import type { SiplyBackup } from "./types";

export type ValidationResult =
  | { valid: true; backup: SiplyBackup }
  | { valid: false; reason: string };

/**
 * Validates that `parsed` is a structurally-sound SiplyBackup object.
 *
 * Checks (3.2 step 4 of EXPORT_IMPORT_DESIGN.md):
 *   - backupVersion === 1
 *   - exportedAt is a non-empty string
 *   - schemaVersion is a finite number
 *   - settings, progress, quickLog, history are all plain objects
 *
 * Does NOT deep-validate individual fields — that is left to the
 * normalize* functions (step 5 of the import pipeline).
 */
export function validateSiplyBackup(parsed: unknown): ValidationResult {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { valid: false, reason: "File content is not a JSON object." };
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.backupVersion !== 1) {
    return {
      valid: false,
      reason: `Unrecognised backup version: ${JSON.stringify(obj.backupVersion)}. This backup was created by a different version of Siply.`,
    };
  }

  if (typeof obj.exportedAt !== "string" || obj.exportedAt.length === 0) {
    return {
      valid: false,
      reason: "Missing or invalid exportedAt timestamp.",
    };
  }

  if (typeof obj.schemaVersion !== "number" || !Number.isFinite(obj.schemaVersion)) {
    return {
      valid: false,
      reason: "Missing or invalid schemaVersion.",
    };
  }

  if (!obj.settings || typeof obj.settings !== "object" || Array.isArray(obj.settings)) {
    return { valid: false, reason: "Missing or invalid settings object." };
  }

  if (!obj.progress || typeof obj.progress !== "object" || Array.isArray(obj.progress)) {
    return { valid: false, reason: "Missing or invalid progress object." };
  }

  if (!obj.quickLog || typeof obj.quickLog !== "object" || Array.isArray(obj.quickLog)) {
    return { valid: false, reason: "Missing or invalid quickLog object." };
  }

  if (!obj.history || typeof obj.history !== "object" || Array.isArray(obj.history)) {
    return { valid: false, reason: "Missing or invalid history object." };
  }

  return { valid: true, backup: parsed as SiplyBackup };
}
