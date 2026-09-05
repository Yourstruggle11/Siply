import * as TaskManager from "expo-task-manager";
import * as BackgroundFetch from "expo-background-fetch";
import { rescheduleNotifications } from "./notifier";
import { hydrateStorage } from "../../../core/storage/migrations";

export const BACKGROUND_FETCH_TASK = "siply-background-fetch";

TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  try {
    const snapshot = await hydrateStorage();
    if (!snapshot.onboarding.completed) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const result = await rescheduleNotifications(snapshot.settings, snapshot.progress.consumedMl);
    
    if (result.success && result.scheduled > 0) {
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }
    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (error) {
    console.error("Siply: background fetch task failed", error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export const registerBackgroundFetchAsync = async () => {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (
      status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
      status === BackgroundFetch.BackgroundFetchStatus.Denied
    ) {
      console.warn("Siply: background fetch is restricted or denied");
      return;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
        minimumInterval: 15 * 60, // 15 minutes
        stopOnTerminate: false,
        startOnBoot: true, // For Android
      });
    }
  } catch (error) {
    console.warn("Siply: failed to register background fetch", error);
  }
};
