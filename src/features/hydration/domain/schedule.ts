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

// ---------------------------------------------------------------------------
// Maximum ml we'll ever put in a single reminder. Prevents the "drink 800ml"
// problem when few slots remain and a lot of ml is left.
// ---------------------------------------------------------------------------
const MAX_ML_PER_REMINDER = REMINDER_TARGET_ML * 2; // 400ml

// ---------------------------------------------------------------------------
// Minimum gap between the last regular slot and a Last-Call slot (minutes).
// Prevents "two notifications 5 min apart" at end of day.
// ---------------------------------------------------------------------------
const LAST_CALL_MIN_GAP_MINUTES = 15;

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

// ---------------------------------------------------------------------------
// Anchor-based slot generation for the current window.
//
// Instead of building from window.start and filtering for > now (which shifts
// every time `now` changes), we compute the "aligned" next slot relative to
// the window grid. The grid is: windowStart, windowStart + interval,
// windowStart + 2*interval, ... The first slot is the smallest grid time > now.
//
// This produces STABLE slot times regardless of when `now` is evaluated,
// because the grid is anchored to windowStart which doesn't change.
// ---------------------------------------------------------------------------
const buildAnchoredFutureTimes = (
  windowStart: Date,
  windowEnd: Date,
  intervalMinutes: number,
  now: Date,
  maxCount: number
): Date[] => {
  if (windowEnd <= windowStart || intervalMinutes <= 0 || maxCount <= 0) {
    return [];
  }

  const times: Date[] = [];
  const intervalMs = intervalMinutes * 60 * 1000;
  const elapsedMs = now.getTime() - windowStart.getTime();

  // How many full intervals have passed since windowStart?
  // The next slot is at windowStart + (completedIntervals + 1) * interval
  const completedIntervals = Math.max(0, Math.floor(elapsedMs / intervalMs));
  let nextSlotIndex = completedIntervals + 1;

  const maxIterations = Math.min(maxCount, 1000);
  for (let i = 0; i < maxIterations; i++) {
    const slotTime = new Date(windowStart.getTime() + nextSlotIndex * intervalMs);
    if (slotTime >= windowEnd) {
      break;
    }
    if (slotTime > now) {
      times.push(slotTime);
    }
    nextSlotIndex += 1;
  }

  return times.slice(0, maxCount);
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

    // Use anchor-based slot generation for the current window to produce
    // stable times that don't shift when `now` changes slightly.
    // For future windows (not yet active), build from window.start normally.
    let times: Date[];
    if (isCurrent) {
      times = buildAnchoredFutureTimes(
        window.start,
        window.end,
        plan.intervalMinutes,
        now,
        remainingCapacity
      );
    } else {
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
      times = plannedTimes.slice(0, remainingCapacity);
    }

    // ----- Last Call fallback -----
    // If we're in the current window but no regular slots remain (very end of day),
    // create a single "last call" reminder with smart constraints.
    if (isCurrent && times.length === 0 && windowMinutes > 0) {
      // Don't bother if remaining is trivially small (less than one sip)
      if (remainingMl >= settings.sipMl) {
        // Cap at a reasonable amount — never demand more than MAX_ML_PER_REMINDER
        const ml = Math.min(MAX_ML_PER_REMINDER, Math.max(1, remainingMl));

        // Schedule 5 minutes before window end, or now+2min if already late
        let lastCallTime = new Date(window.end.getTime() - 5 * 60000);
        if (lastCallTime <= now) {
          lastCallTime = addMinutes(now, 2);
        }

        // Ensure minimum gap from the last scheduled slot to avoid rapid-fire
        const lastSlotTime = slots.length > 0 ? slots[slots.length - 1].time : null;
        if (lastSlotTime) {
          const gapMs = lastCallTime.getTime() - lastSlotTime.getTime();
          const minGapMs = LAST_CALL_MIN_GAP_MINUTES * 60000;
          if (gapMs < minGapMs) {
            // Push the last call out to respect the minimum gap
            lastCallTime = new Date(lastSlotTime.getTime() + minGapMs);
          }
        }

        if (lastCallTime < window.end) {
          slots.push({
            time: lastCallTime,
            mlPerReminder: ml,
            sipsPerReminder: computeSipsPerReminder(ml, settings.sipMl),
            intervalMinutes: 0, // sentinel: this is a last-call, not a regular slot
          });
        }
      }
      continue;
    }

    if (!times.length) {
      continue;
    }

    // Cap mlPerReminder to prevent unrealistic "drink 800ml" notifications
    const rawMlPerReminder = Math.max(1, Math.round(remainingMl / times.length));
    const mlPerReminder = Math.min(rawMlPerReminder, MAX_ML_PER_REMINDER);
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
