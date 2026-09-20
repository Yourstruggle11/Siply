import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import {
  getCachedSnapshot,
  getNextReminderFromSnapshot,
  getNextSlotDetails,
  refreshSnapshotCache,
  subscribeScheduleSnapshot,
  type ScheduleSnapshot,
} from "../../features/hydration/notifications/scheduleEngine";

export { getNextReminderFromSnapshot, getNextSlotDetails };

/** Reactive view of the persisted, OS-verified reminder plan. */
export const useScheduleSnapshot = () => {
  const [snapshot, setSnapshot] = useState<ScheduleSnapshot | null>(() => getCachedSnapshot());

  const refresh = useCallback(async () => {
    setSnapshot(await refreshSnapshotCache());
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeScheduleSnapshot(setSnapshot);
    void refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      unsubscribe();
      subscription.remove();
    };
  }, [refresh]);

  return { snapshot, refresh };
};
