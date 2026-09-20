import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import {
  NORMAL_NUDGE_FAMILIES_PER_DAY,
  NUDGE_MINUTES,
  URGENCY_EXTRA_NUDGE_FAMILIES_PER_DAY,
} from "../../../core/constants";
import { addDays, addMinutes, getDateKey, setTimeOnDate } from "../../../core/time";
import { getWindowMinutes, litersToMl } from "../domain/calculations";
import { computeReminderSchedule, type ReminderPhase, type ReminderSlot } from "../domain/schedule";
import {
  analyzeWeekendAwareness,
  computeHourlyAdherence,
} from "../domain/schedulingIntelligence";
import type { HydrationHistory, HydrationSettings } from "../domain/types";
import {
  applyNotificationPlan,
  buildReminderFamilyId,
  cancelNotificationFamily,
  parseSiplyNotificationId,
  type NotificationApplyResult,
  type NotificationPlanSlot,
} from "./notifier";
import { recordNotificationDiagnostic } from "./diagnostics";

export const SCHEDULE_SNAPSHOT_KEY = "siply:schedule_snapshot:v2";
const NUDGE_LEDGER_KEY = "siply:nudge_ledger:v2";
const HANDLED_FAMILIES_KEY = "siply:handled_notification_families:v1";

type NudgeMode = "normal" | "urgency" | null;

export type SerializedSlot = {
  familyId: string;
  time: string;
  windowEnd: string;
  mlPerReminder: number;
  sipsPerReminder: number;
  intervalMinutes: number;
  phase: ReminderPhase;
  nudgeOffsets: number[];
  nudgeMode: NudgeMode;
};

export type ReminderHealth =
  | "scheduled"
  | "partially_scheduled"
  | "schedule_failed"
  | "target_met"
  | "outside_window"
  | "day_complete"
  | "invalid_window"
  | "channel_blocked";

export type ScheduleSnapshot = {
  version: 2;
  planId: string;
  revision: number;
  computedAt: string;
  verifiedAt: string;
  dateKey: string;
  timezoneOffsetMinutes: number;
  consumedMlAtCompute: number;
  lastLogAtAtCompute: string | null;
  settingsHash: string;
  slots: SerializedSlot[];
  triggerSource: string;
  desiredCount: number;
  plannedCount?: number;
  suppressedOptionalCount?: number;
  suppressedBaseCount?: number;
  scheduledCount: number;
  verifiedFamilyIds: string[];
  health: ReminderHealth;
  errors: string[];
  urgencyMode: boolean;
  weekendAdjustmentMinutes: number;
};

type NudgeDayLedger = {
  normalUsed: string[];
  urgencyUsed: string[];
};

type NudgeLedger = Record<string, NudgeDayLedger>;
type HandledFamilies = Record<string, Record<string, "skipped" | "snoozed">>;

export type ReconcileInput = {
  settings: HydrationSettings;
  consumedMl: number;
  lastLogAt?: string | null;
  source: string;
  history?: HydrationHistory;
};

let cachedSnapshot: ScheduleSnapshot | null = null;
const listeners = new Set<(snapshot: ScheduleSnapshot | null) => void>();
let mutexQueue: Promise<void> = Promise.resolve();
let repairTimer: ReturnType<typeof setTimeout> | null = null;
let repairAttempt = 0;
let repairInputKey: string | null = null;
let latestRepairInput: ReconcileInput | null = null;

const withMutex = <T>(operation: () => Promise<T>): Promise<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const result = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  mutexQueue = mutexQueue.then(operation).then(resolve).catch(reject);
  return result;
};

const hashSettings = (settings: HydrationSettings) => [
  settings.targetLiters,
  settings.windowStart,
  settings.windowEnd,
  settings.sipMl,
  settings.escalationEnabled,
  settings.soundEnabled,
  settings.tone ?? "encouraging",
  settings.weekendAwarenessEnabled,
  settings.urgencyExtraNudgeEnabled,
].join("|");

const readJson = async <T>(key: string, fallback: T): Promise<T> => {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
};

const readSnapshot = async () => {
  const snapshot = await readJson<ScheduleSnapshot | null>(SCHEDULE_SNAPSHOT_KEY, null);
  return snapshot?.version === 2 ? snapshot : null;
};

const publishSnapshot = (snapshot: ScheduleSnapshot | null) => {
  cachedSnapshot = snapshot;
  listeners.forEach((listener) => listener(snapshot));
};

const writeSnapshot = async (snapshot: ScheduleSnapshot) => {
  await AsyncStorage.setItem(SCHEDULE_SNAPSHOT_KEY, JSON.stringify(snapshot));
  publishSnapshot(snapshot);
  if (Platform.OS === "android") {
    try {
      // Deferred to keep the widget renderer and schedule engine from forming
      // an eager module cycle. Refresh only after the verified snapshot lands.
      const { updateAndroidWidget } = require("../widgets/AndroidWidgetTaskHandler") as typeof import("../widgets/AndroidWidgetTaskHandler");
      updateAndroidWidget();
    } catch {
      // Widgets are optional; scheduling must never fail because one is absent.
    }
  }
};

const deserializeSlots = (slots: SerializedSlot[]): NotificationPlanSlot[] =>
  slots.map((slot) => ({
    familyId: slot.familyId,
    time: new Date(slot.time),
    windowEnd: new Date(slot.windowEnd),
    mlPerReminder: slot.mlPerReminder,
    sipsPerReminder: slot.sipsPerReminder,
    phase: slot.phase,
    nudgeOffsets: slot.nudgeOffsets,
  }));

const serializeSlots = (slots: Array<ReminderSlot & { familyId: string; nudgeOffsets: number[]; nudgeMode: NudgeMode }>): SerializedSlot[] =>
  slots.map((slot) => ({
    familyId: slot.familyId,
    time: slot.time.toISOString(),
    windowEnd: slot.windowEnd.toISOString(),
    mlPerReminder: slot.mlPerReminder,
    sipsPerReminder: slot.sipsPerReminder,
    intervalMinutes: slot.intervalMinutes,
    phase: slot.phase,
    nudgeOffsets: slot.nudgeOffsets,
    nudgeMode: slot.nudgeMode,
  }));

const updateConsumedNudges = async (existing: ScheduleSnapshot | null, now: Date) => {
  const ledger = await readJson<NudgeLedger>(NUDGE_LEDGER_KEY, {});
  existing?.slots.forEach((slot) => {
    if (!slot.nudgeMode || !slot.nudgeOffsets.length) return;
    const firstNudge = new Date(slot.time).getTime() + slot.nudgeOffsets[0] * 60_000;
    if (firstNudge > now.getTime()) return;
    const dateKey = getDateKey(new Date(slot.time));
    const day = ledger[dateKey] ?? { normalUsed: [], urgencyUsed: [] };
    const target = slot.nudgeMode === "urgency" ? day.urgencyUsed : day.normalUsed;
    if (!target.includes(slot.familyId)) target.push(slot.familyId);
    ledger[dateKey] = day;
  });

  const validKeys = new Set([getDateKey(now), getDateKey(addDays(now, 1))]);
  Object.keys(ledger).forEach((key) => {
    if (!validKeys.has(key)) delete ledger[key];
  });
  await AsyncStorage.setItem(NUDGE_LEDGER_KEY, JSON.stringify(ledger));
  return ledger;
};

const chooseDistributedFamilies = (
  candidates: Array<ReminderSlot & { familyId: string }>,
  count: number,
  hourlyAdherence: number[]
) => {
  if (count <= 0 || !candidates.length) return [];
  if (candidates.length <= count) return candidates;
  const selected: Array<ReminderSlot & { familyId: string }> = [];
  for (let segment = 0; segment < count; segment += 1) {
    const start = Math.floor((segment * candidates.length) / count);
    const end = Math.max(start + 1, Math.floor(((segment + 1) * candidates.length) / count));
    const group = candidates.slice(start, end);
    const best = [...group].sort((a, b) => {
      const adherenceDifference = hourlyAdherence[a.time.getHours()] - hourlyAdherence[b.time.getHours()];
      return adherenceDifference || b.time.getTime() - a.time.getTime();
    })[0];
    if (best) selected.push(best);
  }
  return selected;
};

const assignNudges = async (
  scheduleSlots: ReminderSlot[],
  input: ReconcileInput,
  existing: ScheduleSnapshot | null,
  now: Date,
  urgencyMode: boolean
) => {
  const ledger = await updateConsumedNudges(existing, now);
  const adherence = computeHourlyAdherence(input.history ?? {}, now);
  const withIds = scheduleSlots.map((slot) => ({ ...slot, familyId: buildReminderFamilyId(slot.time) }));
  const output = withIds.map((slot) => ({ ...slot, nudgeOffsets: [] as number[], nudgeMode: null as NudgeMode }));

  if (!input.settings.escalationEnabled) return output;

  const grouped = new Map<string, typeof withIds>();
  withIds.forEach((slot) => {
    if (slot.phase === "last_call" || addMinutesSafe(slot.time, 10) >= slot.windowEnd) return;
    const key = getDateKey(slot.time);
    grouped.set(key, [...(grouped.get(key) ?? []), slot]);
  });

  grouped.forEach((candidates, dateKey) => {
    const day = ledger[dateKey] ?? { normalUsed: [], urgencyUsed: [] };
    const unusedCandidates = candidates.filter((slot) => !day.normalUsed.includes(slot.familyId));
    const remainingNormal = Math.max(0, NORMAL_NUDGE_FAMILIES_PER_DAY - day.normalUsed.length);
    const selectedNormal = chooseDistributedFamilies(unusedCandidates, remainingNormal, adherence);
    selectedNormal.forEach((selected) => {
      const slot = output.find((item) => item.familyId === selected.familyId)!;
      slot.nudgeOffsets = [...NUDGE_MINUTES];
      slot.nudgeMode = "normal";
    });

    const canUseUrgency = input.settings.urgencyExtraNudgeEnabled
      && dateKey === getDateKey(now)
      && urgencyMode
      && day.urgencyUsed.length < URGENCY_EXTRA_NUDGE_FAMILIES_PER_DAY;
    if (!canUseUrgency) return;

    const normalIds = new Set(selectedNormal.map((slot) => slot.familyId));
    const urgency = [...candidates]
      .reverse()
      .find((slot) => !normalIds.has(slot.familyId) && !day.urgencyUsed.includes(slot.familyId));
    if (urgency) {
      const slot = output.find((item) => item.familyId === urgency.familyId)!;
      slot.nudgeOffsets = [...NUDGE_MINUTES];
      slot.nudgeMode = "urgency";
    }
  });

  return output;
};

const addMinutesSafe = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000);

const isSubstantiallyBehindPace = (
  input: ReconcileInput,
  now: Date,
  weekendAdjustmentMinutes: number
) => {
  const targetMl = litersToMl(input.settings.targetLiters);
  if (targetMl <= 0 || input.consumedMl >= targetMl) return false;
  let windowStart = setTimeOnDate(now, input.settings.windowStart);
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  if (input.settings.weekendAwarenessEnabled && isWeekend) {
    windowStart = addMinutes(windowStart, weekendAdjustmentMinutes);
  }
  const windowEnd = setTimeOnDate(now, input.settings.windowEnd);
  if (now <= windowStart || now >= windowEnd) return false;
  const elapsedRatio = Math.min(
    1,
    Math.max(0, (now.getTime() - windowStart.getTime()) / (windowEnd.getTime() - windowStart.getTime()))
  );
  const expectedMl = targetMl * elapsedRatio;
  const behindByMl = expectedMl - input.consumedMl;
  return elapsedRatio >= 0.35 && behindByMl >= Math.max(300, targetMl * 0.1);
};

const readHandledFamilies = async (dateKeys: string[]) => {
  const state = await readJson<HandledFamilies>(HANDLED_FAMILIES_KEY, {});
  const wanted = new Set(dateKeys);
  Object.keys(state).forEach((key) => {
    if (!wanted.has(key)) delete state[key];
  });
  await AsyncStorage.setItem(HANDLED_FAMILIES_KEY, JSON.stringify(state));
  return dateKeys.flatMap((key) => Object.keys(state[key] ?? {}));
};

const healthFrom = (result: NotificationApplyResult, slotCount: number, targetMet: boolean, windowValid: boolean): ReminderHealth => {
  if (!windowValid) return "invalid_window";
  if (result.channelBlocked) return "channel_blocked";
  if (result.status === "failed") return "schedule_failed";
  if (result.status === "partial") return "partially_scheduled";
  if (targetMet) return "target_met";
  if (!slotCount && result.success) return "day_complete";
  return "scheduled";
};

const scheduleAutomaticRepair = (input: ReconcileInput) => {
  const inputKey = JSON.stringify({
    settings: hashSettings(input.settings),
    consumedMl: input.consumedMl,
    lastLogAt: input.lastLogAt ?? null,
    history: input.history ?? {},
  });
  latestRepairInput = input;
  if (repairInputKey !== inputKey) {
    repairInputKey = inputKey;
    repairAttempt = 0;
    if (repairTimer) clearTimeout(repairTimer);
    repairTimer = null;
  }
  if (repairAttempt >= 3 && input.source !== "automatic_retry" && !repairTimer) {
    repairAttempt = 0;
  }
  if (repairTimer || repairAttempt >= 3) return;
  const delays = [5_000, 30_000, 120_000];
  const delay = delays[repairAttempt++] ?? delays[delays.length - 1];
  repairTimer = setTimeout(() => {
    repairTimer = null;
    const latest = latestRepairInput;
    if (!latest) return;
    void reconcile({ ...latest, source: "automatic_retry" }).catch((error) => {
      console.warn("Siply: automatic reminder repair failed", error);
    });
  }, delay);
};

const clearRepair = () => {
  repairAttempt = 0;
  repairInputKey = null;
  latestRepairInput = null;
  if (repairTimer) clearTimeout(repairTimer);
  repairTimer = null;
};

const applyAndPersist = async (
  input: ReconcileInput,
  existing: ScheduleSnapshot | null,
  slots: SerializedSlot[],
  now: Date,
  computed: boolean,
  urgencyMode: boolean,
  weekendAdjustmentMinutes: number,
  reinstallExisting: boolean
) => {
  const dateKeys = Array.from(new Set([getDateKey(now), ...slots.map((slot) => getDateKey(new Date(slot.time)))]));
  const handled = await readHandledFamilies(dateKeys);
  const result = await applyNotificationPlan(
    input.settings,
    deserializeSlots(slots),
    now,
    handled,
    { reinstallExisting }
  );
  const targetMet = input.consumedMl >= litersToMl(input.settings.targetLiters);
  const windowValid = getWindowMinutes(input.settings) > 0
    && Number.isFinite(input.settings.targetLiters)
    && Number.isFinite(input.settings.sipMl)
    && input.settings.targetLiters > 0
    && input.settings.sipMl > 0;
  // Reconciliation is transactional: when a replacement cannot be installed,
  // keep presenting any older reminders that the OS still confirms as pending.
  const fallbackSlots = result.status === "failed" && existing
    ? existing.slots.filter((slot) => result.pendingFamilyIds.includes(slot.familyId))
    : [];
  const usingFallback = fallbackSlots.length > 0;
  const retainedOldSlots = result.status === "partial" && existing
    ? existing.slots.filter(
        (slot) => result.pendingFamilyIds.includes(slot.familyId)
          && !result.verifiedFamilyIds.includes(slot.familyId)
      )
    : [];
  const verifiedNudges = new Map<string, Set<number>>();
  result.pendingIds.forEach((identifier) => {
    const parsed = parseSiplyNotificationId(identifier);
    if (parsed?.kind !== "nudge" || !parsed.familyId || parsed.nudgeOffset === undefined) return;
    const offsets = verifiedNudges.get(parsed.familyId) ?? new Set<number>();
    offsets.add(parsed.nudgeOffset);
    verifiedNudges.set(parsed.familyId, offsets);
  });
  const verifiedNewSlots = slots.map((slot) => ({
    ...slot,
    nudgeOffsets: slot.nudgeOffsets.filter((offset) => verifiedNudges.get(slot.familyId)?.has(offset)),
  }));
  const effectiveSlots = usingFallback
    ? fallbackSlots
    : Array.from(new Map([...verifiedNewSlots, ...retainedOldSlots].map((slot) => [slot.familyId, slot])).values())
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  const effectiveVerifiedFamilies = usingFallback
    ? fallbackSlots.map((slot) => slot.familyId)
    : Array.from(new Set([
        ...result.verifiedFamilyIds,
        ...retainedOldSlots.map((slot) => slot.familyId),
      ]));
  const effectiveHealth = usingFallback
    ? "partially_scheduled"
    : healthFrom(result, slots.length, targetMet, windowValid);
  const revision = usingFallback
    ? existing!.revision
    : computed ? (existing?.revision ?? 0) + 1 : existing?.revision ?? 1;
  const snapshot: ScheduleSnapshot = {
    version: 2,
    planId: usingFallback
      ? existing!.planId
      : computed
        ? `${getDateKey(now)}-${now.getTime()}-${revision}`
        : existing?.planId ?? `${getDateKey(now)}-${now.getTime()}-${revision}`,
    revision,
    computedAt: usingFallback
      ? existing!.computedAt
      : computed ? now.toISOString() : existing?.computedAt ?? now.toISOString(),
    verifiedAt: now.toISOString(),
    dateKey: getDateKey(now),
    timezoneOffsetMinutes: usingFallback
      ? existing!.timezoneOffsetMinutes ?? now.getTimezoneOffset()
      : now.getTimezoneOffset(),
    // A fallback is still the old plan. Keep its input fingerprint so the
    // next automatic/foreground attempt recomputes the rejected replacement.
    consumedMlAtCompute: usingFallback ? existing!.consumedMlAtCompute : input.consumedMl,
    lastLogAtAtCompute: usingFallback ? existing!.lastLogAtAtCompute : input.lastLogAt ?? null,
    settingsHash: usingFallback ? existing!.settingsHash : hashSettings(input.settings),
    slots: effectiveSlots,
    triggerSource: input.source,
    desiredCount: result.desiredCount,
    plannedCount: result.plannedCount ?? result.desiredCount,
    suppressedOptionalCount: result.suppressedOptionalCount ?? 0,
    suppressedBaseCount: result.suppressedBaseCount ?? 0,
    scheduledCount: usingFallback ? effectiveVerifiedFamilies.length : result.scheduled,
    verifiedFamilyIds: effectiveVerifiedFamilies,
    health: effectiveHealth,
    errors: result.errors,
    urgencyMode: usingFallback ? existing!.urgencyMode : urgencyMode,
    weekendAdjustmentMinutes: usingFallback
      ? existing!.weekendAdjustmentMinutes
      : weekendAdjustmentMinutes,
  };
  await writeSnapshot(snapshot);
  await recordNotificationDiagnostic({
    type: "reconcile",
    at: now.toISOString(),
    source: input.source,
    planId: snapshot.planId,
    revision: snapshot.revision,
    dateKey: snapshot.dateKey,
    timezoneOffsetMinutes: now.getTimezoneOffset(),
    remainingMl: Math.max(0, litersToMl(input.settings.targetLiters) - input.consumedMl),
    desiredCount: result.desiredCount,
    scheduledCount: result.scheduled,
    failedCount: result.failed,
    plannedCount: result.plannedCount ?? result.desiredCount,
    suppressedOptionalCount: result.suppressedOptionalCount ?? 0,
    suppressedBaseCount: result.suppressedBaseCount ?? 0,
    extraneousCount: result.extraneousIds?.length ?? 0,
    health: snapshot.health,
    urgencyMode,
    weekendAdjustmentMinutes,
    errors: result.errors,
  }).catch(() => {});
  if (result.success) clearRepair();
  else scheduleAutomaticRepair(input);
  return snapshot;
};

const shouldRecompute = (snapshot: ScheduleSnapshot | null, input: ReconcileInput, now: Date) =>
  !snapshot
  || snapshot.health === "schedule_failed"
  || snapshot.health === "partially_scheduled"
  || snapshot.dateKey !== getDateKey(now)
  || snapshot.timezoneOffsetMinutes !== now.getTimezoneOffset()
  || snapshot.settingsHash !== hashSettings(input.settings)
  || snapshot.consumedMlAtCompute !== input.consumedMl
  || snapshot.lastLogAtAtCompute !== (input.lastLogAt ?? null);

const execute = async (input: ReconcileInput, now: Date, force: boolean) => {
  const existing = await readSnapshot();
  if (!force && !shouldRecompute(existing, input, now)) {
    return applyAndPersist(
      input,
      existing,
      existing!.slots,
      now,
      false,
      existing!.urgencyMode,
      existing!.weekendAdjustmentMinutes,
      false
    );
  }

  const weekend = analyzeWeekendAwareness(input.history ?? {}, now);
  const reuseWeekendAdjustment = existing?.dateKey === getDateKey(now)
    ? existing.weekendAdjustmentMinutes
    : null;
  const weekendAdjustmentMinutes = input.settings.weekendAwarenessEnabled
    ? reuseWeekendAdjustment ?? (weekend.eligible ? weekend.shiftMinutes : 0)
    : 0;
  const schedule = computeReminderSchedule(
    now,
    input.settings,
    input.consumedMl,
    input.lastLogAt,
    { weekendShiftMinutes: weekendAdjustmentMinutes }
  );
  const urgencyMode = isSubstantiallyBehindPace(input, now, weekendAdjustmentMinutes);
  const assigned = await assignNudges(schedule.slots, input, existing, now, urgencyMode);
  return applyAndPersist(
    input,
    existing,
    serializeSlots(assigned),
    now,
    true,
    urgencyMode,
    weekendAdjustmentMinutes,
    true
  );
};

export const reconcile = (input: ReconcileInput) => withMutex(() => execute(input, new Date(), false));
export const forceReconcile = (input: ReconcileInput) => withMutex(() => execute(input, new Date(), true));

export const markReminderFamilyHandled = async (
  familyId: string,
  status: "skipped" | "snoozed",
  at = new Date()
) => {
  const state = await readJson<HandledFamilies>(HANDLED_FAMILIES_KEY, {});
  const dateKey = getDateKey(at);
  state[dateKey] = { ...(state[dateKey] ?? {}), [familyId]: status };
  await AsyncStorage.setItem(HANDLED_FAMILIES_KEY, JSON.stringify(state));
  const cancelledCount = await cancelNotificationFamily(familyId);
  const snapshot = await readSnapshot();
  if (snapshot) {
    const removed = snapshot.slots.find((slot) => slot.familyId === familyId);
    const removedNotificationCount = typeof cancelledCount === "number" && cancelledCount > 0
      ? cancelledCount
      : removed ? 1 + removed.nudgeOffsets.length : 0;
    await writeSnapshot({
      ...snapshot,
      verifiedAt: at.toISOString(),
      slots: snapshot.slots.filter((slot) => slot.familyId !== familyId),
      verifiedFamilyIds: snapshot.verifiedFamilyIds.filter((id) => id !== familyId),
      desiredCount: Math.max(0, snapshot.desiredCount - removedNotificationCount),
      plannedCount: Math.max(0, (snapshot.plannedCount ?? snapshot.desiredCount) - removedNotificationCount),
      scheduledCount: Math.max(0, snapshot.scheduledCount - removedNotificationCount),
    });
  }
  await recordNotificationDiagnostic({
    type: "action",
    at: at.toISOString(),
    action: status,
    familyId,
  }).catch(() => {});
};

export const getScheduleSnapshot = readSnapshot;
export const getCachedSnapshot = () => cachedSnapshot;
export const refreshSnapshotCache = async () => {
  const snapshot = await readSnapshot();
  publishSnapshot(snapshot);
  return snapshot;
};
export const subscribeScheduleSnapshot = (listener: (snapshot: ScheduleSnapshot | null) => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const clearScheduleSnapshot = async () => {
  publishSnapshot(null);
  await Promise.all([
    AsyncStorage.removeItem(SCHEDULE_SNAPSHOT_KEY),
    AsyncStorage.removeItem(NUDGE_LEDGER_KEY),
    AsyncStorage.removeItem(HANDLED_FAMILIES_KEY),
  ]);
};

export const getNextReminderFromSnapshot = (snapshot: ScheduleSnapshot | null, now = new Date()) =>
  (() => {
    const slot = getNextSlotDetails(snapshot, now);
    return slot ? new Date(slot.time) : null;
  })();

export const getNextSlotDetails = (snapshot: ScheduleSnapshot | null, now = new Date()) => {
  if (!snapshot) return null;
  const verified = new Set(snapshot.verifiedFamilyIds);
  return snapshot.slots.find((slot) => verified.has(slot.familyId) && new Date(slot.time) > now) ?? null;
};
