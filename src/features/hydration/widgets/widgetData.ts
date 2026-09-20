import { getDateKey } from "../../../core/time";
import type { HydrationStorageSnapshot } from "../../../core/storage/migrations";
import { litersToMl } from "../domain/calculations";
import type { ScheduleSnapshot } from "../notifications/scheduleEngine";

type WidgetSource = Pick<HydrationStorageSnapshot, "settings" | "progress">;

const formatClockTime = (date: Date) => {
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${minutes} ${hours >= 12 ? "PM" : "AM"}`;
};

export const formatWidgetReminderLabel = (next: Date | null, now: Date) => {
  if (!next) return "Not scheduled";
  const today = getDateKey(now);
  const nextDate = getDateKey(next);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const day = nextDate === today
    ? "Today"
    : nextDate === getDateKey(tomorrow)
      ? "Tomorrow"
      : next.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${day} · ${formatClockTime(next)}`;
};

export const buildWidgetHydrationData = (
  source: WidgetSource,
  now = new Date(),
  scheduleSnapshot: ScheduleSnapshot | null = null
) => {
  const targetMl = litersToMl(source.settings.targetLiters);
  const consumedMl = source.progress.date === getDateKey(now)
    ? Math.max(0, source.progress.consumedMl)
    : 0;
  const percentage = targetMl > 0 ? Math.round((consumedMl / targetMl) * 100) : 0;
  const verifiedFamilies = new Set(scheduleSnapshot?.verifiedFamilyIds ?? []);
  const nextSlot = scheduleSnapshot?.slots.find(
    (slot) => verifiedFamilies.has(slot.familyId) && new Date(slot.time) > now
  );
  const nextReminder = nextSlot ? new Date(nextSlot.time) : null;
  return {
    consumedMl,
    targetMl,
    percentage,
    nextReminderLabel: formatWidgetReminderLabel(nextReminder, now),
  };
};
