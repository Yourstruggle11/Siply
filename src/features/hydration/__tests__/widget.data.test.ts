import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../../core/constants";
import type { ScheduleSnapshot } from "../notifications/scheduleEngine";
import { buildWidgetHydrationData, formatWidgetReminderLabel } from "../widgets/widgetData";

const snapshotAt = (date: Date): ScheduleSnapshot => ({
  version: 2,
  planId: "test",
  revision: 1,
  computedAt: date.toISOString(),
  verifiedAt: date.toISOString(),
  dateKey: "2026-09-14",
  timezoneOffsetMinutes: new Date(2026, 8, 14).getTimezoneOffset(),
  consumedMlAtCompute: 750,
  lastLogAtAtCompute: null,
  settingsHash: "test",
  slots: [{
    familyId: "verified-family",
    time: date.toISOString(),
    windowEnd: new Date(2026, 8, 14, 23, 0).toISOString(),
    mlPerReminder: 200,
    sipsPerReminder: 14,
    intervalMinutes: 60,
    phase: "normal",
    nudgeOffsets: [],
    nudgeMode: null,
  }],
  triggerSource: "test",
  desiredCount: 1,
  scheduledCount: 1,
  verifiedFamilyIds: ["verified-family"],
  health: "scheduled",
  errors: [],
  urgencyMode: false,
  weekendAdjustmentMinutes: 0,
});

describe("Android widget hydration data", () => {
  it("formats same-day and next-day reminder times clearly", () => {
    const now = new Date(2026, 8, 14, 12, 0);
    expect(formatWidgetReminderLabel(new Date(2026, 8, 14, 15, 30), now))
      .toBe("Today · 3:30 PM");
    expect(formatWidgetReminderLabel(new Date(2026, 8, 15, 7, 0), now))
      .toBe("Tomorrow · 7:00 AM");
    expect(formatWidgetReminderLabel(null, now)).toBe("Not scheduled");
  });

  it("uses today's progress and the OS-verified schedule snapshot", () => {
    const now = new Date(2026, 8, 14, 12, 0);
    const data = buildWidgetHydrationData({
      settings: { ...DEFAULT_SETTINGS, targetLiters: 2 },
      progress: { date: "2026-09-14", consumedMl: 750 },
    }, now, snapshotAt(new Date(2026, 8, 14, 15, 30)));
    expect(data).toMatchObject({
      consumedMl: 750,
      targetMl: 2000,
      percentage: 38,
      nextReminderLabel: "Today · 3:30 PM",
    });
  });

  it("does not invent a reminder when no verified plan exists", () => {
    const data = buildWidgetHydrationData({
      settings: DEFAULT_SETTINGS,
      progress: { date: "2026-09-14", consumedMl: 100 },
    }, new Date(2026, 8, 14, 12, 0));
    expect(data.nextReminderLabel).toBe("Not scheduled");
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
