import type { HydrationHistory, LogEntry } from "../domain/types";
import { deriveAggregates } from "../domain/history";

/**
 * Merges imported history into current history per §5.3 of PER_ENTRY_LOGGING_DESIGN.md.
 *
 * Four-case decision table:
 *   current ✅ + imported ✅  → Union entries by id (dedup). Re-derive aggregates.
 *                               safeTotalMl guard: max(derived, current, imported) prevents
 *                               data loss from ID collisions (should never occur).
 *   current ✅ + imported ❌  → Keep whichever side has higher totalMl. Entries discarded
 *                               if summary-only side wins.
 *   current ❌ + imported ✅  → Use imported only if its total ≥ current total. Otherwise
 *                               summary-only current wins.
 *   current ❌ + imported ❌  → Keep higher totalMl (original rule, unchanged).
 *
 * Core invariant: merge never reduces a day's known total.
 *
 * This function is pure (no side effects, does not touch the store).
 */
export function mergeHistory(
  current: HydrationHistory,
  imported: HydrationHistory
): HydrationHistory {
  // Start with a shallow copy of current — never remove existing dates.
  const merged: HydrationHistory = { ...current };

  for (const [dateKey, importedDay] of Object.entries(imported)) {
    const currentDay = merged[dateKey];

    if (!currentDay) {
      // New day from backup — add it as-is.
      merged[dateKey] = importedDay;
      continue;
    }

    // Both sides have data for this day
    const currentHasEntries = currentDay.entries && currentDay.entries.length > 0;
    const importedHasEntries = importedDay.entries && importedDay.entries.length > 0;

    if (currentHasEntries && importedHasEntries) {
      // ENTRY-LEVEL MERGE: union by entry ID, deduplicate.
      // Same ID → keep current (device-local is canonical).
      const entryMap = new Map<string, LogEntry>();
      for (const e of currentDay.entries!) {
        entryMap.set(e.id, e);
      }
      for (const e of importedDay.entries!) {
        if (!entryMap.has(e.id)) {
          entryMap.set(e.id, e);
        }
      }
      const mergedEntries = Array.from(entryMap.values()).sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      const { totalMl, logHours } = deriveAggregates(mergedEntries);

      // Guard: merged entries total must not be lower than either side's stored total.
      // This should not happen with correct entry IDs (union is additive), but the guard
      // prevents data loss from ID collisions or corruption. Log a dev warning if it fires
      // — this indicates a collision that should never occur with the current ID scheme.
      const safeTotalMl = Math.max(totalMl, currentDay.totalMl, importedDay.totalMl);
      if (safeTotalMl !== totalMl) {
        if (__DEV__) {
          console.warn(
            `[mergeHistory] safeTotalMl guard clamped ${dateKey}: ` +
            `derived=${totalMl}, current=${currentDay.totalMl}, imported=${importedDay.totalMl}. ` +
            `This indicates an entry ID collision — investigate.`
          );
        }
      }

      merged[dateKey] = {
        ...currentDay,
        entries: mergedEntries,
        totalMl: safeTotalMl,
        logHours,
        // Keep goalMl/goodThresholdMl from current (most recent settings)
      };
    } else if (currentHasEntries && !importedHasEntries) {
      // Current has entries, imported is summary-only.
      // Keep current only if its total >= imported's total.
      // Otherwise the summary-only side has a higher known total — use that.
      if (importedDay.totalMl > currentDay.totalMl) {
        merged[dateKey] = importedDay;
      }
      // else: keep current (has entries AND equal-or-higher total)
    } else if (!currentHasEntries && importedHasEntries) {
      // Imported has entries, current is summary-only.
      // Use imported only if its total >= current's total.
      // Otherwise the summary-only current has a higher known total — keep it.
      if (importedDay.totalMl >= currentDay.totalMl) {
        merged[dateKey] = importedDay;
      }
      // else: keep current (summary-only but higher total)
    } else {
      // Both summary-only — existing "higher totalMl" rule, unchanged.
      if (importedDay.totalMl > currentDay.totalMl) {
        merged[dateKey] = importedDay;
      }
    }
  }

  return merged;
}
