import { useMemo, useState, useEffect } from "react";
import { AppState } from "react-native";
import {
  REMINDER_TARGET_ML,
} from "../../core/constants";
import {
  computeHydrationPlan,
  computeSipsPerReminder,
  litersToMl,
} from "../../features/hydration/domain/calculations";
import { HydrationPlan } from "../../features/hydration/domain/types";
import { useHydrationStore } from "../../features/hydration/state/hydrationStore";
import { useScheduleSnapshot, getNextReminderFromSnapshot, getNextSlotDetails } from "./useScheduleSnapshot";

export const useHydrationPlan = (): HydrationPlan => {
  const settings = useHydrationStore((s) => s.settings);
  const progress = useHydrationStore((s) => s.progress);
  const { snapshot } = useScheduleSnapshot();

  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const updateNow = () => setNow(new Date());
    
    // Update every minute to keep derived values fresh (remainingMl, targetMet)
    const intervalId = setInterval(updateNow, 60000);
    
    // Update immediately when app comes to foreground
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        updateNow();
      }
    });

    return () => {
      clearInterval(intervalId);
      subscription.remove();
    };
  }, []);

  return useMemo((): HydrationPlan => {
    const targetMl = litersToMl(settings.targetLiters);
    const remainingMl = Math.max(0, targetMl - progress.consumedMl);
    const targetMet = progress.consumedMl >= targetMl;
    const fallbackPlan = computeHydrationPlan(settings, remainingMl);
    const fallbackMl = fallbackPlan?.mlPerReminder ?? REMINDER_TARGET_ML;
    const fallbackSips = computeSipsPerReminder(fallbackMl, settings.sipMl);

    // Read next reminder from the persisted schedule snapshot.
    // This is the SOURCE OF TRUTH — it matches what is actually scheduled
    // with the OS, unlike independently recomputing which produces drift.
    const nextSlot = getNextSlotDetails(snapshot, now);
    const nextReminderAt = nextSlot
      ? new Date(nextSlot.time)
      : getNextReminderFromSnapshot(snapshot, now);

    const mlPerReminder = nextSlot?.mlPerReminder ?? fallbackMl;
    const sipsPerReminder = nextSlot?.sipsPerReminder ?? fallbackSips;
    const remindersPerDay = fallbackPlan?.reminders ?? (snapshot?.slots?.length ?? 0);

    return {
      targetMl,
      remindersPerDay,
      mlPerReminder,
      sipsPerReminder,
      nextReminderAt,
      targetMet,
      remainingMl,
      consumedMl: progress.consumedMl,
    };
  }, [settings, progress.consumedMl, now, snapshot]);
};
