import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import {
  APP_NAME,
  MAX_NOTIFICATIONS_PER_DAY,
  NOTIFICATION_ACTION_LOG,
  NOTIFICATION_ACTION_SNOOZE,
  NOTIFICATION_ACTION_SKIP,
  NOTIFICATION_CATEGORY_ID,
  NOTIFICATION_CATEGORY_SUMMARY_ID,
  NOTIFICATION_ACTION_VIEW_HISTORY,
  NUDGE_MINUTES,
} from "../../../core/constants";
import { buildDailySummaryBody } from "./summaryContent";
import { addMinutes } from "../../../core/time";
import { computeReminderSchedule } from "../domain/schedule";
import { computeSipsPerReminder } from "../domain/calculations";
import { HydrationSettings, ReminderTone } from "../domain/types";
import { recordScheduleDiagnostics, recordTestDiagnostics } from "./diagnostics";
import {
  ENCOURAGING_MESSAGES,
  MINIMAL_MESSAGES,
  PLAYFUL_MESSAGES,
  getRandomMessage,
} from "./messages";

const ANDROID_CHANNEL_SOUND = "siply-reminders-sound";
const ANDROID_CHANNEL_SILENT = "siply-reminders-silent";
let channelsReady: Promise<void> | null = null;
const NOTIFICATION_SOUND =
  Platform.OS === "android" ? "siply_reminder" : "siply_reminder.wav";
const NOTIFICATION_ID_PREFIX = "siply";

type SiplyNotificationKind = "reminder" | "nudge" | "test" | "snooze" | "summary";

const getContentSound = (soundEnabled: boolean) => {
  if (!soundEnabled) {
    return undefined;
  }
  if (Platform.OS === "ios") {
    return NOTIFICATION_SOUND;
  }
  // Android sound is controlled by the channel, avoid per-notification sound payload.
  if (Platform.OS === "android" && typeof Platform.Version === "number" && Platform.Version < 26) {
    return NOTIFICATION_SOUND;
  }
  return undefined;
};

const formatReminderBody = (ml: number, sips: number, tone: ReminderTone = "encouraging") => {
  let msg = getRandomMessage(ENCOURAGING_MESSAGES);
  if (tone === "minimal") msg = getRandomMessage(MINIMAL_MESSAGES);
  else if (tone === "playful") msg = getRandomMessage(PLAYFUL_MESSAGES);
  
  return msg.replace("{ml}", String(ml)).replace("{sips}", String(sips));
};

const formatNudgeBody = (ml: number, sips: number, tone: ReminderTone = "encouraging") => {
  let msg = getRandomMessage(ENCOURAGING_MESSAGES);
  if (tone === "minimal") msg = getRandomMessage(MINIMAL_MESSAGES);
  else if (tone === "playful") msg = getRandomMessage(PLAYFUL_MESSAGES);
  
  msg = msg.replace("{ml}", String(ml)).replace("{sips}", String(sips));
  if (tone !== "minimal") {
    return `Reminder: ${msg}`;
  }
  return msg;
};

const formatFinalNudgeBody = (ml: number, tone: ReminderTone = "encouraging") => {
  let msg = getRandomMessage(ENCOURAGING_MESSAGES);
  if (tone === "minimal") msg = getRandomMessage(MINIMAL_MESSAGES);
  else if (tone === "playful") msg = getRandomMessage(PLAYFUL_MESSAGES);
  
  msg = msg.replace("{ml}", String(ml)).replace("{sips}", "1"); // fallback for {sips} if present
  if (tone !== "minimal") {
    return `Final reminder: ${msg}`;
  }
  return msg;
};

const getChannelId = (soundEnabled: boolean) =>
  soundEnabled ? ANDROID_CHANNEL_SOUND : ANDROID_CHANNEL_SILENT;

type NotificationScheduleResult = {
  success: boolean;
  requested: number;
  scheduled: number;
  failed: number;
  errors: string[];
};

const buildContent = (body: string, soundEnabled: boolean, categoryId: string = NOTIFICATION_CATEGORY_ID) => {
  const contentSound = getContentSound(soundEnabled);
  return {
    title: APP_NAME,
    body,
    ...(contentSound ? { sound: contentSound } : {}),
    priority: soundEnabled
      ? Notifications.AndroidNotificationPriority.HIGH
      : Notifications.AndroidNotificationPriority.DEFAULT,
    vibrate: soundEnabled ? [0, 250, 250, 250] : undefined,
    categoryIdentifier: categoryId,
  };
};

const buildNotificationId = (kind: SiplyNotificationKind, time: Date, ml?: number, offset?: number) => {
  const parts = [NOTIFICATION_ID_PREFIX, kind, String(time.getTime())];
  if (typeof ml === "number" && Number.isFinite(ml)) {
    parts.push(String(Math.round(ml)));
  }
  if (typeof offset === "number" && Number.isFinite(offset)) {
    parts.push(String(offset));
  }
  return parts.join(":");
};

export const parseSiplyNotificationId = (identifier?: string) => {
  if (!identifier) {
    return null;
  }
  const parts = identifier.split(":");
  if (parts.length < 2 || parts[0] !== NOTIFICATION_ID_PREFIX) {
    return null;
  }
  const kind = parts[1] as SiplyNotificationKind;
  if (kind !== "reminder" && kind !== "nudge" && kind !== "test" && kind !== "snooze" && kind !== "summary") {
    return null;
  }
  const mlRaw = parts.length >= 4 ? Number.parseInt(parts[3], 10) : NaN;
  const ml = Number.isFinite(mlRaw) ? mlRaw : undefined;
  return { kind, ml };
};

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
        opensAppToForeground: true,
      },
    },
    {
      identifier: NOTIFICATION_ACTION_SNOOZE,
      buttonTitle: "Snooze 30 min",
      options: {
        opensAppToForeground: false,
      },
    },
    {
      identifier: NOTIFICATION_ACTION_SKIP,
      buttonTitle: "Skip",
      options: {
        opensAppToForeground: false,
      },
    },
  ]);

  await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORY_SUMMARY_ID, [
    {
      identifier: NOTIFICATION_ACTION_VIEW_HISTORY,
      buttonTitle: "View History",
      options: {
        opensAppToForeground: true,
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
  now = new Date(),
  _lastLogAt?: string | null,
  remainingNudgeBudget: number = Infinity
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

  // iOS caps local notifications at 64. Reserve a few for snooze/test/summary.
  const IOS_CAP = 58;
  let iosRemaining = IOS_CAP;
  if (Platform.OS === "ios") {
    try {
      const pending = await Notifications.getAllScheduledNotificationsAsync();
      iosRemaining = Math.max(0, IOS_CAP - pending.length);
      if (iosRemaining <= 0) {
        console.warn(`Siply: iOS notification cap reached. ${pending.length} already pending.`);
      }
    } catch (err) {
      console.warn("Siply: failed to check scheduled notifications limit", err);
    }
  }

  const requests: Promise<string>[] = [];
  let requested = 0;
  let nudgeSequencesUsed = 0;

  for (const slot of baseSchedule) {
    if (slot.time > horizonEnd) {
      continue;
    }
    // Enforce iOS cap
    if (Platform.OS === "ios" && requested >= iosRemaining) {
      break;
    }
    const content = buildContent(
      formatReminderBody(slot.mlPerReminder, slot.sipsPerReminder, settings.tone),
      settings.soundEnabled
    );
    requests.push(
      Notifications.scheduleNotificationAsync({
        identifier: buildNotificationId("reminder", slot.time, slot.mlPerReminder),
        content,
        trigger: buildTrigger(slot.time, channelId),
      })
    );
    requested += 1;

    // Nudges: only schedule if escalation enabled AND we have nudge budget remaining
    if (settings.escalationEnabled && nudgeSequencesUsed < remainingNudgeBudget) {
      let scheduledNudgesForSlot = false;
      for (const offset of NUDGE_MINUTES) {
        const nudgeTime = addMinutes(slot.time, offset);
        if (nudgeTime > horizonEnd) {
          continue;
        }
        if (Platform.OS === "ios" && requested >= iosRemaining) {
          break;
        }
        requests.push(
          Notifications.scheduleNotificationAsync({
            identifier: buildNotificationId("nudge", nudgeTime, slot.mlPerReminder, offset),
            content: buildContent(
              offset === NUDGE_MINUTES[0]
                ? formatNudgeBody(slot.mlPerReminder, slot.sipsPerReminder, settings.tone)
                : formatFinalNudgeBody(slot.mlPerReminder, settings.tone),
              settings.soundEnabled
            ),
            trigger: buildTrigger(nudgeTime, channelId),
          })
        );
        requested += 1;
        scheduledNudgesForSlot = true;
      }
      if (scheduledNudgesForSlot) {
        nudgeSequencesUsed += 1;
      }
    }
  }

  // Schedule daily summary at windowEnd
  if (settings.windowEnd) {
    const [endH, endM] = settings.windowEnd.split(":").map(Number);
    const summaryTime = new Date(now);
    summaryTime.setHours(endH, endM, 0, 0);
    
    // Only schedule if the window end is still coming up today (within our 24h horizon)
    if (summaryTime > now && summaryTime <= horizonEnd) {
      const summaryContent = buildContent(
        buildDailySummaryBody(),
        settings.soundEnabled,
        NOTIFICATION_CATEGORY_SUMMARY_ID
      );
      
      requests.push(
        Notifications.scheduleNotificationAsync({
          identifier: buildNotificationId("summary", summaryTime),
          content: summaryContent,
          trigger: buildTrigger(summaryTime, channelId),
        })
      );
      requested += 1;
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
  now = new Date(),
  lastLogAt?: string | null,
  remainingNudgeBudget: number = Infinity
) => {
  const errors: string[] = [];
  try {
    await cancelAllNotifications();
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Failed to cancel notifications.");
  }

  const result = await scheduleNotifications(settings, consumedMl, now, lastLogAt, remainingNudgeBudget);

  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    const thirtyMinsAgo = Date.now() - 30 * 60 * 1000;
    for (const notification of presented) {
      const parts = notification.request.identifier.split(":");
      if (parts[0] === NOTIFICATION_ID_PREFIX && parts.length >= 3) {
        const timeMs = Number.parseInt(parts[2], 10);
        if (Number.isFinite(timeMs) && timeMs < thirtyMinsAgo) {
          void Notifications.dismissNotificationAsync(notification.request.identifier);
        }
      }
    }
  } catch (err) {
    console.warn("Siply: failed to dismiss stale notifications", err);
  }

  void recordScheduleDiagnostics({
    source: "reschedule",
    at: new Date().toISOString(),
    consumedMl,
    settings: {
      targetLiters: settings.targetLiters,
      windowStart: settings.windowStart,
      windowEnd: settings.windowEnd,
      sipMl: settings.sipMl,
      escalationEnabled: settings.escalationEnabled,
      soundEnabled: settings.soundEnabled,
    },
    result: {
      success: result.success,
      requested: result.requested,
      scheduled: result.scheduled,
      failed: result.failed,
      errors: result.errors,
    },
  });
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
        ...buildContent("Test reminder: Drink 200 ml (13 sips)", true),
      },
      identifier: buildNotificationId("test", triggerDate),
      trigger: buildTrigger(triggerDate, channelId),
    });
    void recordTestDiagnostics({
      at: new Date().toISOString(),
      success: true,
    });
  } catch (error) {
    console.warn("Siply: failed to schedule test notification", error);
    void recordTestDiagnostics({
      at: new Date().toISOString(),
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const snoozeNotification = async (mlPerReminder: number, settings: HydrationSettings) => {
  if (Platform.OS === "android") {
    try {
      await ensureNotificationChannels();
    } catch {}
  }
  
  if (Platform.OS === "ios") {
    try {
      const pending = await Notifications.getAllScheduledNotificationsAsync();
      if (pending.length >= 62) {
        console.warn(`Siply: OS notification cap reached. Cannot snooze.`);
        return;
      }
    } catch {}
  }

  // Cancel any pending nudges for the snoozed reminder to prevent duplicates.
  // Nudge IDs follow the pattern: siply:nudge:<timeMs>:<ml>:<offset>
  // We cancel all pending nudges that are within the next 15 minutes (the nudge window).
  try {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    const now = Date.now();
    const nudgeHorizon = now + 15 * 60 * 1000;
    for (const n of pending) {
      const parts = n.identifier.split(":");
      if (parts[0] === NOTIFICATION_ID_PREFIX && parts[1] === "nudge") {
        const timeMs = Number.parseInt(parts[2], 10);
        if (Number.isFinite(timeMs) && timeMs > now && timeMs <= nudgeHorizon) {
          void Notifications.cancelScheduledNotificationAsync(n.identifier);
        }
      }
    }
  } catch {
    // Best effort — continue with snooze even if cleanup fails
  }
  
  const now = new Date();
  const snoozeTime = addMinutes(now, 30);
  const channelId = getChannelId(settings.soundEnabled);
  const content = buildContent(
    formatReminderBody(mlPerReminder, computeSipsPerReminder(mlPerReminder, settings.sipMl), settings.tone),
    settings.soundEnabled
  );
  
  await Notifications.scheduleNotificationAsync({
    identifier: buildNotificationId("snooze", snoozeTime, mlPerReminder),
    content,
    trigger: buildTrigger(snoozeTime, channelId),
  });
};
