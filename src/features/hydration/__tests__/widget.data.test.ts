import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../../core/constants";
import {
  buildWidgetHydrationData,
  formatWidgetReminderLabel,
} from "../widgets/widgetData";

describe("Android widget hydration data", () => {
  it("formats same-day and next-day reminder times clearly", () => {
    const now = new Date(2026, 8, 14, 12, 0);
    expect(formatWidgetReminderLabel(new Date(2026, 8, 14, 15, 30), now))
      .toBe("Today · 3:30 PM");
    expect(formatWidgetReminderLabel(new Date(2026, 8, 15, 7, 0), now))
      .toBe("Tomorrow · 7:00 AM");
    expect(formatWidgetReminderLabel(null, now)).toBe("Not scheduled");
  });

  it("uses today's normalized progress and the shared reminder schedule", () => {
    const now = new Date(2026, 8, 14, 12, 0);
    const data = buildWidgetHydrationData({
      settings: { ...DEFAULT_SETTINGS, targetLiters: 2 },
      progress: { date: "2026-09-14", consumedMl: 750 },
    }, now);
    expect(data).toMatchObject({ consumedMl: 750, targetMl: 2000, percentage: 38 });
    expect(data.nextReminderLabel).toMatch(/^Today · /);
  });

  it("does not carry yesterday's progress into the widget", () => {
    const data = buildWidgetHydrationData({
      settings: DEFAULT_SETTINGS,
      progress: { date: "2026-09-13", consumedMl: 2000 },
    }, new Date(2026, 8, 14, 12, 0));
    expect(data.consumedMl).toBe(0);
    expect(data.percentage).toBe(0);
  });
});
