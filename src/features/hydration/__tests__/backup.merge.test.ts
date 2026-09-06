import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mergeHistory } from "../backup/merge";
import type { HydrationHistory, LogEntry } from "../domain/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeDay = (date: string, totalMl: number) => ({
  date,
  totalMl,
  goalMl: 3000,
  goodThresholdMl: 1800,
  logHours: Array<number>(24).fill(0),
});

const makeEntry = (id: string, isoTimestamp: string, amountMl: number): LogEntry => ({
  id,
  timestamp: isoTimestamp,
  amountMl,
});

const makeDayWithEntries = (
  date: string,
  entries: LogEntry[]
) => {
  const totalMl = entries.reduce((sum, e) => sum + e.amountMl, 0);
  return {
    date,
    totalMl,
    goalMl: 3000,
    goodThresholdMl: 1800,
    logHours: Array<number>(24).fill(0),
    entries,
  };
};

// ---------------------------------------------------------------------------
// Summary-only merge (existing behaviour — must remain unchanged)
// ---------------------------------------------------------------------------

describe("mergeHistory — summary-only (existing behaviour)", () => {
  it("returns empty when both are empty", () => {
    const result = mergeHistory({}, {});
    expect(result).toEqual({});
  });

  it("returns current unchanged when imported is empty", () => {
    const current: HydrationHistory = {
      "2026-09-01": makeDay("2026-09-01", 2000),
    };
    const result = mergeHistory(current, {});
    expect(result).toEqual(current);
    // Result must be a copy, not the same reference
    expect(result).not.toBe(current);
  });

  it("returns all imported days when current is empty", () => {
    const imported: HydrationHistory = {
      "2026-09-01": makeDay("2026-09-01", 2500),
      "2026-09-02": makeDay("2026-09-02", 1800),
    };
    const result = mergeHistory({}, imported);
    expect(Object.keys(result)).toHaveLength(2);
    expect(result["2026-09-01"].totalMl).toBe(2500);
    expect(result["2026-09-02"].totalMl).toBe(1800);
  });

  it("adds non-overlapping imported days to current", () => {
    const current: HydrationHistory = {
      "2026-09-01": makeDay("2026-09-01", 2000),
    };
    const imported: HydrationHistory = {
      "2026-09-03": makeDay("2026-09-03", 3000),
    };
    const result = mergeHistory(current, imported);
    expect(Object.keys(result)).toHaveLength(2);
    expect(result["2026-09-01"].totalMl).toBe(2000);
    expect(result["2026-09-03"].totalMl).toBe(3000);
  });

  it("keeps imported record when imported.totalMl > current.totalMl on same day", () => {
    const current: HydrationHistory = {
      "2026-09-05": makeDay("2026-09-05", 1000),
    };
    const imported: HydrationHistory = {
      "2026-09-05": makeDay("2026-09-05", 2800),
    };
    const result = mergeHistory(current, imported);
    expect(result["2026-09-05"].totalMl).toBe(2800);
  });

  it("keeps current record when current.totalMl > imported.totalMl on same day", () => {
    const current: HydrationHistory = {
      "2026-09-05": makeDay("2026-09-05", 2800),
    };
    const imported: HydrationHistory = {
      "2026-09-05": makeDay("2026-09-05", 1000),
    };
    const result = mergeHistory(current, imported);
    expect(result["2026-09-05"].totalMl).toBe(2800);
  });

  it("keeps current record when totalMl is equal (no unnecessary overwrite)", () => {
    const currentDay = makeDay("2026-09-05", 2000);
    const importedDay = { ...makeDay("2026-09-05", 2000), goalMl: 9999 };
    const current: HydrationHistory = { "2026-09-05": currentDay };
    const imported: HydrationHistory = { "2026-09-05": importedDay };
    const result = mergeHistory(current, imported);
    // Equal totalMl → keep current (goalMl should stay at 3000, not 9999).
    expect(result["2026-09-05"].goalMl).toBe(3000);
  });

  it("never removes existing days from current (merge is additive-only)", () => {
    const current: HydrationHistory = {
      "2026-08-01": makeDay("2026-08-01", 2000),
      "2026-08-02": makeDay("2026-08-02", 1500),
      "2026-08-03": makeDay("2026-08-03", 3000),
    };
    // Imported only has two days, one of which overlaps.
    const imported: HydrationHistory = {
      "2026-08-02": makeDay("2026-08-02", 2500), // imported wins (higher)
      "2026-09-01": makeDay("2026-09-01", 1000), // new day
    };
    const result = mergeHistory(current, imported);
    expect(Object.keys(result)).toHaveLength(4);
    expect(result["2026-08-01"].totalMl).toBe(2000); // unchanged
    expect(result["2026-08-02"].totalMl).toBe(2500); // imported wins
    expect(result["2026-08-03"].totalMl).toBe(3000); // unchanged
    expect(result["2026-09-01"].totalMl).toBe(1000); // new
  });

  it("is a pure function — does not mutate the current or imported arguments", () => {
    const current: HydrationHistory = {
      "2026-09-05": makeDay("2026-09-05", 1000),
    };
    const imported: HydrationHistory = {
      "2026-09-05": makeDay("2026-09-05", 2000),
      "2026-09-06": makeDay("2026-09-06", 500),
    };
    const currentCopy = JSON.parse(JSON.stringify(current));
    const importedCopy = JSON.parse(JSON.stringify(imported));

    mergeHistory(current, imported);

    expect(current).toEqual(currentCopy);
    expect(imported).toEqual(importedCopy);
  });

  it("importing same backup twice in a row produces identical history (idempotent)", () => {
    const initial: HydrationHistory = {
      "2026-09-01": makeDay("2026-09-01", 2000),
    };
    const backup: HydrationHistory = {
      "2026-09-01": makeDay("2026-09-01", 2500),
      "2026-09-02": makeDay("2026-09-02", 1800),
    };

    const afterFirst = mergeHistory(initial, backup);
    const afterSecond = mergeHistory(afterFirst, backup);

    // After two imports, totals must not double-count.
    expect(afterSecond["2026-09-01"].totalMl).toBe(2500);
    expect(afterSecond["2026-09-02"].totalMl).toBe(1800);
    expect(afterSecond).toEqual(afterFirst);
  });
});

// ---------------------------------------------------------------------------
// Entry-level merge (§5.3 of PER_ENTRY_LOGGING_DESIGN.md)
// ---------------------------------------------------------------------------

describe("mergeHistory — entry-level merge (§5.3)", () => {
  it("unions entries by id when both sides have entries", () => {
    const current: HydrationHistory = {
      "2026-09-07": makeDayWithEntries("2026-09-07", [
        makeEntry("e1", "2026-09-07T08:00:00.000Z", 250),
        makeEntry("e2", "2026-09-07T10:00:00.000Z", 300),
      ]),
    };
    const imported: HydrationHistory = {
      "2026-09-07": makeDayWithEntries("2026-09-07", [
        makeEntry("e2", "2026-09-07T10:00:00.000Z", 300), // duplicate — must dedup
        makeEntry("e3", "2026-09-07T12:00:00.000Z", 500), // new entry from import
      ]),
    };
    const result = mergeHistory(current, imported);
    expect(result["2026-09-07"].entries).toHaveLength(3);
    expect(result["2026-09-07"].totalMl).toBe(1050); // 250 + 300 + 500
  });

  it("keeps current version on ID collision (device-local is canonical)", () => {
    // e-clash appears on both sides with the same id but different amountMl.
    const current: HydrationHistory = {
      "2026-09-07": makeDayWithEntries("2026-09-07", [
        makeEntry("e-clash", "2026-09-07T08:00:00.000Z", 999), // current value
      ]),
    };
    const imported: HydrationHistory = {
      "2026-09-07": makeDayWithEntries("2026-09-07", [
        makeEntry("e-clash", "2026-09-07T08:00:00.000Z", 1),   // imported value — must be discarded
      ]),
    };
    const result = mergeHistory(current, imported);
    expect(result["2026-09-07"].entries).toHaveLength(1);
    expect(result["2026-09-07"].entries![0].amountMl).toBe(999); // current wins
  });

  it("re-derives totalMl and logHours from merged entries", () => {
    // 12:00Z → UTC hour 12, IST hour 17 (17:30); 12:15Z → UTC hour 12, IST hour 17 (17:45).
    // Both are the same local hour in any of the test environments.
    const current: HydrationHistory = {
      "2026-09-07": makeDayWithEntries("2026-09-07", [
        makeEntry("e1", "2026-09-07T12:00:00.000Z", 250),
      ]),
    };
    const imported: HydrationHistory = {
      "2026-09-07": makeDayWithEntries("2026-09-07", [
        makeEntry("e2", "2026-09-07T12:15:00.000Z", 300),
      ]),
    };
    const result = mergeHistory(current, imported);
    expect(result["2026-09-07"].totalMl).toBe(550);
    const hour12 = new Date("2026-09-07T12:00:00.000Z").getHours();
    expect(result["2026-09-07"].logHours[hour12]).toBe(2);
  });

  it("keeps goalMl/goodThresholdMl from current (most recent settings)", () => {
    const current: HydrationHistory = {
      "2026-09-07": {
        ...makeDayWithEntries("2026-09-07", [makeEntry("e1", "2026-09-07T08:00:00.000Z", 250)]),
        goalMl: 3000,
        goodThresholdMl: 1800,
      },
    };
    const imported: HydrationHistory = {
      "2026-09-07": {
        ...makeDayWithEntries("2026-09-07", [makeEntry("e2", "2026-09-07T09:00:00.000Z", 300)]),
        goalMl: 9999,
        goodThresholdMl: 9999,
      },
    };
    const result = mergeHistory(current, imported);
    expect(result["2026-09-07"].goalMl).toBe(3000);
    expect(result["2026-09-07"].goodThresholdMl).toBe(1800);
  });

  it("merged entries are sorted chronologically (ascending timestamp)", () => {
    const current: HydrationHistory = {
      "2026-09-07": makeDayWithEntries("2026-09-07", [
        makeEntry("e1", "2026-09-07T12:00:00.000Z", 500),
      ]),
    };
    const imported: HydrationHistory = {
      "2026-09-07": makeDayWithEntries("2026-09-07", [
        makeEntry("e2", "2026-09-07T08:00:00.000Z", 250),
      ]),
    };
    const result = mergeHistory(current, imported);
    const entries = result["2026-09-07"].entries!;
    expect(entries[0].id).toBe("e2"); // earlier timestamp first
    expect(entries[1].id).toBe("e1");
  });

  // -------------------------------------------------------------------------
  // current ✅ entries + imported ❌ summary-only
  // -------------------------------------------------------------------------

  it("keeps current (with entries) when imported is summary-only with lower total", () => {
    const current: HydrationHistory = {
      "2026-09-07": makeDayWithEntries("2026-09-07", [
        makeEntry("e1", "2026-09-07T08:00:00.000Z", 2000),
      ]),
    };
    const imported: HydrationHistory = {
      "2026-09-07": makeDay("2026-09-07", 800), // lower total, no entries
    };
    const result = mergeHistory(current, imported);
    expect(result["2026-09-07"].totalMl).toBe(2000);
    expect(result["2026-09-07"].entries).toHaveLength(1);
  });

  it("uses imported summary-only when its total exceeds the entries-side current", () => {
    // Current has entries totalling 800. Imported summary-only has 3000.
    // Must use imported (higher total) — entries are discarded.
    const current: HydrationHistory = {
      "2026-09-07": makeDayWithEntries("2026-09-07", [
        makeEntry("e1", "2026-09-07T08:00:00.000Z", 800),
      ]),
    };
    const imported: HydrationHistory = {
      "2026-09-07": makeDay("2026-09-07", 3000), // higher total, no entries
    };
    const result = mergeHistory(current, imported);
    expect(result["2026-09-07"].totalMl).toBe(3000);
    expect(result["2026-09-07"].entries).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // current ❌ summary-only + imported ✅ entries
  // -------------------------------------------------------------------------

  it("adopts imported entries when imported total >= current summary-only total", () => {
    const current: HydrationHistory = {
      "2026-09-07": makeDay("2026-09-07", 800), // summary-only, lower total
    };
    const imported: HydrationHistory = {
      "2026-09-07": makeDayWithEntries("2026-09-07", [
        makeEntry("e1", "2026-09-07T08:00:00.000Z", 1200),
      ]),
    };
    const result = mergeHistory(current, imported);
    expect(result["2026-09-07"].totalMl).toBe(1200);
    expect(result["2026-09-07"].entries).toHaveLength(1);
  });

  it("keeps summary-only current when its total exceeds the imported entries-side total (§5.4 guard)", () => {
    // §5.4 required test case:
    // Device A: complete summary-only day, totalMl=3000 (entries stripped by retention).
    // Device B: same day but only 800 ml logged before export.
    // Merging must NOT reduce the day's total from 3000 to 800.

    const current: HydrationHistory = {
      "2026-09-01": {
        date: "2026-09-01",
        totalMl: 3000,
        goalMl: 3000,
        goodThresholdMl: 1800,
        logHours: [0,0,0,0,0,0,0,2,3,2,1,1,2,1,0,1,1,0,0,0,0,0,0,0],
        // No entries — stripped by retention
      },
    };

    const imported: HydrationHistory = {
      "2026-09-01": {
        date: "2026-09-01",
        totalMl: 800,
        goalMl: 3000,
        goodThresholdMl: 1800,
        logHours: [0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        entries: [
          { id: "entry-1", timestamp: "2026-09-01T07:30:00.000Z", amountMl: 300 },
          { id: "entry-2", timestamp: "2026-09-01T08:15:00.000Z", amountMl: 500 },
        ],
      },
    };

    const result = mergeHistory(current, imported);

    // Current's summary-only record with totalMl=3000 must be kept.
    // Imported's entries (total=800) must NOT replace it.
    expect(result["2026-09-01"].totalMl).toBe(3000);
    expect(result["2026-09-01"].entries).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Idempotent re-import with entry data
  // -------------------------------------------------------------------------

  it("importing the same entry-bearing backup twice is idempotent", () => {
    const initial: HydrationHistory = {
      "2026-09-07": makeDayWithEntries("2026-09-07", [
        makeEntry("e1", "2026-09-07T08:00:00.000Z", 250),
      ]),
    };
    const backup: HydrationHistory = {
      "2026-09-07": makeDayWithEntries("2026-09-07", [
        makeEntry("e1", "2026-09-07T08:00:00.000Z", 250), // same entry
        makeEntry("e2", "2026-09-07T10:00:00.000Z", 500), // additional entry
      ]),
    };

    const afterFirst = mergeHistory(initial, backup);
    const afterSecond = mergeHistory(afterFirst, backup);

    // e1 must not be double-counted
    expect(afterFirst["2026-09-07"].entries).toHaveLength(2);
    expect(afterFirst["2026-09-07"].totalMl).toBe(750);
    expect(afterSecond).toEqual(afterFirst);
  });

  // -------------------------------------------------------------------------
  // safeTotalMl guard (should never fire in production, but must clamp if it does)
  // -------------------------------------------------------------------------

  it("safeTotalMl guard fires and warns in __DEV__ when derived total is less than stored totals", () => {
    // Simulate an ID collision: both sides have different content for the same ID.
    // The dedup rule keeps current, so only 100 ml ends up in mergedEntries.
    // But both sides stored 500 ml — the guard must clamp to max(100, 500, 500) = 500.
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Force __DEV__ = true for this test
    const originalDev = (global as any).__DEV__;
    (global as any).__DEV__ = true;

    const current: HydrationHistory = {
      "2026-09-07": {
        ...makeDayWithEntries("2026-09-07", [makeEntry("collision-id", "2026-09-07T08:00:00.000Z", 100)]),
        totalMl: 500, // stored total > derived (simulating corruption)
      },
    };
    const imported: HydrationHistory = {
      "2026-09-07": {
        ...makeDayWithEntries("2026-09-07", [makeEntry("collision-id", "2026-09-07T08:00:00.000Z", 100)]),
        totalMl: 500, // same
      },
    };

    const result = mergeHistory(current, imported);

    // Guard: clamp to max(100, 500, 500) = 500
    expect(result["2026-09-07"].totalMl).toBe(500);
    // Warning must have fired
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("safeTotalMl guard clamped")
    );

    consoleSpy.mockRestore();
    (global as any).__DEV__ = originalDev;
  });
});
