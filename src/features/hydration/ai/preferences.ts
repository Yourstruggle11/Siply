import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  AI_PREFERENCES_STORAGE_KEY,
  AI_PROVIDER_ORDER,
  DEFAULT_AI_PREFERENCES,
} from "./constants";
import type { AiPreferences, AiProviderId } from "./types";

const isProvider = (value: unknown): value is AiProviderId =>
  typeof value === "string" && AI_PROVIDER_ORDER.includes(value as AiProviderId);

export const normalizeAiPreferences = (value: unknown): AiPreferences => {
  if (!value || typeof value !== "object") return DEFAULT_AI_PREFERENCES;
  const item = value as Partial<AiPreferences>;
  return {
    activeProvider: isProvider(item.activeProvider) ? item.activeProvider : null,
    automaticInsightsEnabled: item.automaticInsightsEnabled === true,
    needsAttention: Array.isArray(item.needsAttention)
      ? item.needsAttention.filter(isProvider)
      : [],
    configRevision:
      typeof item.configRevision === "number" && Number.isFinite(item.configRevision)
        ? Math.max(0, Math.floor(item.configRevision))
        : 0,
  };
};

export const loadAiPreferences = async () => {
  try {
    const raw = await AsyncStorage.getItem(AI_PREFERENCES_STORAGE_KEY);
    return raw ? normalizeAiPreferences(JSON.parse(raw)) : DEFAULT_AI_PREFERENCES;
  } catch {
    return DEFAULT_AI_PREFERENCES;
  }
};

export const saveAiPreferences = async (preferences: AiPreferences) => {
  await AsyncStorage.setItem(AI_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
};
