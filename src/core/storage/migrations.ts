import { DEFAULT_SETTINGS, MIN_INTERVAL_MINUTES, SCHEMA_VERSION } from "../constants";
import { getDateKey, parseTimeToMinutes } from "../time";
import { HydrationProgress, HydrationSettings, OnboardingState } from "../../features/hydration/domain/types";
import { STORAGE_KEYS } from "./keys";
import { getJson, setJson } from "./storage";

export type HydrationStorageSnapshot = {
  settings: HydrationSettings;
  progress: HydrationProgress;
  onboarding: OnboardingState;
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
    intervalMinutes: Math.max(
      MIN_INTERVAL_MINUTES,
      toNumber(base.intervalMinutes, DEFAULT_SETTINGS.intervalMinutes)
    ),
    sipMl: toNumber(base.sipMl, DEFAULT_SETTINGS.sipMl),
    escalationEnabled: toBoolean(base.escalationEnabled, DEFAULT_SETTINGS.escalationEnabled),
    soundEnabled: toBoolean(base.soundEnabled, DEFAULT_SETTINGS.soundEnabled),
    appearanceMode: toAppearanceMode(base.appearanceMode, DEFAULT_SETTINGS.appearanceMode),
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

export const hydrateStorage = async (): Promise<HydrationStorageSnapshot> => {
  const todayKey = getDateKey(new Date());
  const schemaVersion = await getJson<number>(STORAGE_KEYS.schemaVersion);
  const rawSettings = await getJson<HydrationSettings>(STORAGE_KEYS.settings);
  const rawProgress = await getJson<HydrationProgress>(STORAGE_KEYS.progress);
  const rawOnboarding = await getJson<OnboardingState>(STORAGE_KEYS.onboarding);

  const settings = normalizeSettings(rawSettings);
  const progress = normalizeProgress(rawProgress, todayKey);
  const onboarding = normalizeOnboarding(rawOnboarding);

  const shouldPersist =
    schemaVersion !== SCHEMA_VERSION || !rawSettings || !rawProgress || !rawOnboarding || progress.date !== rawProgress?.date;

  if (shouldPersist) {
    await Promise.all([
      setJson(STORAGE_KEYS.schemaVersion, SCHEMA_VERSION),
      setJson(STORAGE_KEYS.settings, settings),
      setJson(STORAGE_KEYS.progress, progress),
      setJson(STORAGE_KEYS.onboarding, onboarding),
    ]);
  }

  return { settings, progress, onboarding };
};

export const persistSettings = async (settings: HydrationSettings) =>
  setJson(STORAGE_KEYS.settings, settings);

export const persistProgress = async (progress: HydrationProgress) =>
  setJson(STORAGE_KEYS.progress, progress);

export const persistOnboarding = async (onboarding: OnboardingState) =>
  setJson(STORAGE_KEYS.onboarding, onboarding);
