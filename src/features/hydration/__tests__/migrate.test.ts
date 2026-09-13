import { describe, it, expect, vi } from "vitest";
import { migrateStorage } from "../state/hydrationStore";
import { DEFAULT_SETTINGS } from "../../../core/constants";
import { getDateKey } from "../../../core/time";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  }
}));

describe("migrateStorage", () => {
  it("normalizes an empty snapshot to current defaults", async () => {
    const result = await migrateStorage(null, 1);
    expect(result.settings).toEqual(DEFAULT_SETTINGS);
    expect(result.progress).toEqual({
      date: getDateKey(new Date()),
      consumedMl: 0,
    });
    expect(result.onboarding.completed).toBe(false);
    expect(result.quickLog.presets.length).toBeGreaterThan(0);
    expect(result.history).toEqual({});
  });

  it("migrates existing state when not empty", async () => {
    const existing = {
      settings: { targetLiters: 10 },
      progress: { date: "2000-01-01", consumedMl: 200 },
    };
    const result = await migrateStorage(existing, 2);
    expect(result.settings.targetLiters).toBe(10);
    // the date is wrong for today, so consumedMl should be reset to 0 in normalization
    expect(result.progress.consumedMl).toBe(0);
  });

  it("handles corrupt snapshot without data loss (uses defaults)", async () => {
    const corrupt = { settings: null, progress: null };
    const result = await migrateStorage(corrupt, 2);
    expect(result.settings).toBeDefined();
    expect(result.progress.consumedMl).toBe(0);
    expect(result.quickLog.presets.length).toBeGreaterThan(0);
  });
});
