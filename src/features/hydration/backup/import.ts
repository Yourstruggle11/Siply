import { Alert } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useHydrationStore } from "../state/hydrationStore";
import {
  normalizeProgress,
  normalizeQuickLog,
  normalizeSettings,
} from "../../../core/storage/migrations";
import { normalizeHistory } from "../domain/history";
import { getDateKey } from "../../../core/time";
import { rescheduleNotifications } from "../notifications/notifier";
import { validateSiplyBackup } from "./validate";
import { mergeHistory } from "./merge";

/**
 * Formats an ISO 8601 timestamp for display in the confirmation dialog.
 * Falls back gracefully if the string is not parseable.
 */
function formatExportedAt(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString();
  } catch {
    return isoString;
  }
}

/**
 * Imports a .siply.json backup file chosen by the user.
 *
 * Full pipeline (3.2 of EXPORT_IMPORT_DESIGN.md):
 *   1. File selection via expo-document-picker.
 *   2. Read file contents via expo-file-system.
 *   3. JSON.parse.
 *   4. Schema validation (validateSiplyBackup).
 *   5. Normalise all slices through the same normalize* functions
 *      used by migrateStorage — guarantees forward/backward compat.
 *   6. Compute merge preview (new days, updated days).
 *   7. Confirmation dialog.
 *   8. Merge history (mergeHistory).
 *   9. Apply to Zustand store via setState.
 *  10. Success feedback + rescheduleNotifications.
 *
 * ANY failure before step 9 returns without modifying state.
 */
export async function importBackup(): Promise<void> {
  // ── Step 1: File selection ────────────────────────────────────────────────
  let pickerResult: DocumentPicker.DocumentPickerResult;
  try {
    pickerResult = await DocumentPicker.getDocumentAsync({
      type: "application/json",
      copyToCacheDirectory: true,
    });
  } catch {
    // Picker threw (should be rare) — treat as cancellation.
    return;
  }

  if (pickerResult.canceled || pickerResult.assets.length === 0) {
    return; // User cancelled — silently return.
  }

  const asset = pickerResult.assets[0];
  await processBackupUri(asset.uri);
}

/**
 * Processes a .siply.json backup file from a given URI.
 */
export async function processBackupUri(fileUri: string): Promise<void> {
  // ── Step 2: Read file contents ────────────────────────────────────────────
  let contents: string;
  try {
    contents = await new File(fileUri).text();
  } catch {
    Alert.alert("Import failed", "Could not read the selected file.");
    return;
  }

  // ── Step 3: JSON.parse ────────────────────────────────────────────────────
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    Alert.alert("Import failed", "The selected file is not a valid JSON file.");
    return;
  }

  // ── Step 4: Schema validation ─────────────────────────────────────────────
  const validation = validateSiplyBackup(parsed);
  if (!validation.valid) {
    Alert.alert(
      "Import failed",
      `This file is not a valid Siply backup.\n\n${validation.reason}`
    );
    return;
  }

  const backup = validation.backup;

  // ── Step 5: Normalise through migrate functions ───────────────────────────
  // Call normalize* directly (not via migrateStorage, which has async legacy
  // bridging logic we do not want during import — see §7.2 of design doc).
  const todayKey = getDateKey(new Date());
  const normSettings = normalizeSettings(backup.settings);
  const normProgress = normalizeProgress(backup.progress, todayKey);
  const normQuickLog = normalizeQuickLog(backup.quickLog);
  const normHistory = normalizeHistory(backup.history);

  // ── Step 6: Compute merge preview ─────────────────────────────────────────
  const currentHistory = useHydrationStore.getState().history;
  let newDays = 0;
  let updatedDays = 0;

  for (const [dateKey, importedDay] of Object.entries(normHistory)) {
    const currentDay = currentHistory[dateKey];
    if (!currentDay) {
      newDays += 1;
    } else if (importedDay.totalMl > currentDay.totalMl) {
      updatedDays += 1;
    }
  }

  const totalDays = Object.keys(normHistory).length;

  // ── Step 7: Confirmation dialog ───────────────────────────────────────────
  const confirmed = await new Promise<boolean>((resolve) => {
    Alert.alert(
      "Restore from backup?",
      [
        `Created: ${formatExportedAt(backup.exportedAt)}`,
        "",
        "• Settings will be replaced",
        "• Today's progress will be replaced",
        `• ${totalDays} days of history will be merged (${newDays} new, ${updatedDays} updated)`,
      ].join("\n"),
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        {
          text: "Restore",
          style: "destructive",
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });

  if (!confirmed) {
    return; // User cancelled — state is untouched.
  }

  // ── Step 8: Merge history ─────────────────────────────────────────────────
  const mergedHistory = mergeHistory(currentHistory, normHistory);

  // ── Step 9: Apply to Zustand store ────────────────────────────────────────
  // Zustand persist auto-writes to AsyncStorage on next tick.
  useHydrationStore.setState({
    settings: normSettings,
    progress: normProgress,
    quickLog: normQuickLog,
    history: mergedHistory,
    onboarding: { completed: true },
  });

  // ── Step 10: Success feedback + reschedule ────────────────────────────────
  Alert.alert(
    "Backup restored",
    `${totalDays} days of history merged successfully.`
  );

  // Reschedule notifications to sync with the newly imported settings/progress.
  try {
    await rescheduleNotifications(normSettings, normProgress.consumedMl, new Date(), normQuickLog.lastLogAt);
  } catch {
    // Reschedule failure should not fail the import — silently ignore.
  }
}
