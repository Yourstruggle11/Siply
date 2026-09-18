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

vi.mock("expo-task-manager", () => ({
  defineTask: vi.fn(),
  isTaskRegisteredAsync: vi.fn().mockResolvedValue(false),
}));

vi.mock("expo-background-task", () => ({
  BackgroundTaskResult: {
    Success: 1,
    Failed: 2,
  },
  BackgroundTaskStatus: {
    Restricted: 1,
    Available: 2,
  },
  getStatusAsync: vi.fn(),
  registerTaskAsync: vi.fn(),
}));

vi.mock("../notifications/notifier", () => ({
  rescheduleNotifications: mockRescheduleNotifications,
  cancelAllNotifications: vi.fn(),
}));

import { SCHEMA_VERSION } from "../../../core/constants";
import { getDateKey } from "../../../core/time";
import { runBackgroundNotificationTask } from "../notifications/backgroundTask";
import { HYDRATION_STORE_STORAGE_KEY } from "../state/hydrationStore";

describe("background notification task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads persisted Zustand snapshot and schedules via engine", async () => {
    const settings = {
      targetLiters: 4.2,
      windowStart: "08:15",
      windowEnd: "21:45",
      sipMl: 24,
      escalationEnabled: false,
      soundEnabled: false,
      appearanceMode: "dark" as const,
      displayUnit: "cups" as const,
      gentleGoalEnabled: true,
      gentleGoalThreshold: 75,
      tone: "minimal" as const,
    };
    const lastLogAt = "2026-09-13T10:30:00.000Z";
    const persistedState = {
      settings,
      progress: {
        date: getDateKey(new Date()),
        consumedMl: 1234,
      },
      onboarding: { completed: true },
      quickLog: {
        presets: [
          { id: "small", name: "Small", icon: "cup", amountMl: 180 },
          { id: "medium", name: "Medium", icon: "cup", amountMl: 320 },
          { id: "large", name: "Large", icon: "bottle", amountMl: 640 },
        ],
        lastUsedMl: 320,
        lastLogAt,
      },
      history: {},
      hydrated: true,
    };

    mockGetItem.mockImplementation(async (key: string) => {
      if (key === HYDRATION_STORE_STORAGE_KEY) {
        return JSON.stringify({ state: persistedState, version: SCHEMA_VERSION });
      }
      // Schedule engine reads snapshot + nudge budget from AsyncStorage
      return null;
    });
    mockRescheduleNotifications.mockResolvedValue({
      success: true,
      scheduled: 6,
      requested: 6,
      failed: 0,
      errors: [],
    });

    const result = await runBackgroundNotificationTask();

    expect(result).toBe(1);
    expect(mockGetItem).toHaveBeenCalledWith(HYDRATION_STORE_STORAGE_KEY);
    // The engine also reads the schedule snapshot and nudge budget keys
    expect(mockGetItem).toHaveBeenCalledTimes(3);
    // rescheduleNotifications is called by the engine with the nudge budget parameter
    expect(mockRescheduleNotifications).toHaveBeenCalledTimes(1);
    expect(mockRescheduleNotifications).toHaveBeenCalledWith(
      settings,
      1234,
      expect.any(Date),
      lastLogAt,
      expect.any(Number), // remainingNudgeBudget
    );
  });

  it("returns Success when onboarding is not completed", async () => {
    const persistedState = {
      settings: {},
      progress: { date: getDateKey(new Date()), consumedMl: 0 },
      onboarding: { completed: false },
      quickLog: { presets: [], lastUsedMl: null, lastLogAt: null },
      history: {},
    };

    mockGetItem.mockImplementation(async (key: string) => {
      if (key === HYDRATION_STORE_STORAGE_KEY) {
        return JSON.stringify({ state: persistedState, version: SCHEMA_VERSION });
      }
      return null;
    });

    const result = await runBackgroundNotificationTask();
    expect(result).toBe(1);
    expect(mockRescheduleNotifications).not.toHaveBeenCalled();
  });

  it("returns Success when no persisted snapshot exists", async () => {
    mockGetItem.mockResolvedValue(null);

    const result = await runBackgroundNotificationTask();
    expect(result).toBe(1);
    expect(mockRescheduleNotifications).not.toHaveBeenCalled();
  });
});
