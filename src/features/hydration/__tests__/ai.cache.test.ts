import { describe, expect, it } from "vitest";
import {
  getAiHistoryPhase,
  shouldDisplayAiInsight,
  shouldFetchAiInsight,
} from "../ai/insightCache";
import type { AiInsightCacheV1 } from "../ai/types";

const cache: AiInsightCacheV1 = {
  version: 1,
  promptVersion: 2,
  text: "Cached",
  provider: "openai",
  model: "gpt-5.6-luna",
  generatedAt: "2026-09-14T10:00:00.000Z",
  localDate: "2026-09-14",
  dataThroughDate: "2026-09-14",
  contextFingerprint: "old-context",
  providerConfigFingerprint: "same-provider",
  sourceConsumedMl: 500,
  sourceTargetMl: 2000,
  sourceTargetMet: false,
  trendFingerprint: "same-trend",
};

const input = {
  enabled: true,
  focused: true,
  hasLocalInsight: true,
  hasCredential: true,
  online: true,
  localDate: "2026-09-14",
  contextFingerprint: "new-context",
  providerConfigFingerprint: "same-provider",
  trendFingerprint: "same-trend",
  consumedMl: 700,
  targetMl: 2000,
  automaticAttempts: 1,
  phaseAvailable: true,
  cache,
};

describe("automatic AI insight decisions", () => {
  it("waits for 350 ml of accumulated change within a new daily phase", () => {
    expect(shouldFetchAiInsight(input)).toBe(false);
    expect(shouldFetchAiInsight({ ...input, consumedMl: 850 })).toBe(true);
    expect(shouldFetchAiInsight({ ...input, consumedMl: 850, phaseAvailable: false })).toBe(false);
  });

  it("refreshes in a fresh phase on a target crossing or non-today trend change", () => {
    expect(shouldFetchAiInsight({ ...input, consumedMl: 2050 })).toBe(true);
    expect(shouldFetchAiInsight({ ...input, trendFingerprint: "changed" })).toBe(true);
  });

  it("refreshes immediately on a new day or provider configuration", () => {
    expect(shouldFetchAiInsight({ ...input, localDate: "2026-09-15" })).toBe(true);
    expect(shouldFetchAiInsight({ ...input, providerConfigFingerprint: "changed" })).toBe(true);
  });

  it("requires focus and all automatic gates, including a fresh phase and the cap", () => {
    expect(shouldFetchAiInsight({ ...input, focused: false, consumedMl: 850 })).toBe(false);
    expect(shouldFetchAiInsight({ ...input, hasCredential: false, consumedMl: 850 })).toBe(false);
    expect(shouldFetchAiInsight({ ...input, online: false, consumedMl: 850 })).toBe(false);
    expect(shouldFetchAiInsight({ ...input, enabled: false, consumedMl: 850 })).toBe(false);
    expect(shouldFetchAiInsight({ ...input, hasLocalInsight: false, consumedMl: 850 })).toBe(false);
    expect(shouldFetchAiInsight({ ...input, automaticAttempts: 3, consumedMl: 850 })).toBe(false);
    expect(shouldFetchAiInsight({ ...input, phaseAvailable: false, consumedMl: 850 })).toBe(false);
  });

  it("keeps a valid same-day cached insight visible through small context changes", () => {
    expect(shouldDisplayAiInsight(true, "2026-09-14", 2000, cache)).toBe(true);
    expect(shouldDisplayAiInsight(true, "2026-09-15", 2000, cache)).toBe(false);
    expect(shouldDisplayAiInsight(true, "2026-09-14", 2500, cache)).toBe(false);
    expect(shouldDisplayAiInsight(false, "2026-09-14", 2000, cache)).toBe(false);
  });

  it("assigns at most one opportunity to each active-window phase", () => {
    const window = { start: "07:00", end: "21:00" };
    expect(getAiHistoryPhase(window, new Date(2026, 8, 14, 6, 59))).toBeNull();
    expect(getAiHistoryPhase(window, new Date(2026, 8, 14, 8))).toBe("early");
    expect(getAiHistoryPhase(window, new Date(2026, 8, 14, 13))).toBe("middle");
    expect(getAiHistoryPhase(window, new Date(2026, 8, 14, 19))).toBe("late");
    expect(getAiHistoryPhase(window, new Date(2026, 8, 14, 21))).toBeNull();
  });
});
