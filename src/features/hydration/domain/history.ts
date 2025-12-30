import { addDays, getDateKey } from "../../../core/time";
import {
  HISTORY_RETENTION_DAYS,
  QUICK_LOG_MAX_PRESETS,
  QUICK_LOG_MIN_PRESETS,
} from "../../../core/constants";
import { HydrationDaySummary, HydrationHistory } from "./types";

const ensureLogHours = (input?: number[]) => {
  const base = Array.isArray(input) ? input.slice(0, 24) : [];
  const normalized = Array.from({ length: 24 }, (_item, index) => {
    const value = base[index];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  });
  return normalized;
};

export const normalizeHistory = (input: unknown): HydrationHistory => {
  if (!input || typeof input !== "object") {
    return {};
  }
  const result: HydrationHistory = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof key !== "string") {
      continue;
    }
    if (!value || typeof value !== "object") {
      continue;
    }
    const entry = value as Partial<HydrationDaySummary>;
    const totalMl = typeof entry.totalMl === "number" && Number.isFinite(entry.totalMl) ? entry.totalMl : 0;
    const goalMl = typeof entry.goalMl === "number" && Number.isFinite(entry.goalMl) ? entry.goalMl : 0;
    const goodThresholdMl =
      typeof entry.goodThresholdMl === "number" && Number.isFinite(entry.goodThresholdMl)
        ? entry.goodThresholdMl
        : 0;
    result[key] = {
      date: key,
      totalMl,
      goalMl,
      goodThresholdMl,
      logHours: ensureLogHours(entry.logHours),
    };
  }
  return result;
};

export const normalizeQuickLogPresets = (input: unknown, fallback: number[]) => {
  const inputRecord = input && typeof input === "object" ? (input as { presets?: unknown[] }) : null;
  const rawPresets = Array.isArray(input)
    ? input
    : Array.isArray(inputRecord?.presets)
      ? inputRecord.presets
      : null;
  const cleaned = Array.isArray(rawPresets)
    ? rawPresets
        .map((value) => (typeof value === "number" ? value : Number.parseInt(String(value), 10)))
        .filter((value) => Number.isFinite(value) && value > 0)
    : fallback.slice();
  const deduped = Array.from(new Set(cleaned));
  const bounded = deduped.slice(0, QUICK_LOG_MAX_PRESETS);
  if (bounded.length >= QUICK_LOG_MIN_PRESETS) {
    return bounded;
  }
  return fallback.slice(0, QUICK_LOG_MAX_PRESETS);
};

export const trimHistory = (history: HydrationHistory, now: Date, retentionDays = HISTORY_RETENTION_DAYS) => {
  const cutoffKey = getDateKey(addDays(now, -Math.max(1, retentionDays) + 1));
  const trimmed: HydrationHistory = {};
  for (const [key, value] of Object.entries(history)) {
    if (key >= cutoffKey) {
      trimmed[key] = value;
    }
  }
  return trimmed;
};

export const updateHistoryForLog = (
  history: HydrationHistory,
  now: Date,
  amountMl: number,
  goalMl: number,
  goodThresholdMl: number
) => {
  if (!Number.isFinite(amountMl) || amountMl <= 0) {
    return history;
  }
  const dateKey = getDateKey(now);
  const existing = history[dateKey];
  const logHours = ensureLogHours(existing?.logHours);
  const hour = now.getHours();
  logHours[hour] += 1;

  const next: HydrationDaySummary = {
    date: dateKey,
    totalMl: Math.max(0, (existing?.totalMl ?? 0) + amountMl),
    goalMl,
    goodThresholdMl,
    logHours,
  };

  return {
    ...history,
    [dateKey]: next,
  };
};

export const resetHistoryForDate = (history: HydrationHistory, dateKey: string, goalMl: number, goodThresholdMl: number) => {
  return {
    ...history,
    [dateKey]: {
      date: dateKey,
      totalMl: 0,
      goalMl,
      goodThresholdMl,
      logHours: Array.from({ length: 24 }, () => 0),
    },
  };
};

export const buildDateKeys = (today: Date, days: number) =>
  Array.from({ length: days }, (_item, index) => getDateKey(addDays(today, -(days - 1 - index))));

export const getSummaryForDate = (
  history: HydrationHistory,
  dateKey: string,
  fallbackGoalMl: number,
  fallbackGoodThresholdMl: number
) => {
  const entry = history[dateKey];
  if (!entry) {
    return {
      date: dateKey,
      totalMl: 0,
      goalMl: fallbackGoalMl,
      goodThresholdMl: fallbackGoodThresholdMl,
      logHours: Array.from({ length: 24 }, () => 0),
    };
  }
  return entry;
};

export type StreakStats = {
  currentStreak: number;
  bestStreak: number;
  last7GoalHits: number;
  last30GoalHits: number;
  currentGoodStreak: number | null;
  bestGoodStreak: number | null;
};

const computeBestStreak = (flags: boolean[]) => {
  let best = 0;
  let current = 0;
  for (const value of flags) {
    if (value) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return best;
};

const computeCurrentStreak = (flags: boolean[]) => {
  let count = 0;
  for (let i = flags.length - 1; i >= 0; i -= 1) {
    if (!flags[i]) {
      break;
    }
    count += 1;
  }
  return count;
};

export const computeStreakStats = (
  history: HydrationHistory,
  now: Date,
  fallbackGoalMl: number,
  fallbackGoodThresholdMl: number,
  gentleEnabled: boolean
): StreakStats => {
  const keys = buildDateKeys(now, HISTORY_RETENTION_DAYS);
  const goalFlags = keys.map((key) => {
    const entry = history[key];
    const total = entry?.totalMl ?? 0;
    const goal = entry?.goalMl ?? fallbackGoalMl;
    return total >= goal && goal > 0;
  });
  const goodFlags = keys.map((key) => {
    const entry = history[key];
    const total = entry?.totalMl ?? 0;
    const threshold = entry?.goodThresholdMl ?? fallbackGoodThresholdMl;
    return total >= threshold && threshold > 0;
  });

  const last7Keys = keys.slice(-7);
  const last30Keys = keys.slice(-30);
  const last7GoalHits = last7Keys.filter((key) => {
    const entry = history[key];
    const total = entry?.totalMl ?? 0;
    const goal = entry?.goalMl ?? fallbackGoalMl;
    return total >= goal && goal > 0;
  }).length;
  const last30GoalHits = last30Keys.filter((key) => {
    const entry = history[key];
    const total = entry?.totalMl ?? 0;
    const goal = entry?.goalMl ?? fallbackGoalMl;
    return total >= goal && goal > 0;
  }).length;

  return {
    currentStreak: computeCurrentStreak(goalFlags),
    bestStreak: computeBestStreak(goalFlags),
    last7GoalHits,
    last30GoalHits,
    currentGoodStreak: gentleEnabled ? computeCurrentStreak(goodFlags) : null,
    bestGoodStreak: gentleEnabled ? computeBestStreak(goodFlags) : null,
  };
};

export const computeBestHours = (history: HydrationHistory, now: Date, days = 30) => {
  const keys = buildDateKeys(now, days);
  const counts = Array.from({ length: 24 }, () => 0);
  for (const key of keys) {
    const entry = history[key];
    if (!entry) {
      continue;
    }
    entry.logHours.forEach((value, index) => {
      counts[index] += value;
    });
  }
  const ranked = counts
    .map((value, index) => ({ hour: index, value }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((item) => item.hour);
  return ranked;
};
