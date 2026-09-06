import { describe, it, expect } from "vitest";
import { mergeHistory } from "../backup/merge";
import type { HydrationHistory } from "../domain/types";

const makeDay = (date: string, totalMl: number) => ({
  date,
  totalMl,
  goalMl: 3000,
  goodThresholdMl: 1800,
  logHours: Array<number>(24).fill(0),
});

describe("mergeHistory", () => {
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
