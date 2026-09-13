import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCopyAsync, mockProcessBackupUri } = vi.hoisted(() => ({
  mockCopyAsync: vi.fn(),
  mockProcessBackupUri: vi.fn(),
}));

vi.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  copyAsync: mockCopyAsync,
}));

vi.mock("../backup/import", () => ({
  processBackupUri: mockProcessBackupUri,
}));

import { handleIncomingBackupUrl } from "../backup/incoming";

describe("handleIncomingBackupUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCopyAsync.mockResolvedValue(undefined);
    mockProcessBackupUri.mockResolvedValue(undefined);
  });

  it("forwards a suffixless content URI to the real import pipeline", async () => {
    await expect(
      handleIncomingBackupUrl("content://documents/42")
    ).resolves.toBe(true);

    expect(mockCopyAsync).toHaveBeenCalledWith({
      from: "content://documents/42",
      to: "file:///cache/incoming-backup.siply.json",
    });
    expect(mockProcessBackupUri).toHaveBeenCalledWith(
      "file:///cache/incoming-backup.siply.json",
      { silentInvalid: true }
    );
  });

  it("forwards a named backup with visible validation errors", async () => {
    await expect(
      handleIncomingBackupUrl("file:///documents/backup.siply.json")
    ).resolves.toBe(true);

    expect(mockCopyAsync).not.toHaveBeenCalled();
    expect(mockProcessBackupUri).toHaveBeenCalledWith(
      "file:///documents/backup.siply.json",
      { silentInvalid: false }
    );
  });

  it("ignores unrelated non-file URLs", async () => {
    await expect(
      handleIncomingBackupUrl("https://example.com/not-a-backup.json")
    ).resolves.toBe(false);

    expect(mockCopyAsync).not.toHaveBeenCalled();
    expect(mockProcessBackupUri).not.toHaveBeenCalled();
  });
});
