import { beforeEach, describe, expect, it, vi } from "vitest";

const { storage, mockReconcile } = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  mockReconcile: vi.fn(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { storage.delete(key); }),
  },
}));

vi.mock("expo-task-manager", () => ({
  defineTask: vi.fn(),
  isTaskRegisteredAsync: vi.fn().mockResolvedValue(false),
}));

vi.mock("expo-background-task", () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
  getStatusAsync: vi.fn().mockResolvedValue(2),
  registerTaskAsync: vi.fn(),
  unregisterTaskAsync: vi.fn(),
}));

vi.mock("../notifications/scheduleEngine", () => ({
  reconcile: mockReconcile,
}));

vi.mock("../notifications/diagnostics", () => ({
  recordNotificationDiagnostic: vi.fn().mockResolvedValue(undefined),
}));

import { DEFAULT_SETTINGS, SCHEMA_VERSION } from "../../../core/constants";
import { getDateKey } from "../../../core/time";
import { runBackgroundNotificationTask } from "../notifications/backgroundTask";
import { HYDRATION_STORE_STORAGE_KEY } from "../state/hydrationStore";

describe("background notification task", () => {
  beforeEach(() => {
    storage.clear();
    mockReconcile.mockReset().mockResolvedValue({ health: "scheduled" });
  });

  it("reads the live Zustand-persisted source of truth and passes all scheduling inputs", async () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      targetLiters: 4.2,
      windowStart: "08:15",
      windowEnd: "21:45",
      sipMl: 24,
      escalationEnabled: false,
      soundEnabled: false,
    };
    const lastLogAt = "2026-09-20T10:30:00.000Z";
    const history = { "2026-09-20": { date: "2026-09-20", totalMl: 1234, goalMl: 4200, goodThresholdMl: 2520, logHours: Array(24).fill(0) } };
    storage.set(HYDRATION_STORE_STORAGE_KEY, JSON.stringify({
      version: SCHEMA_VERSION,
      state: {
        settings,
        progress: { date: getDateKey(new Date()), consumedMl: 1234 },
        onboarding: { completed: true },
        quickLog: { presets: [], lastUsedMl: 320, lastLogAt },
        history,
        hydrated: true,
      },
    }));

    expect(await runBackgroundNotificationTask()).toBe(1);
    expect(mockReconcile).toHaveBeenCalledWith({
      settings,
      consumedMl: 1234,
      lastLogAt,
      source: "background_task",
      history,
    });
  });

  it("does not schedule from missing or incomplete persisted state", async () => {
    expect(await runBackgroundNotificationTask()).toBe(1);
    expect(mockReconcile).not.toHaveBeenCalled();

    storage.set(HYDRATION_STORE_STORAGE_KEY, JSON.stringify({
      version: SCHEMA_VERSION,
      state: {
        settings: DEFAULT_SETTINGS,
        progress: { date: getDateKey(new Date()), consumedMl: 0 },
        onboarding: { completed: false },
        quickLog: { presets: [], lastUsedMl: null, lastLogAt: null },
        history: {},
      },
    }));
    expect(await runBackgroundNotificationTask()).toBe(1);
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it("reports a failed background result when reconciliation cannot restore the plan", async () => {
    storage.set(HYDRATION_STORE_STORAGE_KEY, JSON.stringify({
      version: SCHEMA_VERSION,
      state: {
        settings: DEFAULT_SETTINGS,
        progress: { date: getDateKey(new Date()), consumedMl: 0 },
        onboarding: { completed: true },
        quickLog: { presets: [], lastUsedMl: null, lastLogAt: null },
        history: {},
      },
    }));
    mockReconcile.mockResolvedValue({ health: "schedule_failed" });

    expect(await runBackgroundNotificationTask()).toBe(2);
  });
});
