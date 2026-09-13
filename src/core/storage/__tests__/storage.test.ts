import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetItem, mockSetItem } = vi.hoisted(() => ({
  mockGetItem: vi.fn(),
  mockSetItem: vi.fn(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: mockGetItem,
    setItem: mockSetItem,
    removeItem: vi.fn(),
  },
}));

import { STORAGE_KEYS } from "../keys";
import { ensureFirstLaunchAt } from "../storage";

describe("ensureFirstLaunchAt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps an existing valid first-launch timestamp", async () => {
    const existing = "2026-08-01T10:00:00.000Z";
    mockGetItem.mockResolvedValue(JSON.stringify(existing));

    await expect(ensureFirstLaunchAt()).resolves.toBe(existing);
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it("stores the first-launch timestamp when it is missing", async () => {
    const now = new Date("2026-09-13T12:00:00.000Z");
    mockGetItem.mockResolvedValue(null);

    await expect(ensureFirstLaunchAt(now)).resolves.toBe(now.toISOString());
    expect(mockSetItem).toHaveBeenCalledWith(
      STORAGE_KEYS.firstLaunchAt,
      JSON.stringify(now.toISOString())
    );
  });

  it("replaces an invalid stored timestamp", async () => {
    const now = new Date("2026-09-13T12:00:00.000Z");
    mockGetItem.mockResolvedValue(JSON.stringify("not-a-date"));

    await expect(ensureFirstLaunchAt(now)).resolves.toBe(now.toISOString());
    expect(mockSetItem).toHaveBeenCalledOnce();
  });
});
