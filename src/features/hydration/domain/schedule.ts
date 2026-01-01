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
  status?: "success" | "no_window" | "target_met" | "config_error";
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
  const maxIterations = Math.min(maxCount, 1000);
  for (let current = new Date(start), i = 0; current < end && times.length < maxCount && i < maxIterations; i += 1) {
    times.push(new Date(current));
    const next = addMinutes(current, intervalMinutes);
    if (next.getTime() <= current.getTime()) {
      console.warn("Siply: buildWindowTimes stalled, stopping to avoid infinite loop.");
      break;
    }
    current = next;
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
  if (!settings || settings.sipMl <= 0 || settings.targetLiters <= 0) {
    return { slots: [], targetMet: false, status: "config_error" };
  }

  const windowMinutesTotal = getWindowMinutes(settings);
  if (windowMinutesTotal <= 0) {
    return { slots: [], targetMet: false, status: "no_window" };
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
    if (remainingMl <= 0) {
      continue;
    }
    const windowMinutes = isCurrent
      ? Math.max(0, Math.ceil((window.end.getTime() - now.getTime()) / 60000))
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

    if (!plan || plan.mlPerReminder <= 0 || plan.intervalMinutes <= 0) {
      continue;
    }

    const windowDurationMinutes = Math.max(
      0,
      Math.ceil((window.end.getTime() - window.start.getTime()) / 60000)
    );
    const maxWindowSlots = Math.max(1, Math.ceil(windowDurationMinutes / plan.intervalMinutes));
    const plannedTimes = buildWindowTimes(
      window.start,
      window.end,
      plan.intervalMinutes,
      maxWindowSlots
    );
    const futureTimes = plannedTimes.filter((time) => time > now);
    const times = futureTimes.slice(0, remainingCapacity);

    if (isCurrent && times.length === 0 && windowMinutes > 0) {
      const immediate = addMinutes(now, 1);
      if (immediate < window.end) {
        const ml = Math.max(1, remainingMl);
        slots.push({
          time: immediate,
          mlPerReminder: ml,
          sipsPerReminder: computeSipsPerReminder(ml, settings.sipMl),
          intervalMinutes: 0,
        });
      }
      continue;
    }
    if (!times.length) {
      continue;
    }
    const mlPerReminder = Math.max(1, Math.round(remainingMl / times.length));
    slots.push(...buildSlots(times, mlPerReminder, plan.intervalMinutes, settings.sipMl));
  }

  const deduped: ReminderSlot[] = [];
  const seen = new Set<number>();
  for (const slot of slots) {
    const key = slot.time.getTime();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(slot);
  }

  return {
    slots: deduped,
    targetMet,
    status: targetMet ? "target_met" : "success",
  };
};
