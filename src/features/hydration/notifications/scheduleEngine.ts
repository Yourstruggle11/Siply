import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import {
  NORMAL_NUDGE_FAMILIES_PER_DAY,
  NUDGE_MINUTES,
  URGENCY_EXTRA_NUDGE_FAMILIES_PER_DAY,
} from "../../../core/constants";
import { getDateKey } from "../../../core/time";
import { litersToMl } from "../domain/calculations";
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
  | "invalid_window";

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

  const validKeys = new Set([getDateKey(now), getDateKey(new Date(now.getTime() + 86_400_000))]);
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
  now: Date
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

    const targetMl = litersToMl(input.settings.targetLiters);
    const remainingRatio = dateKey === getDateKey(now)
      ? Math.max(0, targetMl - input.consumedMl) / targetMl
      : 1;
    const canUseUrgency = input.settings.urgencyExtraNudgeEnabled
      && remainingRatio >= 0.6
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
  if (result.status === "failed") return "schedule_failed";
  if (result.status === "partial") return "partially_scheduled";
  if (targetMet) return "target_met";
  if (!slotCount && result.success) return "day_complete";
  return "scheduled";
};

const scheduleAutomaticRepair = (input: ReconcileInput) => {
  if (repairTimer || repairAttempt >= 3) return;
  const delays = [5_000, 30_000, 120_000];
  const delay = delays[repairAttempt++] ?? delays[delays.length - 1];
  repairTimer = setTimeout(() => {
    repairTimer = null;
    void reconcile({ ...input, source: "automatic_retry" });
  }, delay);
};

const clearRepair = () => {
  repairAttempt = 0;
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
  weekendAdjustmentMinutes: number
) => {
  const dateKeys = Array.from(new Set([getDateKey(now), ...slots.map((slot) => getDateKey(new Date(slot.time)))]));
  const handled = await readHandledFamilies(dateKeys);
  const result = await applyNotificationPlan(input.settings, deserializeSlots(slots), now, handled);
  const targetMet = input.consumedMl >= litersToMl(input.settings.targetLiters);
  const windowValid = input.settings.windowEnd > input.settings.windowStart;
  // Reconciliation is transactional: when a replacement cannot be installed,
  // keep presenting any older reminders that the OS still confirms as pending.
  const fallbackSlots = result.status === "failed" && existing
    ? existing.slots.filter((slot) => result.pendingFamilyIds.includes(slot.familyId))
    : [];
  const usingFallback = fallbackSlots.length > 0;
  const effectiveSlots = usingFallback ? fallbackSlots : slots;
  const effectiveVerifiedFamilies = usingFallback
    ? fallbackSlots.map((slot) => slot.familyId)
    : result.verifiedFamilyIds;
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
      existing!.weekendAdjustmentMinutes
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
  const urgencyMode = input.consumedMl < litersToMl(input.settings.targetLiters) * 0.4
    && schedule.slots.some((slot) => slot.phase === "wind_down");
  const assigned = await assignNudges(schedule.slots, input, existing, now);
  return applyAndPersist(
    input,
    existing,
    serializeSlots(assigned),
    now,
    true,
    urgencyMode,
    weekendAdjustmentMinutes
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
  await cancelNotificationFamily(familyId);
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
