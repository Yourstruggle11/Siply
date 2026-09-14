import AsyncStorage from "@react-native-async-storage/async-storage";
import { addDays, getDateKey, parseTimeToMinutes } from "../../../core/time";
import { formatLiquid } from "../../../core/units";
import type { HydrationState } from "../state/hydrationStore";
import { getDayContextSummary } from "../domain/history";
import {
  AI_HISTORY_ARTIFACT_CACHE_STORAGE_KEY,
  AI_HISTORY_ARTIFACT_PROMPT_VERSION,
} from "./constants";
import { fingerprintValue } from "./insightCache";
import type { AiHistoryArtifactCacheV1, AiHistoryArtifactKind } from "./types";

type Source = Pick<HydrationState, "settings" | "history">;

export type AiHistoryArtifactCandidate = {
  kind: AiHistoryArtifactKind;
  periodKey: string;
  title: string;
  deterministicText: string;
  context: Record<string, unknown>;
  contextFingerprint: string;
};

const dateFromKey = (key: string) => new Date(`${key}T12:00:00`);

const finalize = (
  candidate: Omit<AiHistoryArtifactCandidate, "contextFingerprint">
): AiHistoryArtifactCandidate => ({
  ...candidate,
  contextFingerprint: fingerprintValue(candidate.context),
});

export const buildDailyRecapCandidate = (
  source: Source,
  now = new Date()
): AiHistoryArtifactCandidate | null => {
  const endMinutes = parseTimeToMinutes(source.settings.windowEnd) ?? 22 * 60;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayKey = getDateKey(now);
  const periodKey = nowMinutes >= endMinutes && source.history[todayKey]
    ? todayKey
    : getDateKey(addDays(now, -1));
  const summary = source.history[periodKey];
  if (!summary || summary.totalMl <= 0) return null;
  const target = summary.goalMl > 0 ? summary.goalMl : Math.round(source.settings.targetLiters * 1000);
  const percent = target > 0 ? Math.round((summary.totalMl / target) * 100) : 0;
  const pattern = getDayContextSummary(summary);
  const amount = formatLiquid(summary.totalMl, source.settings.displayUnit);
  const deterministicText = summary.totalMl >= target
    ? `You reached your goal with ${amount}. ${pattern ?? "Nice work showing up for your hydration."}`
    : `You logged ${amount}, reaching ${percent}% of your goal. ${pattern ?? "Every log helps reveal your routine."}`;
  const context = {
    period: periodKey,
    valuesUnit: "ml",
    preferredDisplayUnit: source.settings.displayUnit,
    totalMl: summary.totalMl,
    goalMl: target,
    percentOfGoal: percent,
    logCount: summary.entries?.length ?? summary.logHours.reduce((a, b) => a + b, 0),
    hourlyLogCounts: summary.logHours,
    deterministicRecap: deterministicText,
  };
  return finalize({ kind: "daily_recap", periodKey, title: "Daily recap", deterministicText, context });
};

const mondayOfWeek = (date: Date) => {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  const day = result.getDay();
  result.setDate(result.getDate() - (day === 0 ? 6 : day - 1));
  return result;
};

const summarizeWeek = (source: Source, start: Date) => {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = getDateKey(addDays(start, index));
    const summary = source.history[date];
    return {
      date,
      totalMl: summary?.totalMl ?? 0,
      goalMl: summary?.goalMl ?? Math.round(source.settings.targetLiters * 1000),
      tracked: Boolean(summary && summary.totalMl > 0),
      goalMet: Boolean(summary && summary.totalMl >= summary.goalMl),
    };
  });
  const tracked = days.filter((day) => day.tracked);
  return {
    startDate: days[0].date,
    endDate: days[6].date,
    trackedDays: tracked.length,
    goalDays: days.filter((day) => day.goalMet).length,
    averageTrackedDayMl: tracked.length
      ? Math.round(tracked.reduce((sum, day) => sum + day.totalMl, 0) / tracked.length)
      : 0,
    days,
  };
};

export const buildWeeklyReviewCandidate = (
  source: Source,
  now = new Date()
): AiHistoryArtifactCandidate | null => {
  const currentMonday = mondayOfWeek(now);
  const reviewedMonday = addDays(currentMonday, -7);
  const comparisonMonday = addDays(currentMonday, -14);
  const reviewed = summarizeWeek(source, reviewedMonday);
  if (reviewed.trackedDays < 4) return null;
  const comparison = summarizeWeek(source, comparisonMonday);
  const difference = comparison.averageTrackedDayMl > 0
    ? Math.round(((reviewed.averageTrackedDayMl - comparison.averageTrackedDayMl) /
      comparison.averageTrackedDayMl) * 100)
    : null;
  const trend = difference === null
    ? "Keep logging to build a week-over-week comparison."
    : Math.abs(difference) < 5
      ? "Your average stayed steady compared with the prior week."
      : `Your average was ${Math.abs(difference)}% ${difference > 0 ? "higher" : "lower"} than the prior week.`;
  const deterministicText = `${reviewed.trackedDays} tracked days and ${reviewed.goalDays} goal days. ${trend}`;
  const context = {
    valuesUnit: "ml",
    preferredDisplayUnit: source.settings.displayUnit,
    reviewedWeek: reviewed,
    precedingWeek: comparison,
    deterministicReview: deterministicText,
  };
  return finalize({
    kind: "weekly_review",
    periodKey: reviewed.startDate,
    title: "Weekly review",
    deterministicText,
    context,
  });
};

const listeners = new Set<(items: AiHistoryArtifactCacheV1[]) => void>();

export const loadAiHistoryArtifactCaches = async (): Promise<AiHistoryArtifactCacheV1[]> => {
  try {
    const raw = await AsyncStorage.getItem(AI_HISTORY_ARTIFACT_CACHE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is AiHistoryArtifactCacheV1 => Boolean(
      item && typeof item === "object" &&
      (item as AiHistoryArtifactCacheV1).version === 1 &&
      typeof (item as AiHistoryArtifactCacheV1).text === "string" &&
      typeof (item as AiHistoryArtifactCacheV1).contextFingerprint === "string"
    ));
  } catch {
    return [];
  }
};

export const saveAiHistoryArtifactCache = async (cache: AiHistoryArtifactCacheV1) => {
  const current = await loadAiHistoryArtifactCaches();
  const next = [cache, ...current.filter(
    (item) => item.kind !== cache.kind || item.periodKey !== cache.periodKey
  )].slice(0, 16);
  await AsyncStorage.setItem(AI_HISTORY_ARTIFACT_CACHE_STORAGE_KEY, JSON.stringify(next));
  listeners.forEach((listener) => listener(next));
};

export const clearAiHistoryArtifactCaches = async () => {
  await AsyncStorage.removeItem(AI_HISTORY_ARTIFACT_CACHE_STORAGE_KEY);
  listeners.forEach((listener) => listener([]));
};

export const subscribeAiHistoryArtifactCaches = (
  listener: (items: AiHistoryArtifactCacheV1[]) => void
) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const makeHistoryArtifactCache = (
  candidate: AiHistoryArtifactCandidate,
  text: string,
  now = new Date()
): AiHistoryArtifactCacheV1 => ({
  version: 1,
  promptVersion: AI_HISTORY_ARTIFACT_PROMPT_VERSION,
  kind: candidate.kind,
  periodKey: candidate.periodKey,
  text,
  contextFingerprint: candidate.contextFingerprint,
  generatedAt: now.toISOString(),
});

