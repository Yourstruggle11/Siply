import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock react-native (Alert) ─────────────────────────────────────────────────
// React Native is mocked centrally in vitest.setup.ts.

// ── Mock expo-document-picker ─────────────────────────────────────────────────
vi.mock("expo-document-picker", () => ({
  getDocumentAsync: vi.fn(),
}));

// ── Mock expo-file-system ─────────────────────────────────────────────────────
const { mockText, mockFile } = vi.hoisted(() => {
  const mockText = vi.fn();
  const mockFile = vi.fn().mockImplementation(function(uri) {
    return { text: mockText };
  });
  return { mockText, mockFile };
});

vi.mock("expo-file-system", () => ({
  File: mockFile,
}));

// ── Mock schedule engine (forceReconcile) ─────────────────────────────────────
vi.mock("../notifications/scheduleEngine", () => ({
  forceReconcile: vi.fn().mockResolvedValue(null),
}));

// ── Mock AsyncStorage ─────────────────────────────────────────────────────────
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  },
}));

// ── Import after mocks ─────────────────────────────────────────────────────────
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import { importBackup, processBackupUri } from "../backup/import";
import { useHydrationStore } from "../state/hydrationStore";
import * as scheduleEngine from "../notifications/scheduleEngine";
import { DEFAULT_SETTINGS } from "../../../core/constants";

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeDay = (date: string, totalMl: number) => ({
  date,
  totalMl,
  goalMl: 3000,
  goodThresholdMl: 1800,
  logHours: Array<number>(24).fill(0),
});

const TODAY = new Date().toISOString().slice(0, 10);

const VALID_BACKUP_JSON = JSON.stringify({
  backupVersion: 1,
  exportedAt: "2026-09-06T15:30:00.000Z",
  appVersion: "1.0.1",
  schemaVersion: 2,
  settings: {
    targetLiters: 2.5,
    windowStart: "08:00",
    windowEnd: "22:00",
    sipMl: 20,
    escalationEnabled: false,
    soundEnabled: false,
    appearanceMode: "dark",
    displayUnit: "ml",
    gentleGoalEnabled: true,
    gentleGoalThreshold: 70,
  },
  progress: { date: TODAY, consumedMl: 500 },
  quickLog: { presets: [150, 300, 400], lastUsedMl: 150 },
  history: {
    "2026-09-05": makeDay("2026-09-05", 2800),
    "2026-09-04": makeDay("2026-09-04", 3000),
  },
});

const INITIAL_STATE = {
  settings: {
    ...DEFAULT_SETTINGS,
    targetLiters: 3.0,
    windowStart: "07:00",
    windowEnd: "23:00",
    sipMl: 15,
    escalationEnabled: true,
    soundEnabled: true,
    appearanceMode: "dark" as const,
    displayUnit: "ml" as const,
    gentleGoalEnabled: false,
    gentleGoalThreshold: 60,
  },
  progress: { date: TODAY, consumedMl: 1000 },
  quickLog: { presets: [{id: '1', name: '1', icon: '1', amountMl: 100}, {id: '2', name: '2', icon: '1', amountMl: 200}, {id: '3', name: '3', icon: '1', amountMl: 250}, {id: '4', name: '4', icon: '1', amountMl: 500}], lastUsedMl: 200, lastLogAt: null },
  history: {
    "2026-09-05": makeDay("2026-09-05", 1000), // existing — backup has higher totalMl
    "2026-09-03": makeDay("2026-09-03", 2000), // current-only — must be preserved
  },
};

// Helper: make a cancelled picker result
const CANCELLED_RESULT = { canceled: true, assets: [] };

// Helper: make a successful picker result
const PICKED_RESULT = {
  canceled: false,
  assets: [{ uri: "file:///cache/backup.siply.json", name: "backup.siply.json", mimeType: "application/json" }],
};

// Helper: mock Alert.alert so confirmation dialog auto-confirms or auto-cancels
function mockAlertConfirm(confirm: boolean) {
  const alertMock = vi.mocked(Alert.alert);
  alertMock.mockImplementation((_title, _msg, buttons) => {
    const target = (buttons as any[])?.find((b) => b.text === (confirm ? "Restore" : "Cancel"));
    target?.onPress?.();
  });
  return alertMock;
}

describe("importBackup", () => {
  beforeEach(() => {
    useHydrationStore.setState(INITIAL_STATE);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Cancellation flows ───────────────────────────────────────────────────────

  it("returns silently when user cancels the file picker", async () => {
    vi.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue(CANCELLED_RESULT as any);
    const stateBefore = JSON.stringify(useHydrationStore.getState());

    await importBackup();

    const stateAfter = JSON.stringify(useHydrationStore.getState());
    expect(stateAfter).toBe(stateBefore);
  });

  it("returns silently when file picker has no assets", async () => {
    vi.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({ canceled: false, assets: [] } as any);
    const stateBefore = JSON.stringify(useHydrationStore.getState());

    await importBackup();

    expect(JSON.stringify(useHydrationStore.getState())).toBe(stateBefore);
  });

  // ── Read / parse failures ────────────────────────────────────────────────────

  it("shows error alert and leaves state untouched when file read fails", async () => {
    vi.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue(PICKED_RESULT as any);
    vi.mocked(scheduleEngine.forceReconcile); // keep import live
    mockText.mockRejectedValue(new Error("read error"));
    const stateBefore = JSON.stringify(useHydrationStore.getState());
    vi.mocked(Alert.alert).mockClear();

    await importBackup();

    expect(vi.mocked(Alert.alert)).toHaveBeenCalledOnce();
    expect(JSON.stringify(useHydrationStore.getState())).toBe(stateBefore);
  });

  it("shows error alert and leaves state untouched when file is not valid JSON", async () => {
    vi.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue(PICKED_RESULT as any);
    mockText.mockResolvedValue("{ this is not: json }}}");
    const stateBefore = JSON.stringify(useHydrationStore.getState());
    vi.mocked(Alert.alert).mockClear();

    await importBackup();

    expect(vi.mocked(Alert.alert)).toHaveBeenCalledOnce();
    const [, msg] = vi.mocked(Alert.alert).mock.calls[0];
    expect(msg).toContain("valid JSON");
    expect(JSON.stringify(useHydrationStore.getState())).toBe(stateBefore);
  });

  // ── Schema validation failures ────────────────────────────────────────────────

  it("shows error alert when backup has wrong backupVersion (corrupt schema)", async () => {
    vi.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue(PICKED_RESULT as any);
    mockText.mockResolvedValue(
      JSON.stringify({ backupVersion: 99, exportedAt: "x", schemaVersion: 2, settings: {}, progress: {}, quickLog: {}, history: {} })
    );
    const stateBefore = JSON.stringify(useHydrationStore.getState());
    vi.mocked(Alert.alert).mockClear();

    await importBackup();

    expect(vi.mocked(Alert.alert)).toHaveBeenCalledOnce();
    const [, msg] = vi.mocked(Alert.alert).mock.calls[0];
    expect(msg).toContain("not a valid Siply backup");
    expect(JSON.stringify(useHydrationStore.getState())).toBe(stateBefore);
  });

  it("leaves state untouched when backup is missing the history field", async () => {
    const noHistory = JSON.parse(VALID_BACKUP_JSON);
    delete noHistory.history;
    vi.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue(PICKED_RESULT as any);
    mockText.mockResolvedValue(JSON.stringify(noHistory));
    const stateBefore = JSON.stringify(useHydrationStore.getState());
    vi.mocked(Alert.alert).mockClear();

    await importBackup();

    expect(JSON.stringify(useHydrationStore.getState())).toBe(stateBefore);
  });

  it("silently ignores unrelated JSON from a generic incoming URI", async () => {
    mockText.mockResolvedValue(JSON.stringify({ unrelated: true }));
    const stateBefore = JSON.stringify(useHydrationStore.getState());
    vi.mocked(Alert.alert).mockClear();

    await processBackupUri("content://documents/42", { silentInvalid: true });

    expect(vi.mocked(Alert.alert)).not.toHaveBeenCalled();
    expect(JSON.stringify(useHydrationStore.getState())).toBe(stateBefore);
  });

  it("accepts a valid backup from a generic incoming URI without a filename", async () => {
    mockText.mockResolvedValue(VALID_BACKUP_JSON);
    mockAlertConfirm(true);

    await processBackupUri("file://documents/42", { silentInvalid: true });

    expect(useHydrationStore.getState().settings.targetLiters).toBe(2.5);
    expect(scheduleEngine.forceReconcile).toHaveBeenCalledOnce();
  });

  // ── Confirmation dialog rejection ─────────────────────────────────────────────

  it("leaves state completely untouched when user cancels the confirmation dialog", async () => {
    vi.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue(PICKED_RESULT as any);
    mockText.mockResolvedValue(VALID_BACKUP_JSON);
    const alertSpy = mockAlertConfirm(false); // user taps Cancel
    const stateBefore = JSON.stringify(useHydrationStore.getState());

    await importBackup();

    const stateAfter = JSON.stringify(useHydrationStore.getState());
    expect(stateAfter).toBe(stateBefore);
    expect(alertSpy).toHaveBeenCalled();
  });

  // ── Successful import ──────────────────────────────────────────────────────────

  it("applies settings, progress, quickLog from backup to the store on confirm", async () => {
    vi.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue(PICKED_RESULT as any);
    mockText.mockResolvedValue(VALID_BACKUP_JSON);
    mockAlertConfirm(true);

    await importBackup();

    const state = useHydrationStore.getState();
    expect(state.settings.targetLiters).toBe(2.5);
    expect(state.settings.windowStart).toBe("08:00");
    // normalizeQuickLog converts raw number presets from backup to DrinkPreset objects
    expect(state.quickLog.presets).toEqual([
      { id: "legacy-0-150", name: "150", icon: "cup-water", amountMl: 150 },
      { id: "legacy-1-300", name: "300", icon: "cup-water", amountMl: 300 },
      { id: "legacy-2-400", name: "400", icon: "cup-water", amountMl: 400 },
    ]);
    // onboarding must be set to completed: true
    expect(state.onboarding.completed).toBe(true);
  });

  it("merges history — backup's higher totalMl wins on conflict", async () => {
    vi.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue(PICKED_RESULT as any);
    mockText.mockResolvedValue(VALID_BACKUP_JSON);
    mockAlertConfirm(true);

    await importBackup();

    const { history } = useHydrationStore.getState();
    // "2026-09-05": current=1000, backup=2800 → backup wins
    expect(history["2026-09-05"].totalMl).toBe(2800);
    // "2026-09-04": only in backup → added
    expect(history["2026-09-04"].totalMl).toBe(3000);
    // "2026-09-03": only in current → preserved
    expect(history["2026-09-03"].totalMl).toBe(2000);
  });

  it("does not double-count when importing the same backup twice", async () => {
    // First import
    vi.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue(PICKED_RESULT as any);
    mockText.mockResolvedValue(VALID_BACKUP_JSON);
    mockAlertConfirm(true);
    await importBackup();

    const afterFirst = JSON.parse(JSON.stringify(useHydrationStore.getState().history));

    vi.clearAllMocks();

    // Second import — same backup
    vi.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue(PICKED_RESULT as any);
    mockText.mockResolvedValue(VALID_BACKUP_JSON);
    mockAlertConfirm(true);
    await importBackup();

    const afterSecond = useHydrationStore.getState().history;
    expect(afterSecond["2026-09-05"].totalMl).toBe(afterFirst["2026-09-05"].totalMl);
    expect(afterSecond["2026-09-04"].totalMl).toBe(afterFirst["2026-09-04"].totalMl);
  });

  it("calls forceReconcile after a successful import", async () => {
    vi.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue(PICKED_RESULT as any);
    mockText.mockResolvedValue(VALID_BACKUP_JSON);
    mockAlertConfirm(true);

    await importBackup();

    expect(scheduleEngine.forceReconcile).toHaveBeenCalledOnce();
  });

  it("reports failure and restores the prior state when persistence fails", async () => {
    vi.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue(PICKED_RESULT as any);
    mockText.mockResolvedValue(VALID_BACKUP_JSON);
    mockAlertConfirm(true);
    vi.mocked(AsyncStorage.setItem).mockRejectedValueOnce(
      new Error("disk full")
    );

    await importBackup();

    const state = useHydrationStore.getState();
    expect(state.settings.targetLiters).toBe(INITIAL_STATE.settings.targetLiters);
    expect(state.progress).toEqual(INITIAL_STATE.progress);
    expect(state.history).toEqual(INITIAL_STATE.history);
    expect(vi.mocked(Alert.alert).mock.calls.some(([title]) => title === "Import failed")).toBe(true);
    expect(vi.mocked(Alert.alert).mock.calls.some(([title]) => title === "Backup restored")).toBe(false);
    expect(scheduleEngine.forceReconcile).not.toHaveBeenCalled();
  });

  it("does not call forceReconcile if user cancels confirmation", async () => {
    vi.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue(PICKED_RESULT as any);
    mockText.mockResolvedValue(VALID_BACKUP_JSON);
    mockAlertConfirm(false);

    await importBackup();

    expect(scheduleEngine.forceReconcile).not.toHaveBeenCalled();
  });
});
