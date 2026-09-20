import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { storage, mockApplyNotificationPlan, mockCancelFamily } = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  mockApplyNotificationPlan: vi.fn(),
  mockCancelFamily: vi.fn(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { storage.delete(key); }),
  },
}));

vi.mock("../notifications/diagnostics", () => ({
  recordNotificationDiagnostic: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../notifications/notifier", () => ({
  buildReminderFamilyId: (time: Date) => `siply-family-${time.getTime()}`,
  cancelNotificationFamily: mockCancelFamily,
  applyNotificationPlan: mockApplyNotificationPlan,
}));

import { DEFAULT_SETTINGS } from "../../../core/constants";
import {
  SCHEDULE_SNAPSHOT_KEY,
  forceReconcile,
  getNextReminderFromSnapshot,
  reconcile,
} from "../notifications/scheduleEngine";

const successfulApply = (_settings: unknown, slots: Array<{ familyId: string }>) => ({
  success: true,
  status: "verified" as const,
  requested: slots.length,
  scheduled: slots.length,
  failed: 0,
  desiredCount: slots.length,
  pendingIds: [],
  verifiedBaseIds: [],
  verifiedFamilyIds: slots.map((slot) => slot.familyId),
  pendingFamilyIds: slots.map((slot) => slot.familyId),
  errors: [],
});

describe("scheduleEngine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 21, 8, 0));
    storage.clear();
    mockApplyNotificationPlan.mockReset();
    mockApplyNotificationPlan.mockImplementation(successfulApply);
    mockCancelFamily.mockReset();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("creates and persists an OS-verified plan", async () => {
    const snapshot = await reconcile({
      settings: DEFAULT_SETTINGS,
      consumedMl: 500,
      source: "test",
    });

    expect(snapshot.consumedMlAtCompute).toBe(500);
    expect(snapshot.health).toBe("scheduled");
    expect(mockApplyNotificationPlan).toHaveBeenCalledOnce();
    expect(JSON.parse(storage.get(SCHEDULE_SNAPSHOT_KEY)!)).toMatchObject({ version: 2 });
  });

  it("verifies an unchanged plan without recomputing or shifting its times", async () => {
    const first = await forceReconcile({
      settings: DEFAULT_SETTINGS,
      consumedMl: 500,
      source: "first",
    });
    const firstTimes = first.slots.map((slot) => slot.time);

    vi.setSystemTime(new Date(2026, 8, 21, 8, 20));
    const second = await reconcile({
      settings: DEFAULT_SETTINGS,
      consumedMl: 500,
      source: "foreground",
    });

    expect(mockApplyNotificationPlan).toHaveBeenCalledTimes(2);
    expect(second.planId).toBe(first.planId);
    expect(second.revision).toBe(first.revision);
    expect(second.slots.map((slot) => slot.time)).toEqual(firstTimes);
    expect(getNextReminderFromSnapshot(second)?.getTime()).toBeGreaterThan(Date.now());
  });

  it("recomputes after a drink and enforces a 30-minute quiet period", async () => {
    await forceReconcile({ settings: DEFAULT_SETTINGS, consumedMl: 500, source: "first" });
    const loggedAt = new Date(2026, 8, 21, 8, 15);
    vi.setSystemTime(loggedAt);

    const result = await reconcile({
      settings: DEFAULT_SETTINGS,
      consumedMl: 750,
      lastLogAt: loggedAt.toISOString(),
      source: "drink_logged",
    });

    expect(result.consumedMlAtCompute).toBe(750);
    expect(new Date(result.slots[0].time).getTime()).toBeGreaterThanOrEqual(
      loggedAt.getTime() + 30 * 60_000
    );
  });

  it("recomputes local clock times after a timezone-offset change", async () => {
    const first = await forceReconcile({
      settings: DEFAULT_SETTINGS,
      consumedMl: 500,
      source: "first",
    });
    const persisted = JSON.parse(storage.get(SCHEDULE_SNAPSHOT_KEY)!);
    persisted.timezoneOffsetMinutes += 60;
    storage.set(SCHEDULE_SNAPSHOT_KEY, JSON.stringify(persisted));

    const refreshed = await reconcile({
      settings: DEFAULT_SETTINGS,
      consumedMl: 500,
      source: "timezone_change",
    });
    expect(refreshed.revision).toBe(first.revision + 1);
  });

  it("spreads four normal nudge families across each hydration day", async () => {
    const snapshot = await forceReconcile({
      settings: { ...DEFAULT_SETTINGS, urgencyExtraNudgeEnabled: false },
      consumedMl: 0,
      source: "nudge_test",
    });
    const nudged = snapshot.slots.filter(
      (slot) => slot.time.startsWith("2026-09-21") && slot.nudgeMode === "normal"
    );

    expect(nudged).toHaveLength(4);
    expect(nudged.every((slot) => slot.nudgeOffsets.join(",") === "5,10")).toBe(true);
    expect(new Set(nudged.map((slot) => new Date(slot.time).getHours())).size).toBeGreaterThan(1);
  });

  it("adds at most one urgency nudge family only when explicitly enabled", async () => {
    const snapshot = await forceReconcile({
      settings: { ...DEFAULT_SETTINGS, urgencyExtraNudgeEnabled: true },
      consumedMl: 0,
      source: "urgency_test",
    });
    const todaySlots = snapshot.slots.filter((slot) => slot.time.startsWith("2026-09-21"));

    expect(todaySlots.filter((slot) => slot.nudgeMode === "normal")).toHaveLength(4);
    expect(todaySlots.filter((slot) => slot.nudgeMode === "urgency")).toHaveLength(1);
  });

  it("preserves the last verified plan when a replacement cannot be installed", async () => {
    const first = await forceReconcile({ settings: DEFAULT_SETTINGS, consumedMl: 500, source: "first" });
    mockApplyNotificationPlan.mockResolvedValueOnce({
      success: false,
      status: "failed",
      requested: 3,
      scheduled: 0,
      failed: 3,
      desiredCount: 3,
      pendingIds: [],
      verifiedBaseIds: [],
      verifiedFamilyIds: [],
      pendingFamilyIds: first.verifiedFamilyIds,
      errors: ["temporary native failure"],
    });

    const replacement = await forceReconcile({
      settings: { ...DEFAULT_SETTINGS, targetLiters: 3.5 },
      consumedMl: 500,
      source: "settings_change",
    });

    expect(replacement.health).toBe("partially_scheduled");
    expect(replacement.slots.map((slot) => slot.familyId)).toEqual(
      first.slots.map((slot) => slot.familyId)
    );
    expect(replacement.planId).toBe(first.planId);

    const recovered = await reconcile({
      settings: { ...DEFAULT_SETTINGS, targetLiters: 3.5 },
      consumedMl: 500,
      source: "automatic_retry",
    });
    expect(recovered.health).toBe("scheduled");
    expect(recovered.revision).toBe(first.revision + 1);
    expect(recovered.planId).not.toBe(first.planId);
  });
});
