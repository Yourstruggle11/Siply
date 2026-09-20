import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../../core/constants";
import { getDateKey } from "../../../core/time";
import { buildAiHydrationContext, fingerprintAiContext } from "../ai/context";
import { ASK_SIPLY_SYSTEM_PROMPT } from "../ai/prompts";
import type { HydrationHistory } from "../domain/types";

describe("AI hydration context", () => {
  it("sends bounded aggregates without raw entry identifiers or timestamps", () => {
    const now = new Date(2026, 8, 14, 12, 0, 0);
    const date = getDateKey(now);
    const timestamp = new Date(2026, 8, 14, 9, 30, 0).toISOString();
    const history: HydrationHistory = {
      [date]: {
        date,
        totalMl: 500,
        goalMl: 2000,
        goodThresholdMl: 1600,
        logHours: Array.from({ length: 24 }, (_, hour) => hour === 9 ? 1 : 0),
        entries: [{ id: "private-entry-id", timestamp, amountMl: 500 }],
      },
    };

    const context = buildAiHydrationContext({
      settings: { ...DEFAULT_SETTINGS, displayUnit: "cups" },
      progress: { date, consumedMl: 500 },
      history,
    }, "ask", now);

    expect(context.period.dailyHistoryDays).toBe(90);
    expect(context.dailyHistory).toHaveLength(90);
    expect(context.recentHourlyHistory).toHaveLength(1);
    expect(context.recentHourlyHistory[0].volumesMl[9]).toBe(500);
    expect(context.recentHourlyHistory[0].quality).toBe("exact");
    expect(context.preferredDisplayUnit).toBe("cups");
    expect(context.valuesUnit).toBe("ml");
    expect(context.version).toBe(2);
    expect(context.settings).not.toHaveProperty("sipMl");
    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain("private-entry-id");
    expect(serialized).not.toContain(timestamp);
  });

  it("uses 14 daily days for an automatic annotation and ignores generation time in its fingerprint", () => {
    const first = buildAiHydrationContext({
      settings: DEFAULT_SETTINGS,
      progress: { date: "2026-09-14", consumedMl: 0 },
      history: {},
    }, "history_insight", new Date(2026, 8, 14, 10));
    const second = { ...first, generatedAt: "2026-09-14T23:00:00.000Z" };
    expect(first.period.dailyHistoryDays).toBe(14);
    expect(first.dailyHistory).toHaveLength(14);
    expect(fingerprintAiContext(first)).toBe(fingerprintAiContext(second));
  });

  it("grounds Ask Siply in real capabilities without unconditional medical copy", () => {
    expect(ASK_SIPLY_SYSTEM_PROMPT).toContain("You cannot change settings");
    expect(ASK_SIPLY_SYSTEM_PROMPT).toContain("only when the question actually concerns");
    expect(ASK_SIPLY_SYSTEM_PROMPT).toContain("Do not invent Siply screens");
    expect(ASK_SIPLY_SYSTEM_PROMPT).not.toContain("15 ml");
  });
});
