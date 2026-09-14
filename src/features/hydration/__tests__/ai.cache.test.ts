import { describe, expect, it } from "vitest";
import { shouldDisplayAiInsight, shouldFetchAiInsight } from "../ai/insightCache";
import type { AiInsightCacheV1 } from "../ai/types";

const cache: AiInsightCacheV1 = {
  version: 1,
  promptVersion: 1,
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
  nowMs: Date.parse("2026-09-14T12:00:00.000Z"),
  cache,
};

describe("automatic AI insight decisions", () => {
  it("waits for 350 ml of accumulated change and the one-hour cooldown", () => {
    expect(shouldFetchAiInsight(input)).toBe(false);
    expect(shouldFetchAiInsight({ ...input, consumedMl: 850 })).toBe(true);
    expect(shouldFetchAiInsight({
      ...input,
      consumedMl: 850,
      nowMs: Date.parse("2026-09-14T10:30:00.000Z"),
    })).toBe(false);
  });

  it("refreshes after cooldown on a target crossing or non-today trend change", () => {
    expect(shouldFetchAiInsight({ ...input, consumedMl: 2050 })).toBe(true);
    expect(shouldFetchAiInsight({ ...input, trendFingerprint: "changed" })).toBe(true);
  });

  it("refreshes immediately on a new day or provider configuration", () => {
    expect(shouldFetchAiInsight({ ...input, localDate: "2026-09-15" })).toBe(true);
    expect(shouldFetchAiInsight({ ...input, providerConfigFingerprint: "changed" })).toBe(true);
  });

  it("requires focus and all automatic gates, including the three-attempt cap", () => {
    expect(shouldFetchAiInsight({ ...input, focused: false, consumedMl: 850 })).toBe(false);
    expect(shouldFetchAiInsight({ ...input, hasCredential: false, consumedMl: 850 })).toBe(false);
    expect(shouldFetchAiInsight({ ...input, online: false, consumedMl: 850 })).toBe(false);
    expect(shouldFetchAiInsight({ ...input, enabled: false, consumedMl: 850 })).toBe(false);
    expect(shouldFetchAiInsight({ ...input, hasLocalInsight: false, consumedMl: 850 })).toBe(false);
    expect(shouldFetchAiInsight({ ...input, automaticAttempts: 3, consumedMl: 850 })).toBe(false);
  });

  it("hides stale cached copy as soon as the hydration context changes", () => {
    expect(shouldDisplayAiInsight(true, "old-context", cache)).toBe(true);
    expect(shouldDisplayAiInsight(true, "new-context", cache)).toBe(false);
    expect(shouldDisplayAiInsight(false, "old-context", cache)).toBe(false);
  });
});
