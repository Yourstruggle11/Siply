import { parseTimeToMinutes } from "../../../core/time";
import { HydrationSettings } from "./types";

export type AutoPlan = {
  intervalMinutes: number;
  reminders: number;
  mlPerReminder: number;
};

export const litersToMl = (liters: number) => Math.round(liters * 1000);

export const getWindowMinutes = (settings: HydrationSettings) => {
  const startMinutes = parseTimeToMinutes(settings.windowStart) ?? 0;
  const endMinutes = parseTimeToMinutes(settings.windowEnd) ?? 0;
  if (startMinutes === endMinutes) {
    return 0;
  }
  if (endMinutes > startMinutes) {
    return endMinutes - startMinutes;
  }
  return 24 * 60 - startMinutes + endMinutes;
};

export const computeAutoPlan = (input: {
  remainingMl: number;
  windowMinutes: number;
  minIntervalMinutes: number;
  maxReminders: number;
  desiredReminderMl: number;
}): AutoPlan | null => {
  const { remainingMl, windowMinutes, minIntervalMinutes, maxReminders, desiredReminderMl } = input;

  if (remainingMl <= 0 || windowMinutes <= 0) {
    return null;
  }

  const maxByInterval = Math.max(1, Math.floor(windowMinutes / minIntervalMinutes));
  const allowedReminders = Math.max(1, Math.min(maxReminders, maxByInterval));
  const desiredReminders = Math.max(1, Math.ceil(remainingMl / desiredReminderMl));
  const initialReminders = Math.min(allowedReminders, desiredReminders);
  const intervalMinutes = Math.max(minIntervalMinutes, Math.floor(windowMinutes / initialReminders));
  const adjustedReminders = Math.max(1, Math.floor(windowMinutes / intervalMinutes));
  const reminders = Math.min(allowedReminders, adjustedReminders);
  const mlPerReminder = Math.max(1, Math.round(remainingMl / reminders));

  return { intervalMinutes, reminders, mlPerReminder };
};

export const computeSipsPerReminder = (mlPerReminder: number, sipMl: number) =>
  Math.max(1, Math.round(mlPerReminder / sipMl));
