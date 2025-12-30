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

const formatReminderBody = (ml: number, sips: number) => `Drink ~${ml} ml (${sips} sips)`;
const formatNudgeBody = (ml: number, sips: number) => `Reminder: ~${ml} ml (${sips} sips)`;
const formatFinalNudgeBody = (ml: number) => `Still time for ~${ml} ml`;

const getChannelId = (soundEnabled: boolean) =>
  soundEnabled ? ANDROID_CHANNEL_SOUND : ANDROID_CHANNEL_SILENT;

const buildContent = (body: string, soundEnabled: boolean, data?: Record<string, unknown>) => ({
  title: APP_NAME,
  body,
  sound: soundEnabled ? "default" : undefined,
  priority: soundEnabled
    ? Notifications.AndroidNotificationPriority.MAX
    : Notifications.AndroidNotificationPriority.DEFAULT,
  vibrate: soundEnabled ? [0, 250, 250, 250] : undefined,
  categoryIdentifier: NOTIFICATION_CATEGORY_ID,
  data,
});

export const configureNotificationChannels = async () => {
  if (Platform.OS !== "android") {
    return;
  }

  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_SOUND, {
    name: "Siply reminders",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
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
  const schedule = computeReminderSchedule(now, settings, consumedMl);
  const channelId = getChannelId(settings.soundEnabled);
  const factor = settings.escalationEnabled ? 1 + NUDGE_MINUTES.length : 1;
  const maxBase = Math.max(1, Math.floor(MAX_NOTIFICATIONS_PER_DAY / factor));
  const baseSchedule = schedule.slots.slice(0, maxBase);
  const horizonEnd = addMinutes(now, 24 * 60);

  let scheduled = 0;
  for (const slot of baseSchedule) {
    await Notifications.scheduleNotificationAsync({
      content: buildContent(
        formatReminderBody(slot.mlPerReminder, slot.sipsPerReminder),
        settings.soundEnabled,
        { ml: slot.mlPerReminder }
      ),
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: slot.time,
        channelId,
      },
    });
    scheduled += 1;

    if (settings.escalationEnabled) {
      for (const offset of NUDGE_MINUTES) {
        const nudgeTime = addMinutes(slot.time, offset);
        if (nudgeTime > horizonEnd) {
          continue;
        }
        await Notifications.scheduleNotificationAsync({
          content: buildContent(
            offset === NUDGE_MINUTES[0]
              ? formatNudgeBody(slot.mlPerReminder, slot.sipsPerReminder)
              : formatFinalNudgeBody(slot.mlPerReminder),
            settings.soundEnabled,
            { ml: slot.mlPerReminder }
          ),
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: nudgeTime,
            channelId,
          },
        });
        scheduled += 1;
      }
    }
  }

  return scheduled;
};

export const rescheduleNotifications = async (
  settings: HydrationSettings,
  consumedMl: number,
  now = new Date()
) => {
  await configureNotificationChannels();
  await configureNotificationActions();
  await cancelAllNotifications();
  return scheduleNotifications(settings, consumedMl, now);
};

export const sendTestNotification = async () => {
  const channelId = getChannelId(true);
  await Notifications.scheduleNotificationAsync({
    content: {
      ...buildContent("Test reminder: Drink 200 ml (13 sips)", true, {
        forceSound: true,
        ml: 200,
      }),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 1,
      repeats: false,
      channelId,
    },
  });
};
