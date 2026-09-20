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
  dismissDailyRecap,
  loadAiHistoryPresentation,
} from "../ai/historyArtifacts";

describe("AI History presentation", () => {
  beforeEach(() => storage.clear());

  it("persists dismissal for one daily recap period", async () => {
    expect((await loadAiHistoryPresentation()).dismissedDailyPeriodKey).toBeNull();
    await dismissDailyRecap("2026-09-19");
    expect((await loadAiHistoryPresentation()).dismissedDailyPeriodKey).toBe("2026-09-19");
  });
});
