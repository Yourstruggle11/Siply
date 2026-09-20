import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import {
  NOTIFICATION_ACTION_SKIP,
  NOTIFICATION_ACTION_SNOOZE,
} from "../../../core/constants";
import { readPersistedHydrationSnapshot } from "../state/hydrationStore";
import { notificationActionDeduplicator } from "./actionDedup";
import { parseSiplyNotificationId, snoozeNotification } from "./notifier";
import { markReminderFamilyHandled } from "./scheduleEngine";

export const BACKGROUND_NOTIFICATION_ACTION_TASK = "siply-notification-actions";

export const handleBackgroundNotificationAction = async (
  payload: Notifications.NotificationTaskPayload
) => {
  if (!("actionIdentifier" in payload)) return;
  const { actionIdentifier, notification } = payload;
  if (
    actionIdentifier !== NOTIFICATION_ACTION_SKIP &&
    actionIdentifier !== NOTIFICATION_ACTION_SNOOZE
  ) return;

  const notificationId = notification.request.identifier;
  if (!notificationId || !(await notificationActionDeduplicator.claimIfUnhandled(notificationId))) {
    return;
  }

  const familyId = notification.request.content.data?.familyId;
  if (actionIdentifier === NOTIFICATION_ACTION_SKIP) {
    if (typeof familyId === "string") {
      await markReminderFamilyHandled(familyId, "skipped");
    }
    return;
  }

  const amount = parseSiplyNotificationId(notificationId)?.ml;
  const snapshot = await readPersistedHydrationSnapshot();
  if (!snapshot || typeof amount !== "number" || amount <= 0) return;
  await snoozeNotification(amount, snapshot.settings);
  if (typeof familyId === "string") {
    await markReminderFamilyHandled(familyId, "snoozed");
  }
};

TaskManager.defineTask<Notifications.NotificationTaskPayload>(
  BACKGROUND_NOTIFICATION_ACTION_TASK,
  async ({ data, error }) => {
    if (!error) {
      await handleBackgroundNotificationAction(data).catch((taskError) => {
        console.warn("Siply: background notification action failed", taskError);
      });
    }
  }
);

export const registerBackgroundNotificationActions = async () => {
  if (Platform.OS !== "android") return;
  await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_ACTION_TASK);
};
