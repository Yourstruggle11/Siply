import { beforeEach, describe, expect, it, vi } from "vitest";

const { storage } = vi.hoisted(() => ({ storage: new Map<string, string>() }));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { storage.delete(key); }),
  },
}));

import { getAiAttemptCount, reserveAiAttempt } from "../ai/usage";

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
});
