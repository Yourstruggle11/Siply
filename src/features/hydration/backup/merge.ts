import type { HydrationHistory } from "../domain/types";

/**
 * Merges imported history into current history per §4.2 of EXPORT_IMPORT_DESIGN.md.
 *
 * Rules:
 *   - Start with a copy of current — never lose existing data.
 *   - For each day in imported:
 *     - If the day doesn't exist in current → add it.
 *     - If it exists and imported.totalMl > current.totalMl → use imported.
 *     - If current.totalMl >= imported.totalMl → keep current.
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
      // New day from backup — add it.
      merged[dateKey] = importedDay;
    } else if (importedDay.totalMl > currentDay.totalMl) {
      // Conflict — imported has higher total, use imported record wholesale.
      merged[dateKey] = importedDay;
    }
    // else: current has equal or higher total — keep current (no-op).
  }

  return merged;
}
