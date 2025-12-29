import { MIN_INTERVAL_MINUTES } from "../../../core/constants";
import { parseTimeToMinutes } from "../../../core/time";
import { HydrationSettings } from "./types";

const clampNumber = (value: number, min: number) => (value < min ? min : value);

export const litersToMl = (liters: number) => Math.round(liters * 1000);

export const getWindowMinutes = (settings: HydrationSettings) => {
  const startMinutes = parseTimeToMinutes(settings.windowStart) ?? 0;
  const endMinutes = parseTimeToMinutes(settings.windowEnd) ?? 0;
  const duration = endMinutes - startMinutes;
  return duration > 0 ? duration : 0;
};

export const getIntervalMinutes = (settings: HydrationSettings) =>
  clampNumber(settings.intervalMinutes, MIN_INTERVAL_MINUTES);

export const computeRemindersPerDay = (settings: HydrationSettings) => {
  const interval = getIntervalMinutes(settings);
  const windowMinutes = getWindowMinutes(settings);
  if (windowMinutes <= 0) {
    return 1;
  }
  return Math.max(1, Math.floor(windowMinutes / interval));
};

export const computeMlPerReminder = (settings: HydrationSettings) => {
  const totalMl = litersToMl(settings.targetLiters);
  const reminders = computeRemindersPerDay(settings);
  return Math.max(1, Math.round(totalMl / reminders));
};

export const computeSipsPerReminder = (settings: HydrationSettings) => {
  const mlPerReminder = computeMlPerReminder(settings);
  return Math.max(1, Math.round(mlPerReminder / settings.sipMl));
};
