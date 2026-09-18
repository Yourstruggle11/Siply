import { useState, useEffect, useCallback } from "react";
import { AppState } from "react-native";
import {
  getScheduleSnapshot,
  getCachedSnapshot,
  refreshSnapshotCache,
  type ScheduleSnapshot,
  type SerializedSlot,
} from "../../features/hydration/notifications/scheduleEngine";

/**
 * Hook that provides the persisted schedule snapshot.
 *
 * The snapshot is the SOURCE OF TRUTH for what is actually scheduled with the
 * OS. The `useHydrationPlan` hook reads `nextReminderAt` from here so the
 * displayed time always matches the real scheduled notification.
 *
 * Refreshes on mount, on foreground, and every 2 minutes (in case a
 * background reconcile updated the snapshot).
 */
export const useScheduleSnapshot = () => {
  const [snapshot, setSnapshot] = useState<ScheduleSnapshot | null>(
    () => getCachedSnapshot()
  );

  const refresh = useCallback(async () => {
    const fresh = await refreshSnapshotCache();
    setSnapshot(fresh);
  }, []);

  useEffect(() => {
    // Initial load
    void refresh();

    // Refresh every 2 minutes (in case background task updated the snapshot)
    const interval = setInterval(() => void refresh(), 2 * 60 * 1000);

    // Refresh on foreground
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void refresh();
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [refresh]);

  return { snapshot, refresh };
};

/**
 * Get the next reminder time from a snapshot's slots.
 * Returns null if no future slots exist.
 */
export const getNextReminderFromSnapshot = (
  snapshot: ScheduleSnapshot | null,
  now: Date = new Date()
): Date | null => {
  if (!snapshot?.slots?.length) return null;

  const nowMs = now.getTime();
  for (const slot of snapshot.slots) {
    const slotTime = new Date(slot.time);
    if (slotTime.getTime() > nowMs) {
      return slotTime;
    }
  }
  return null;
};

/**
 * Get the first slot's ml and sip values from the snapshot.
 */
export const getNextSlotDetails = (
  snapshot: ScheduleSnapshot | null,
  now: Date = new Date()
): SerializedSlot | null => {
  if (!snapshot?.slots?.length) return null;

  const nowMs = now.getTime();
  for (const slot of snapshot.slots) {
    const slotTime = new Date(slot.time);
    if (slotTime.getTime() > nowMs) {
      return slot;
    }
  }
  return null;
};
