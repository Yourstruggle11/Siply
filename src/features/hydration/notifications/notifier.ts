import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { APP_NAME, MAX_NOTIFICATIONS_PER_DAY, NUDGE_MINUTES } from "../../../core/constants";
import { addMinutes } from "../../../core/time";
import { computeMlPerReminder, computeSipsPerReminder } from "../domain/calculations";
import { computeReminderSchedule } from "../domain/schedule";
import { HydrationSettings } from "../domain/types";

const ANDROID_CHANNEL_SOUND = "siply-reminders-sound";
const ANDROID_CHANNEL_SILENT = "siply-reminders-silent";

const formatReminderBody = (ml: number, sips: number) => `Drink ~${ml} ml (${sips} sips)`;
const formatNudgeBody = (ml: number, sips: number) => `Reminder: ~${ml} ml (${sips} sips)`;
const formatFinalNudgeBody = (ml: number) => `Still time for ~${ml} ml`;

const getChannelId = (soundEnabled: boolean) =>
  soundEnabled ? ANDROID_CHANNEL_SOUND : ANDROID_CHANNEL_SILENT;

const buildContent = (body: string, soundEnabled: boolean) => ({
  title: APP_NAME,
  body,
  sound: soundEnabled ? "default" : undefined,
  priority: soundEnabled
    ? Notifications.AndroidNotificationPriority.MAX
    : Notifications.AndroidNotificationPriority.DEFAULT,
  vibrate: soundEnabled ? [0, 250, 250, 250] : undefined,
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

export const cancelAllNotifications = async () => {
  await Notifications.cancelAllScheduledNotificationsAsync();
};

export const scheduleNotifications = async (settings: HydrationSettings, now = new Date()) => {
  const schedule = computeReminderSchedule(now, settings);
  const mlPerReminder = computeMlPerReminder(settings);
  const sipsPerReminder = computeSipsPerReminder(settings);
  const channelId = getChannelId(settings.soundEnabled);
  const factor = settings.escalationEnabled ? 1 + NUDGE_MINUTES.length : 1;
  const maxBase = Math.max(1, Math.floor(MAX_NOTIFICATIONS_PER_DAY / factor));
  const baseSchedule = schedule.slice(0, maxBase);
  const horizonEnd = addMinutes(now, 24 * 60);

  let scheduled = 0;
  for (const time of baseSchedule) {
    await Notifications.scheduleNotificationAsync({
      content: buildContent(
        formatReminderBody(mlPerReminder, sipsPerReminder),
        settings.soundEnabled
      ),
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: time,
        channelId,
      },
    });
    scheduled += 1;

    if (settings.escalationEnabled) {
      for (const offset of NUDGE_MINUTES) {
        const nudgeTime = addMinutes(time, offset);
        if (nudgeTime > horizonEnd) {
          continue;
        }
        await Notifications.scheduleNotificationAsync({
          content: buildContent(
            offset === NUDGE_MINUTES[0]
              ? formatNudgeBody(mlPerReminder, sipsPerReminder)
              : formatFinalNudgeBody(mlPerReminder),
            settings.soundEnabled
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

export const rescheduleNotifications = async (settings: HydrationSettings, now = new Date()) => {
  await configureNotificationChannels();
  await cancelAllNotifications();
  return scheduleNotifications(settings, now);
};

export const sendTestNotification = async () => {
  const channelId = getChannelId(true);
  await Notifications.scheduleNotificationAsync({
    content: {
      ...buildContent("Test reminder: Drink 200 ml (13 sips)", true),
      data: { forceSound: true },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 1,
      repeats: false,
      channelId,
    },
  });
};
