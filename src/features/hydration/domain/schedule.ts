import {
  MAX_NOTIFICATIONS_PER_DAY,
  MIN_INTERVAL_MINUTES,
  NUDGE_MINUTES,
  REMINDER_TARGET_ML,
} from "../../../core/constants";
import { addDays, addMinutes, setTimeOnDate } from "../../../core/time";
import { computeAutoPlan, computeSipsPerReminder, getWindowMinutes, litersToMl } from "./calculations";
import { HydrationSettings } from "./types";

export type ReminderSlot = {
  time: Date;
  mlPerReminder: number;
  sipsPerReminder: number;
  intervalMinutes: number;
};

export type ScheduleResult = {
  slots: ReminderSlot[];
  targetMet: boolean;
};

const buildWindowTimes = (
  start: Date,
  end: Date,
  intervalMinutes: number,
  maxCount: number
) => {
  const times: Date[] = [];
  if (end <= start || intervalMinutes <= 0) {
    return times;
  }
  for (let current = new Date(start); current < end && times.length < maxCount; current = addMinutes(current, intervalMinutes)) {
    times.push(new Date(current));
  }
  return times;
};

const buildSlots = (
  times: Date[],
  mlPerReminder: number,
  intervalMinutes: number,
  sipMl: number
) => {
  const sips = computeSipsPerReminder(mlPerReminder, sipMl);
  return times.map((time) => ({
    time,
    mlPerReminder,
    sipsPerReminder: sips,
    intervalMinutes,
  }));
};

export const computeReminderSchedule = (
  now: Date,
  settings: HydrationSettings,
  consumedMl: number
): ScheduleResult => {
  const windowMinutesTotal = getWindowMinutes(settings);
  if (windowMinutesTotal <= 0) {
    return { slots: [], targetMet: false };
  }

  const targetMl = litersToMl(settings.targetLiters);
  const targetMet = consumedMl >= targetMl;
  const maxBase = Math.max(
    1,
    Math.floor(MAX_NOTIFICATIONS_PER_DAY / (settings.escalationEnabled ? 1 + NUDGE_MINUTES.length : 1))
  );

  const horizonEnd = addMinutes(now, 24 * 60);

  const windows = [-1, 0, 1]
    .map((offset) => {
      const start = setTimeOnDate(addDays(now, offset), settings.windowStart);
      const end = addMinutes(start, windowMinutesTotal);
      return { start, end };
    })
    .filter((window) => window.end > now && window.start <= horizonEnd)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const slots: ReminderSlot[] = [];

  for (const window of windows) {
    const remainingCapacity = maxBase - slots.length;
    if (remainingCapacity <= 0) {
      break;
    }

    const isCurrent = now >= window.start && now < window.end;
    const remainingMl = isCurrent ? Math.max(targetMl - consumedMl, 0) : targetMl;
    const windowMinutes = isCurrent
      ? Math.max(0, Math.floor((window.end.getTime() - now.getTime()) / 60000))
      : windowMinutesTotal;

    const plan =
      remainingMl > 0
        ? computeAutoPlan({
            remainingMl,
            windowMinutes,
            minIntervalMinutes: MIN_INTERVAL_MINUTES,
            maxReminders: remainingCapacity,
            desiredReminderMl: REMINDER_TARGET_ML,
          })
        : null;

    if (!plan) {
      continue;
    }

    let start = isCurrent ? addMinutes(now, plan.intervalMinutes) : window.start;
    let times = buildWindowTimes(start, window.end, plan.intervalMinutes, remainingCapacity);

    if (isCurrent && times.length === 0 && windowMinutes > 0) {
      const immediate = addMinutes(now, 1);
      if (immediate < window.end) {
        times = [immediate];
      }
    }

    slots.push(...buildSlots(times, plan.mlPerReminder, plan.intervalMinutes, settings.sipMl));
  }

  return { slots, targetMet };
};
