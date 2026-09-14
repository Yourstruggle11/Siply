import { addDays, getDateKey } from "../../../core/time";
import {
  ENTRY_RETENTION_DAYS,
  HISTORY_RETENTION_DAYS,
  QUICK_LOG_MAX_PRESETS,
  QUICK_LOG_MIN_PRESETS,
} from "../../../core/constants";
import { HydrationDaySummary, HydrationHistory, LogEntry, DrinkPreset } from "./types";

const ensureLogHours = (input?: number[]) => {
  const base = Array.isArray(input) ? input.slice(0, 24) : [];
  const normalized = Array.from({ length: 24 }, (_item, index) => {
    const value = base[index];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  });
  return normalized;
};

// ---------------------------------------------------------------------------
// §1.4 — deriveAggregates
// Pure helper: compute totalMl and logHours from an entries array.
// Called from updateHistoryForLog and undoHistoryForLog to maintain the
// critical invariant:
//   totalMl === entries.reduce((sum, e) => sum + e.amountMl, 0)
//   logHours[h] === entries.filter(e => getHours(e.timestamp) === h).length
// ---------------------------------------------------------------------------
export function deriveAggregates(entries: LogEntry[]): { totalMl: number; logHours: number[] } {
  const logHours = Array.from({ length: 24 }, () => 0);
  let totalMl = 0;
  for (const entry of entries) {
    totalMl += entry.amountMl;
    const hour = new Date(entry.timestamp).getHours();
    logHours[hour] += 1;
  }
  return { totalMl, logHours };
}

// ---------------------------------------------------------------------------
// §3.4 — normalizeHistory
// Pass-through entries when present and valid. Never fabricate them when absent.
// ---------------------------------------------------------------------------
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

    // Validate entries if present — filter out any malformed items
    let entries: LogEntry[] | undefined;
    if (Array.isArray(entry.entries)) {
      const valid = entry.entries.filter(
        (e): e is LogEntry =>
          !!e &&
          typeof e === "object" &&
          typeof (e as any).id === "string" &&
          typeof (e as any).timestamp === "string" &&
          typeof (e as any).amountMl === "number" &&
          Number.isFinite((e as any).amountMl) &&
          (e as any).amountMl > 0
      );
      // Don't store an empty array — treat as legacy (undefined)
      if (valid.length > 0) {
        entries = valid;
      }
    }

    result[key] = {
      date: key,
      totalMl,
      goalMl,
      goodThresholdMl,
      logHours: ensureLogHours(entry.logHours),
      ...(entries ? { entries } : {}),
    };
  }
  return result;
};

// ---------------------------------------------------------------------------
// §2.3 — trimHistory
// Strip entries past the 7-day retention window while keeping the summary.
// The existing day-level cutoff (120-day HISTORY_RETENTION_DAYS) is unchanged.
// ---------------------------------------------------------------------------
export const trimHistory = (
  history: HydrationHistory,
  now: Date,
  retentionDays = HISTORY_RETENTION_DAYS,
  entryRetentionDays = ENTRY_RETENTION_DAYS
) => {
  const cutoffKey = getDateKey(addDays(now, -Math.max(1, retentionDays) + 1));
  const entryCutoffKey = getDateKey(addDays(now, -Math.max(1, entryRetentionDays) + 1));
  const trimmed: HydrationHistory = {};

  for (const [key, value] of Object.entries(history)) {
    if (key < cutoffKey) {
      continue; // drop entire day (existing behaviour)
    }
    if (key < entryCutoffKey && value.entries) {
      // Strip entries but keep summary
      const { entries: _entries, ...summary } = value;
      trimmed[key] = summary;
    } else {
      trimmed[key] = value;
    }
  }

  return trimmed;
};

// ---------------------------------------------------------------------------
// §8 — updateHistoryForLog
// Creates a LogEntry and derives totalMl/logHours from entries.
// ---------------------------------------------------------------------------
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

  // A summary-only current day can come from an older persisted snapshot or
  // backup. Its individual entries cannot be reconstructed truthfully. Keep
  // that day summary-only and add to its known aggregates so the first new log
  // cannot erase intake recorded earlier that day.
  if (
    existing &&
    (!existing.entries || existing.entries.length === 0) &&
    existing.totalMl > 0
  ) {
    const logHours = ensureLogHours(existing.logHours);
    logHours[now.getHours()] += 1;

    return {
      ...history,
      [dateKey]: {
        ...existing,
        date: dateKey,
        totalMl: existing.totalMl + amountMl,
        goalMl,
        goodThresholdMl,
        logHours,
        entries: undefined,
      },
    };
  }

  // Create the new entry — ID is timestamp-ms + 4-char random suffix for
  // same-millisecond safety (no external dependency needed).
  const newEntry: LogEntry = {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: now.toISOString(),
    amountMl,
  };

  // Append to existing entries (or start fresh)
  const existingEntries = existing?.entries ?? [];
  const nextEntries = [...existingEntries, newEntry];

  // Derive aggregates from entries (enforces the invariant)
  const { totalMl, logHours } = deriveAggregates(nextEntries);

  const next: HydrationDaySummary = {
    date: dateKey,
    totalMl,
    goalMl,
    goodThresholdMl,
    logHours,
    entries: nextEntries,
  };

  return {
    ...history,
    [dateKey]: next,
  };
};

// ---------------------------------------------------------------------------
// §4.2 — undoHistoryForLog
// Remove the most recent entry from the given day and re-derive aggregates.
// Pure function — no store, no side effects.
// ---------------------------------------------------------------------------
export const undoHistoryForLog = (
  history: HydrationHistory,
  dateKey: string
): HydrationHistory => {
  const daySummary = history[dateKey];

  // Can only undo if day has entries
  if (!daySummary?.entries || daySummary.entries.length === 0) {
    return history;
  }

  // Sort descending by timestamp; remove the most recent (index 0 after sort)
  const sortedEntries = [...daySummary.entries].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const remainingEntries = sortedEntries.slice(1);

  // Derive new aggregates from remaining entries
  const { totalMl, logHours } = deriveAggregates(remainingEntries);

  const nextSummary: HydrationDaySummary = {
    ...daySummary,
    // entries=undefined when empty (no empty array stored, consistent with normalizeHistory)
    entries: remainingEntries.length > 0 ? remainingEntries : undefined,
    totalMl,
    logHours,
  };

  return {
    ...history,
    [dateKey]: nextSummary,
  };
};

// ---------------------------------------------------------------------------
// §10 — resetHistoryForDate
// Clear entries on reset — undefined = fresh start.
// ---------------------------------------------------------------------------
export const resetHistoryForDate = (history: HydrationHistory, dateKey: string, goalMl: number, goodThresholdMl: number) => {
  return {
    ...history,
    [dateKey]: {
      date: dateKey,
      totalMl: 0,
      goalMl,
      goodThresholdMl,
      logHours: Array.from({ length: 24 }, () => 0),
      // entries deliberately omitted (undefined) — reset means fresh start
    },
  };
};

// ---------------------------------------------------------------------------
// §11 — removeEntryFromHistory
// Remove a specific entry by ID, and fully re-derive aggregates.
// ---------------------------------------------------------------------------
export const removeEntryFromHistory = (
  history: HydrationHistory,
  dateKey: string,
  entryId: string
): HydrationHistory => {
  const daySummary = history[dateKey];

  if (!daySummary?.entries || daySummary.entries.length === 0) {
    return history;
  }

  const remainingEntries = daySummary.entries.filter((e) => e.id !== entryId);
  if (remainingEntries.length === daySummary.entries.length) {
    return history; // Entry not found
  }

  const { totalMl, logHours } = deriveAggregates(remainingEntries);

  const nextSummary: HydrationDaySummary = {
    ...daySummary,
    entries: remainingEntries.length > 0 ? remainingEntries : undefined,
    totalMl,
    logHours,
  };

  return {
    ...history,
    [dateKey]: nextSummary,
  };
};

export const buildDateKeys = (today: Date, days: number) =>
  Array.from({ length: days }, (_item, index) => getDateKey(addDays(today, -(days - 1 - index))));

export const computeHistoryOverview = (
  history: HydrationHistory,
  now: Date,
  days: number,
  fallbackGoalMl: number
) => {
  const keys = buildDateKeys(now, days);
  const totals = keys.map((key) => history[key]?.totalMl ?? 0);
  const trackedTotals = totals.filter((value) => value > 0);
  const averageDailyMl = trackedTotals.length
    ? trackedTotals.reduce((sum, value) => sum + value, 0) / trackedTotals.length
    : 0;
  const goalHits = keys.filter((key) => {
    const summary = history[key];
    const goalMl = summary?.goalMl ?? fallbackGoalMl;
    return goalMl > 0 && (summary?.totalMl ?? 0) >= goalMl;
  }).length;

  return {
    keys,
    totals,
    trackedDays: trackedTotals.length,
    averageDailyMl,
    goalHitRatePercent: keys.length ? Math.round((goalHits / keys.length) * 100) : 0,
  };
};

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

// ---------------------------------------------------------------------------
// §7 — computeBestHours (original — kept untouched, ranks by tap count)
// ---------------------------------------------------------------------------
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

export type HourlyVolumeDistribution = {
  volumes: number[];
  estimated: boolean;
};

/**
 * Returns millilitres by local hour. Recent entry-backed days are exact;
 * summary-only days distribute their known total proportionally across the
 * recorded tap counts and are explicitly marked as estimated.
 */
export const getHourlyVolumeDistribution = (
  summary: HydrationDaySummary
): HourlyVolumeDistribution => {
  const volumes = Array.from({ length: 24 }, () => 0);

  if (summary.entries && summary.entries.length > 0) {
    for (const entry of summary.entries) {
      const hour = new Date(entry.timestamp).getHours();
      volumes[hour] += entry.amountMl;
    }
    return { volumes, estimated: false };
  }

  const totalTaps = summary.logHours.reduce((total, taps) => total + taps, 0);
  if (totalTaps > 0) {
    summary.logHours.forEach((taps, hour) => {
      volumes[hour] = (taps / totalTaps) * summary.totalMl;
    });
  }

  return { volumes, estimated: true };
};

// ---------------------------------------------------------------------------
// §7.2 — computeBestHoursByVolume
// Ranks hours by total ml consumed (not tap count). Uses exact entry data
// when available; falls back to proportional distribution via logHours for
// summary-only days.
// ---------------------------------------------------------------------------
export const computeBestHoursByVolume = (history: HydrationHistory, now: Date, days = 30) => {
  const keys = buildDateKeys(now, days);
  const volumes = Array.from({ length: 24 }, () => 0);

  for (const key of keys) {
    const entry = history[key];
    if (!entry) continue;

    const distribution = getHourlyVolumeDistribution(entry);
    distribution.volumes.forEach((volume, hour) => {
      volumes[hour] += volume;
    });
  }

  const ranked = volumes
    .map((vol, h) => ({ hour: h, volume: vol }))
    .filter((item) => item.volume > 0)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 3)
    .map((item) => item.hour);

  return ranked;
};

// ---------------------------------------------------------------------------
// 7.3 — computeSmartPresets
// Reorders presets based on recent consumption history for the current time of day.
// ---------------------------------------------------------------------------
export const computeSmartPresets = (
  history: HydrationHistory,
  now: Date,
  presets: DrinkPreset[],
  days = 7
): DrinkPreset[] => {
  const currentHour = now.getHours();
  const keys = buildDateKeys(now, days);
  
  const matches = new Map<number, number>();
  let totalMatches = 0;
  
  for (const key of keys) {
    const entry = history[key];
    if (!entry || !entry.entries) continue;
    
    for (const e of entry.entries) {
      const eHour = new Date(e.timestamp).getHours();
      // Check if within window (± 2 hours)
      let diff = Math.abs(eHour - currentHour);
      if (diff > 12) diff = 24 - diff;
      
      if (diff <= 2) {
        const amt = e.amountMl;
        matches.set(amt, (matches.get(amt) ?? 0) + 1);
        totalMatches += 1;
      }
    }
  }
  
  // If insufficient data for this time window, keep original order
  if (totalMatches < 3) {
    return presets;
  }
  
  return [...presets].sort((a, b) => {
    const amtA = typeof a === "number" ? a : a.amountMl;
    const amtB = typeof b === "number" ? b : b.amountMl;
    const countA = matches.get(amtA) ?? 0;
    const countB = matches.get(amtB) ?? 0;
    
    if (countA !== countB) {
      return countB - countA; // descending
    }
    // Fallback to original order
    return presets.indexOf(a) - presets.indexOf(b);
  });
};

// ---------------------------------------------------------------------------
// §12 — computeSmartInsight
// Returns a dynamic insight string based on recent history.
// ---------------------------------------------------------------------------
export const computeSmartInsight = (
  history: HydrationHistory,
  now: Date,
  goalMl: number
): string | null => {
  if (goalMl <= 0) return null;
  const keys = buildDateKeys(now, 14); // 2 weeks of data
  let thisWeekVolume = 0;
  let lastWeekVolume = 0;
  let hasEnoughData = true;

  // Split into last 7 days and the 7 days before that
  for (let i = 0; i < 7; i++) {
    const entryLast = history[keys[i]];
    if (!entryLast) hasEnoughData = false;
    lastWeekVolume += entryLast?.totalMl || 0;
    
    const entryThis = history[keys[i + 7]];
    if (!entryThis) hasEnoughData = false;
    thisWeekVolume += entryThis?.totalMl || 0;
  }

  // If we don't have a full 2 weeks of history, check for streaks
  if (!hasEnoughData || lastWeekVolume === 0) {
    const thisWeekGoalHits = keys.slice(7).filter(k => (history[k]?.totalMl || 0) >= goalMl).length;
    if (thisWeekGoalHits >= 3) {
      return "You're on a roll this week! Keep it up.";
    }
    return null;
  }

  const diffPct = Math.round(((thisWeekVolume - lastWeekVolume) / lastWeekVolume) * 100);
  
  if (diffPct > 10) {
    return `Great job! You're drinking ${diffPct}% more water this week compared to last week.`;
  } else if (diffPct < -15) {
    return `You're a bit behind this week. Try adding an extra glass to your routine!`;
  } else {
    return `You're staying remarkably consistent. Excellent work!`;
  }
};

// ---------------------------------------------------------------------------
// §13 — getDayContextSummary
// Returns a string summarizing the day's intake pattern.
// ---------------------------------------------------------------------------
export const getDayContextSummary = (summary: HydrationDaySummary): string | null => {
  if (summary.totalMl === 0) return "No logs recorded for this day.";
  
  let morning = 0; // 5 AM - 11 AM
  let afternoon = 0; // 12 PM - 4 PM
  let evening = 0; // 5 PM - 11 PM
  let night = 0; // 12 AM - 4 AM

  const { volumes } = getHourlyVolumeDistribution(summary);
  volumes.forEach((ml, hr) => {
    if (hr >= 5 && hr < 12) morning += ml;
    else if (hr >= 12 && hr < 17) afternoon += ml;
    else if (hr >= 17 && hr < 24) evening += ml;
    else night += ml;
  });

  const max = Math.max(morning, afternoon, evening, night);
  if (max === 0) return null;

  if (max === morning) return "Most of your intake happened in the morning.";
  if (max === afternoon) return "Most of your intake happened in the afternoon.";
  if (max === evening) return "Most of your intake happened in the evening.";
  if (max === night) return "Most of your intake happened late at night.";
  return null;
};
