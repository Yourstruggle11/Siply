import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock react-native (Alert) ─────────────────────────────────────────────────
// Prevent Vitest from parsing react-native's Flow-typed source.
vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
}));

// ── Mock expo-file-system ───────────────────────────────────────────────────
const { mockWrite, mockDelete, mockFile } = vi.hoisted(() => {
  const mockWrite = vi.fn().mockResolvedValue(undefined);
  const mockDelete = vi.fn().mockResolvedValue(undefined);
  const mockFile = vi.fn().mockImplementation(function(dir, file) {
    let uri = "";
    if (arguments.length === 2 && arguments[0] === "file:///tmp") {
      uri = arguments[0] + "/" + arguments[1];
    } else {
      uri = arguments[0];
    }
    return { write: mockWrite, delete: mockDelete, uri };
  });
  return { mockWrite, mockDelete, mockFile };
});

vi.mock("expo-file-system", () => ({
  Paths: { document: "file:///tmp" },
  File: mockFile,
}));

// ── Mock expo-sharing ────────────────────────────────────────────────────────
vi.mock("expo-sharing", () => ({
  shareAsync: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock expo-constants ──────────────────────────────────────────────────────
vi.mock("expo-constants", () => ({
  default: { expoConfig: { version: "1.0.1" } },
}));

// ── Mock AsyncStorage (required by Zustand persist) ──────────────────────────
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  },
}));

// ── Import modules AFTER mocks are set up ────────────────────────────────────
import * as Sharing from "expo-sharing";
import { exportBackup } from "../backup/export";
import { useHydrationStore } from "../state/hydrationStore";
import { SCHEMA_VERSION } from "../../../core/constants";

// ── Seed store state for tests ────────────────────────────────────────────────
const SEED_STATE = {
  settings: {
    targetLiters: 3.0,
    windowStart: "07:00",
    windowEnd: "23:00",
    sipMl: 15,
    escalationEnabled: true,
    soundEnabled: true,
    appearanceMode: "dark" as const,
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
      logHours: Array<number>(24).fill(0),
    },
  },
};

describe("exportBackup", () => {
  beforeEach(() => {
    useHydrationStore.setState(SEED_STATE);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("writes a JSON file to documentDirectory with correct filename shape", async () => {
    await exportBackup();

    expect(mockWrite).toHaveBeenCalledOnce();
    // URI must start with documentDirectory and end with .siply.json
    expect(mockFile).toHaveBeenCalledWith(
      "file:///tmp",
      expect.stringMatching(/^siply-backup-\d{4}-\d{2}-\d{2}\.siply\.json$/)
    );
  });

  it("produces a backup object with all required top-level fields", async () => {
    await exportBackup();

    const [json] = mockWrite.mock.calls[0];
    const backup = JSON.parse(json as string);

    expect(backup.backupVersion).toBe(1);
    expect(typeof backup.exportedAt).toBe("string");
    expect(backup.appVersion).toBe("1.0.1");
    expect(backup.schemaVersion).toBe(SCHEMA_VERSION);
    expect(backup.settings).toEqual(SEED_STATE.settings);
    expect(backup.progress).toEqual(SEED_STATE.progress);
    expect(backup.quickLog).toEqual(SEED_STATE.quickLog);
    expect(backup.history).toEqual(SEED_STATE.history);
  });

  it("does NOT include onboarding or hydrated in the backup", async () => {
    await exportBackup();

    const [json] = mockWrite.mock.calls[0];
    const backup = JSON.parse(json as string);

    expect(backup).not.toHaveProperty("onboarding");
    expect(backup).not.toHaveProperty("hydrated");
  });

  it("calls shareAsync with mimeType application/json", async () => {
    await exportBackup();

    expect(Sharing.shareAsync).toHaveBeenCalledOnce();
    const [, options] = vi.mocked(Sharing.shareAsync).mock.calls[0];
    expect(options?.mimeType).toBe("application/json");
  });

  it("cleans up temp file after sharing", async () => {
    await exportBackup();
    expect(mockDelete).toHaveBeenCalledOnce();
  });

  it("shows an alert and stops if writeAsStringAsync throws (disk full)", async () => {
    mockWrite.mockRejectedValueOnce(
      new Error("ENOSPC: no space left on device")
    );

    // Alert is mocked at the module level — get a reference to the mock.
    const { Alert } = await import("react-native");
    const alertSpy = vi.mocked(Alert.alert);
    alertSpy.mockClear();

    await exportBackup();

    expect(alertSpy).toHaveBeenCalledOnce();
    const [title] = alertSpy.mock.calls[0];
    expect(title).toContain("Export");
    // shareAsync must NOT have been called (we returned early).
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it("does not throw if shareAsync fails (user dismissed sheet)", async () => {
    vi.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error("dismissed"));
    await expect(exportBackup()).resolves.not.toThrow();
  });

  it("does not mutate the Zustand store state", async () => {
    const before = JSON.stringify(useHydrationStore.getState().settings);
    await exportBackup();
    const after = JSON.stringify(useHydrationStore.getState().settings);
    expect(after).toBe(before);
  });
});
