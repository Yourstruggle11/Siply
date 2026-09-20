import { getDateKey } from "../../../core/time";
import type { HydrationDaySummary, HydrationHistory } from "./types";

export const WEEKEND_MIN_WEEKS = 4;
export const WEEKEND_MIN_DAYS = 6;
export const WEEKDAY_MIN_DAYS = 12;
export const WEEKEND_MIN_SHIFT_MINUTES = 60;
export const WEEKEND_MAX_SHIFT_MINUTES = 60;

export type WeekendAwareness = {
  eligible: boolean;
  observedWeeks: number;
  weekendDays: number;
  weekdayDays: number;
  shiftMinutes: number;
  reason: "learning" | "insufficient_samples" | "no_difference" | "eligible";
};

const firstLogMinute = (day: HydrationDaySummary): number | null => {
  if (day.entries?.length) {
    const timestamps = day.entries
      .map((entry) => new Date(entry.timestamp))
      .filter((date) => Number.isFinite(date.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());
    if (timestamps.length) {
      return timestamps[0].getHours() * 60 + timestamps[0].getMinutes();
    }
  }

  const hour = day.logHours.findIndex((count) => count > 0);
  return hour >= 0 ? hour * 60 + 30 : null;
};

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};

export const analyzeWeekendAwareness = (
  history: HydrationHistory,
  now = new Date()
): WeekendAwareness => {
  const todayKey = getDateKey(now);
  const activeDays = Object.entries(history)
    .filter(([key, day]) => key <= todayKey && day.totalMl > 0)
    .map(([key, day]) => ({ key, day, minute: firstLogMinute(day) }))
    .filter((item): item is typeof item & { minute: number } => item.minute !== null)
    .sort((a, b) => a.key.localeCompare(b.key));

  const firstDate = activeDays.length
    ? new Date(`${activeDays[0].key}T12:00:00`)
    : now;
  const observedDays = Math.max(
    0,
    Math.floor((now.getTime() - firstDate.getTime()) / 86_400_000) + 1
  );
  const observedWeeks = Math.min(WEEKEND_MIN_WEEKS, Math.floor(observedDays / 7));

  const weekend: number[] = [];
  const weekday: number[] = [];
  activeDays.forEach(({ key, minute }) => {
    const day = new Date(`${key}T12:00:00`).getDay();
    (day === 0 || day === 6 ? weekend : weekday).push(minute);
  });

  if (observedDays < WEEKEND_MIN_WEEKS * 7) {
    return {
      eligible: false,
      observedWeeks,
      weekendDays: weekend.length,
      weekdayDays: weekday.length,
      shiftMinutes: 0,
      reason: "learning",
    };
  }

  if (weekend.length < WEEKEND_MIN_DAYS || weekday.length < WEEKDAY_MIN_DAYS) {
    return {
      eligible: false,
      observedWeeks,
      weekendDays: weekend.length,
      weekdayDays: weekday.length,
      shiftMinutes: 0,
      reason: "insufficient_samples",
    };
  }

  const weekendMedian = median(weekend) ?? 0;
  const weekdayMedian = median(weekday) ?? 0;
  const difference = weekendMedian - weekdayMedian;
  if (difference < WEEKEND_MIN_SHIFT_MINUTES) {
    return {
      eligible: false,
      observedWeeks,
      weekendDays: weekend.length,
      weekdayDays: weekday.length,
      shiftMinutes: 0,
      reason: "no_difference",
    };
  }

  return {
    eligible: true,
    observedWeeks,
    weekendDays: weekend.length,
    weekdayDays: weekday.length,
    shiftMinutes: Math.min(WEEKEND_MAX_SHIFT_MINUTES, Math.round(difference)),
    reason: "eligible",
  };
};

/** Average logging activity for each hour. Lower values mean a nudge may help. */
export const computeHourlyAdherence = (history: HydrationHistory, now = new Date()) => {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 28);
  const cutoffKey = getDateKey(cutoff);
  const totals = Array(24).fill(0) as number[];
  let days = 0;

  Object.entries(history).forEach(([key, day]) => {
    if (key < cutoffKey || key > getDateKey(now) || day.totalMl <= 0) return;
    days += 1;
    day.logHours.forEach((count, hour) => {
      totals[hour] += count;
    });
  });

  return totals.map((total) => (days ? total / days : 0));
};
