import { useMemo } from "react";
import { computeMlPerReminder, computeRemindersPerDay, computeSipsPerReminder, litersToMl } from "../../features/hydration/domain/calculations";
import { computeReminderSchedule } from "../../features/hydration/domain/schedule";
import { useHydration } from "../../features/hydration/state/hydrationStore";

export const useHydrationPlan = () => {
  const { settings, progress } = useHydration();

  return useMemo(() => {
    const targetMl = litersToMl(settings.targetLiters);
    const remindersPerDay = computeRemindersPerDay(settings);
    const mlPerReminder = computeMlPerReminder(settings);
    const sipsPerReminder = computeSipsPerReminder(settings);
    const schedule = computeReminderSchedule(new Date(), settings);
    const nextReminderAt = schedule.length > 0 ? schedule[0] : null;

    return {
      targetMl,
      remindersPerDay,
      mlPerReminder,
      sipsPerReminder,
      nextReminderAt,
      consumedMl: progress.consumedMl,
    };
  }, [settings, progress.consumedMl]);
};
