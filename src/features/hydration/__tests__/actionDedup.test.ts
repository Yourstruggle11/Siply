import { describe, expect, it, vi } from "vitest";
import {
  NOTIFICATION_ACTION_DEDUP_MAX_ENTRIES,
  NOTIFICATION_ACTION_DEDUP_STORAGE_KEY,
  NOTIFICATION_ACTION_DEDUP_TTL_MS,
  NotificationActionDeduplicator,
} from "../notifications/actionDedup";

const NOW = 2_000_000_000_000;

const createStorage = (initial: string | null = null) => ({
  getItem: vi.fn().mockResolvedValue(initial),
  setItem: vi.fn().mockResolvedValue(undefined),
});

describe("NotificationActionDeduplicator", () => {
  it("awaits persisted identifiers before deciding whether an action is new", async () => {
    let finishLoad: ((value: string | null) => void) | undefined;
    const storage = createStorage();
    storage.getItem.mockImplementation(
      () => new Promise((resolve) => {
        finishLoad = resolve;
      })
    );
    const dedup = new NotificationActionDeduplicator(storage, () => NOW);

    const claim = dedup.claimIfUnhandled("already-handled");
    finishLoad?.(JSON.stringify([["already-handled", NOW - 1_000]]));

    await expect(claim).resolves.toBe(false);
    expect(storage.getItem).toHaveBeenCalledWith(
      NOTIFICATION_ACTION_DEDUP_STORAGE_KEY
    );
  });

  it("keeps a hard maximum of the 50 newest fresh identifiers", async () => {
    const entries = Array.from(
      { length: NOTIFICATION_ACTION_DEDUP_MAX_ENTRIES },
      (_, index) => [`id-${index}`, NOW - index] as [string, number]
    );
    const storage = createStorage(JSON.stringify(entries));
    const dedup = new NotificationActionDeduplicator(storage, () => NOW + 1);

    await expect(dedup.claimIfUnhandled("new-id")).resolves.toBe(true);

    const persisted = JSON.parse(
      storage.setItem.mock.calls.at(-1)?.[1] ?? "[]"
    ) as [string, number][];
    expect(persisted).toHaveLength(NOTIFICATION_ACTION_DEDUP_MAX_ENTRIES);
    expect(persisted.some(([id]) => id === "new-id")).toBe(true);
    expect(persisted.some(([id]) => id === "id-49")).toBe(false);
  });

  it("compacts an oversized persisted set during startup", async () => {
    const entries = Array.from(
      { length: NOTIFICATION_ACTION_DEDUP_MAX_ENTRIES + 10 },
      (_, index) => [`id-${index}`, NOW - index] as [string, number]
    );
    const storage = createStorage(JSON.stringify(entries));
    const dedup = new NotificationActionDeduplicator(storage, () => NOW);

    await dedup.ready();

    const persisted = JSON.parse(
      storage.setItem.mock.calls.at(-1)?.[1] ?? "[]"
    ) as [string, number][];
    expect(persisted).toHaveLength(NOTIFICATION_ACTION_DEDUP_MAX_ENTRIES);
    expect(persisted[0][0]).toBe("id-0");
    expect(persisted.at(-1)?.[0]).toBe("id-49");
  });

  it("allows an identifier again after its 24-hour retention expires", async () => {
    const storage = createStorage(
      JSON.stringify([["expired", NOW - NOTIFICATION_ACTION_DEDUP_TTL_MS - 1]])
    );
    const dedup = new NotificationActionDeduplicator(storage, () => NOW);

    await expect(dedup.claimIfUnhandled("expired")).resolves.toBe(true);
  });
});
