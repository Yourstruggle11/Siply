import { Alert } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import Constants from "expo-constants";
import { useHydrationStore } from "../state/hydrationStore";
import { SCHEMA_VERSION } from "../../../core/constants";
import type { SiplyBackup } from "./types";

/**
 * Exports the current Zustand store state as a .siply.json backup file.
 *
 * Flow (§2.2 of EXPORT_IMPORT_DESIGN.md):
 *   1. Read state from in-memory Zustand store (never from AsyncStorage).
 *   2. Build SiplyBackup object (excludes `hydrated` and `onboarding`).
 *   3. Write to a temp file in documentDirectory via expo-file-system.
 *   4. Share via expo-sharing.
 *   5. Clean up temp file (best-effort).
 *
 * Export is always read-only — it never modifies state.
 */
export async function exportBackup(): Promise<void> {
  const state = useHydrationStore.getState();

  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10); // "YYYY-MM-DD"
  const filename = `siply-backup-${dateStr}.siply.json`;

  const backup: SiplyBackup = {
    backupVersion: 1,
    exportedAt: today.toISOString(),
    appVersion: Constants.expoConfig?.version ?? "?",
    schemaVersion: SCHEMA_VERSION,
    settings: state.settings,
    progress: state.progress,
    quickLog: state.quickLog,
    history: state.history,
    // Excluded: hydrated (runtime flag), onboarding (restore implies completed)
  };

  const json = JSON.stringify(backup, null, 2);

  const file = new File(Paths.document, filename);

  try {
    await file.write(json);
  } catch {
    Alert.alert(
      "Export failed",
      "Could not create backup file. Free some storage and try again."
    );
    return;
  }

  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: "application/json",
      dialogTitle: "Save Siply backup",
      UTI: "public.json",
    });
  } catch {
    // User dismissed share sheet or it failed — not an error worth surfacing.
  }

  // Clean up temp file (best-effort — ignore errors).
  try {
    await file.delete();
  } catch {
    // Ignore cleanup errors.
  }
}
