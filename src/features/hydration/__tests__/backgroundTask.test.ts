import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetItem, mockRescheduleNotifications } = vi.hoisted(() => ({
  mockGetItem: vi.fn(),
  mockRescheduleNotifications: vi.fn(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: mockGetItem,
    setItem: vi.fn(),
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
}));

import { SCHEMA_VERSION } from "../../../core/constants";
import { getDateKey } from "../../../core/time";
import { runBackgroundNotificationTask } from "../notifications/backgroundTask";
import { HYDRATION_STORE_STORAGE_KEY } from "../state/hydrationStore";

describe("background notification task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads only the canonical persisted Zustand snapshot", async () => {
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

    mockGetItem.mockImplementation(async (key: string) =>
      key === HYDRATION_STORE_STORAGE_KEY
        ? JSON.stringify({ state: persistedState, version: SCHEMA_VERSION })
        : null,
    );
    mockRescheduleNotifications.mockResolvedValue({
      success: true,
      scheduled: 6,
    });

    const result = await runBackgroundNotificationTask();

    expect(result).toBe(1);
    expect(mockGetItem).toHaveBeenCalledWith(HYDRATION_STORE_STORAGE_KEY);
    expect(mockGetItem).toHaveBeenCalledTimes(1);
    expect(mockRescheduleNotifications).toHaveBeenCalledTimes(1);
    expect(mockRescheduleNotifications).toHaveBeenCalledWith(
      settings,
      1234,
      expect.any(Date),
      lastLogAt,
    );
  });
});
