import type { DisplayUnit } from "../domain/types";

export type AiProviderId = "openai" | "anthropic" | "gemini" | "nvidia";

type CredentialBase = {
  apiKey: string;
  disclosureVersion: number;
  provider: AiProviderId;
  validatedAt: string;
};

export type SimpleProviderCredential = CredentialBase & {
  provider: "openai" | "anthropic" | "gemini";
};

export type NvidiaCredential = CredentialBase & {
  provider: "nvidia";
  baseUrl: string;
  modelId: string;
};

export type AiProviderCredential = SimpleProviderCredential | NvidiaCredential;

export type AiPreferences = {
  activeProvider: AiProviderId | null;
  automaticInsightsEnabled: boolean;
  needsAttention: AiProviderId[];
  configRevision: number;
};

export type AiHydrationContext = {
  version: 2;
  purpose: "ask" | "history_insight";
  generatedAt: string;
  localDate: string;
  timezoneOffsetMinutes: number;
  preferredDisplayUnit: DisplayUnit;
  valuesUnit: "ml";
  settings: {
    dailyTargetMl: number;
    activeWindow: { start: string; end: string };
    gentleGoal: { enabled: boolean; thresholdPercent: number };
  };
  today: {
    consumedMl: number;
    remainingMl: number;
    percentOfGoal: number;
  };
  period: {
    startDate: string;
    endDate: string;
    dailyHistoryDays: 14 | 90;
    hourlyHistoryDays: 7;
  };
  dailyHistory: Array<{
    date: string;
    totalMl: number;
    goalMl: number;
    percentOfGoal: number;
    logCount: number;
  }>;
  recentHourlyHistory: Array<{
    date: string;
    volumesMl: number[];
    quality: "exact" | "estimated";
  }>;
  aggregates: {
    trackedDays: number;
    averageDailyMl: number;
    goalHitRatePercent: number;
    currentGoalStreak: number;
    bestGoalStreak: number;
    last7GoalHits: number;
    last30GoalHits: number;
    currentGentleStreak: number | null;
    bestGentleStreak: number | null;
    bestHoursLocal: number[];
    deterministicInsight: string | null;
  };
};

export type AiConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AiGenerateRequest = {
  credential: AiProviderCredential;
  systemPrompt: string;
  messages: AiConversationMessage[];
  maxOutputTokens: number;
  signal?: AbortSignal;
};

export type AiGenerateResult = {
  text: string;
  truncated: boolean;
  finishReason?: string;
};

export type AiInsightCacheV1 = {
  version: 1;
  promptVersion: number;
  text: string;
  provider: AiProviderId;
  model: string;
  generatedAt: string;
  localDate: string;
  dataThroughDate: string;
  contextFingerprint: string;
  providerConfigFingerprint: string;
  sourceConsumedMl: number;
  sourceTargetMl: number;
  sourceTargetMet: boolean;
  trendFingerprint: string;
};

export type AiHistoryArtifactKind = "daily_recap" | "weekly_review";

export type AiHistoryArtifactCacheV1 = {
  version: 1;
  promptVersion: number;
  kind: AiHistoryArtifactKind;
  periodKey: string;
  text: string;
  contextFingerprint: string;
  generatedAt: string;
};
