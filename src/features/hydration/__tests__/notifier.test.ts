import { beforeEach, describe, expect, it, vi } from "vitest";
import { Platform } from "react-native";

const { pending, events, mockSchedule, mockCancel, mockPermissions, mockRequestPermissions, mockGetChannel } = vi.hoisted(() => ({
  pending: [] as Array<{ identifier: string; content: any; trigger: any }>,
  events: [] as string[],
  mockSchedule: vi.fn(),
  mockCancel: vi.fn(),
  mockPermissions: vi.fn(),
  mockRequestPermissions: vi.fn(),
  mockGetChannel: vi.fn(),
}));

vi.mock("expo-notifications", () => ({
  SchedulableTriggerInputTypes: { DATE: "date" },
  AndroidNotificationPriority: { HIGH: "high", DEFAULT: "default" },
  AndroidImportance: { HIGH: 4, LOW: 2, NONE: 0 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  getAllScheduledNotificationsAsync: vi.fn(async () => [...pending]),
  getPermissionsAsync: mockPermissions,
  requestPermissionsAsync: mockRequestPermissions,
  scheduleNotificationAsync: mockSchedule,
  cancelScheduledNotificationAsync: mockCancel,
  cancelAllScheduledNotificationsAsync: vi.fn(),
  setNotificationChannelAsync: vi.fn(),
  getNotificationChannelAsync: mockGetChannel,
  setNotificationCategoryAsync: vi.fn(),
}));

vi.mock("../notifications/diagnostics", () => ({
  recordTestDiagnostics: vi.fn(async () => {}),
}));

import { DEFAULT_SETTINGS } from "../../../core/constants";
import {
  applyNotificationPlan,
  buildReminderFamilyId,
  cancelNotificationFamily,
  resolveNotificationFamilyId,
  sendTestNotification,
  sendTestNotificationDetailed,
  snoozeNotification,
  type NotificationPlanSlot,
} from "../notifications/notifier";

const makeSlot = (time: Date): NotificationPlanSlot => ({
  familyId: buildReminderFamilyId(time),
  time,
  windowEnd: new Date(2026, 8, 21, 23, 0),
  mlPerReminder: 200,
  sipsPerReminder: 13,
  phase: "normal",
  nudgeOffsets: [5, 10],
});

describe("notification plan reconciliation", () => {
  beforeEach(() => {
    (Platform as any).OS = "ios";
    pending.splice(0);
    events.splice(0);
    mockPermissions.mockReset().mockResolvedValue({ granted: true, canAskAgain: true });
    mockRequestPermissions.mockReset().mockResolvedValue({ granted: true, canAskAgain: true });
    mockGetChannel.mockReset().mockResolvedValue({ importance: 4 });
    mockCancel.mockReset().mockImplementation(async (identifier: string) => {
      events.push(`cancel:${identifier}`);
      const index = pending.findIndex((item) => item.identifier === identifier);
      if (index >= 0) pending.splice(index, 1);
    });
    mockSchedule.mockReset().mockImplementation(async (request: any) => {
      events.push(`schedule:${request.identifier}`);
      const next = {
        identifier: request.identifier,
        content: request.content,
        trigger: request.trigger,
      };
      const existing = pending.findIndex((item) => item.identifier === request.identifier);
      if (existing >= 0) pending.splice(existing, 1, next);
      else pending.push(next);
      return request.identifier;
    });
  });

  it("adds and verifies replacements before removing an obsolete plan", async () => {
    const oldTime = new Date(2026, 8, 21, 9, 0);
    const oldId = `siply:reminder:${oldTime.getTime()}:200`;
    pending.push({
      identifier: oldId,
      content: { data: { familyId: buildReminderFamilyId(oldTime) } },
      trigger: {},
    });
    const slot = makeSlot(new Date(2026, 8, 21, 10, 0));

    const result = await applyNotificationPlan(
      DEFAULT_SETTINGS,
      [slot],
      new Date(2026, 8, 21, 8, 0)
    );

    expect(result.status).toBe("verified");
    expect(result.verifiedFamilyIds).toEqual([slot.familyId]);
    expect(events.findIndex((event) => event.startsWith("schedule:"))).toBeLessThan(
      events.findIndex((event) => event === `cancel:${oldId}`)
    );
    expect(pending.some((item) => item.identifier === oldId)).toBe(false);
  });

  it("is idempotent and does not duplicate an already verified plan", async () => {
    const slot = makeSlot(new Date(2026, 8, 21, 10, 0));
    await applyNotificationPlan(DEFAULT_SETTINGS, [slot], new Date(2026, 8, 21, 8, 0));
    mockSchedule.mockClear();

    const second = await applyNotificationPlan(
      DEFAULT_SETTINGS,
      [slot],
      new Date(2026, 8, 21, 8, 1)
    );

    expect(second.status).toBe("verified");
    expect(second.requested).toBe(0);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("keeps the older usable plan when every replacement attempt fails", async () => {
    const oldTime = new Date(2026, 8, 21, 9, 0);
    const oldFamily = buildReminderFamilyId(oldTime);
    const oldId = `siply:reminder:${oldTime.getTime()}:200`;
    pending.push({ identifier: oldId, content: { data: { familyId: oldFamily } }, trigger: {} });
    mockSchedule.mockRejectedValue(new Error("native scheduler unavailable"));

    const result = await applyNotificationPlan(
      DEFAULT_SETTINGS,
      [makeSlot(new Date(2026, 8, 21, 10, 0))],
      new Date(2026, 8, 21, 8, 0)
    );

    expect(result.status).toBe("failed");
    expect(result.pendingFamilyIds).toContain(oldFamily);
    expect(pending.some((item) => item.identifier === oldId)).toBe(true);
    expect(events.some((event) => event.startsWith("cancel:"))).toBe(false);
    // Base reminder, two follow-ups, and two summaries each receive one bounded retry.
    expect(mockSchedule).toHaveBeenCalledTimes(10);
  });

  it("rolls back a partially accepted replacement instead of leaving a hybrid queue", async () => {
    const oldTime = new Date(2026, 8, 21, 9, 0);
    const oldFamily = buildReminderFamilyId(oldTime);
    const oldId = `siply:reminder:${oldTime.getTime()}:200`;
    pending.push({ identifier: oldId, content: { data: { familyId: oldFamily } }, trigger: {} });
    mockSchedule.mockImplementation(async (request: any) => {
      if (request.identifier.includes(":nudge:") && request.identifier.includes(":5:")) {
        throw new Error("one replacement failed");
      }
      const next = { identifier: request.identifier, content: request.content, trigger: request.trigger };
      const existing = pending.findIndex((item) => item.identifier === request.identifier);
      if (existing >= 0) pending.splice(existing, 1, next);
      else pending.push(next);
      return request.identifier;
    });

    const slot = makeSlot(new Date(2026, 8, 21, 10, 0));
    const result = await applyNotificationPlan(DEFAULT_SETTINGS, [slot], new Date(2026, 8, 21, 8, 0));

    expect(result.status).toBe("failed");
    expect(pending.map((item) => item.identifier)).toEqual([oldId]);
    expect(result.pendingFamilyIds).toEqual([oldFamily]);
  });

  it("removes today's obsolete reminders after target completion even if tomorrow cannot be installed", async () => {
    const oldTime = new Date(2026, 8, 21, 9, 0);
    const oldId = `siply:v2:reminder:${oldTime.getTime()}:200`;
    pending.push({
      identifier: oldId,
      content: { data: { familyId: buildReminderFamilyId(oldTime) } },
      trigger: {},
    });
    mockSchedule.mockRejectedValue(new Error("native scheduler unavailable"));

    const result = await applyNotificationPlan(DEFAULT_SETTINGS, [], new Date(2026, 8, 21, 8, 0));

    expect(result.status).toBe("failed");
    expect(pending.some((item) => item.identifier === oldId)).toBe(false);
  });

  it("removes disabled nudges even when the replacement plan fails", async () => {
    const oldTime = new Date(2026, 8, 21, 9, 0);
    const familyId = buildReminderFamilyId(oldTime);
    const oldReminder = `siply:v2:reminder:${oldTime.getTime()}:200`;
    const oldNudge = `siply:v2:nudge:${oldTime.getTime() + 300_000}:200:5:${oldTime.getTime()}`;
    pending.push(
      { identifier: oldReminder, content: { data: { familyId } }, trigger: {} },
      { identifier: oldNudge, content: { data: { familyId } }, trigger: {} }
    );
    mockSchedule.mockRejectedValue(new Error("native scheduler unavailable"));

    await applyNotificationPlan(
      { ...DEFAULT_SETTINGS, escalationEnabled: false },
      [makeSlot(new Date(2026, 8, 21, 10, 0))],
      new Date(2026, 8, 21, 8, 0)
    );

    expect(pending.some((item) => item.identifier === oldNudge)).toBe(false);
    expect(pending.some((item) => item.identifier === oldReminder)).toBe(true);
  });

  it("resubmits existing requests when a semantic setting changes", async () => {
    (Platform as any).OS = "android";
    const slot = makeSlot(new Date(2026, 8, 21, 10, 0));
    await applyNotificationPlan(DEFAULT_SETTINGS, [slot], new Date(2026, 8, 21, 8, 0));
    mockSchedule.mockClear();

    const result = await applyNotificationPlan(
      { ...DEFAULT_SETTINGS, soundEnabled: false },
      [slot],
      new Date(2026, 8, 21, 8, 1),
      [],
      { reinstallExisting: true }
    );

    expect(result.status).toBe("verified");
    expect(result.requested).toBe(result.desiredCount);
    expect(mockSchedule).toHaveBeenCalled();
    expect(pending.find((item) => item.identifier.includes(":reminder:"))?.trigger.channelId)
      .toBe("siply-reminders-silent");
  });

  it("keeps the end-of-window summary even when today's target has no reminder slots", async () => {
    const result = await applyNotificationPlan(
      DEFAULT_SETTINGS,
      [],
      new Date(2026, 8, 21, 8, 0)
    );
    expect(result.status).toBe("verified");
    expect(result.desiredCount).toBe(2);
    expect(pending[0]?.identifier).toContain("siply:v2:summary:");
  });

  it("covers tomorrow's complete window with a summary beyond 24 elapsed hours", async () => {
    const result = await applyNotificationPlan(
      DEFAULT_SETTINGS,
      [],
      new Date(2026, 8, 21, 6, 25)
    );
    const summaries = pending.filter((item) => item.identifier.includes(":summary:"));
    expect(result.status).toBe("verified");
    expect(summaries).toHaveLength(2);
    expect(summaries[1].identifier).toContain(String(new Date(2026, 8, 22, 23, 0).getTime()));
  });

  it("keeps pending follow-up nudges after their base reminder has fired", async () => {
    const slot = makeSlot(new Date(2026, 8, 21, 10, 0));
    await applyNotificationPlan(DEFAULT_SETTINGS, [slot], new Date(2026, 8, 21, 8, 0));
    const baseIndex = pending.findIndex((item) => item.identifier.includes(":reminder:"));
    pending.splice(baseIndex, 1); // The OS removes a delivered request.
    events.splice(0);

    await applyNotificationPlan(DEFAULT_SETTINGS, [slot], new Date(2026, 8, 21, 10, 2));

    const followUps = pending.filter((item) => item.identifier.includes(":nudge:"));
    expect(followUps).toHaveLength(2);
    expect(events.some((event) => event.startsWith("cancel:") && event.includes(":nudge:"))).toBe(false);
  });

  it("never exceeds the total queue limit when transient requests already exist", async () => {
    for (let index = 0; index < 47; index += 1) {
      pending.push({
        identifier: `siply:v2:snooze:${index}:200`,
        content: { data: { siplyKind: "snooze" } },
        trigger: {},
      });
    }
    const result = await applyNotificationPlan(
      DEFAULT_SETTINGS,
      [makeSlot(new Date(2026, 8, 21, 10, 0))],
      new Date(2026, 8, 21, 8, 0)
    );
    expect(result.desiredCount).toBe(1);
    expect(pending).toHaveLength(48);
    expect(result.verifiedFamilyIds).toHaveLength(1);
    expect(pending.some((item) => item.identifier.includes(":nudge:"))).toBe(false);
  });

  it("frees obsolete capacity before adding a full replacement plan", async () => {
    for (let index = 0; index < 6; index += 1) {
      pending.push({ identifier: `transient-${index}`, content: {}, trigger: {} });
    }
    for (let index = 0; index < 14; index += 1) {
      const time = new Date(2026, 8, 22, 7, index * 5);
      pending.push({
        identifier: `siply:v2:reminder:${time.getTime()}:180`,
        content: { data: { familyId: buildReminderFamilyId(time) } },
        trigger: {},
      });
    }
    mockSchedule.mockImplementation(async (request: any) => {
      if (!pending.some((item) => item.identifier === request.identifier) && pending.length >= 48) {
        throw new Error("queue capacity exceeded");
      }
      const next = { identifier: request.identifier, content: request.content, trigger: request.trigger };
      const existing = pending.findIndex((item) => item.identifier === request.identifier);
      if (existing >= 0) pending.splice(existing, 1, next);
      else pending.push(next);
      return request.identifier;
    });
    const slots = Array.from({ length: 14 }, (_, index) =>
      makeSlot(new Date(2026, 8, 21, 8 + Math.floor(index / 2), (index % 2) * 30))
    );

    const result = await applyNotificationPlan(DEFAULT_SETTINGS, slots, new Date(2026, 8, 21, 7, 0));

    expect(result.status).toBe("verified");
    expect(result.extraneousIds).toEqual([]);
    expect(pending.length).toBeLessThanOrEqual(48);
    expect(result.verifiedFamilyIds).toHaveLength(14);
  });

  it("keeps the configured sip count in the final follow-up copy", async () => {
    const slot = makeSlot(new Date(2026, 8, 21, 10, 0));
    await applyNotificationPlan(
      { ...DEFAULT_SETTINGS, tone: "minimal" },
      [slot],
      new Date(2026, 8, 21, 8, 0)
    );
    const finalNudge = pending.find((item) => item.identifier.includes(":nudge:") && item.identifier.includes(":10:"));
    expect(finalNudge?.content.body).toContain("13 sips");
    expect(finalNudge?.content.body).not.toContain("1 sip)");
  });

  it("removes Snooze from reminders too close to the active-window end", async () => {
    const slot = makeSlot(new Date(2026, 8, 21, 22, 30));
    slot.phase = "last_call";
    slot.nudgeOffsets = [];
    await applyNotificationPlan(DEFAULT_SETTINGS, [slot], new Date(2026, 8, 21, 20, 0));
    const reminder = pending.find((item) => item.identifier.includes(":reminder:"));
    expect(reminder?.content.categoryIdentifier).toBe("siply_reminder_no_snooze");
  });

  it("refuses a defensive snooze that would cross the active-window end", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 21, 22, 40));
    try {
      await expect(snoozeNotification(200, DEFAULT_SETTINGS)).resolves.toBe(false);
      expect(mockSchedule).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("frees the original family before scheduling a snooze into a full queue", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 21, 8, 0));
    const originalTime = new Date(2026, 8, 21, 8, 0);
    const familyId = buildReminderFamilyId(originalTime);
    pending.push({
      identifier: `siply:v2:nudge:${new Date(2026, 8, 21, 8, 5).getTime()}:200:5:${originalTime.getTime()}`,
      content: { data: { familyId } },
      trigger: {},
    });
    for (let index = 0; index < 47; index += 1) {
      pending.push({ identifier: `other-${index}`, content: {}, trigger: {} });
    }
    mockSchedule.mockImplementation(async (request: any) => {
      if (pending.length >= 48) throw new Error("queue capacity exceeded");
      pending.push({ identifier: request.identifier, content: request.content, trigger: request.trigger });
      return request.identifier;
    });

    try {
      await expect(snoozeNotification(200, DEFAULT_SETTINGS, familyId)).resolves.toBe(true);
      expect(pending).toHaveLength(48);
      expect(pending.some((item) => item.identifier.includes(":snooze:"))).toBe(true);
      expect(pending.some((item) => item.content.data?.familyId === familyId)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a blocked Android reminder channel separately from queue health", async () => {
    (Platform as any).OS = "android";
    mockGetChannel.mockResolvedValue({ importance: 0 });
    const result = await applyNotificationPlan(
      DEFAULT_SETTINGS,
      [makeSlot(new Date(2026, 8, 21, 10, 0))],
      new Date(2026, 8, 21, 8, 0)
    );
    expect(result.status).toBe("verified");
    expect(result.channelBlocked).toBe(true);
  });

  it("keeps Android action metadata in the identifier instead of content data", async () => {
    (Platform as any).OS = "android";
    const slot = makeSlot(new Date(2026, 8, 21, 10, 0));

    await applyNotificationPlan(DEFAULT_SETTINGS, [slot], new Date(2026, 8, 21, 8, 0));

    const reminder = pending.find((item) => item.identifier.includes(":reminder:"));
    expect(reminder?.content).not.toHaveProperty("data");
    expect(resolveNotificationFamilyId(reminder?.identifier, reminder?.content.data)).toBe(
      slot.familyId
    );

    await cancelNotificationFamily(slot.familyId);
    expect(
      pending.some(
        (item) => resolveNotificationFamilyId(item.identifier, item.content.data) === slot.familyId
      )
    ).toBe(false);
  });

  it("reports why a test notification cannot be added to a full queue", async () => {
    for (let index = 0; index < 48; index += 1) {
      pending.push({ identifier: `existing-${index}`, content: {}, trigger: {} });
    }

    const result = await sendTestNotificationDetailed();

    expect(result).toMatchObject({
      success: false,
      reason: "queue_full",
      pendingCount: 48,
    });
    expect(result.error).toContain("48/48");
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("preserves the boolean test API while exposing a native scheduling error", async () => {
    mockSchedule.mockRejectedValue(new Error("native scheduler unavailable"));

    const detailed = await sendTestNotificationDetailed();
    const compatible = await sendTestNotification();

    expect(detailed).toEqual({
      success: false,
      reason: "scheduling_failed",
      error: "native scheduler unavailable",
    });
    expect(compatible).toBe(false);
  });
});
