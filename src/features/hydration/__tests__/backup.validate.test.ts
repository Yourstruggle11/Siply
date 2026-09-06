import { describe, it, expect } from "vitest";
import { validateSiplyBackup } from "../backup/validate";

// A fully-valid backup object that satisfies every check.
const VALID_BACKUP = {
  backupVersion: 1,
  exportedAt: "2026-09-06T15:30:00.000Z",
  appVersion: "1.0.1",
  schemaVersion: 2,
  settings: {
    targetLiters: 3.0,
    windowStart: "07:00",
    windowEnd: "23:00",
    sipMl: 15,
    escalationEnabled: true,
    soundEnabled: true,
    appearanceMode: "dark",
    gentleGoalEnabled: false,
    gentleGoalThreshold: 60,
  },
  progress: { date: "2026-09-06", consumedMl: 1500 },
  quickLog: { presets: [100, 200, 250, 500], lastUsedMl: 200 },
  history: {
    "2026-09-05": {
      date: "2026-09-05",
      totalMl: 2800,
      goalMl: 3000,
      goodThresholdMl: 1800,
      logHours: Array(24).fill(0),
    },
  },
};

describe("validateSiplyBackup", () => {
  it("accepts a fully-valid backup", () => {
    const result = validateSiplyBackup(VALID_BACKUP);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.backup.backupVersion).toBe(1);
      expect(result.backup.schemaVersion).toBe(2);
    }
  });

  it("rejects null input", () => {
    const result = validateSiplyBackup(null);
    expect(result.valid).toBe(false);
  });

  it("rejects a plain array", () => {
    const result = validateSiplyBackup([1, 2, 3]);
    expect(result.valid).toBe(false);
  });

  it("rejects a JSON string (not an object)", () => {
    const result = validateSiplyBackup("not an object");
    expect(result.valid).toBe(false);
  });

  it("rejects wrong backupVersion (version 2)", () => {
    const result = validateSiplyBackup({ ...VALID_BACKUP, backupVersion: 2 });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("Unrecognised backup version");
    }
  });

  it("rejects missing backupVersion", () => {
    const { backupVersion: _bv, ...rest } = VALID_BACKUP;
    const result = validateSiplyBackup(rest);
    expect(result.valid).toBe(false);
  });

  it("rejects missing exportedAt", () => {
    const { exportedAt: _e, ...rest } = VALID_BACKUP;
    const result = validateSiplyBackup(rest);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("exportedAt");
    }
  });

  it("rejects empty string exportedAt", () => {
    const result = validateSiplyBackup({ ...VALID_BACKUP, exportedAt: "" });
    expect(result.valid).toBe(false);
  });

  it("rejects non-number schemaVersion", () => {
    const result = validateSiplyBackup({ ...VALID_BACKUP, schemaVersion: "2" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("schemaVersion");
    }
  });

  it("rejects NaN schemaVersion", () => {
    const result = validateSiplyBackup({ ...VALID_BACKUP, schemaVersion: NaN });
    expect(result.valid).toBe(false);
  });

  it("rejects missing settings object", () => {
    const { settings: _s, ...rest } = VALID_BACKUP;
    const result = validateSiplyBackup(rest);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("settings");
    }
  });

  it("rejects settings as an array", () => {
    const result = validateSiplyBackup({ ...VALID_BACKUP, settings: [] });
    expect(result.valid).toBe(false);
  });

  it("rejects missing progress object", () => {
    const { progress: _p, ...rest } = VALID_BACKUP;
    const result = validateSiplyBackup(rest);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("progress");
    }
  });

  it("rejects missing quickLog object", () => {
    const { quickLog: _q, ...rest } = VALID_BACKUP;
    const result = validateSiplyBackup(rest);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("quickLog");
    }
  });

  it("rejects missing history object", () => {
    const { history: _h, ...rest } = VALID_BACKUP;
    const result = validateSiplyBackup(rest);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("history");
    }
  });

  it("rejects history as null", () => {
    const result = validateSiplyBackup({ ...VALID_BACKUP, history: null });
    expect(result.valid).toBe(false);
  });

  it("accepts an empty history object", () => {
    // An empty {} is still a valid object — history may be empty on a fresh install.
    const result = validateSiplyBackup({ ...VALID_BACKUP, history: {} });
    expect(result.valid).toBe(true);
  });
});
