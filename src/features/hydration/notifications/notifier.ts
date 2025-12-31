import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import {
  APP_NAME,
  MAX_NOTIFICATIONS_PER_DAY,
  NOTIFICATION_ACTION_LOG,
  NOTIFICATION_CATEGORY_ID,
  NUDGE_MINUTES,
} from "../../../core/constants";
import { addMinutes } from "../../../core/time";
import { computeReminderSchedule } from "../domain/schedule";
import { HydrationSettings } from "../domain/types";

const ANDROID_CHANNEL_SOUND = "siply-reminders-sound";
const ANDROID_CHANNEL_SILENT = "siply-reminders-silent";
let channelsReady: Promise<void> | null = null;
const NOTIFICATION_SOUND =
  Platform.OS === "android" ? "siply_reminder" : "siply_reminder.wav";

const formatReminderBody = (ml: number, sips: number) => `Drink ~${ml} ml (${sips} sips)`;
const formatNudgeBody = (ml: number, sips: number) => `Reminder: ~${ml} ml (${sips} sips)`;
const formatFinalNudgeBody = (ml: number) => `Still time for ~${ml} ml`;

const getChannelId = (soundEnabled: boolean) =>
  soundEnabled ? ANDROID_CHANNEL_SOUND : ANDROID_CHANNEL_SILENT;

type NotificationScheduleResult = {
  success: boolean;
  requested: number;
  scheduled: number;
  failed: number;
  errors: string[];
};

const buildContent = (body: string, soundEnabled: boolean, data?: Record<string, unknown>) => ({
  title: APP_NAME,
  body,
  sound: soundEnabled ? NOTIFICATION_SOUND : undefined,
  priority: soundEnabled
    ? Notifications.AndroidNotificationPriority.HIGH
    : Notifications.AndroidNotificationPriority.DEFAULT,
  vibrate: soundEnabled ? [0, 250, 250, 250] : undefined,
  categoryIdentifier: NOTIFICATION_CATEGORY_ID,
  data,
});

const buildTrigger = (
  date: Date,
  channelId: string
): Notifications.NotificationTriggerInput => {
  const base: Notifications.DateTriggerInput = {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date,
  };
  if (Platform.OS === "android") {
    return { ...base, channelId };
  }
  return base;
};

export const configureNotificationChannels = async () => {
  if (Platform.OS !== "android") {
    return;
  }

  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_SOUND, {
    name: "Siply reminders",
    importance: Notifications.AndroidImportance.HIGH,
    sound: NOTIFICATION_SOUND,
    enableVibrate: true,
    vibrationPattern: [0, 250, 250, 250],
    enableLights: true,
    lightColor: "#6B7C8D",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    showBadge: false,
  });

  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_SILENT, {
    name: "Siply reminders (silent)",
    importance: Notifications.AndroidImportance.LOW,
    sound: null,
    enableVibrate: false,
    vibrationPattern: null,
    enableLights: false,
    lightColor: "#6B7C8D",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    showBadge: false,
  });
};

const ensureNotificationChannels = async () => {
  if (Platform.OS !== "android") {
    return;
  }
  if (!channelsReady) {
    channelsReady = configureNotificationChannels().catch((error) => {
      channelsReady = null;
      throw error;
    });
  }
  await channelsReady;
};

export const configureNotificationActions = async () => {
  await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORY_ID, [
    {
      identifier: NOTIFICATION_ACTION_LOG,
      buttonTitle: "I drank",
      options: {
        opensAppToForeground: false,
      },
    },
  ]);
};

export const cancelAllNotifications = async () => {
  await Notifications.cancelAllScheduledNotificationsAsync();
};

export const scheduleNotifications = async (
  settings: HydrationSettings,
  consumedMl: number,
  now = new Date()
) => {
  const errors: string[] = [];
  if (!settings || typeof settings.soundEnabled !== "boolean") {
    return {
      success: false,
      requested: 0,
      scheduled: 0,
      failed: 0,
      errors: ["Invalid settings provided to scheduleNotifications."],
    };
  }

  if (Platform.OS === "android") {
    try {
      await ensureNotificationChannels();
    } catch (error) {
      return {
        success: false,
        requested: 0,
        scheduled: 0,
        failed: 0,
        errors: [error instanceof Error ? error.message : "Failed to configure notification channels."],
      };
    }
  }

  let schedule;
  try {
    schedule = computeReminderSchedule(now, settings, consumedMl);
  } catch (error) {
    return {
      success: false,
      requested: 0,
      scheduled: 0,
      failed: 0,
      errors: [error instanceof Error ? error.message : "Failed to compute schedule."],
    };
  }

  if (!schedule?.slots?.length) {
    return {
      success: true,
      requested: 0,
      scheduled: 0,
      failed: 0,
      errors: [],
    };
  }

  const channelId = getChannelId(settings.soundEnabled);
  const factor = settings.escalationEnabled ? 1 + NUDGE_MINUTES.length : 1;
  const maxBase = Math.max(1, Math.floor(MAX_NOTIFICATIONS_PER_DAY / factor));
  const baseSchedule = schedule.slots.slice(0, maxBase);
  const horizonEnd = addMinutes(now, 24 * 60);

  const requests: Promise<string>[] = [];
  let requested = 0;

  for (const slot of baseSchedule) {
    if (slot.time > horizonEnd) {
      continue;
    }
    const content = buildContent(
      formatReminderBody(slot.mlPerReminder, slot.sipsPerReminder),
      settings.soundEnabled,
      { ml: slot.mlPerReminder }
    );
    requests.push(
      Notifications.scheduleNotificationAsync({
        content,
        trigger: buildTrigger(slot.time, channelId),
      })
    );
    requested += 1;

    if (settings.escalationEnabled) {
      for (const offset of NUDGE_MINUTES) {
        const nudgeTime = addMinutes(slot.time, offset);
        if (nudgeTime > horizonEnd) {
          continue;
        }
        requests.push(
          Notifications.scheduleNotificationAsync({
            content: buildContent(
              offset === NUDGE_MINUTES[0]
                ? formatNudgeBody(slot.mlPerReminder, slot.sipsPerReminder)
                : formatFinalNudgeBody(slot.mlPerReminder),
              settings.soundEnabled,
              { ml: slot.mlPerReminder }
            ),
            trigger: buildTrigger(nudgeTime, channelId),
          })
        );
        requested += 1;
      }
    }
  }

  if (!requests.length) {
    return {
      success: true,
      requested: 0,
      scheduled: 0,
      failed: 0,
      errors: [],
    };
  }

  const results = await Promise.allSettled(requests);
  const scheduled = results.filter((result) => result.status === "fulfilled").length;
  const failed = results.length - scheduled;
  results.forEach((result) => {
    if (result.status === "rejected") {
      errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
    }
  });

  if (failed > 0) {
    console.warn("Siply: notification scheduling had failures", {
      requested,
      scheduled,
      failed,
    });
  }

  return {
    success: failed === 0,
    requested,
    scheduled,
    failed,
    errors,
  };
};

export const rescheduleNotifications = async (
  settings: HydrationSettings,
  consumedMl: number,
  now = new Date()
) => {
  const errors: string[] = [];
  try {
    await cancelAllNotifications();
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Failed to cancel notifications.");
  }

  const result = await scheduleNotifications(settings, consumedMl, now);
  return {
    ...result,
    errors: [...errors, ...result.errors],
    success: errors.length === 0 && result.success,
  };
};

export const sendTestNotification = async () => {
  try {
    const permissions = await Notifications.getPermissionsAsync();
    if (!permissions.granted) {
      if (permissions.canAskAgain) {
        const requested = await Notifications.requestPermissionsAsync();
        if (!requested.granted) {
          console.warn("Siply: notifications permission not granted.");
          return;
        }
      } else {
        console.warn("Siply: notifications permission is denied.");
        return;
      }
    }

    await ensureNotificationChannels();
    const channelId = getChannelId(true);
    const triggerDate = new Date(Date.now() + 1000);
    await Notifications.scheduleNotificationAsync({
      content: {
        ...buildContent("Test reminder: Drink 200 ml (13 sips)", true, {
          forceSound: true,
          ml: 200,
        }),
      },
      trigger: buildTrigger(triggerDate, channelId),
    });
  } catch (error) {
    console.warn("Siply: failed to schedule test notification", error);
  }
};
