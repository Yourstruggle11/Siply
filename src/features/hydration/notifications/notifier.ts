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
  NOTIFICATION_CATEGORY_NO_SNOOZE_ID,
  NOTIFICATION_CATEGORY_SUMMARY_ID,
  NUDGE_MINUTES,
} from "../../../core/constants";
import { addDays, addMinutes, getDateKey, setTimeOnDate } from "../../../core/time";
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
  plannedCount: number;
  suppressedOptionalCount: number;
  suppressedBaseCount: number;
  extraneousIds: string[];
  channelBlocked: boolean;
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
  const body = formatReminderBody(ml, sips, tone);
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
  const nudgeOffsetRaw = kind === "nudge" ? Number.parseInt(parts[kindIndex + 3], 10) : undefined;
  const baseTime = kind === "nudge" ? Number.parseInt(parts[kindIndex + 4], 10) : timeMs;
  return {
    kind,
    timeMs: Number.isFinite(timeMs) ? timeMs : undefined,
    ml: Number.isFinite(mlRaw) ? mlRaw : undefined,
    nudgeOffset: typeof nudgeOffsetRaw === "number" && Number.isFinite(nudgeOffsetRaw)
      ? nudgeOffsetRaw
      : undefined,
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
  await Notifications.setNotificationCategoryAsync(
    NOTIFICATION_CATEGORY_NO_SNOOZE_ID,
    [
      { identifier: NOTIFICATION_ACTION_LOG, buttonTitle: "I drank", options: { opensAppToForeground: true } },
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
    if (handledFamilies.has(slot.familyId)) return;
    const commonData = {
      siplyKind: "reminder",
      familyId: slot.familyId,
      slotTime: slot.time.toISOString(),
      ml: slot.mlPerReminder,
    };
    const identifier = buildId("reminder", slot.time, slot.mlPerReminder);
    const reminderCategory = addMinutes(slot.time, 30) >= slot.windowEnd
      ? NOTIFICATION_CATEGORY_NO_SNOOZE_ID
      : NOTIFICATION_CATEGORY_ID;
    if (slot.time > now) {
      desired.push({
        identifier,
        familyId: slot.familyId,
        kind: "reminder",
        request: {
          identifier,
          content: buildContent(
            formatReminderBody(slot.mlPerReminder, slot.sipsPerReminder, settings.tone),
            settings.soundEnabled,
            reminderCategory,
            commonData
          ),
          trigger: buildTrigger(slot.time, channelId),
        },
      });
    }

    slot.nudgeOffsets.forEach((offset, index) => {
      const nudgeTime = addMinutes(slot.time, offset);
      if (nudgeTime >= slot.windowEnd || nudgeTime <= now) return;
      const nudgeId = buildId("nudge", nudgeTime, slot.mlPerReminder, `${offset}:${slot.time.getTime()}`);
      const nudgeCategory = addMinutes(nudgeTime, 30) >= slot.windowEnd
        ? NOTIFICATION_CATEGORY_NO_SNOOZE_ID
        : NOTIFICATION_CATEGORY_ID;
      desired.push({
        identifier: nudgeId,
        familyId: slot.familyId,
        kind: "nudge",
        request: {
          identifier: nudgeId,
          content: buildContent(
            formatNudgeBody(slot.mlPerReminder, slot.sipsPerReminder, settings.tone ?? "encouraging", index === slot.nudgeOffsets.length - 1),
            settings.soundEnabled,
            nudgeCategory,
            { ...commonData, siplyKind: "nudge", nudgeOffset: offset }
          ),
          trigger: buildTrigger(nudgeTime, channelId),
        },
      });
    });
  });

  const windowEnds = getWindowMinutes(settings) > 0 ? [0, 1]
    .map((offset) => setTimeOnDate(addDays(now, offset), settings.windowEnd).getTime())
    .filter((timeMs, index, values) => values.indexOf(timeMs) === index)
    .filter((timeMs) => timeMs > now.getTime())
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

const delay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const scheduleWithRetry = async (request: Notifications.NotificationRequestInput) => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await Notifications.scheduleNotificationAsync(request);
    } catch (error) {
      lastError = error;
      if (attempt === 0) await delay(100);
    }
  }
  throw lastError;
};

const cancelWithRetry = async (identifier: string) => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await Notifications.cancelScheduledNotificationAsync(identifier);
      return;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await delay(100);
    }
  }
  throw lastError;
};

const runBounded = async <T, R>(items: T[], worker: (item: T) => Promise<R>, concurrency = 4) => {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = { status: "fulfilled", value: await worker(items[index]) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  });
  await Promise.all(runners);
  return results;
};

const compactErrors = (errors: string[]) => {
  const counts = new Map<string, number>();
  errors.forEach((message) => counts.set(message, (counts.get(message) ?? 0) + 1));
  return Array.from(counts, ([message, count]) => count > 1 ? `${message} (${count}x)` : message);
};

const prioritizeDesired = (items: DesiredNotification[], now: Date) => {
  const todayKey = getDateKey(now);
  const priority = (item: DesiredNotification) => {
    if (item.kind === "reminder") return 0;
    if (item.kind === "nudge") {
      const parsed = parseSiplyNotificationId(item.identifier);
      return parsed?.timeMs && getDateKey(new Date(parsed.timeMs)) === todayKey ? 1 : 3;
    }
    if (item.kind === "summary") return 2;
    return 4;
  };
  return [...items].sort((a, b) => priority(a) - priority(b));
};

const getChannelBlocked = async (settings: HydrationSettings) => {
  if (Platform.OS !== "android") return false;
  try {
    const getChannel = Notifications.getNotificationChannelAsync;
    if (typeof getChannel !== "function") return false;
    const channel = await getChannel(getChannelId(settings.soundEnabled));
    return channel?.importance === 0;
  } catch {
    return false;
  }
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
  handledFamilyIds: string[] = [],
  options: { reinstallExisting?: boolean } = {}
): Promise<NotificationApplyResult> => {
  const rawErrors: string[] = [];
  const handled = new Set(handledFamilyIds);
  const planned = prioritizeDesired(buildDesiredNotifications(settings, slots, now, handled), now);
  let before: Notifications.NotificationRequest[];
  try {
    before = await Notifications.getAllScheduledNotificationsAsync();
  } catch (error) {
    return {
      success: false,
      status: "failed",
      requested: planned.length,
      scheduled: 0,
      failed: planned.length,
      desiredCount: planned.length,
      pendingIds: [],
      verifiedBaseIds: [],
      verifiedFamilyIds: [],
      pendingFamilyIds: [],
      errors: [errorMessage(error)],
      plannedCount: planned.length,
      suppressedOptionalCount: 0,
      suppressedBaseCount: 0,
      extraneousIds: [],
      channelBlocked: false,
    };
  }

  const platformLimit = Platform.OS === "ios" ? IOS_PENDING_LIMIT : MAX_NOTIFICATIONS_PER_DAY;
  const transientPendingCount = before.filter(
    (item) => !isManagedPlanNotification(item.identifier)
  ).length;
  const capacity = Math.max(0, Math.min(MAX_NOTIFICATIONS_PER_DAY, platformLimit) - transientPendingCount);
  const desired = planned.slice(0, capacity);
  const suppressed = planned.slice(capacity);
  const suppressedBaseCount = suppressed.filter((item) => item.kind === "reminder").length;
  const suppressedOptionalCount = suppressed.length - suppressedBaseCount;
  const desiredIds = new Set(desired.map((item) => item.identifier));
  const oldManaged = before.filter((item) => isManagedPlanNotification(item.identifier));

  const plannedCurrentBase = planned.some((item) => {
    if (item.kind !== "reminder") return false;
    const timeMs = parseSiplyNotificationId(item.identifier)?.timeMs;
    return Boolean(timeMs && getDateKey(new Date(timeMs)) === getDateKey(now));
  });
  const safetyObsolete = oldManaged.filter((item) => {
    if (desiredIds.has(item.identifier)) return false;
    const meta = parseSiplyNotificationId(item.identifier);
    if (meta?.familyId && handled.has(meta.familyId)) return true;
    if (meta?.kind === "nudge" && !settings.escalationEnabled) return true;
    return Boolean(
      !plannedCurrentBase &&
      (meta?.kind === "reminder" || meta?.kind === "nudge") &&
      meta.timeMs &&
      getDateKey(new Date(meta.timeMs)) === getDateKey(now)
    );
  });

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
      plannedCount: planned.length,
      suppressedOptionalCount,
      suppressedBaseCount,
      extraneousIds: oldManaged.map((item) => item.identifier),
      channelBlocked: false,
    };
  }

  let workingBefore = before;
  let existingIds = new Set(workingBefore.map((item) => item.identifier));
  let missing = desired.filter((item) => !existingIds.has(item.identifier));
  const availableWithoutRemoval = Math.max(0, Math.min(MAX_NOTIFICATIONS_PER_DAY, platformLimit) - workingBefore.length);
  const capacityShortfall = Math.max(0, missing.length - availableWithoutRemoval);
  let capacityTransition = false;
  if (capacityShortfall > 0) {
    // The old and new plans cannot coexist at peak capacity. Free only
    // obsolete requests, preferring optional notifications and far-future
    // reminders so the nearest existing reminder remains protected longest.
    const capacityCandidates = oldManaged
      .filter((item) => !desiredIds.has(item.identifier))
      .sort((a, b) => {
        const aMeta = parseSiplyNotificationId(a.identifier);
        const bMeta = parseSiplyNotificationId(b.identifier);
        const aOptional = aMeta?.kind === "reminder" ? 1 : 0;
        const bOptional = bMeta?.kind === "reminder" ? 1 : 0;
        if (aOptional !== bOptional) return aOptional - bOptional;
        return (bMeta?.timeMs ?? 0) - (aMeta?.timeMs ?? 0);
      })
      .slice(0, capacityShortfall);
    const capacityResults = await runBounded(capacityCandidates, (item) => cancelWithRetry(item.identifier));
    capacityResults.forEach((result) => {
      if (result.status === "rejected") rawErrors.push(`Capacity cleanup failed: ${errorMessage(result.reason)}`);
    });
    capacityTransition = capacityCandidates.length > 0;
    try {
      workingBefore = await Notifications.getAllScheduledNotificationsAsync();
      existingIds = new Set(workingBefore.map((item) => item.identifier));
      missing = desired.filter((item) => !existingIds.has(item.identifier));
    } catch (error) {
      rawErrors.push(`Could not verify capacity cleanup: ${errorMessage(error)}`);
    }
  }
  const attempted = options.reinstallExisting ? desired : missing;
  const addResults = await runBounded(attempted, (item) => scheduleWithRetry(item.request));
  addResults.forEach((result) => {
    if (result.status === "rejected") rawErrors.push(errorMessage(result.reason));
  });

  let afterAdd: Notifications.NotificationRequest[];
  try {
    afterAdd = await Notifications.getAllScheduledNotificationsAsync();
  } catch (error) {
    rawErrors.push(`Could not verify scheduled notifications: ${errorMessage(error)}`);
    afterAdd = workingBefore;
  }
  const afterAddIds = new Set(afterAdd.map((item) => item.identifier));
  const stillMissing = desired.filter((item) => !afterAddIds.has(item.identifier));

  // Safety cancellations are preference/state removals, not replacement
  // cleanup. They must be attempted even when a new plan cannot be installed.
  const safetyResults = await runBounded(safetyObsolete, (item) => cancelWithRetry(item.identifier));
  safetyResults.forEach((result) => {
    if (result.status === "rejected") rawErrors.push(errorMessage(result.reason));
  });

  let transactionRolledBack = false;
  if (stillMissing.length > 0 && oldManaged.length > 0 && !capacityTransition) {
    // A half-installed replacement is worse than the last coherent plan. Roll
    // back only identifiers that were genuinely new; resubmissions with an
    // existing identifier leave the prior request as the fallback.
    const newlyAdded = missing.filter((item) => afterAddIds.has(item.identifier));
    const rollbackResults = await runBounded(newlyAdded, (item) => cancelWithRetry(item.identifier));
    rollbackResults.forEach((result) => {
      if (result.status === "rejected") rawErrors.push(`Rollback failed: ${errorMessage(result.reason)}`);
    });
    transactionRolledBack = true;
  } else if (stillMissing.length === 0) {
    const obsolete = afterAdd.filter(
      (item) => isManagedPlanNotification(item.identifier) && !desiredIds.has(item.identifier) &&
        !safetyObsolete.some((safe) => safe.identifier === item.identifier)
    );
    const cancelResults = await runBounded(obsolete, (item) => cancelWithRetry(item.identifier));
    cancelResults.forEach((result) => {
      if (result.status === "rejected") rawErrors.push(errorMessage(result.reason));
    });
  }

  try {
    afterAdd = await Notifications.getAllScheduledNotificationsAsync();
  } catch (error) {
    rawErrors.push(`Could not verify final notification queue: ${errorMessage(error)}`);
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
  const extraneousIds = afterAdd
    .filter((item) => isManagedPlanNotification(item.identifier) && !desiredIds.has(item.identifier))
    .map((item) => item.identifier);
  const errors = compactErrors(rawErrors);
  const channelBlocked = await getChannelBlocked(settings);
  const success = !transactionRolledBack && failed === 0 && errors.length === 0 && extraneousIds.length === 0;
  const status = transactionRolledBack
    ? "failed"
    : success && suppressedBaseCount === 0
      ? "verified"
      : verifiedBaseIds.length
        ? "partial"
        : "failed";

  return {
    success,
    status,
    requested: attempted.length,
    scheduled: verified.length,
    failed,
    desiredCount: desired.length,
    pendingIds: verified.map((item) => item.identifier),
    verifiedBaseIds,
    verifiedFamilyIds,
    pendingFamilyIds,
    errors,
    plannedCount: planned.length,
    suppressedOptionalCount,
    suppressedBaseCount,
    extraneousIds,
    channelBlocked,
  };
};

export const cancelNotificationFamily = async (familyId: string) => {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  const family = pending.filter(
    (item) => resolveNotificationFamilyId(item.identifier, item.content.data) === familyId
  );
  await Promise.all(family.map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)));
  return family.length;
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
    const triggerDate = new Date(Date.now() + 3000);
    const identifier = buildId("test", triggerDate);
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: buildContent("Test reminder: Drink 200 ml (13 sips)", true),
      trigger: buildTrigger(triggerDate, getChannelId(true)),
    });
    const verified = await Notifications.getAllScheduledNotificationsAsync();
    if (!verified.some((item) => item.identifier === identifier)) {
      throw new Error("The native scheduler did not retain the test notification.");
    }
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
  const now = new Date();
  const snoozeTime = addMinutes(now, 30);
  const windowEnd = setTimeOnDate(now, settings.windowEnd);
  if (getWindowMinutes(settings) <= 0 || snoozeTime >= windowEnd) {
    return false;
  }
  const familyTime = familyId ? Number.parseInt(familyId.replace("siply-family-", ""), 10) : Number.NaN;
  const identifierTime = Number.isFinite(familyTime) ? new Date(familyTime) : snoozeTime;
  const snoozeId = buildId("snooze", identifierTime, mlPerReminder, "30");
  // The delivered reminder no longer needs its follow-ups. Clear that family
  // before checking capacity so a full queue cannot make a valid Snooze fail
  // merely because the very notifications it replaces are still pending.
  if (familyId) await cancelNotificationFamily(familyId);
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  if (pending.length >= MAX_NOTIFICATIONS_PER_DAY && !pending.some((item) => item.identifier === snoozeId)) {
    throw new Error("Notification capacity is temporarily full");
  }
  await Notifications.scheduleNotificationAsync({
    identifier: snoozeId,
    content: buildContent(
      formatReminderBody(mlPerReminder, computeSipsPerReminder(mlPerReminder, settings.sipMl), settings.tone),
      settings.soundEnabled,
      NOTIFICATION_CATEGORY_ID,
      { siplyKind: "snooze", ml: mlPerReminder }
    ),
    trigger: buildTrigger(snoozeTime, getChannelId(settings.soundEnabled)),
  });
  return true;
};
