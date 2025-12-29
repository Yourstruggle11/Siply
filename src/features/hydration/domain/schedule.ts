import { MIN_INTERVAL_MINUTES } from "../../../core/constants";
import { addDays, addMinutes, parseTimeToMinutes, setTimeOnDate } from "../../../core/time";
import { HydrationSettings } from "./types";

const buildWindowTimes = (start: Date, end: Date, intervalMinutes: number) => {
  const times: Date[] = [];
  if (end <= start) {
    return times;
  }
  for (let current = new Date(start); current < end; current = addMinutes(current, intervalMinutes)) {
    times.push(new Date(current));
  }
  return times;
};

export const computeReminderSchedule = (now: Date, settings: HydrationSettings) => {
  const intervalMinutes = Math.max(settings.intervalMinutes, MIN_INTERVAL_MINUTES);
  const startMinutes = parseTimeToMinutes(settings.windowStart);
  const endMinutes = parseTimeToMinutes(settings.windowEnd);

  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return [] as Date[];
  }

  const windowStartToday = setTimeOnDate(now, settings.windowStart);
  const windowEndToday = setTimeOnDate(now, settings.windowEnd);
  const windowStartTomorrow = addDays(windowStartToday, 1);
  const windowEndTomorrow = addDays(windowEndToday, 1);

  const candidates = [
    ...buildWindowTimes(windowStartToday, windowEndToday, intervalMinutes),
    ...buildWindowTimes(windowStartTomorrow, windowEndTomorrow, intervalMinutes),
  ];

  const horizonEnd = addMinutes(now, 24 * 60);
  return candidates.filter((time) => time > now && time <= horizonEnd);
};
