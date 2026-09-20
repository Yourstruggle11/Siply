import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockClaim,
  mockRelease,
  mockMarkHandled,
  mockReadSnapshot,
  mockSnooze,
} = vi.hoisted(() => ({
  mockClaim: vi.fn(),
  mockRelease: vi.fn(),
  mockMarkHandled: vi.fn(),
  mockReadSnapshot: vi.fn(),
  mockSnooze: vi.fn(),
}));

vi.mock("expo-notifications", () => ({
  registerTaskAsync: vi.fn(),
}));

vi.mock("expo-task-manager", () => ({
  defineTask: vi.fn(),
}));

vi.mock("../notifications/actionDedup", () => ({
  notificationActionDeduplicator: { claimIfUnhandled: mockClaim, release: mockRelease },
}));

vi.mock("../state/hydrationStore", () => ({
  readPersistedHydrationSnapshot: mockReadSnapshot,
}));

vi.mock("../notifications/scheduleEngine", () => ({
  markReminderFamilyHandled: mockMarkHandled,
}));

vi.mock("../notifications/notifier", () => ({
  parseSiplyNotificationId: (id: string) => ({
    ml: Number(id.split(":")[4]),
    familyId: `siply-family-${id.split(":")[3]}`,
  }),
  resolveNotificationFamilyId: (id: string, data?: Record<string, unknown>) =>
    data?.familyId ?? `siply-family-${id.split(":")[3]}`,
  snoozeNotification: mockSnooze,
}));

import {
  NOTIFICATION_ACTION_SKIP,
  NOTIFICATION_ACTION_SNOOZE,
  DEFAULT_SETTINGS,
} from "../../../core/constants";
import { handleBackgroundNotificationAction } from "../notifications/notificationActionTask";

const response = (actionIdentifier: string, includeData = true) => ({
  actionIdentifier,
  notification: {
    date: Date.now(),
    request: {
      identifier: "siply:v2:reminder:1789977600000:240",
      content: {
        title: "Siply",
        body: "Drink 240 ml",
        ...(includeData ? { data: { familyId: "family-1" } } : {}),
      },
      trigger: null,
    },
  },
});

describe("background notification actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClaim.mockResolvedValue(true);
    mockRelease.mockResolvedValue(undefined);
    mockMarkHandled.mockResolvedValue(undefined);
    mockSnooze.mockResolvedValue(true);
    mockReadSnapshot.mockResolvedValue({ settings: DEFAULT_SETTINGS });
  });

  it("cancels a skipped reminder family without requiring the foreground UI", async () => {
    await handleBackgroundNotificationAction(response(NOTIFICATION_ACTION_SKIP) as any);
    expect(mockMarkHandled).toHaveBeenCalledWith("family-1", "skipped");
    expect(mockSnooze).not.toHaveBeenCalled();
  });

  it("schedules snooze from the persisted live settings", async () => {
    const settings = { ...DEFAULT_SETTINGS, soundEnabled: false };
    mockReadSnapshot.mockResolvedValue({ settings });
    await handleBackgroundNotificationAction(response(NOTIFICATION_ACTION_SNOOZE) as any);
    expect(mockMarkHandled).toHaveBeenCalledWith("family-1", "snoozed");
    expect(mockSnooze).toHaveBeenCalledWith(240, settings, "family-1");
  });

  it("handles Android actions when local notification data is omitted", async () => {
    await handleBackgroundNotificationAction(
      response(NOTIFICATION_ACTION_SKIP, false) as any
    );

    expect(mockMarkHandled).toHaveBeenCalledWith(
      "siply-family-1789977600000",
      "skipped"
    );
  });

  it("deduplicates action delivery across background and foreground handlers", async () => {
    mockClaim.mockResolvedValue(false);
    await handleBackgroundNotificationAction(response(NOTIFICATION_ACTION_SKIP) as any);
    expect(mockMarkHandled).not.toHaveBeenCalled();
  });

  it("releases a claimed action when its side effect fails", async () => {
    mockMarkHandled.mockRejectedValueOnce(new Error("native cancellation failed"));
    await expect(
      handleBackgroundNotificationAction(response(NOTIFICATION_ACTION_SKIP) as any)
    ).rejects.toThrow("native cancellation failed");
    expect(mockRelease).toHaveBeenCalledWith("siply:v2:reminder:1789977600000:240");
  });
});
