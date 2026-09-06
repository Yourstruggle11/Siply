import * as TaskManager from "expo-task-manager";
import * as BackgroundTask from "expo-background-task";
import { rescheduleNotifications } from "./notifier";
import { hydrateStorage } from "../../../core/storage/migrations";

export const BACKGROUND_FETCH_TASK = "siply-background-fetch";

TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  try {
    const snapshot = await hydrateStorage();
    if (!snapshot.onboarding.completed) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    const result = await rescheduleNotifications(snapshot.settings, snapshot.progress.consumedMl, new Date(), snapshot.quickLog.lastLogAt);
    
    if (result.success && result.scheduled > 0) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.error("Siply: background fetch task failed", error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export const registerBackgroundFetchAsync = async () => {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
      console.warn("Siply: background tasks are restricted");
      return;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
    if (!isRegistered) {
      await BackgroundTask.registerTaskAsync(BACKGROUND_FETCH_TASK, {
        minimumInterval: 15, // 15 minutes
      });
    }
  } catch (error) {
    console.warn("Siply: failed to register background fetch", error);
  }
};
