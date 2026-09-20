import { describe, expect, it } from "vitest";
import { getDateKey } from "../../../core/time";
import type { HydrationHistory } from "../domain/types";
import {
  analyzeWeekendAwareness,
  computeHourlyAdherence,
} from "../domain/schedulingIntelligence";

const historyWithPatterns = (weekendHour: number, weekdayHour: number) => {
  const now = new Date(2026, 8, 20, 12, 0);
  const history: HydrationHistory = {};
  for (let offset = 0; offset < 35; offset += 1) {
    const day = new Date(now);
    day.setDate(day.getDate() - offset);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const firstLog = new Date(day);
    firstLog.setHours(weekend ? weekendHour : weekdayHour, 0, 0, 0);
    const key = getDateKey(day);
    const logHours = Array(24).fill(0) as number[];
    logHours[firstLog.getHours()] = 1;
    history[key] = {
      date: key,
      totalMl: 250,
      goalMl: 3000,
      goodThresholdMl: 1800,
      logHours,
      entries: [{ id: `${key}-1`, timestamp: firstLog.toISOString(), amountMl: 250 }],
    };
  }
  return { history, now };
};

describe("scheduling intelligence", () => {
  it("unlocks weekend rhythm only after enough history and a meaningful later start", () => {
    const { history, now } = historyWithPatterns(9, 7);
    const result = analyzeWeekendAwareness(history, now);
    expect(result).toMatchObject({ eligible: true, reason: "eligible", shiftMinutes: 60 });
    expect(result.weekendDays).toBeGreaterThanOrEqual(6);
    expect(result.weekdayDays).toBeGreaterThanOrEqual(12);
  });

  it("does not recommend a separate weekend plan for similar routines", () => {
    const { history, now } = historyWithPatterns(7, 7);
    expect(analyzeWeekendAwareness(history, now)).toMatchObject({
      eligible: false,
      reason: "no_difference",
      shiftMinutes: 0,
    });
  });

  it("uses recent hourly logging activity to identify lower-adherence periods", () => {
    const { history, now } = historyWithPatterns(9, 7);
    const adherence = computeHourlyAdherence(history, now);
    expect(adherence).toHaveLength(24);
    expect(adherence[7]).toBeGreaterThan(adherence[15]);
  });
});
