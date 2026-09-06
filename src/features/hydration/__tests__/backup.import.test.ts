import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock react-native (Alert) ─────────────────────────────────────────────────
// Prevent Vitest from parsing react-native's Flow-typed source.
vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
}));

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

// ── Mock notifier (rescheduleNotifications) ───────────────────────────────────
vi.mock("../notifications/notifier", () => ({
  rescheduleNotifications: vi.fn().mockResolvedValue(undefined),
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
import * as DocumentPicker from "expo-document-picker";
import { importBackup } from "../backup/import";
import { useHydrationStore } from "../state/hydrationStore";
import * as notifier from "../notifications/notifier";

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
    appearanceMode: "light",
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
  progress: { date: TODAY, consumedMl: 1000 },
  quickLog: { presets: [100, 200, 250, 500], lastUsedMl: 200 },
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
    vi.mocked(notifier.rescheduleNotifications); // keep import live
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

  it("calls rescheduleNotifications after a successful import", async () => {
    vi.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue(PICKED_RESULT as any);
    mockText.mockResolvedValue(VALID_BACKUP_JSON);
    mockAlertConfirm(true);

    await importBackup();

    expect(notifier.rescheduleNotifications).toHaveBeenCalledOnce();
  });

  it("does not call rescheduleNotifications if user cancels confirmation", async () => {
    vi.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue(PICKED_RESULT as any);
    mockText.mockResolvedValue(VALID_BACKUP_JSON);
    mockAlertConfirm(false);

    await importBackup();

    expect(notifier.rescheduleNotifications).not.toHaveBeenCalled();
  });
});
