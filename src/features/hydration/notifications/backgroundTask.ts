import * as TaskManager from "expo-task-manager";
import * as BackgroundTask from "expo-background-task";
import { reconcile } from "./scheduleEngine";
import { readPersistedHydrationSnapshot } from "../state/hydrationStore";

export const BACKGROUND_FETCH_TASK = "siply-background-fetch";

export const runBackgroundNotificationTask = async () => {
  try {
    const snapshot = await readPersistedHydrationSnapshot();
    if (!snapshot?.onboarding.completed) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    // Use the schedule engine which will check staleness before recomputing.
    // This prevents the background task from needlessly shifting reminder times.
    await reconcile({
      settings: snapshot.settings,
      consumedMl: snapshot.progress.consumedMl,
      lastLogAt: snapshot.quickLog.lastLogAt,
      source: "background_task",
    });

    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.error("Siply: background fetch task failed", error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
};

TaskManager.defineTask(BACKGROUND_FETCH_TASK, runBackgroundNotificationTask);

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
