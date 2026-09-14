import type { AiPreferences, AiProviderId } from "./types";

export const AI_DISCLOSURE_VERSION = 1;
export const AI_CONTEXT_VERSION = 1;
export const AI_INSIGHT_PROMPT_VERSION = 1;
export const AI_HISTORY_ARTIFACT_PROMPT_VERSION = 1;
export const AI_PREFERENCES_STORAGE_KEY = "siply:ai_preferences:v1";
export const AI_INSIGHT_CACHE_STORAGE_KEY = "siply:ai_insight_cache:v1";
export const AI_HISTORY_ARTIFACT_CACHE_STORAGE_KEY = "siply:ai_history_artifacts:v1";
export const AI_USAGE_STORAGE_KEY = "siply:ai_usage:v1";
export const AI_REQUEST_TIMEOUT_MS = 20_000;
export const AI_VALIDATION_TIMEOUT_MS = 12_000;
export const ASK_SIPLY_MAX_QUESTION_LENGTH = 500;
export const ASK_SIPLY_MAX_PRIOR_TURNS = 3;
export const AI_HISTORY_REFRESH_THRESHOLD_ML = 350;
export const AI_HISTORY_REFRESH_COOLDOWN_MS = 60 * 60 * 1000;
export const AI_HISTORY_DAILY_AUTOMATIC_ATTEMPT_LIMIT = 3;

export const NVIDIA_DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const NVIDIA_DEFAULT_MODEL = "nvidia/nemotron-3-ultra-550b-a55b";

export const AI_PROVIDER_ORDER: AiProviderId[] = [
  "openai",
  "anthropic",
  "gemini",
  "nvidia",
];

export const AI_PROVIDER_NAMES: Record<AiProviderId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  nvidia: "NVIDIA",
};

export const AI_FIXED_MODELS: Record<Exclude<AiProviderId, "nvidia">, string> = {
  openai: "gpt-5.6-luna",
  anthropic: "claude-sonnet-5",
  gemini: "gemini-3.5-flash-lite",
};

export const DEFAULT_AI_PREFERENCES: AiPreferences = {
  activeProvider: null,
  automaticInsightsEnabled: false,
  needsAttention: [],
  configRevision: 0,
};
