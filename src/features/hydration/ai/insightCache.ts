import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  AI_HISTORY_DAILY_AUTOMATIC_ATTEMPT_LIMIT,
  AI_HISTORY_PHASE_BOUNDARIES,
  AI_HISTORY_REFRESH_THRESHOLD_ML,
  AI_INSIGHT_CACHE_STORAGE_KEY,
  AI_INSIGHT_PROMPT_VERSION,
} from "./constants";
import type { AiInsightCacheV1 } from "./types";

const cacheListeners = new Set<(cache: AiInsightCacheV1 | null) => void>();

export const subscribeAiInsightCache = (
  listener: (cache: AiInsightCacheV1 | null) => void
) => {
  cacheListeners.add(listener);
  return () => cacheListeners.delete(listener);
};

const notifyCacheListeners = (cache: AiInsightCacheV1 | null) => {
  cacheListeners.forEach((listener) => listener(cache));
};

export const loadAiInsightCache = async (): Promise<AiInsightCacheV1 | null> => {
  try {
    const raw = await AsyncStorage.getItem(AI_INSIGHT_CACHE_STORAGE_KEY);
    if (!raw) return null;
    const item = JSON.parse(raw) as Partial<AiInsightCacheV1>;
    if (
      item.version !== 1 ||
      typeof item.text !== "string" ||
      item.text.trim().length === 0 ||
      typeof item.generatedAt !== "string" ||
      typeof item.localDate !== "string" ||
      typeof item.contextFingerprint !== "string" ||
      typeof item.providerConfigFingerprint !== "string" ||
      typeof item.sourceConsumedMl !== "number" ||
      typeof item.sourceTargetMl !== "number" ||
      typeof item.sourceTargetMet !== "boolean" ||
      typeof item.trendFingerprint !== "string"
    ) {
      return null;
    }
    return item as AiInsightCacheV1;
  } catch {
    return null;
  }
};

export const saveAiInsightCache = async (cache: AiInsightCacheV1) => {
  await AsyncStorage.setItem(AI_INSIGHT_CACHE_STORAGE_KEY, JSON.stringify(cache));
  notifyCacheListeners(cache);
};

export const clearAiInsightCache = async () => {
  await AsyncStorage.removeItem(AI_INSIGHT_CACHE_STORAGE_KEY);
  notifyCacheListeners(null);
};

export type InsightFetchDecisionInput = {
  enabled: boolean;
  hasLocalInsight: boolean;
  hasCredential: boolean;
  online: boolean;
  localDate: string;
  contextFingerprint: string;
  providerConfigFingerprint: string;
  trendFingerprint: string;
  consumedMl: number;
  targetMl: number;
  focused: boolean;
  automaticAttempts: number;
  phaseAvailable: boolean;
  cache: AiInsightCacheV1 | null;
};

export type AiHistoryPhase = "early" | "middle" | "late";

export const getAiHistoryPhase = (
  activeWindow: { start: string; end: string },
  now = new Date()
): AiHistoryPhase | null => {
  const [startHour, startMinute] = activeWindow.start.split(":").map(Number);
  const [endHour, endMinute] = activeWindow.end.split(":").map(Number);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  const current = now.getHours() * 60 + now.getMinutes();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  if (current < start || current >= end) return null;
  const progress = (current - start) / (end - start);
  if (progress < AI_HISTORY_PHASE_BOUNDARIES[0]) return "early";
  if (progress < AI_HISTORY_PHASE_BOUNDARIES[1]) return "middle";
  return "late";
};

export const shouldFetchAiInsight = (input: InsightFetchDecisionInput) => {
  if (
    !input.enabled ||
    !input.focused ||
    !input.hasLocalInsight ||
    !input.hasCredential ||
    !input.online ||
    !input.phaseAvailable ||
    input.automaticAttempts >= AI_HISTORY_DAILY_AUTOMATIC_ATTEMPT_LIMIT
  ) {
    return false;
  }
  if (!input.cache) return true;
  if (
    input.cache.promptVersion !== AI_INSIGHT_PROMPT_VERSION ||
    input.cache.localDate !== input.localDate ||
    input.cache.providerConfigFingerprint !== input.providerConfigFingerprint
  ) return true;

  const targetMet = input.targetMl > 0 && input.consumedMl >= input.targetMl;
  if (targetMet !== input.cache.sourceTargetMet) return true;
  if (Math.abs(input.consumedMl - input.cache.sourceConsumedMl) >= AI_HISTORY_REFRESH_THRESHOLD_ML) {
    return true;
  }
  return input.trendFingerprint !== input.cache.trendFingerprint;
};

export const shouldDisplayAiInsight = (
  enabled: boolean,
  localDate: string,
  targetMl: number,
  cache: AiInsightCacheV1 | null
) => Boolean(
  enabled &&
  cache?.promptVersion === AI_INSIGHT_PROMPT_VERSION &&
  cache.localDate === localDate &&
  cache.sourceTargetMl === targetMl
);

export const fingerprintValue = (value: unknown) => {
  const input = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};
