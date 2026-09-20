import { beforeEach, describe, expect, it, vi } from "vitest";

const { storage } = vi.hoisted(() => ({ storage: new Map<string, string>() }));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { storage.delete(key); }),
  },
}));

import {
  getAiAttemptCount,
  getAiHistoryAttemptState,
  reserveAiAttempt,
  reserveAiHistoryPhaseAttempt,
} from "../ai/usage";

describe("AI automatic request budget", () => {
  beforeEach(() => storage.clear());

  it("atomically limits concurrent History reservations to three started requests", async () => {
    const results = await Promise.all(Array.from(
      { length: 5 },
      () => reserveAiAttempt("history_insight", "2026-09-14", 3)
    ));
    expect(results.filter(Boolean)).toHaveLength(3);
    expect(await getAiAttemptCount("history_insight", "2026-09-14")).toBe(3);
  });

  it("allows only one History request in each early, middle, and late phase", async () => {
    expect(await reserveAiHistoryPhaseAttempt("2026-09-15", "early")).toBe(true);
    expect(await reserveAiHistoryPhaseAttempt("2026-09-15", "early")).toBe(false);
    expect(await reserveAiHistoryPhaseAttempt("2026-09-15", "middle")).toBe(true);
    expect(await reserveAiHistoryPhaseAttempt("2026-09-15", "late")).toBe(true);
    const state = await getAiHistoryAttemptState("2026-09-15");
    expect(state.attempts).toBe(3);
    expect(state.attemptedPhases).toEqual(["early", "middle", "late"]);
  });

  it("honors the pre-phase aggregate counter after an OTA update", async () => {
    await reserveAiAttempt("history_insight", "2026-09-16", 3);
    await reserveAiAttempt("history_insight", "2026-09-16", 3);
    await reserveAiAttempt("history_insight", "2026-09-16", 3);
    expect(await reserveAiHistoryPhaseAttempt("2026-09-16", "late")).toBe(false);
    expect((await getAiHistoryAttemptState("2026-09-16")).attempts).toBe(3);
  });
});
