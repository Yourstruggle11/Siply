import {
  MAX_ML_PER_REMINDER,
  MIN_INTERVAL_MINUTES,
  POST_LOG_QUIET_MINUTES,
  REMINDER_TARGET_ML,
} from "../../../core/constants";
import { addDays, addMinutes, getDateKey, setTimeOnDate } from "../../../core/time";
import {
  computeAutoPlan,
  computeSipsPerReminder,
  getMaxBaseReminderCount,
  getWindowMinutes,
  litersToMl,
} from "./calculations";
import type { HydrationSettings } from "./types";

export type ReminderPhase = "normal" | "wind_down" | "last_call";

export type ReminderSlot = {
  time: Date;
  mlPerReminder: number;
  sipsPerReminder: number;
  intervalMinutes: number;
  phase: ReminderPhase;
  windowEnd: Date;
};

export type ScheduleResult = {
  slots: ReminderSlot[];
  targetMet: boolean;
  status?: "success" | "no_window" | "target_met" | "config_error";
};

export type ReminderScheduleOptions = {
  weekendShiftMinutes?: number;
};

const buildAnchoredFutureTimes = (
  windowStart: Date,
  latestTimeExclusive: Date,
  intervalMinutes: number,
  earliestTime: Date,
  maxCount: number
) => {
  if (latestTimeExclusive <= windowStart || intervalMinutes <= 0 || maxCount <= 0) return [];
  const intervalMs = intervalMinutes * 60_000;
  const elapsedMs = Math.max(0, earliestTime.getTime() - windowStart.getTime());
  let slotIndex = Math.floor(elapsedMs / intervalMs);
  let candidate = new Date(windowStart.getTime() + slotIndex * intervalMs);
  if (candidate <= earliestTime) slotIndex += 1;

  const times: Date[] = [];
  for (let i = 0; i < Math.min(maxCount, 1000); i += 1) {
    candidate = new Date(windowStart.getTime() + slotIndex * intervalMs);
    if (candidate >= latestTimeExclusive) break;
    times.push(candidate);
    slotIndex += 1;
  }
  return times;
};

const isWeekend = (date: Date) => date.getDay() === 0 || date.getDay() === 6;

const validLastLog = (lastLogAt: string | null | undefined, dateKey: string) => {
  if (!lastLogAt) return null;
  const parsed = new Date(lastLogAt);
  return Number.isFinite(parsed.getTime()) && getDateKey(parsed) === dateKey ? parsed : null;
};

/**
 * Builds a stable rolling plan. Later amounts follow the "no new logs" path,
 * so ignored reminders are accounted for without background JavaScript.
 */
export const computeReminderSchedule = (
  now: Date,
  settings: HydrationSettings,
  consumedMl: number,
  lastLogAt?: string | null,
  options: ReminderScheduleOptions = {}
): ScheduleResult => {
  if (
    !settings ||
    !Number.isFinite(settings.sipMl) ||
    !Number.isFinite(settings.targetLiters) ||
    !Number.isFinite(consumedMl) ||
    settings.sipMl <= 0 ||
    settings.targetLiters <= 0
  ) {
    return { slots: [], targetMet: false, status: "config_error" };
  }

  const windowMinutesTotal = getWindowMinutes(settings);
  if (windowMinutesTotal <= 0) {
    return { slots: [], targetMet: false, status: "no_window" };
  }

  const targetMl = litersToMl(settings.targetLiters);
  const targetMet = consumedMl >= targetMl;
  // Reserve capacity for base reminders across today and tomorrow. Optional
  // nudges are capacity-selected by the notifier after every base reminder,
  // so they can never displace the core plan.
  const maxBase = getMaxBaseReminderCount(settings);
  const todayKey = getDateKey(now);
  const lastLog = validLastLog(lastLogAt, todayKey);
  const quietUntil = lastLog ? addMinutes(lastLog, POST_LOG_QUIET_MINUTES) : null;
  const slots: ReminderSlot[] = [];

  for (const offset of [0, 1]) {
    const date = addDays(now, offset);
    let windowStart = setTimeOnDate(date, settings.windowStart);
    if (settings.weekendAwarenessEnabled && isWeekend(windowStart)) {
      windowStart = addMinutes(windowStart, Math.max(0, options.weekendShiftMinutes ?? 0));
    }
    const windowEnd = setTimeOnDate(date, settings.windowEnd);
    if (windowEnd <= windowStart || windowEnd <= now) continue;

    const dateKey = getDateKey(windowStart);
    const isToday = dateKey === todayKey;
    const remainingMl = isToday ? Math.max(0, targetMl - consumedMl) : targetMl;
    // Avoid a final notification for a quantity smaller than one configured
    // sip; it is neither useful nor actionable.
    if (remainingMl < settings.sipMl) continue;

    const remainingCapacity = maxBase - slots.length;
    if (remainingCapacity <= 0) break;

    const earliest = new Date(
      Math.max(
        now.getTime(),
        windowStart.getTime() - 1,
        isToday && quietUntil ? quietUntil.getTime() - 1 : Number.NEGATIVE_INFINITY
      )
    );
    if (earliest >= windowEnd) continue;

    // Reserve the final 30 minutes as closeout. A single last-call slot sits
    // at the boundary, remains calm, and never receives nudges.
    const closeoutStart = addMinutes(windowEnd, -30);
    const regularEnd = closeoutStart > windowStart ? closeoutStart : windowEnd;
    const availableMinutes = Math.max(
      0,
      Math.ceil((regularEnd.getTime() - Math.max(earliest.getTime(), windowStart.getTime())) / 60_000)
    );
    const plan = computeAutoPlan({
      remainingMl,
      windowMinutes: Math.max(availableMinutes, MIN_INTERVAL_MINUTES),
      minIntervalMinutes: MIN_INTERVAL_MINUTES,
      maxReminders: remainingCapacity,
      desiredReminderMl: REMINDER_TARGET_ML,
    });

    let times = plan
      ? buildAnchoredFutureTimes(windowStart, regularEnd, plan.intervalMinutes, earliest, remainingCapacity)
      : [];

    if (
      closeoutStart >= windowStart &&
      closeoutStart > earliest &&
      times.length < remainingCapacity
    ) {
      const previous = times[times.length - 1];
      const gapOkay = !previous || closeoutStart.getTime() - previous.getTime() >= MIN_INTERVAL_MINUTES * 60_000;
      const logGapOkay = !quietUntil || closeoutStart >= quietUntil;
      if (gapOkay && logGapOkay) times.push(closeoutStart);
    }

    times = times.filter((time) => time > now);
    times.forEach((time, index) => {
      const opportunitiesLeft = Math.max(1, times.length - index);
      const mlPerReminder = Math.min(
        MAX_ML_PER_REMINDER,
        Math.max(1, Math.round(remainingMl / opportunitiesLeft))
      );
      const minutesToEnd = Math.round((windowEnd.getTime() - time.getTime()) / 60_000);
      const phase: ReminderPhase = minutesToEnd === 30
        ? "last_call"
        : minutesToEnd <= 90
          ? "wind_down"
          : "normal";
      slots.push({
        time,
        mlPerReminder,
        sipsPerReminder: computeSipsPerReminder(mlPerReminder, settings.sipMl),
        intervalMinutes: phase === "last_call" ? 0 : plan?.intervalMinutes ?? MIN_INTERVAL_MINUTES,
        phase,
        windowEnd,
      });
    });
  }

  const deduped = Array.from(new Map(slots.map((slot) => [slot.time.getTime(), slot])).values())
    .sort((a, b) => a.time.getTime() - b.time.getTime());

  return {
    slots: deduped,
    targetMet,
    status: targetMet ? "target_met" : "success",
  };
};
