import { beforeEach, describe, expect, it, vi } from "vitest";

const { pending, events, mockSchedule } = vi.hoisted(() => ({
  pending: [] as Array<{ identifier: string; content: any; trigger: any }>,
  events: [] as string[],
  mockSchedule: vi.fn(),
}));

vi.mock("expo-notifications", () => ({
  SchedulableTriggerInputTypes: { DATE: "date" },
  AndroidNotificationPriority: { HIGH: "high", DEFAULT: "default" },
  AndroidImportance: { HIGH: 4, LOW: 2 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  getAllScheduledNotificationsAsync: vi.fn(async () => [...pending]),
  scheduleNotificationAsync: mockSchedule,
  cancelScheduledNotificationAsync: vi.fn(async (identifier: string) => {
    events.push(`cancel:${identifier}`);
    const index = pending.findIndex((item) => item.identifier === identifier);
    if (index >= 0) pending.splice(index, 1);
  }),
  cancelAllScheduledNotificationsAsync: vi.fn(),
  setNotificationChannelAsync: vi.fn(),
  setNotificationCategoryAsync: vi.fn(),
}));

vi.mock("../notifications/diagnostics", () => ({
  recordTestDiagnostics: vi.fn(),
}));

import { DEFAULT_SETTINGS } from "../../../core/constants";
import {
  applyNotificationPlan,
  buildReminderFamilyId,
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
    pending.splice(0);
    events.splice(0);
    mockSchedule.mockReset().mockImplementation(async (request: any) => {
      events.push(`schedule:${request.identifier}`);
      pending.push({
        identifier: request.identifier,
        content: request.content,
        trigger: request.trigger,
      });
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
    // Base reminder, two follow-ups, and end-of-window summary each retry 3x.
    expect(mockSchedule).toHaveBeenCalledTimes(12);
  });

  it("keeps the end-of-window summary even when today's target has no reminder slots", async () => {
    const result = await applyNotificationPlan(
      DEFAULT_SETTINGS,
      [],
      new Date(2026, 8, 21, 8, 0)
    );
    expect(result.status).toBe("verified");
    expect(result.desiredCount).toBe(1);
    expect(pending[0]?.identifier).toContain("siply:v2:summary:");
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
  });
});
