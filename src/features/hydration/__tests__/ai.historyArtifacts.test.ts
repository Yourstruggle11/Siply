import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../../core/constants";
import { addDays, getDateKey } from "../../../core/time";
import {
  buildDailyRecapCandidate,
  buildWeeklyReviewCandidate,
} from "../ai/historyArtifacts";
import type { HydrationHistory } from "../domain/types";

const summary = (date: string, totalMl: number, goalMl = 2000) => ({
  date,
  totalMl,
  goalMl,
  goodThresholdMl: 1600,
  logHours: Array.from({ length: 24 }, (_, hour) => hour === 9 ? 1 : 0),
});

describe("AI History artifacts", () => {
  it("uses yesterday before the active window closes and today afterward", () => {
    const yesterday = "2026-09-13";
    const today = "2026-09-14";
    const history: HydrationHistory = {
      [yesterday]: summary(yesterday, 1800),
      [today]: summary(today, 2100),
    };
    const source = { settings: { ...DEFAULT_SETTINGS, windowEnd: "22:00" }, history };

    expect(buildDailyRecapCandidate(source, new Date(2026, 8, 14, 18))?.periodKey).toBe(yesterday);
    expect(buildDailyRecapCandidate(source, new Date(2026, 8, 14, 22, 1))?.periodKey).toBe(today);
  });

  it("invalidates a daily recap fingerprint after a late edit", () => {
    const date = "2026-09-14";
    const source = { settings: DEFAULT_SETTINGS, history: { [date]: summary(date, 1000) } };
    const before = buildDailyRecapCandidate(source, new Date(2026, 8, 14, 23));
    const after = buildDailyRecapCandidate({
      ...source,
      history: { [date]: summary(date, 1400) },
    }, new Date(2026, 8, 14, 23));
    expect(before?.contextFingerprint).not.toBe(after?.contextFingerprint);
  });

  it("offers a review only for a completed week with at least four tracked days", () => {
    const now = new Date(2026, 8, 16, 12);
    const reviewedMonday = new Date(2026, 8, 7, 12);
    const history: HydrationHistory = {};
    for (let index = 0; index < 4; index += 1) {
      const key = getDateKey(addDays(reviewedMonday, index));
      history[key] = summary(key, 1500 + index * 100);
    }
    const candidate = buildWeeklyReviewCandidate({ settings: DEFAULT_SETTINGS, history }, now);
    expect(candidate?.periodKey).toBe("2026-09-07");

    const threeDays = { ...history };
    delete threeDays[getDateKey(addDays(reviewedMonday, 3))];
    expect(buildWeeklyReviewCandidate({ settings: DEFAULT_SETTINGS, history: threeDays }, now)).toBeNull();
  });
});
