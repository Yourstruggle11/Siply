import { useMemo } from "react";
import {
  MAX_NOTIFICATIONS_PER_DAY,
  MIN_INTERVAL_MINUTES,
  NUDGE_MINUTES,
  REMINDER_TARGET_ML,
} from "../../core/constants";
import {
  computeAutoPlan,
  computeSipsPerReminder,
  getWindowMinutes,
  litersToMl,
} from "../../features/hydration/domain/calculations";
import { computeReminderSchedule } from "../../features/hydration/domain/schedule";
import { useHydration } from "../../features/hydration/state/hydrationStore";

export const useHydrationPlan = () => {
  const { settings, progress } = useHydration();

  return useMemo(() => {
    const now = new Date();
    const targetMl = litersToMl(settings.targetLiters);
    const schedule = computeReminderSchedule(now, settings, progress.consumedMl);
    const nextSlot = schedule.slots[0] ?? null;
    const factor = settings.escalationEnabled ? 1 + NUDGE_MINUTES.length : 1;
    const maxBase = Math.max(1, Math.floor(MAX_NOTIFICATIONS_PER_DAY / factor));
    const fallbackPlan = computeAutoPlan({
      remainingMl: Math.max(targetMl - progress.consumedMl, 0),
      windowMinutes: getWindowMinutes(settings),
      minIntervalMinutes: MIN_INTERVAL_MINUTES,
      maxReminders: maxBase,
      desiredReminderMl: REMINDER_TARGET_ML,
    });
    const fallbackMl = fallbackPlan?.mlPerReminder ?? REMINDER_TARGET_ML;
    const fallbackSips = computeSipsPerReminder(fallbackMl, settings.sipMl);
    const mlPerReminder = nextSlot?.mlPerReminder ?? fallbackMl;
    const sipsPerReminder = nextSlot?.sipsPerReminder ?? fallbackSips;
    const nextReminderAt = nextSlot?.time ?? null;
    const remindersPerDay = fallbackPlan?.reminders ?? schedule.slots.length;

    return {
      targetMl,
      remindersPerDay,
      mlPerReminder,
      sipsPerReminder,
      nextReminderAt,
      targetMet: schedule.targetMet,
      consumedMl: progress.consumedMl,
    };
  }, [settings, progress.consumedMl]);
};
