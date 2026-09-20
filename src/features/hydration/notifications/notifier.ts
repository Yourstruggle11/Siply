import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import {
  APP_NAME,
  MAX_NOTIFICATIONS_PER_DAY,
  NOTIFICATION_ACTION_LOG,
  NOTIFICATION_ACTION_SKIP,
  NOTIFICATION_ACTION_SNOOZE,
  NOTIFICATION_ACTION_VIEW_HISTORY,
  NOTIFICATION_CATEGORY_ID,
  NOTIFICATION_CATEGORY_SUMMARY_ID,
  NUDGE_MINUTES,
} from "../../../core/constants";
import { addDays, addMinutes, setTimeOnDate } from "../../../core/time";
import { computeSipsPerReminder, getWindowMinutes } from "../domain/calculations";
import type { ReminderPhase } from "../domain/schedule";
import type { HydrationSettings, ReminderTone } from "../domain/types";
import { buildDailySummaryBody } from "./summaryContent";
import { recordTestDiagnostics } from "./diagnostics";
import {
  ENCOURAGING_MESSAGES,
  MINIMAL_MESSAGES,
  PLAYFUL_MESSAGES,
  getRandomMessage,
} from "./messages";

const ANDROID_CHANNEL_SOUND = "siply-reminders-sound";
const ANDROID_CHANNEL_SILENT = "siply-reminders-silent";
const NOTIFICATION_ID_PREFIX = "siply";
const NOTIFICATION_ID_VERSION = "v2";
const LEGACY_CATEGORY_IDS = ["siply-reminder", "siply-summary"];
const NOTIFICATION_SOUND = Platform.OS === "android" ? "siply_reminder" : "siply_reminder.wav";
const IOS_PENDING_LIMIT = 58;
let channelsReady: Promise<void> | null = null;

export type SiplyNotificationKind = "reminder" | "nudge" | "test" | "snooze" | "summary";

export type NotificationPlanSlot = {
  familyId: string;
  time: Date;
  windowEnd: Date;
  mlPerReminder: number;
  sipsPerReminder: number;
  phase: ReminderPhase;
  nudgeOffsets: number[];
};

export type NotificationApplyResult = {
  success: boolean;
  status: "verified" | "partial" | "failed";
  requested: number;
  scheduled: number;
  failed: number;
  desiredCount: number;
  pendingIds: string[];
  verifiedBaseIds: string[];
  verifiedFamilyIds: string[];
  pendingFamilyIds: string[];
  errors: string[];
};

export type TestNotificationResult = {
  success: boolean;
  reason: "scheduled" | "permission_denied" | "queue_full" | "scheduling_failed";
  error?: string;
  pendingCount?: number;
  identifier?: string;
};

type DesiredNotification = {
  identifier: string;
  familyId?: string;
  kind: SiplyNotificationKind;
  request: Notifications.NotificationRequestInput;
};

const getContentSound = (soundEnabled: boolean) => {
  if (!soundEnabled) return undefined;
  if (Platform.OS === "ios") return NOTIFICATION_SOUND;
  if (Platform.OS === "android" && typeof Platform.Version === "number" && Platform.Version < 26) {
    return NOTIFICATION_SOUND;
  }
  return undefined;
};

const messagePool = (tone: ReminderTone) =>
  tone === "minimal" ? MINIMAL_MESSAGES : tone === "playful" ? PLAYFUL_MESSAGES : ENCOURAGING_MESSAGES;

const formatReminderBody = (ml: number, sips: number, tone: ReminderTone = "encouraging") =>
  getRandomMessage(messagePool(tone)).replace("{ml}", String(ml)).replace("{sips}", String(sips));

const formatNudgeBody = (ml: number, sips: number, tone: ReminderTone, final: boolean) => {
  const body = formatReminderBody(ml, final ? 1 : sips, tone);
  if (tone === "minimal") return body;
  return final ? `Final reminder: ${body}` : `Reminder: ${body}`;
};

const getChannelId = (soundEnabled: boolean) =>
  soundEnabled ? ANDROID_CHANNEL_SOUND : ANDROID_CHANNEL_SILENT;

const buildContent = (
  body: string,
  soundEnabled: boolean,
  categoryIdentifier = NOTIFICATION_CATEGORY_ID,
  data: Record<string, string | number> = {}
): Notifications.NotificationContentInput => {
  const sound = getContentSound(soundEnabled);
  return {
    title: APP_NAME,
    body,
    // expo-notifications persists Android local notifications through Java
    // serialization. On affected SDK 54 builds, even an empty data object is
    // converted to org.json.JSONObject and makes that persistence fail. Siply's
    // notification identifier carries the same action metadata on Android.
    ...(Platform.OS !== "android" && Object.keys(data).length ? { data } : {}),
    ...(sound ? { sound } : {}),
    priority: soundEnabled
      ? Notifications.AndroidNotificationPriority.HIGH
      : Notifications.AndroidNotificationPriority.DEFAULT,
    vibrate: soundEnabled ? [0, 250, 250, 250] : undefined,
    categoryIdentifier,
  };
};

const buildTrigger = (date: Date, channelId: string): Notifications.NotificationTriggerInput => {
  const base: Notifications.DateTriggerInput = {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date,
  };
  return Platform.OS === "android" ? { ...base, channelId } : base;
};

const buildId = (kind: SiplyNotificationKind, time: Date, ml?: number, suffix?: string | number) =>
  [NOTIFICATION_ID_PREFIX, NOTIFICATION_ID_VERSION, kind, time.getTime(), ml, suffix]
    .filter((part) => part !== undefined)
    .join(":");

export const buildReminderFamilyId = (time: Date) => `siply-family-${time.getTime()}`;

export const parseSiplyNotificationId = (identifier?: string) => {
  if (!identifier) return null;
  const parts = identifier.split(":");
  if (parts[0] !== NOTIFICATION_ID_PREFIX) return null;
  const versioned = parts[1] === NOTIFICATION_ID_VERSION;
  const kindIndex = versioned ? 2 : 1;
  const kind = parts[kindIndex] as SiplyNotificationKind;
  if (!["reminder", "nudge", "test", "snooze", "summary"].includes(kind)) return null;
  const timeMs = Number.parseInt(parts[kindIndex + 1], 10);
  const mlRaw = Number.parseInt(parts[kindIndex + 2], 10);
  const baseTime = kind === "nudge" ? Number.parseInt(parts[kindIndex + 4], 10) : timeMs;
  return {
    kind,
    ml: Number.isFinite(mlRaw) ? mlRaw : undefined,
    familyId: (kind === "reminder" || kind === "nudge") && Number.isFinite(baseTime)
      ? `siply-family-${baseTime}`
      : undefined,
  };
};

export const resolveNotificationFamilyId = (
  identifier?: string,
  data?: Record<string, unknown> | null
) => {
  const storedFamilyId = data?.familyId;
  return typeof storedFamilyId === "string"
    ? storedFamilyId
    : parseSiplyNotificationId(identifier)?.familyId;
};

export const configureNotificationChannels = async () => {
  if (Platform.OS !== "android") return;
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
  if (Platform.OS !== "android") return;
  if (!channelsReady) {
    channelsReady = configureNotificationChannels().catch((error) => {
      channelsReady = null;
      throw error;
    });
  }
  await channelsReady;
};

export const configureNotificationActions = async () => {
  await Notifications.setNotificationCategoryAsync(
    NOTIFICATION_CATEGORY_ID,
    [
      { identifier: NOTIFICATION_ACTION_LOG, buttonTitle: "I drank", options: { opensAppToForeground: true } },
      { identifier: NOTIFICATION_ACTION_SNOOZE, buttonTitle: "Snooze 30 min", options: { opensAppToForeground: Platform.OS === "ios" } },
      { identifier: NOTIFICATION_ACTION_SKIP, buttonTitle: "Skip", options: { opensAppToForeground: Platform.OS === "ios" } },
    ],
    Platform.OS === "ios" ? { customDismissAction: true } : undefined
  );
  await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORY_SUMMARY_ID, [
    { identifier: NOTIFICATION_ACTION_VIEW_HISTORY, buttonTitle: "View History", options: { opensAppToForeground: true } },
  ]);
  await Promise.allSettled(
    LEGACY_CATEGORY_IDS.map((identifier) =>
      Notifications.deleteNotificationCategoryAsync(identifier)
    )
  );
};

export const cancelAllNotifications = () => Notifications.cancelAllScheduledNotificationsAsync();

const isManagedPlanNotification = (identifier: string) => {
  const kind = parseSiplyNotificationId(identifier)?.kind;
  return kind === "reminder" || kind === "nudge" || kind === "summary";
};

const buildDesiredNotifications = (
  settings: HydrationSettings,
  slots: NotificationPlanSlot[],
  now: Date,
  handledFamilies: Set<string>
): DesiredNotification[] => {
  const desired: DesiredNotification[] = [];
  const channelId = getChannelId(settings.soundEnabled);

  slots.forEach((slot) => {
    if (slot.time <= now || handledFamilies.has(slot.familyId)) return;
    const commonData = {
      siplyKind: "reminder",
      familyId: slot.familyId,
      slotTime: slot.time.toISOString(),
      ml: slot.mlPerReminder,
    };
    const identifier = buildId("reminder", slot.time, slot.mlPerReminder);
    desired.push({
      identifier,
      familyId: slot.familyId,
      kind: "reminder",
      request: {
        identifier,
        content: buildContent(
          formatReminderBody(slot.mlPerReminder, slot.sipsPerReminder, settings.tone),
          settings.soundEnabled,
          NOTIFICATION_CATEGORY_ID,
          commonData
        ),
        trigger: buildTrigger(slot.time, channelId),
      },
    });

    slot.nudgeOffsets.forEach((offset, index) => {
      const nudgeTime = addMinutes(slot.time, offset);
      if (nudgeTime >= slot.windowEnd || nudgeTime <= now) return;
      const nudgeId = buildId("nudge", nudgeTime, slot.mlPerReminder, `${offset}:${slot.time.getTime()}`);
      desired.push({
        identifier: nudgeId,
        familyId: slot.familyId,
        kind: "nudge",
        request: {
          identifier: nudgeId,
          content: buildContent(
            formatNudgeBody(slot.mlPerReminder, slot.sipsPerReminder, settings.tone ?? "encouraging", index === slot.nudgeOffsets.length - 1),
            settings.soundEnabled,
            NOTIFICATION_CATEGORY_ID,
            { ...commonData, siplyKind: "nudge", nudgeOffset: offset }
          ),
          trigger: buildTrigger(nudgeTime, channelId),
        },
      });
    });
  });

  const horizonEnd = addMinutes(now, 24 * 60);
  const windowEnds = getWindowMinutes(settings) > 0 ? [0, 1]
    .map((offset) => setTimeOnDate(addDays(now, offset), settings.windowEnd).getTime())
    .filter((timeMs, index, values) => values.indexOf(timeMs) === index)
    .filter((timeMs) => timeMs > now.getTime() && timeMs <= horizonEnd.getTime())
    .sort() : [];
  windowEnds.forEach((timeMs) => {
    const summaryTime = new Date(timeMs);
    const collides = slots.some(
      (slot) => slot.time < summaryTime && summaryTime.getTime() - slot.time.getTime() < 30 * 60_000
    );
    if (collides) return;
    const identifier = buildId("summary", summaryTime);
    desired.push({
      identifier,
      kind: "summary",
      request: {
        identifier,
        content: buildContent(
          buildDailySummaryBody(),
          settings.soundEnabled,
          NOTIFICATION_CATEGORY_SUMMARY_ID,
          { siplyKind: "summary" }
        ),
        trigger: buildTrigger(summaryTime, channelId),
      },
    });
  });

  return desired;
};

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

const scheduleWithRetry = async (request: Notifications.NotificationRequestInput) => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await Notifications.scheduleNotificationAsync(request);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
};

const extractPendingFamilyIds = (requests: Notifications.NotificationRequest[]) =>
  Array.from(new Set(requests.flatMap((item) => {
    const familyId = resolveNotificationFamilyId(item.identifier, item.content.data);
    return familyId ? [familyId] : [];
  })));

/** Differential, add-before-remove reconciliation against the real OS queue. */
export const applyNotificationPlan = async (
  settings: HydrationSettings,
  slots: NotificationPlanSlot[],
  now = new Date(),
  handledFamilyIds: string[] = []
): Promise<NotificationApplyResult> => {
  const errors: string[] = [];
  let desired = buildDesiredNotifications(settings, slots, now, new Set(handledFamilyIds));
  let before: Notifications.NotificationRequest[];
  try {
    before = await Notifications.getAllScheduledNotificationsAsync();
  } catch (error) {
    return {
      success: false,
      status: "failed",
      requested: desired.length,
      scheduled: 0,
      failed: desired.length,
      desiredCount: desired.length,
      pendingIds: [],
      verifiedBaseIds: [],
      verifiedFamilyIds: [],
      pendingFamilyIds: [],
      errors: [errorMessage(error)],
    };
  }

  const platformLimit = Platform.OS === "ios" ? IOS_PENDING_LIMIT : MAX_NOTIFICATIONS_PER_DAY;
  const transientPendingCount = before.filter(
    (item) => !isManagedPlanNotification(item.identifier)
  ).length;
  desired = desired.slice(
    0,
    Math.max(0, Math.min(MAX_NOTIFICATIONS_PER_DAY, platformLimit) - transientPendingCount)
  );
  const desiredIds = new Set(desired.map((item) => item.identifier));

  try {
    await ensureNotificationChannels();
  } catch (error) {
    return {
      success: false,
      status: "failed",
      requested: desired.length,
      scheduled: 0,
      failed: desired.length,
      desiredCount: desired.length,
      pendingIds: [],
      verifiedBaseIds: [],
      verifiedFamilyIds: [],
      pendingFamilyIds: extractPendingFamilyIds(before),
      errors: [errorMessage(error)],
    };
  }

  const existingIds = new Set(before.map((item) => item.identifier));
  const missing = desired.filter((item) => !existingIds.has(item.identifier));
  const addResults = await Promise.allSettled(missing.map((item) => scheduleWithRetry(item.request)));
  addResults.forEach((result) => {
    if (result.status === "rejected") errors.push(errorMessage(result.reason));
  });

  let afterAdd = await Notifications.getAllScheduledNotificationsAsync().catch(() => before);
  const afterAddIds = new Set(afterAdd.map((item) => item.identifier));
  const stillMissing = desired.filter((item) => !afterAddIds.has(item.identifier));

  // Never remove an older usable plan unless all replacements were accepted.
  if (stillMissing.length === 0) {
    const obsolete = afterAdd.filter(
      (item) => isManagedPlanNotification(item.identifier) && !desiredIds.has(item.identifier)
    );
    const cancelResults = await Promise.allSettled(
      obsolete.map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier))
    );
    cancelResults.forEach((result) => {
      if (result.status === "rejected") errors.push(errorMessage(result.reason));
    });
    afterAdd = await Notifications.getAllScheduledNotificationsAsync().catch(() => afterAdd);
  }

  const finalIds = new Set(afterAdd.map((item) => item.identifier));
  const verified = desired.filter((item) => finalIds.has(item.identifier));
  const verifiedBaseIds = verified
    .filter((item) => item.kind === "reminder")
    .map((item) => item.identifier);
  const verifiedFamilyIds = verified
    .filter((item) => item.kind === "reminder" && item.familyId)
    .map((item) => item.familyId!);
  const pendingFamilyIds = extractPendingFamilyIds(afterAdd);
  const failed = desired.length - verified.length;
  const success = failed === 0 && errors.length === 0;

  return {
    success,
    status: success ? "verified" : verifiedBaseIds.length ? "partial" : "failed",
    requested: missing.length,
    scheduled: verified.length,
    failed,
    desiredCount: desired.length,
    pendingIds: verified.map((item) => item.identifier),
    verifiedBaseIds,
    verifiedFamilyIds,
    pendingFamilyIds,
    errors,
  };
};

export const cancelNotificationFamily = async (familyId: string) => {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  const family = pending.filter(
    (item) => resolveNotificationFamilyId(item.identifier, item.content.data) === familyId
  );
  await Promise.all(family.map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)));
};

export const sendTestNotificationDetailed = async (): Promise<TestNotificationResult> => {
  try {
    const permissions = await Notifications.getPermissionsAsync();
    if (!permissions.granted) {
      const granted = permissions.canAskAgain
        ? (await Notifications.requestPermissionsAsync()).granted
        : false;
      if (!granted) {
        const error = "Notification permission is not granted.";
        await recordTestDiagnostics({ at: new Date().toISOString(), success: false, error }).catch(() => {});
        return { success: false, reason: "permission_denied", error };
      }
    }
    await ensureNotificationChannels();
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    if (pending.length >= MAX_NOTIFICATIONS_PER_DAY) {
      const error = `Notification queue is at Siply's safety limit (${pending.length}/${MAX_NOTIFICATIONS_PER_DAY}).`;
      await recordTestDiagnostics({ at: new Date().toISOString(), success: false, error }).catch(() => {});
      return {
        success: false,
        reason: "queue_full",
        error,
        pendingCount: pending.length,
      };
    }
    const triggerDate = new Date(Date.now() + 1000);
    const identifier = buildId("test", triggerDate);
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: buildContent("Test reminder: Drink 200 ml (13 sips)", true),
      trigger: buildTrigger(triggerDate, getChannelId(true)),
    });
    await recordTestDiagnostics({ at: new Date().toISOString(), success: true }).catch(() => {});
    return {
      success: true,
      reason: "scheduled",
      pendingCount: pending.length + 1,
      identifier,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordTestDiagnostics({
      at: new Date().toISOString(),
      success: false,
      error: message,
    }).catch(() => {});
    return { success: false, reason: "scheduling_failed", error: message };
  }
};

export const sendTestNotification = async () =>
  (await sendTestNotificationDetailed()).success;

export const snoozeNotification = async (
  mlPerReminder: number,
  settings: HydrationSettings,
  familyId?: string
) => {
  await ensureNotificationChannels();
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  if (pending.length >= MAX_NOTIFICATIONS_PER_DAY) {
    throw new Error("Notification capacity is temporarily full");
  }
  const snoozeTime = addMinutes(new Date(), 30);
  await Notifications.scheduleNotificationAsync({
    identifier: buildId("snooze", snoozeTime, mlPerReminder),
    content: buildContent(
      formatReminderBody(mlPerReminder, computeSipsPerReminder(mlPerReminder, settings.sipMl), settings.tone),
      settings.soundEnabled,
      NOTIFICATION_CATEGORY_ID,
      { siplyKind: "snooze", ml: mlPerReminder }
    ),
    trigger: buildTrigger(snoozeTime, getChannelId(settings.soundEnabled)),
  });
  if (familyId) await cancelNotificationFamily(familyId);
};
