import { beforeEach, describe, expect, it, vi } from "vitest";

const { storage, mockCanSchedule } = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  mockCanSchedule: vi.fn(),
}));

vi.mock("react-native", () => ({
  Platform: { OS: "android", Version: 35, select: (value: any) => value.android },
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
  },
}));

vi.mock("react-native-permissions", () => ({
  canScheduleExactAlarms: mockCanSchedule,
  openSettings: vi.fn(),
}));

import { STORAGE_KEYS } from "../../../core/storage/keys";
import {
  consumePreciseTimingStatusChange,
  dismissPreciseTimingPrompt,
  shouldShowPreciseTimingPrompt,
} from "../notifications/preciseTiming";

describe("precise reminder timing education", () => {
  beforeEach(() => {
    storage.clear();
    mockCanSchedule.mockReset().mockResolvedValue(false);
  });

  it("waits three days and never shows more than twice", async () => {
    const launch = new Date(2026, 8, 1, 12, 0);
    storage.set(STORAGE_KEYS.firstLaunchAt, JSON.stringify(launch.toISOString()));
    expect(await shouldShowPreciseTimingPrompt(true, new Date(2026, 8, 4, 11, 59))).toBe(false);
    expect(await shouldShowPreciseTimingPrompt(true, new Date(2026, 8, 4, 12, 0))).toBe(true);

    await dismissPreciseTimingPrompt(false, new Date(2026, 8, 4, 12, 0));
    expect(await shouldShowPreciseTimingPrompt(true, new Date(2026, 8, 20, 12, 0))).toBe(false);
    expect(await shouldShowPreciseTimingPrompt(true, new Date(2026, 9, 4, 12, 1))).toBe(true);
    await dismissPreciseTimingPrompt(false, new Date(2026, 9, 4, 12, 1));
    expect(await shouldShowPreciseTimingPrompt(true, new Date(2027, 1, 1, 12, 0))).toBe(false);
  });

  it("treats malformed first-launch metadata as ineligible", async () => {
    storage.set(STORAGE_KEYS.firstLaunchAt, "not-json");
    await expect(shouldShowPreciseTimingPrompt(true, new Date(2026, 8, 20)))
      .resolves.toBe(false);
  });

  it("detects an exact-alarm grant or revocation after the initial observation", async () => {
    expect(await consumePreciseTimingStatusChange()).toBe(false);
    mockCanSchedule.mockResolvedValue(true);
    expect(await consumePreciseTimingStatusChange()).toBe(true);
    expect(await consumePreciseTimingStatusChange()).toBe(false);
  });
});
