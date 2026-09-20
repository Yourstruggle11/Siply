import AsyncStorage from "@react-native-async-storage/async-storage";

const DIAGNOSTICS_KEY = "siply:notification_diagnostics:v2";
const LEGACY_DIAGNOSTICS_KEY = "siply:notification_diagnostics:v1";
const MAX_EVENTS = 250;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
let writeQueue: Promise<void> = Promise.resolve();

export type NotificationDiagnosticEvent =
  | {
      type: "reconcile";
      at: string;
      source: string;
      planId: string;
      revision: number;
      dateKey: string;
      timezoneOffsetMinutes: number;
      remainingMl: number;
      desiredCount: number;
      scheduledCount: number;
      failedCount: number;
      plannedCount?: number;
      suppressedOptionalCount?: number;
      suppressedBaseCount?: number;
      extraneousCount?: number;
      health: string;
      urgencyMode: boolean;
      weekendAdjustmentMinutes: number;
      errors: string[];
    }
  | {
      type: "action";
      at: string;
      action: "skipped" | "snoozed" | "dismissed";
      familyId: string;
    }
  | {
      type: "background";
      at: string;
      result: "success" | "failed" | "restricted";
      durationMs: number;
      error?: string;
    }
  | {
      type: "test";
      at: string;
      success: boolean;
      error?: string;
    };

export type ScheduleDiagnostics = {
  source: string;
  at: string;
  consumedMl: number;
  settings: {
    targetLiters: number;
    windowStart: string;
    windowEnd: string;
    sipMl: number;
    escalationEnabled: boolean;
    soundEnabled: boolean;
  };
  result: {
    success: boolean;
    requested: number;
    scheduled: number;
    failed: number;
    errors: string[];
  };
};

export type TestNotificationDiagnostics = {
  at: string;
  success: boolean;
  error?: string;
};

export type NotificationDiagnosticsState = {
  updatedAt?: string;
  events: NotificationDiagnosticEvent[];
  lastSchedule?: ScheduleDiagnostics;
  lastTest?: TestNotificationDiagnostics;
};

const emptyState = (): NotificationDiagnosticsState => ({ events: [] });

const readState = async (): Promise<NotificationDiagnosticsState> => {
  try {
    const raw = await AsyncStorage.getItem(DIAGNOSTICS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as NotificationDiagnosticsState;
      return { ...parsed, events: Array.isArray(parsed.events) ? parsed.events : [] };
    }
    const legacy = await AsyncStorage.getItem(LEGACY_DIAGNOSTICS_KEY);
    if (!legacy) return emptyState();
    const parsed = JSON.parse(legacy) as Omit<NotificationDiagnosticsState, "events">;
    return { ...parsed, events: [] };
  } catch {
    return emptyState();
  }
};

const writeState = (state: NotificationDiagnosticsState) =>
  AsyncStorage.setItem(DIAGNOSTICS_KEY, JSON.stringify(state));

const serializeWrite = (operation: () => Promise<void>) => {
  writeQueue = writeQueue.then(operation, operation);
  return writeQueue;
};

const trimEvents = (events: NotificationDiagnosticEvent[], now = Date.now()) =>
  events
    .filter((event) => {
      const timestamp = new Date(event.at).getTime();
      return Number.isFinite(timestamp) && timestamp >= now - RETENTION_MS;
    })
    .slice(-MAX_EVENTS);

export const loadNotificationDiagnostics = readState;

export const recordNotificationDiagnostic = (event: NotificationDiagnosticEvent) =>
  serializeWrite(async () => {
    const current = await readState();
    await writeState({
      ...current,
      events: trimEvents([...current.events, event]),
      updatedAt: new Date().toISOString(),
    });
  });

// Compatibility helpers retained for the test-notification and older callers.
export const recordScheduleDiagnostics = (payload: ScheduleDiagnostics) =>
  serializeWrite(async () => {
    const current = await readState();
    await writeState({
      ...current,
      lastSchedule: payload,
      events: trimEvents(current.events),
      updatedAt: new Date().toISOString(),
    });
  });

export const recordTestDiagnostics = (payload: TestNotificationDiagnostics) =>
  serializeWrite(async () => {
    const current = await readState();
    await writeState({
      ...current,
      lastTest: payload,
      events: trimEvents([
        ...current.events,
        { type: "test", ...payload },
      ]),
      updatedAt: new Date().toISOString(),
    });
  });

export const clearNotificationDiagnostics = async () => {
  await Promise.all([
    AsyncStorage.removeItem(DIAGNOSTICS_KEY),
    AsyncStorage.removeItem(LEGACY_DIAGNOSTICS_KEY),
  ]);
};
