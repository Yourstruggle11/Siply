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
  it("always recaps the previous completed calendar day", () => {
    const yesterday = "2026-09-13";
    const today = "2026-09-14";
    const history: HydrationHistory = {
      [yesterday]: summary(yesterday, 1800),
      [today]: summary(today, 2100),
    };
    const source = { settings: { ...DEFAULT_SETTINGS, windowEnd: "22:00" }, history };

    expect(buildDailyRecapCandidate(source, new Date(2026, 8, 14, 18))?.periodKey).toBe(yesterday);
    expect(buildDailyRecapCandidate(source, new Date(2026, 8, 14, 22, 1))?.periodKey).toBe(yesterday);
  });

  it("invalidates a daily recap fingerprint after a late edit", () => {
    const date = "2026-09-13";
    const source = { settings: DEFAULT_SETTINGS, history: { [date]: summary(date, 1000) } };
    const before = buildDailyRecapCandidate(source, new Date(2026, 8, 14, 23));
    const after = buildDailyRecapCandidate({
      ...source,
      history: { [date]: summary(date, 1400) },
    }, new Date(2026, 8, 14, 23));
    expect(before?.contextFingerprint).not.toBe(after?.contextFingerprint);
  });

  it("offers the prior Sunday-to-Saturday review only on Sunday with four tracked days", () => {
    const now = new Date(2026, 8, 20, 12);
    const reviewedSunday = new Date(2026, 8, 13, 12);
    const history: HydrationHistory = {};
    for (let index = 0; index < 4; index += 1) {
      const key = getDateKey(addDays(reviewedSunday, index));
      history[key] = summary(key, 1500 + index * 100);
    }
    const candidate = buildWeeklyReviewCandidate({ settings: DEFAULT_SETTINGS, history }, now);
    expect(candidate?.periodKey).toBe("2026-09-13");
    expect(buildWeeklyReviewCandidate(
      { settings: DEFAULT_SETTINGS, history },
      new Date(2026, 8, 21, 12)
    )).toBeNull();

    const threeDays = { ...history };
    delete threeDays[getDateKey(addDays(reviewedSunday, 3))];
    expect(buildWeeklyReviewCandidate({ settings: DEFAULT_SETTINGS, history: threeDays }, now)).toBeNull();
  });
});
