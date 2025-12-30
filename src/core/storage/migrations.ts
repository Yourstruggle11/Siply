import {
  DEFAULT_GENTLE_GOAL_THRESHOLD,
  DEFAULT_QUICK_LOG_PRESETS,
  DEFAULT_SETTINGS,
  SCHEMA_VERSION,
} from "../constants";
import { getDateKey, parseTimeToMinutes } from "../time";
import {
  HydrationHistory,
  HydrationProgress,
  HydrationSettings,
  OnboardingState,
  QuickLogState,
} from "../../features/hydration/domain/types";
import { normalizeHistory, normalizeQuickLogPresets } from "../../features/hydration/domain/history";
import { STORAGE_KEYS } from "./keys";
import { getJson, setJson } from "./storage";

export type HydrationStorageSnapshot = {
  settings: HydrationSettings;
  progress: HydrationProgress;
  onboarding: OnboardingState;
  quickLog: QuickLogState;
  history: HydrationHistory;
};

const toNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const toBoolean = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

const toTimeString = (value: unknown, fallback: string) => {
  if (typeof value !== "string") {
    return fallback;
  }
  return parseTimeToMinutes(value) === null ? fallback : value;
};

const toAppearanceMode = (value: unknown, fallback: "light" | "dark") =>
  value === "light" || value === "dark" ? value : fallback;

const normalizeSettings = (input: Partial<HydrationSettings> | null): HydrationSettings => {
  const base = input ?? {};
  return {
    targetLiters: toNumber(base.targetLiters, DEFAULT_SETTINGS.targetLiters),
    windowStart: toTimeString(base.windowStart, DEFAULT_SETTINGS.windowStart),
    windowEnd: toTimeString(base.windowEnd, DEFAULT_SETTINGS.windowEnd),
    sipMl: toNumber(base.sipMl, DEFAULT_SETTINGS.sipMl),
    escalationEnabled: toBoolean(base.escalationEnabled, DEFAULT_SETTINGS.escalationEnabled),
    soundEnabled: toBoolean(base.soundEnabled, DEFAULT_SETTINGS.soundEnabled),
    appearanceMode: toAppearanceMode(base.appearanceMode, DEFAULT_SETTINGS.appearanceMode),
    gentleGoalEnabled: toBoolean(base.gentleGoalEnabled, DEFAULT_SETTINGS.gentleGoalEnabled),
    gentleGoalThreshold: toNumber(base.gentleGoalThreshold, DEFAULT_GENTLE_GOAL_THRESHOLD),
  };
};

const normalizeProgress = (input: HydrationProgress | null, todayKey: string): HydrationProgress => {
  if (!input || input.date !== todayKey) {
    return { date: todayKey, consumedMl: 0 };
  }
  return {
    date: input.date,
    consumedMl: toNumber(input.consumedMl, 0),
  };
};

const normalizeOnboarding = (input: OnboardingState | null): OnboardingState => ({
  completed: toBoolean(input?.completed, false),
});

const normalizeQuickLog = (input: unknown): QuickLogState => {
  const presets = normalizeQuickLogPresets(input, DEFAULT_QUICK_LOG_PRESETS);
  const lastUsedValue = (input as { lastUsedMl?: unknown })?.lastUsedMl;
  const lastUsed = typeof lastUsedValue === "number" && Number.isFinite(lastUsedValue)
    ? lastUsedValue
    : null;
  return {
    presets,
    lastUsedMl: lastUsed,
  };
};

export const hydrateStorage = async (): Promise<HydrationStorageSnapshot> => {
  const todayKey = getDateKey(new Date());
  const schemaVersion = await getJson<number>(STORAGE_KEYS.schemaVersion);
  const rawSettings = await getJson<HydrationSettings>(STORAGE_KEYS.settings);
  const rawProgress = await getJson<HydrationProgress>(STORAGE_KEYS.progress);
  const rawOnboarding = await getJson<OnboardingState>(STORAGE_KEYS.onboarding);
  const rawQuickLog = await getJson<QuickLogState>(STORAGE_KEYS.quickLog);
  const rawHistory = await getJson<HydrationHistory>(STORAGE_KEYS.history);

  const settings = normalizeSettings(rawSettings);
  const progress = normalizeProgress(rawProgress, todayKey);
  const onboarding = normalizeOnboarding(rawOnboarding);
  const quickLog = normalizeQuickLog(rawQuickLog);
  const history = normalizeHistory(rawHistory);

  const shouldPersist =
    schemaVersion !== SCHEMA_VERSION ||
    !rawSettings ||
    !rawProgress ||
    !rawOnboarding ||
    !rawQuickLog ||
    !rawHistory ||
    progress.date !== rawProgress?.date;

  if (shouldPersist) {
    await Promise.all([
      setJson(STORAGE_KEYS.schemaVersion, SCHEMA_VERSION),
      setJson(STORAGE_KEYS.settings, settings),
      setJson(STORAGE_KEYS.progress, progress),
      setJson(STORAGE_KEYS.onboarding, onboarding),
      setJson(STORAGE_KEYS.quickLog, quickLog),
      setJson(STORAGE_KEYS.history, history),
    ]);
  }

  return { settings, progress, onboarding, quickLog, history };
};

export const persistSettings = async (settings: HydrationSettings) =>
  setJson(STORAGE_KEYS.settings, settings);

export const persistProgress = async (progress: HydrationProgress) =>
  setJson(STORAGE_KEYS.progress, progress);

export const persistOnboarding = async (onboarding: OnboardingState) =>
  setJson(STORAGE_KEYS.onboarding, onboarding);

export const persistQuickLog = async (quickLog: QuickLogState) =>
  setJson(STORAGE_KEYS.quickLog, quickLog);

export const persistHistory = async (history: HydrationHistory) =>
  setJson(STORAGE_KEYS.history, history);
