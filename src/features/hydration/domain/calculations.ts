import { parseTimeToMinutes } from "../../../core/time";
import {
  MAX_NOTIFICATIONS_PER_DAY,
  MIN_INTERVAL_MINUTES,
  NORMAL_NUDGE_FAMILIES_PER_DAY,
  NUDGE_MINUTES,
  REMINDER_TARGET_ML,
  TRANSIENT_NOTIFICATION_RESERVE,
  URGENCY_EXTRA_NUDGE_FAMILIES_PER_DAY,
} from "../../../core/constants";
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
  // Siply's progress day resets at midnight. Overnight windows would span two
  // different progress days, so reject them until a first-class Hydration Day
  // model exists.
  if (endMinutes <= startMinutes) {
    return 0;
  }
  return endMinutes - startMinutes;
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

export const computeHydrationPlan = (
  settings: HydrationSettings,
  remainingMl: number
): AutoPlan | null => {
  const windowMinutes = getWindowMinutes(settings);
  const maxBase = getMaxBaseReminderCount(settings);
  return computeAutoPlan({
    remainingMl,
    windowMinutes,
    minIntervalMinutes: MIN_INTERVAL_MINUTES,
    maxReminders: maxBase,
    desiredReminderMl: REMINDER_TARGET_ML,
  });
};

export const getMaxBaseReminderCount = (settings: HydrationSettings) => {
  const reservedForNudges = settings.escalationEnabled
    ? (NORMAL_NUDGE_FAMILIES_PER_DAY + URGENCY_EXTRA_NUDGE_FAMILIES_PER_DAY)
      * NUDGE_MINUTES.length
      * 2
    : 0;
  return Math.max(
    1,
    MAX_NOTIFICATIONS_PER_DAY - TRANSIENT_NOTIFICATION_RESERVE - reservedForNudges - 2
  );
};

export const computeSipsPerReminder = (mlPerReminder: number, sipMl: number) =>
  Math.max(1, Math.round(mlPerReminder / sipMl));
