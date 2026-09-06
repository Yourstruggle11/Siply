import type {
  HydrationHistory,
  HydrationProgress,
  HydrationSettings,
  QuickLogState,
} from "../domain/types";

/**
 * SiplyBackup — the shape of a .siply.json backup file.
 *
 * backupVersion: backup FORMAT version (independent of SCHEMA_VERSION).
 * schemaVersion: the Zustand persist SCHEMA_VERSION at time of export,
 *   so the importer knows whether to run normalisation for missing fields.
 */
export type SiplyBackup = {
  /** Backup format version. Currently always 1. */
  backupVersion: 1;

  /** ISO 8601 timestamp of when this export was created. */
  exportedAt: string;

  /** App version at time of export (from Constants.expoConfig?.version). */
  appVersion: string;

  /**
   * The Zustand persist SCHEMA_VERSION at time of export.
   * Used during import to decide whether normalize* functions need to fill
   * in fields that did not exist in older schema versions.
   */
  schemaVersion: number;

  /** User settings. */
  settings: HydrationSettings;

  /** Today's progress snapshot at time of export. */
  progress: HydrationProgress;

  /** Quick-log presets and last-used amount. */
  quickLog: QuickLogState;

  /**
   * Full hydration history (up to 120 days).
   * Record<"YYYY-MM-DD", HydrationDaySummary>.
   */
  history: HydrationHistory;
};
