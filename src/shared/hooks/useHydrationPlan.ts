import { useMemo } from "react";
import {
  REMINDER_TARGET_ML,
} from "../../core/constants";
import {
  computeHydrationPlan,
  computeSipsPerReminder,
  litersToMl,
} from "../../features/hydration/domain/calculations";
import { HydrationPlan } from "../../features/hydration/domain/types";
import { computeReminderSchedule } from "../../features/hydration/domain/schedule";
import { useHydrationStore } from "../../features/hydration/state/hydrationStore";

export const useHydrationPlan = (): HydrationPlan => {
  const settings = useHydrationStore((s) => s.settings);
  const progress = useHydrationStore((s) => s.progress);

  return useMemo((): HydrationPlan => {
    const now = new Date();
    const targetMl = litersToMl(settings.targetLiters);
    const schedule = computeReminderSchedule(now, settings, progress.consumedMl);
    const nextSlot = schedule.slots[0] ?? null;
    const remainingMl = Math.max(0, targetMl - progress.consumedMl);
    const fallbackPlan = computeHydrationPlan(settings, remainingMl);
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
      remainingMl,
      consumedMl: progress.consumedMl,
    };
  }, [settings, progress.consumedMl]);
};
