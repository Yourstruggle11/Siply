import { describe, it, expect } from "vitest";
import {
  deriveAggregates,
  normalizeHistory,
  undoHistoryForLog,
  updateHistoryForLog,
} from "../domain/history";
import type { HydrationHistory, LogEntry } from "../domain/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeEntry = (id: string, isoTimestamp: string, amountMl: number): LogEntry => ({
  id,
  timestamp: isoTimestamp,
  amountMl,
});

/** Build a date key string for easy test construction */
const dateKey = "2026-09-07";

/** A fixed "now" pointing to 2026-09-07 09:30:00 UTC */
const fixedNow = new Date("2026-09-07T09:30:00.000Z");

// ---------------------------------------------------------------------------
// deriveAggregates
// ---------------------------------------------------------------------------

describe("deriveAggregates", () => {
  it("returns zero totalMl and empty logHours for empty entries", () => {
    const { totalMl, logHours } = deriveAggregates([]);
    expect(totalMl).toBe(0);
    expect(logHours).toHaveLength(24);
    expect(logHours.every((v) => v === 0)).toBe(true);
  });

  it("sums amountMl correctly for a single entry", () => {
    const entry = makeEntry("e1", "2026-09-07T08:00:00.000Z", 250);
    const { totalMl, logHours } = deriveAggregates([entry]);
    expect(totalMl).toBe(250);
    const hour = new Date("2026-09-07T08:00:00.000Z").getHours();
    expect(logHours[hour]).toBe(1);
    expect(logHours.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("sums amountMl correctly for multiple entries", () => {
    const entries = [
      makeEntry("e1", "2026-09-07T08:00:00.000Z", 250),
      makeEntry("e2", "2026-09-07T08:30:00.000Z", 300),
      makeEntry("e3", "2026-09-07T12:00:00.000Z", 500),
    ];
    const { totalMl } = deriveAggregates(entries);
    expect(totalMl).toBe(1050);
  });

  it("counts logHours correctly — two entries in the same hour count as 2", () => {
    // 12:00Z → UTC hour 12, IST hour 17 (17:30); 12:15Z → UTC hour 12, IST hour 17 (17:45).
    // Both are the same local hour in UTC and IST (+5:30), the two likely environments.
    const entries = [
      makeEntry("e1", "2026-09-07T12:00:00.000Z", 100),
      makeEntry("e2", "2026-09-07T12:15:00.000Z", 200),
    ];
    const { logHours } = deriveAggregates(entries);
    const hour = new Date("2026-09-07T12:00:00.000Z").getHours();
    expect(logHours[hour]).toBe(2);
    expect(logHours.reduce((a, b) => a + b, 0)).toBe(2);
  });

  it("produces exactly 24 logHours slots", () => {
    const { logHours } = deriveAggregates([]);
    expect(logHours).toHaveLength(24);
  });
});

// ---------------------------------------------------------------------------
// updateHistoryForLog
// ---------------------------------------------------------------------------

describe("updateHistoryForLog", () => {
  it("creates the first entry for a new day", () => {
    const result = updateHistoryForLog({}, fixedNow, 250, 3000, 1800);
    const day = result[dateKey];
    expect(day).toBeDefined();
    expect(day.entries).toHaveLength(1);
    expect(day.entries![0].amountMl).toBe(250);
    expect(typeof day.entries![0].id).toBe("string");
    expect(typeof day.entries![0].timestamp).toBe("string");
  });

  it("derives totalMl from entries (not incremental addition)", () => {
    const result = updateHistoryForLog({}, fixedNow, 350, 3000, 1800);
    expect(result[dateKey].totalMl).toBe(350);
  });

  it("derives logHours from entries", () => {
    const result = updateHistoryForLog({}, fixedNow, 250, 3000, 1800);
    const hour = fixedNow.getHours();
    expect(result[dateKey].logHours[hour]).toBe(1);
  });

  it("appends to existing entries on subsequent calls", () => {
    const h1 = updateHistoryForLog({}, fixedNow, 250, 3000, 1800);
    const t2 = new Date("2026-09-07T11:00:00.000Z");
    const h2 = updateHistoryForLog(h1, t2, 500, 3000, 1800);
    const day = h2[dateKey];
    expect(day.entries).toHaveLength(2);
    expect(day.totalMl).toBe(750);
  });

  it("is a no-op for amountMl <= 0", () => {
    const result = updateHistoryForLog({}, fixedNow, 0, 3000, 1800);
    expect(result).toEqual({});
  });

  it("is a no-op for non-finite amountMl", () => {
    const result = updateHistoryForLog({}, fixedNow, NaN, 3000, 1800);
    expect(result).toEqual({});
  });

  it("does not mutate the input history", () => {
    const input: HydrationHistory = {};
    updateHistoryForLog(input, fixedNow, 250, 3000, 1800);
    expect(Object.keys(input)).toHaveLength(0);
  });

  it("stores goalMl and goodThresholdMl on the day record", () => {
    const result = updateHistoryForLog({}, fixedNow, 250, 3000, 1800);
    expect(result[dateKey].goalMl).toBe(3000);
    expect(result[dateKey].goodThresholdMl).toBe(1800);
  });
});

// ---------------------------------------------------------------------------
// undoHistoryForLog
// ---------------------------------------------------------------------------

describe("undoHistoryForLog", () => {
  it("returns history unchanged if day has no entries", () => {
    const history: HydrationHistory = {
      [dateKey]: { date: dateKey, totalMl: 500, goalMl: 3000, goodThresholdMl: 1800, logHours: Array(24).fill(0) },
    };
    const result = undoHistoryForLog(history, dateKey);
    expect(result).toBe(history); // same reference — nothing changed
  });

  it("returns history unchanged if day does not exist", () => {
    const result = undoHistoryForLog({}, dateKey);
    expect(result).toEqual({});
  });

  it("removes the most recent entry (by timestamp)", () => {
    // Build two entries: e1 at 08:00, e2 at 11:00 — e2 is most recent
    const h1 = updateHistoryForLog({}, new Date("2026-09-07T08:00:00.000Z"), 250, 3000, 1800);
    const h2 = updateHistoryForLog(h1, new Date("2026-09-07T11:00:00.000Z"), 500, 3000, 1800);
    expect(h2[dateKey].entries).toHaveLength(2);

    const result = undoHistoryForLog(h2, dateKey);
    expect(result[dateKey].entries).toHaveLength(1);
    expect(result[dateKey].entries![0].amountMl).toBe(250); // e1 remains
    expect(result[dateKey].totalMl).toBe(250);
  });

  it("re-derives totalMl and logHours from remaining entries", () => {
    const h1 = updateHistoryForLog({}, new Date("2026-09-07T08:00:00.000Z"), 300, 3000, 1800);
    const h2 = updateHistoryForLog(h1, new Date("2026-09-07T09:00:00.000Z"), 700, 3000, 1800);
    const result = undoHistoryForLog(h2, dateKey);

    expect(result[dateKey].totalMl).toBe(300);
    const hour8 = new Date("2026-09-07T08:00:00.000Z").getHours();
    const hour9 = new Date("2026-09-07T09:00:00.000Z").getHours();
    expect(result[dateKey].logHours[hour8]).toBe(1);
    expect(result[dateKey].logHours[hour9]).toBe(0);
  });

  it("sets entries to undefined (not []) when the last entry is removed", () => {
    const h1 = updateHistoryForLog({}, fixedNow, 250, 3000, 1800);
    expect(h1[dateKey].entries).toHaveLength(1);
    const result = undoHistoryForLog(h1, dateKey);
    // entries must be undefined, not []
    expect(result[dateKey].entries).toBeUndefined();
    expect(result[dateKey].totalMl).toBe(0);
  });

  it("does not mutate the input history", () => {
    const h1 = updateHistoryForLog({}, fixedNow, 250, 3000, 1800);
    const snapshot = JSON.parse(JSON.stringify(h1));
    undoHistoryForLog(h1, dateKey);
    expect(h1).toEqual(snapshot);
  });

  it("only removes one entry per call (single-level undo)", () => {
    let h = updateHistoryForLog({}, new Date("2026-09-07T08:00:00.000Z"), 100, 3000, 1800);
    h = updateHistoryForLog(h, new Date("2026-09-07T09:00:00.000Z"), 200, 3000, 1800);
    h = updateHistoryForLog(h, new Date("2026-09-07T10:00:00.000Z"), 300, 3000, 1800);
    expect(h[dateKey].entries).toHaveLength(3);

    const afterOne = undoHistoryForLog(h, dateKey);
    expect(afterOne[dateKey].entries).toHaveLength(2);
    expect(afterOne[dateKey].totalMl).toBe(300); // 100 + 200
  });
});

// ---------------------------------------------------------------------------
// normalizeHistory
// ---------------------------------------------------------------------------

describe("normalizeHistory", () => {
  it("returns empty object for null input", () => {
    expect(normalizeHistory(null)).toEqual({});
  });

  it("returns empty object for non-object input", () => {
    expect(normalizeHistory("bad")).toEqual({});
    expect(normalizeHistory(42)).toEqual({});
  });

  it("passes through valid entries when present", () => {
    const input = {
      "2026-09-07": {
        date: "2026-09-07",
        totalMl: 500,
        goalMl: 3000,
        goodThresholdMl: 1800,
        logHours: Array(24).fill(0),
        entries: [
          { id: "e1", timestamp: "2026-09-07T09:00:00.000Z", amountMl: 250 },
          { id: "e2", timestamp: "2026-09-07T11:00:00.000Z", amountMl: 250 },
        ],
      },
    };
    const result = normalizeHistory(input);
    expect(result["2026-09-07"].entries).toHaveLength(2);
    expect(result["2026-09-07"].entries![0].id).toBe("e1");
    expect(result["2026-09-07"].entries![1].id).toBe("e2");
  });

  it("leaves entries undefined when absent (no fabrication)", () => {
    const input = {
      "2026-09-01": {
        date: "2026-09-01",
        totalMl: 2000,
        goalMl: 3000,
        goodThresholdMl: 1800,
        logHours: Array(24).fill(0),
      },
    };
    const result = normalizeHistory(input);
    expect(result["2026-09-01"].entries).toBeUndefined();
  });

  it("filters out malformed entries (missing id, bad amountMl) and keeps valid ones", () => {
    const input = {
      "2026-09-07": {
        date: "2026-09-07",
        totalMl: 250,
        goalMl: 3000,
        goodThresholdMl: 1800,
        logHours: Array(24).fill(0),
        entries: [
          { id: "good", timestamp: "2026-09-07T09:00:00.000Z", amountMl: 250 },
          { timestamp: "2026-09-07T10:00:00.000Z", amountMl: 100 },         // missing id
          { id: "bad2", timestamp: "2026-09-07T10:00:00.000Z", amountMl: -50 }, // negative amountMl
          { id: "bad3", timestamp: "2026-09-07T10:00:00.000Z", amountMl: 0 },   // zero amountMl
          { id: "bad4", timestamp: "2026-09-07T10:00:00.000Z", amountMl: NaN }, // NaN
          null,                                                                 // null item
        ],
      },
    };
    const result = normalizeHistory(input);
    // Only the one valid entry should survive
    expect(result["2026-09-07"].entries).toHaveLength(1);
    expect(result["2026-09-07"].entries![0].id).toBe("good");
  });

  it("sets entries to undefined when all entries are malformed", () => {
    const input = {
      "2026-09-07": {
        date: "2026-09-07",
        totalMl: 0,
        goalMl: 3000,
        goodThresholdMl: 1800,
        logHours: Array(24).fill(0),
        entries: [
          { id: 123, timestamp: "2026-09-07T09:00:00.000Z", amountMl: 250 }, // id is number
        ],
      },
    };
    const result = normalizeHistory(input);
    // All entries filtered → undefined (not [])
    expect(result["2026-09-07"].entries).toBeUndefined();
  });

  it("is a pure function — does not mutate the input", () => {
    const input = {
      "2026-09-07": {
        date: "2026-09-07",
        totalMl: 500,
        goalMl: 3000,
        goodThresholdMl: 1800,
        logHours: Array(24).fill(0),
        entries: [{ id: "e1", timestamp: "2026-09-07T09:00:00.000Z", amountMl: 250 }],
      },
    };
    const copy = JSON.parse(JSON.stringify(input));
    normalizeHistory(input);
    expect(input).toEqual(copy);
  });
});
