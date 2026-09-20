import AsyncStorage from "@react-native-async-storage/async-storage";

export const NOTIFICATION_ACTION_DEDUP_STORAGE_KEY =
  "siply:handled_notification_ids:v1";
export const NOTIFICATION_ACTION_DEDUP_TTL_MS = 24 * 60 * 60 * 1000;
export const NOTIFICATION_ACTION_DEDUP_MAX_ENTRIES = 50;

type DedupStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export class NotificationActionDeduplicator {
  private entries = new Map<string, number>();
  private readyPromise: Promise<void> | null = null;
  private persistenceQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly storage: DedupStorage,
    private readonly now: () => number = Date.now
  ) {}

  ready(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = this.load();
    }
    return this.readyPromise;
  }

  /** Returns true only for the first handling of an identifier. */
  async claimIfUnhandled(notificationId: string): Promise<boolean> {
    await this.ready();
    const now = this.now();
    const pruned = this.prune(now);

    if (this.entries.has(notificationId)) {
      if (pruned) {
        await this.persist();
      }
      return false;
    }

    this.entries.set(notificationId, now);
    this.prune(now);
    await this.persist();
    return true;
  }

  /** Releases a failed claim so the OS or foreground handler can retry it. */
  async release(notificationId: string): Promise<void> {
    await this.ready();
    if (!this.entries.delete(notificationId)) return;
    await this.persist();
  }

  private async load(): Promise<void> {
    try {
      const raw = await this.storage.getItem(
        NOTIFICATION_ACTION_DEDUP_STORAGE_KEY
      );
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return;
      }

      const validEntries = parsed.filter(
        (entry): entry is [string, number] =>
          Array.isArray(entry) &&
          typeof entry[0] === "string" &&
          typeof entry[1] === "number" &&
          Number.isFinite(entry[1])
      );
      this.entries = new Map(validEntries);
      if (this.prune(this.now())) {
        await this.persist();
      }
    } catch (error) {
      this.entries.clear();
      console.error("Siply: failed to load notification-action history", error);
    }
  }

  private prune(now: number): boolean {
    const previous = Array.from(this.entries.entries());
    const kept = Array.from(this.entries.entries())
      .filter(([, timestamp]) => now - timestamp <= NOTIFICATION_ACTION_DEDUP_TTL_MS)
      .sort((a, b) => b[1] - a[1])
      .slice(0, NOTIFICATION_ACTION_DEDUP_MAX_ENTRIES);
    this.entries = new Map(kept);
    return (
      previous.length !== kept.length ||
      previous.some(
        ([id, timestamp], index) =>
          kept[index]?.[0] !== id || kept[index]?.[1] !== timestamp
      )
    );
  }

  private async persist(): Promise<void> {
    const serialized = JSON.stringify(Array.from(this.entries.entries()));
    const write = this.persistenceQueue.then(() =>
      this.storage.setItem(NOTIFICATION_ACTION_DEDUP_STORAGE_KEY, serialized)
    );
    this.persistenceQueue = write.catch(() => {});
    try {
      await write;
    } catch (error) {
      console.error("Siply: failed to persist notification-action history", error);
    }
  }
}

export const notificationActionDeduplicator =
  new NotificationActionDeduplicator(AsyncStorage);
