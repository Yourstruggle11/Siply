import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetItem, mockSetItem, mockRescheduleNotifications } = vi.hoisted(() => ({
  mockGetItem: vi.fn(),
  mockSetItem: vi.fn(),
  mockRescheduleNotifications: vi.fn(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: mockGetItem,
    setItem: mockSetItem,
    removeItem: vi.fn(),
  },
}));

vi.mock("../notifications/notifier", () => ({
  rescheduleNotifications: mockRescheduleNotifications,
  cancelAllNotifications: vi.fn(),
}));

import { reconcile, forceReconcile, isRelaxedDay } from "../notifications/scheduleEngine";
import { DEFAULT_SETTINGS } from "../../../core/constants";
import { getDateKey } from "../../../core/time";
import { HydrationHistory } from "../domain/types";

describe("scheduleEngine — reconcile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
    mockRescheduleNotifications.mockResolvedValue({
      success: true,
      scheduled: 5,
      requested: 5,
      failed: 0,
      errors: [],
    });
  });

  it("schedules when no existing snapshot exists", async () => {
    const result = await reconcile({
      settings: DEFAULT_SETTINGS,
      consumedMl: 500,
      source: "test",
    });

    expect(result).not.toBeNull();
    expect(result!.consumedMlAtCompute).toBe(500);
    expect(result!.triggerSource).toBe("test");
    expect(mockRescheduleNotifications).toHaveBeenCalledTimes(1);
  });

  it("skips rescheduling when snapshot is fresh and nothing changed", async () => {
    // First call — creates snapshot
    const snapshot = await forceReconcile({
      settings: DEFAULT_SETTINGS,
      consumedMl: 500,
      source: "first",
    });

    // Mock getItem to return the snapshot we just created
    mockGetItem.mockImplementation(async (key: string) => {
      if (key === "siply:schedule_snapshot:v1") {
        return JSON.stringify(snapshot);
      }
      return null;
    });

    mockRescheduleNotifications.mockClear();

    // Second call — same inputs, should be skipped
    const result = await reconcile({
      settings: DEFAULT_SETTINGS,
      consumedMl: 500,
      source: "second",
    });

    // Should return the cached snapshot without rescheduling
    expect(result).not.toBeNull();
    expect(mockRescheduleNotifications).not.toHaveBeenCalled();
  });

  it("reschedules when consumedMl changes", async () => {
    // First call
    const snapshot = await forceReconcile({
      settings: DEFAULT_SETTINGS,
      consumedMl: 500,
      source: "first",
    });

    mockGetItem.mockImplementation(async (key: string) => {
      if (key === "siply:schedule_snapshot:v1") {
        return JSON.stringify(snapshot);
      }
      return null;
    });

    mockRescheduleNotifications.mockClear();

    // Second call with different consumedMl
    const result = await reconcile({
      settings: DEFAULT_SETTINGS,
      consumedMl: 750,
      source: "drink_logged",
    });

    expect(result).not.toBeNull();
    expect(result!.consumedMlAtCompute).toBe(750);
    expect(mockRescheduleNotifications).toHaveBeenCalledTimes(1);
  });

  it("reschedules when settings change", async () => {
    const snapshot = await forceReconcile({
      settings: DEFAULT_SETTINGS,
      consumedMl: 500,
      source: "first",
    });

    mockGetItem.mockImplementation(async (key: string) => {
      if (key === "siply:schedule_snapshot:v1") {
        return JSON.stringify(snapshot);
      }
      return null;
    });

    mockRescheduleNotifications.mockClear();

    // Change a setting
    const newSettings = { ...DEFAULT_SETTINGS, targetLiters: 4.0 };
    const result = await reconcile({
      settings: newSettings,
      consumedMl: 500,
      source: "settings_change",
    });

    expect(result).not.toBeNull();
    expect(mockRescheduleNotifications).toHaveBeenCalledTimes(1);
  });
});

describe("scheduleEngine — forceReconcile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
    mockRescheduleNotifications.mockResolvedValue({
      success: true,
      scheduled: 5,
      requested: 5,
      failed: 0,
      errors: [],
    });
  });

  it("always reschedules regardless of snapshot freshness", async () => {
    // Create a fresh snapshot
    await forceReconcile({
      settings: DEFAULT_SETTINGS,
      consumedMl: 500,
      source: "first",
    });

    mockRescheduleNotifications.mockClear();

    // Force reconcile with same inputs — should still reschedule
    const result = await forceReconcile({
      settings: DEFAULT_SETTINGS,
      consumedMl: 500,
      source: "force",
    });

    expect(result).not.toBeNull();
    expect(mockRescheduleNotifications).toHaveBeenCalledTimes(1);
  });
});

describe("scheduleEngine — serialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
    mockRescheduleNotifications.mockResolvedValue({
      success: true,
      scheduled: 5,
      requested: 5,
      failed: 0,
      errors: [],
    });
  });

  it("serializes concurrent calls (no parallel execution)", async () => {
    const callOrder: number[] = [];
    let callCount = 0;

    mockRescheduleNotifications.mockImplementation(async () => {
      const myIndex = ++callCount;
      callOrder.push(myIndex);
      // Simulate async work
      await new Promise((r) => setTimeout(r, 10));
      return { success: true, scheduled: 1, requested: 1, failed: 0, errors: [] };
    });

    // Launch 3 concurrent reconciles
    const results = await Promise.all([
      forceReconcile({ settings: DEFAULT_SETTINGS, consumedMl: 100, source: "a" }),
      forceReconcile({ settings: DEFAULT_SETTINGS, consumedMl: 200, source: "b" }),
      forceReconcile({ settings: DEFAULT_SETTINGS, consumedMl: 300, source: "c" }),
    ]);

    // All should complete
    expect(results.every((r) => r !== null)).toBe(true);
    // They should have been serialized (executed in order)
    expect(callOrder).toEqual([1, 2, 3]);
  });
});

describe("scheduleEngine — weekend awareness", () => {
  it("detects relaxed day when weekend intake is significantly lower", () => {
    const history: HydrationHistory = {};
    const now = new Date("2026-09-20T12:00:00"); // Saturday

    // Create 30 days of history with lower weekend intake
    for (let i = 0; i < 30; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = getDateKey(d);
      const dow = d.getDay();
      const isWeekend = dow === 0 || dow === 6;
      history[key] = {
        date: key,
        totalMl: isWeekend ? 1500 : 2800, // Weekend avg 1500, weekday avg 2800
        goalMl: 3000,
        goodThresholdMl: 1800,
        logHours: Array(24).fill(0),
      };
    }

    expect(isRelaxedDay(history, now)).toBe(true);
  });

  it("returns false on a weekday", () => {
    const history: HydrationHistory = {};
    const now = new Date("2026-09-21T12:00:00"); // Monday

    expect(isRelaxedDay(history, now)).toBe(false);
  });

  it("returns false when insufficient data", () => {
    const history: HydrationHistory = {};
    const now = new Date("2026-09-20T12:00:00"); // Saturday

    expect(isRelaxedDay(history, now)).toBe(false);
  });
});
