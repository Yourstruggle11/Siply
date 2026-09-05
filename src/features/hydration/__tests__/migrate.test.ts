import { describe, it, expect, vi } from "vitest";
import { migrateStorage } from "../state/hydrationStore";
import * as migrations from "../../../core/storage/migrations";

vi.mock("../../../core/storage/migrations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../core/storage/migrations")>();
  return {
    ...actual,
    hydrateStorage: vi.fn(),
  };
});

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  }
}));

describe("migrateStorage", () => {
  it("migrates legacy state when empty", async () => {
    vi.mocked(migrations.hydrateStorage).mockResolvedValueOnce({
      settings: { targetLiters: 5 } as any,
      progress: { consumedMl: 100 } as any,
      history: {},
      quickLog: { presets: [] } as any,
      onboarding: { completed: true },
    });

    const result = await migrateStorage(null, 1);
    expect(migrations.hydrateStorage).toHaveBeenCalled();
    expect(result.settings.targetLiters).toBe(5);
    expect(result.progress.consumedMl).toBe(100);
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
