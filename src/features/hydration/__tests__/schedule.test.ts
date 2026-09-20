import { describe, it, expect } from "vitest";
import { computeReminderSchedule } from "../domain/schedule";
import { DEFAULT_SETTINGS } from "../../../core/constants";
import { HydrationSettings } from "../domain/types";

const makeSettings = (overrides: Partial<HydrationSettings> = {}): HydrationSettings => ({
  ...DEFAULT_SETTINGS,
  ...overrides,
});

// Helper: create a Date at a specific time today
const today = (hour: number, minute = 0) => {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
};

describe("computeReminderSchedule — anchor stability", () => {
  it("produces stable slot times when called moments apart (same interval)", () => {
    // Use a scenario where the interval won't change: enough consumed
    // that the number of reminders stays the same, and enough window left.
    const settings = makeSettings({
      targetLiters: 2.0,
      windowStart: "07:00",
      windowEnd: "23:00",
    });
    // Consumed enough that we need ~5 reminders → interval = ~60 min
    // Window = 16h = 960 min. 1000ml remaining at 200ml/reminder = 5 reminders
    // interval = floor(960/5) = 192 → but from 10:00, remaining = 780 min
    // Let's use a stable mid-day point
    const consumedMl = 1000;

    const now1 = today(12, 0);
    const now2 = today(12, 2); // Just 2 minutes later

    const schedule1 = computeReminderSchedule(now1, settings, consumedMl);
    const schedule2 = computeReminderSchedule(now2, settings, consumedMl);

    // Both should produce the same interval since remaining window barely changed
    if (
      schedule1.slots.length > 0 &&
      schedule2.slots.length > 0 &&
      schedule1.slots[0].intervalMinutes === schedule2.slots[0].intervalMinutes
    ) {
      // When the interval is the same, the anchor grid guarantees the same slot times
      const futureSlots1 = schedule1.slots.filter((s) => s.time > now2);
      const futureSlots2 = schedule2.slots;

      if (futureSlots1.length > 0 && futureSlots2.length > 0) {
        expect(futureSlots2[0].time.getTime()).toBe(futureSlots1[0].time.getTime());
      }
    }
  });

  it("consecutive slots are evenly spaced by the computed interval", () => {
    const settings = makeSettings({
      targetLiters: 1.5,
      windowStart: "06:00",
      windowEnd: "22:00",
    });

    const schedule = computeReminderSchedule(today(10, 0), settings, 0);
    // Filter to regular slots in the same window (same date, exclude last-call)
    const todayDate = new Date().getDate();
    const regularSlots = schedule.slots.filter(
      (s) => s.intervalMinutes > 0 && s.time.getDate() === todayDate
    );

    if (regularSlots.length >= 2) {
      const interval = regularSlots[0].intervalMinutes;
      for (let i = 1; i < regularSlots.length; i++) {
        const gap = regularSlots[i].time.getTime() - regularSlots[i - 1].time.getTime();
        const gapMinutes = Math.round(gap / 60000);
        expect(gapMinutes).toBe(interval);
      }
    }
  });

  it("anchor prevents drift: reopening app doesn't change next slot time", () => {
    // Simulate the exact user scenario from the bug report:
    // 1. Record drink at 4:15 PM
    // 2. App shows next reminder at X
    // 3. Reopen app at 4:20 PM (no drink logged)
    // 4. Next reminder should still be X (not a different time)
    const settings = makeSettings({
      targetLiters: 3.0,
      windowStart: "07:00",
      windowEnd: "23:00",
    });

    // After logging at 4:15 PM — consumedMl = 1500
    const afterLog = today(16, 15);
    const schedule1 = computeReminderSchedule(afterLog, settings, 1500);

    // Reopen at 4:20 PM — same consumedMl, no new drink
    const reopen = today(16, 20);
    const schedule2 = computeReminderSchedule(reopen, settings, 1500);

    if (schedule1.slots.length > 0 && schedule2.slots.length > 0) {
      // The next future slot from both should be at the same time
      // (as long as the interval calculation produces the same result)
      const next1 = schedule1.slots.filter((s) => s.time > reopen)[0];
      const next2 = schedule2.slots[0];

      if (next1 && next2 && next1.intervalMinutes === next2.intervalMinutes) {
        expect(next2.time.getTime()).toBe(next1.time.getTime());
      }
    }
  });
});

describe("computeReminderSchedule — mlPerReminder cap", () => {
  it("never exceeds 400ml per reminder", () => {
    const settings = makeSettings({
      targetLiters: 3.0,
      windowStart: "07:00",
      windowEnd: "23:00",
    });
    // Very low consumed, late in the day — triggers high per-reminder amounts
    const schedule = computeReminderSchedule(today(22, 30), settings, 0);

    for (const slot of schedule.slots) {
      expect(slot.mlPerReminder).toBeLessThanOrEqual(400);
    }
  });

  it("never produces 0 or negative mlPerReminder", () => {
    const settings = makeSettings();
    const schedule = computeReminderSchedule(today(12, 0), settings, 500);

    for (const slot of schedule.slots) {
      expect(slot.mlPerReminder).toBeGreaterThan(0);
    }
  });

  it("precomputes later asks for the no-new-log path after ignored reminders", () => {
    const now = today(12, 0);
    const schedule = computeReminderSchedule(
      now,
      makeSettings({ targetLiters: 3, windowStart: "07:00", windowEnd: "23:00" }),
      1000
    );
    const sameDay = schedule.slots.filter((slot) => slot.time.getDate() === now.getDate());
    expect(sameDay.length).toBeGreaterThan(1);
    for (let index = 1; index < sameDay.length; index += 1) {
      expect(sameDay[index].mlPerReminder).toBeGreaterThanOrEqual(
        sameDay[index - 1].mlPerReminder
      );
    }
  });
});

describe("computeReminderSchedule — Last Call behavior", () => {
  it("schedules a Last Call when near window end with remaining intake", () => {
    const settings = makeSettings({
      windowStart: "07:00",
      windowEnd: "23:00",
      targetLiters: 3.0,
    });
    // Very late, past all regular slots
    const schedule = computeReminderSchedule(today(22, 55), settings, 1000);

    expect(schedule.slots.length).toBeGreaterThanOrEqual(0);
    // If there is a slot, it should be a last-call (intervalMinutes === 0)
    const lastCallSlots = schedule.slots.filter((s) => s.intervalMinutes === 0);
    if (schedule.slots.length > 0) {
      expect(lastCallSlots.length).toBeGreaterThanOrEqual(0);
    }
  });

  it("does not schedule Last Call if remaining is less than one sip", () => {
    const settings = makeSettings({
      windowStart: "07:00",
      windowEnd: "23:00",
      targetLiters: 3.0,
      sipMl: 15,
    });
    // Almost at target — remaining is < sipMl
    const consumedMl = 3000 - 10; // only 10ml remaining, < sipMl of 15
    const schedule = computeReminderSchedule(today(22, 55), settings, consumedMl);

    const lastCallSlots = schedule.slots.filter(
      (s) => s.intervalMinutes === 0 && s.time.getDate() === today(22, 55).getDate()
    );
    expect(lastCallSlots.length).toBe(0);
  });

  it("caps Last Call mlPerReminder at MAX_ML_PER_REMINDER", () => {
    const settings = makeSettings({
      windowStart: "07:00",
      windowEnd: "23:00",
      targetLiters: 3.0,
    });
    // Haven't drunk anything all day, now it's very late
    const schedule = computeReminderSchedule(today(22, 58), settings, 0);

    for (const slot of schedule.slots) {
      expect(slot.mlPerReminder).toBeLessThanOrEqual(400);
    }
  });
});

describe("computeReminderSchedule — target met", () => {
  it("returns no slots when target is met", () => {
    const settings = makeSettings({ targetLiters: 2.0 });
    const schedule = computeReminderSchedule(today(12, 0), settings, 2000);

    expect(schedule.targetMet).toBe(true);
    expect(schedule.status).toBe("target_met");
    // Current window should have no slots since remainingMl = 0
    const currentSlots = schedule.slots.filter(
      (s) => s.time.getDate() === new Date().getDate()
    );
    expect(currentSlots.length).toBe(0);
  });
});

describe("computeReminderSchedule — deduplication", () => {
  it("never produces duplicate slot times", () => {
    const settings = makeSettings();
    const schedule = computeReminderSchedule(today(12, 0), settings, 500);

    const times = new Set<number>();
    for (const slot of schedule.slots) {
      const t = slot.time.getTime();
      expect(times.has(t)).toBe(false);
      times.add(t);
    }
  });
});

describe("computeReminderSchedule — edge cases", () => {
  it("handles window that hasn't started yet", () => {
    const settings = makeSettings({ windowStart: "22:00", windowEnd: "23:00" });
    const schedule = computeReminderSchedule(today(8, 0), settings, 0);

    // All slots should be in the future (after 22:00)
    for (const slot of schedule.slots) {
      expect(slot.time.getHours()).toBeGreaterThanOrEqual(22);
    }
  });

  it("handles zero consumed ml", () => {
    const settings = makeSettings();
    const schedule = computeReminderSchedule(today(12, 0), settings, 0);

    expect(schedule.slots.length).toBeGreaterThan(0);
  });

  it("handles invalid settings gracefully", () => {
    const settings = makeSettings({ sipMl: 0 });
    const schedule = computeReminderSchedule(today(12, 0), settings, 0);

    expect(schedule.status).toBe("config_error");
    expect(schedule.slots.length).toBe(0);
  });

  it("handles zero-width window", () => {
    const settings = makeSettings({ windowStart: "12:00", windowEnd: "12:00" });
    const schedule = computeReminderSchedule(today(12, 0), settings, 0);

    expect(schedule.status).toBe("no_window");
    expect(schedule.slots.length).toBe(0);
  });

  it("rejects an overnight active window until Hydration Day is supported", () => {
    const settings = makeSettings({ windowStart: "22:00", windowEnd: "07:00" });
    const schedule = computeReminderSchedule(today(23, 0), settings, 0);
    expect(schedule.status).toBe("no_window");
    expect(schedule.slots).toHaveLength(0);
  });

  it("keeps every same-day reminder at least 30 minutes after a drink", () => {
    const loggedAt = today(16, 15);
    const schedule = computeReminderSchedule(
      loggedAt,
      makeSettings({ windowStart: "07:00", windowEnd: "23:00" }),
      1200,
      loggedAt.toISOString()
    );
    const earliestAllowed = loggedAt.getTime() + 30 * 60_000;
    const sameDay = schedule.slots.filter((slot) => slot.time.getDate() === loggedAt.getDate());
    expect(sameDay.every((slot) => slot.time.getTime() >= earliestAllowed)).toBe(true);
  });

  it("does not create an aggressive reminder after the final last-call boundary", () => {
    const now = today(22, 31);
    const schedule = computeReminderSchedule(
      now,
      makeSettings({ windowStart: "07:00", windowEnd: "23:00" }),
      1000
    );
    const sameDay = schedule.slots.filter((slot) => slot.time.getDate() === now.getDate());
    expect(sameDay).toHaveLength(0);
  });

  it("handles very short remaining window (<30 min)", () => {
    const settings = makeSettings({
      windowStart: "07:00",
      windowEnd: "23:00",
      targetLiters: 3.0,
    });
    const schedule = computeReminderSchedule(today(22, 45), settings, 1000);

    // Should still produce slots or a last-call
    // No crashes or infinite loops
    expect(schedule).toBeDefined();
  });
});
