import * as TaskManager from "expo-task-manager";
import * as BackgroundTask from "expo-background-task";
import { reconcile } from "./scheduleEngine";
import { readPersistedHydrationSnapshot } from "../state/hydrationStore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { recordNotificationDiagnostic } from "./diagnostics";

export const BACKGROUND_FETCH_TASK = "siply-background-fetch";
const REGISTRATION_VERSION_KEY = "siply:background_task_registration:v2";

export const runBackgroundNotificationTask = async () => {
  const startedAt = Date.now();
  try {
    const snapshot = await readPersistedHydrationSnapshot();
    if (!snapshot?.onboarding.completed) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    // Unchanged live inputs verify/repair the existing OS plan. The background
    // worker never shifts reminder times merely because time has passed.
    const result = await reconcile({
      settings: snapshot.settings,
      consumedMl: snapshot.progress.consumedMl,
      lastLogAt: snapshot.quickLog.lastLogAt,
      source: "background_task",
      history: snapshot.history,
    });

    const failed = result.health === "schedule_failed" || result.health === "partially_scheduled";
    await recordNotificationDiagnostic({
      type: "background",
      at: new Date().toISOString(),
      result: failed ? "failed" : "success",
      durationMs: Date.now() - startedAt,
      ...(failed ? { error: `Schedule health: ${result.health}` } : {}),
    }).catch(() => {});

    return failed
      ? BackgroundTask.BackgroundTaskResult.Failed
      : BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.error("Siply: background fetch task failed", error);
    await recordNotificationDiagnostic({
      type: "background",
      at: new Date().toISOString(),
      result: "failed",
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    }).catch(() => {});
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
};

TaskManager.defineTask(BACKGROUND_FETCH_TASK, runBackgroundNotificationTask);

export const registerBackgroundFetchAsync = async () => {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
      console.warn("Siply: background tasks are restricted");
      await recordNotificationDiagnostic({
        type: "background",
        at: new Date().toISOString(),
        result: "restricted",
        durationMs: 0,
      }).catch(() => {});
      return;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
    const registrationVersion = await AsyncStorage.getItem(REGISTRATION_VERSION_KEY);
    if (isRegistered && registrationVersion !== "2") {
      await BackgroundTask.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
    }
    if (!isRegistered || registrationVersion !== "2") {
      await BackgroundTask.registerTaskAsync(BACKGROUND_FETCH_TASK, {
        // Repair/replenishment only. Reminder delivery never depends on this
        // inexact, OS-controlled worker.
        minimumInterval: 360,
      });
      await AsyncStorage.setItem(REGISTRATION_VERSION_KEY, "2");
    }
  } catch (error) {
    console.warn("Siply: failed to register background fetch", error);
  }
};
