import AsyncStorage from "@react-native-async-storage/async-storage";
import { HydrationSettings, HydrationHistory } from "../domain/types";
import { computeReminderSchedule, ReminderSlot } from "../domain/schedule";
import { rescheduleNotifications } from "./notifier";
import {
  MIN_INTERVAL_MINUTES,
  REMINDER_TARGET_ML,
} from "../../../core/constants";
import {
  getDateKey,
  parseTimeToMinutes,
} from "../../../core/time";
import { litersToMl, getWindowMinutes } from "../domain/calculations";

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------
const SCHEDULE_SNAPSHOT_KEY = "siply:schedule_snapshot:v1";
const NUDGE_BUDGET_KEY = "siply:nudge_budget:v1";

// ---------------------------------------------------------------------------
// How long a schedule remains "fresh" before the engine considers it stale
// and recomputes. Must be shorter than MIN_INTERVAL_MINUTES so the user
// always has an accurate next-reminder time.
// ---------------------------------------------------------------------------
const STALENESS_THRESHOLD_MS = (MIN_INTERVAL_MINUTES / 2) * 60 * 1000; // 15 min

// ---------------------------------------------------------------------------
// Maximum nudge sequences per day (Q1 decision: nudge budget)
// ---------------------------------------------------------------------------
const MAX_NUDGE_SEQUENCES_PER_DAY = 4;

// ---------------------------------------------------------------------------
// Urgency mode thresholds (Q2/Phase 6.2)
// If the user has >60% of target remaining with <30% of window time left,
// the engine switches to urgency mode: shorter intervals (but ≥ MIN_INTERVAL_MINUTES)
// and nudges are enabled even if the user disabled escalation.
// ---------------------------------------------------------------------------
const URGENCY_REMAINING_RATIO = 0.6; // 60% of target remaining
const URGENCY_TIME_RATIO = 0.3; // 30% of window time remaining

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type SerializedSlot = {
  time: string; // ISO string
  mlPerReminder: number;
  sipsPerReminder: number;
  intervalMinutes: number;
};

export type ScheduleSnapshot = {
  /** ISO timestamp of when this schedule was computed */
  computedAt: string;
  /** The date key (YYYY-MM-DD) this schedule belongs to */
  dateKey: string;
  /** consumedMl at the time of computation */
  consumedMlAtCompute: number;
  /** Serialized settings hash for change detection */
  settingsHash: string;
  /** The actual slots that were sent to the OS */
  slots: SerializedSlot[];
  /** What triggered this computation */
  triggerSource: string;
  /** How many notifications were successfully scheduled */
  scheduledCount: number;
  /** Whether urgency mode was active when this schedule was computed */
  urgencyMode: boolean;
};

export type NudgeBudgetState = {
  dateKey: string;
  usedSequences: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const serializeSlots = (slots: ReminderSlot[]): SerializedSlot[] =>
  slots.map((s) => ({
    time: s.time.toISOString(),
    mlPerReminder: s.mlPerReminder,
    sipsPerReminder: s.sipsPerReminder,
    intervalMinutes: s.intervalMinutes,
  }));

/**
 * Deterministic hash of the settings fields that affect scheduling.
 * If this changes, the schedule must be recomputed.
 */
const hashSettings = (s: HydrationSettings): string =>
  [
    s.targetLiters,
    s.windowStart,
    s.windowEnd,
    s.sipMl,
    s.escalationEnabled,
    s.soundEnabled,
    s.tone ?? "encouraging",
  ].join("|");

// ---------------------------------------------------------------------------
// Urgency detection
// ---------------------------------------------------------------------------
const detectUrgencyMode = (
  settings: HydrationSettings,
  consumedMl: number,
  now: Date
): boolean => {
  const targetMl = litersToMl(settings.targetLiters);
  const remainingMl = Math.max(0, targetMl - consumedMl);
  const remainingRatio = remainingMl / targetMl;

  if (remainingRatio < URGENCY_REMAINING_RATIO) {
    return false; // User is on track — no urgency
  }

  // Calculate how much window time is left
  const windowMinutes = getWindowMinutes(settings);
  if (windowMinutes <= 0) return false;

  const startMinutes = parseTimeToMinutes(settings.windowStart) ?? 0;
  const windowStartToday = new Date(now);
  windowStartToday.setHours(0, 0, 0, 0);
  windowStartToday.setMinutes(startMinutes);

  // If windowStart is after now, the window hasn't started yet
  if (windowStartToday > now) return false;

  const windowEndTime = new Date(windowStartToday.getTime() + windowMinutes * 60000);
  const totalWindowMs = windowMinutes * 60000;
  const remainingWindowMs = Math.max(0, windowEndTime.getTime() - now.getTime());
  const timeRemainingRatio = remainingWindowMs / totalWindowMs;

  return timeRemainingRatio <= URGENCY_TIME_RATIO;
};

// ---------------------------------------------------------------------------
// Weekend/weekday awareness (Phase 6.3)
// Returns true if today is a weekend AND the user historically drinks less
// on weekends (based on the provided history).
// ---------------------------------------------------------------------------
export const isRelaxedDay = (
  history: HydrationHistory | undefined,
  now: Date
): boolean => {
  if (!history) return false;

  const dayOfWeek = now.getDay(); // 0=Sun, 6=Sat
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  if (!isWeekend) return false;

  // Compare average weekend vs weekday intake over the last 30 days
  let weekdayTotal = 0;
  let weekdayDays = 0;
  let weekendTotal = 0;
  let weekendDays = 0;

  const entries = Object.entries(history);
  // Only consider recent entries (last 30 days)
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoffKey = getDateKey(thirtyDaysAgo);

  for (const [key, summary] of entries) {
    if (key < cutoffKey || summary.totalMl <= 0) continue;

    const dayDate = new Date(key + "T12:00:00"); // Parse date key
    const dow = dayDate.getDay();
    if (dow === 0 || dow === 6) {
      weekendTotal += summary.totalMl;
      weekendDays += 1;
    } else {
      weekdayTotal += summary.totalMl;
      weekdayDays += 1;
    }
  }

  // Need at least 3 data points for each to make a meaningful comparison
  if (weekendDays < 3 || weekdayDays < 3) return false;

  const weekendAvg = weekendTotal / weekendDays;
  const weekdayAvg = weekdayTotal / weekdayDays;

  // If weekend average is at least 15% lower, consider it a relaxed day
  return weekendAvg < weekdayAvg * 0.85;
};

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------
const readSnapshot = async (): Promise<ScheduleSnapshot | null> => {
  try {
    const raw = await AsyncStorage.getItem(SCHEDULE_SNAPSHOT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ScheduleSnapshot;
  } catch {
    return null;
  }
};

const writeSnapshot = async (snapshot: ScheduleSnapshot): Promise<void> => {
  // Update in-memory cache first for instant reads
  cachedSnapshot = snapshot;
  try {
    await AsyncStorage.setItem(
      SCHEDULE_SNAPSHOT_KEY,
      JSON.stringify(snapshot)
    );
  } catch (e) {
    console.warn("Siply: failed to persist schedule snapshot", e);
  }
};

export const readNudgeBudget = async (): Promise<NudgeBudgetState> => {
  const todayKey = getDateKey(new Date());
  try {
    const raw = await AsyncStorage.getItem(NUDGE_BUDGET_KEY);
    if (!raw) return { dateKey: todayKey, usedSequences: 0 };
    const parsed = JSON.parse(raw) as NudgeBudgetState;
    // Reset if it's a new day
    if (parsed.dateKey !== todayKey) {
      return { dateKey: todayKey, usedSequences: 0 };
    }
    return parsed;
  } catch {
    return { dateKey: todayKey, usedSequences: 0 };
  }
};

export const consumeNudgeBudget = async (): Promise<boolean> => {
  const budget = await readNudgeBudget();
  if (budget.usedSequences >= MAX_NUDGE_SEQUENCES_PER_DAY) {
    return false; // budget exhausted
  }
  const next: NudgeBudgetState = {
    dateKey: budget.dateKey,
    usedSequences: budget.usedSequences + 1,
  };
  try {
    await AsyncStorage.setItem(NUDGE_BUDGET_KEY, JSON.stringify(next));
  } catch {}
  return true;
};

export const getRemainingNudgeBudget = async (): Promise<number> => {
  const budget = await readNudgeBudget();
  return Math.max(0, MAX_NUDGE_SEQUENCES_PER_DAY - budget.usedSequences);
};

// ---------------------------------------------------------------------------
// Staleness detection
// ---------------------------------------------------------------------------
export type ReconcileInput = {
  settings: HydrationSettings;
  consumedMl: number;
  lastLogAt?: string | null;
  source: string;
  /** Optional: pass history for intelligence features (weekend awareness) */
  history?: HydrationHistory;
};

const isStale = (
  snapshot: ScheduleSnapshot | null,
  input: ReconcileInput,
  now: Date
): boolean => {
  if (!snapshot) return true;

  const todayKey = getDateKey(now);

  // Day changed — must recompute
  if (snapshot.dateKey !== todayKey) return true;

  // Settings changed — must recompute
  if (snapshot.settingsHash !== hashSettings(input.settings)) return true;

  // User logged a drink since last computation — must recompute
  if (snapshot.consumedMlAtCompute !== input.consumedMl) return true;

  // Time-based staleness: if the snapshot is old enough that the next slot
  // has probably passed, recompute to ensure accuracy
  const elapsed = now.getTime() - new Date(snapshot.computedAt).getTime();
  if (elapsed >= STALENESS_THRESHOLD_MS) return true;

  return false;
};

// ---------------------------------------------------------------------------
// Mutex — simple promise-based serialization
// ---------------------------------------------------------------------------
let mutexQueue: Promise<void> = Promise.resolve();

const withMutex = <T>(fn: () => Promise<T>): Promise<T> => {
  let resolve: (value: T) => void;
  let reject: (reason: unknown) => void;
  const result = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  mutexQueue = mutexQueue
    .then(() => fn())
    .then(resolve!)
    .catch(reject!);

  return result;
};

// ---------------------------------------------------------------------------
// Core reconcile — the single entry point
// ---------------------------------------------------------------------------
export const reconcile = async (input: ReconcileInput): Promise<ScheduleSnapshot | null> => {
  return withMutex(async () => {
    const now = new Date();
    const existing = await readSnapshot();

    if (!isStale(existing, input, now)) {
      return existing;
    }

    return executeScheduling(input, now);
  });
};

// ---------------------------------------------------------------------------
// Force reconcile — skip staleness check (settings changes, day rollover)
// ---------------------------------------------------------------------------
export const forceReconcile = async (input: ReconcileInput): Promise<ScheduleSnapshot | null> => {
  return withMutex(async () => {
    const now = new Date();
    return executeScheduling(input, now);
  });
};

// ---------------------------------------------------------------------------
// Shared scheduling execution (used by both reconcile and forceReconcile)
// ---------------------------------------------------------------------------
const executeScheduling = async (
  input: ReconcileInput,
  now: Date
): Promise<ScheduleSnapshot> => {
  // Phase 6.2: Detect urgency mode
  const urgencyMode = detectUrgencyMode(input.settings, input.consumedMl, now);

  // Phase 6.3: Weekend awareness — if it's a relaxed day and the user
  // is on track, we could optionally widen intervals. For now, we note
  // the state in the snapshot for future UI use (e.g., gentler messages).
  // The actual interval adjustment happens through the existing settings.

  // If urgency mode is active, temporarily boost escalation
  const effectiveSettings: HydrationSettings = urgencyMode
    ? { ...input.settings, escalationEnabled: true }
    : input.settings;

  // Determine nudge budget
  const nudgeBudget = await readNudgeBudget();
  let remainingNudges = Math.max(
    0,
    MAX_NUDGE_SEQUENCES_PER_DAY - nudgeBudget.usedSequences
  );

  // In urgency mode, grant extra nudge budget (up to 2 additional)
  if (urgencyMode) {
    remainingNudges = Math.max(remainingNudges, 2);
  }

  // Compute fresh schedule
  const schedule = computeReminderSchedule(
    now,
    effectiveSettings,
    input.consumedMl
  );

  // Reschedule with the OS (cancel all + schedule new)
  const result = await rescheduleNotifications(
    effectiveSettings,
    input.consumedMl,
    now,
    input.lastLogAt,
    remainingNudges
  );

  // Persist the snapshot
  const snapshot: ScheduleSnapshot = {
    computedAt: now.toISOString(),
    dateKey: getDateKey(now),
    consumedMlAtCompute: input.consumedMl,
    settingsHash: hashSettings(input.settings),
    slots: serializeSlots(schedule.slots),
    triggerSource: input.source,
    scheduledCount: result.scheduled,
    urgencyMode,
  };

  await writeSnapshot(snapshot);
  return snapshot;
};

// ---------------------------------------------------------------------------
// Public read — for display hooks
// ---------------------------------------------------------------------------
export const getScheduleSnapshot = readSnapshot;

// ---------------------------------------------------------------------------
// Clear — for day rollover or full reset
// ---------------------------------------------------------------------------
export const clearScheduleSnapshot = async (): Promise<void> => {
  cachedSnapshot = null;
  try {
    await AsyncStorage.removeItem(SCHEDULE_SNAPSHOT_KEY);
  } catch {}
};

// ---------------------------------------------------------------------------
// In-memory cache for fast synchronous reads from hooks
// ---------------------------------------------------------------------------
let cachedSnapshot: ScheduleSnapshot | null = null;

export const getCachedSnapshot = (): ScheduleSnapshot | null => cachedSnapshot;

export const refreshSnapshotCache = async (): Promise<ScheduleSnapshot | null> => {
  cachedSnapshot = await readSnapshot();
  return cachedSnapshot;
};
