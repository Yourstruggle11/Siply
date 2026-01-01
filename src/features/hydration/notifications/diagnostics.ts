import AsyncStorage from "@react-native-async-storage/async-storage";

const DIAGNOSTICS_KEY = "siply:notification_diagnostics:v1";

export type ScheduleDiagnostics = {
  source: "reschedule";
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
  lastSchedule?: ScheduleDiagnostics;
  lastTest?: TestNotificationDiagnostics;
};

const readState = async (): Promise<NotificationDiagnosticsState> => {
  try {
    const raw = await AsyncStorage.getItem(DIAGNOSTICS_KEY);
    if (!raw) {
      return {};
    }
    return JSON.parse(raw) as NotificationDiagnosticsState;
  } catch {
    return {};
  }
};

const writeState = async (next: NotificationDiagnosticsState) => {
  await AsyncStorage.setItem(DIAGNOSTICS_KEY, JSON.stringify(next));
};

export const loadNotificationDiagnostics = async () => {
  return readState();
};

export const recordScheduleDiagnostics = async (payload: ScheduleDiagnostics) => {
  const current = await readState();
  const next: NotificationDiagnosticsState = {
    ...current,
    lastSchedule: payload,
    updatedAt: new Date().toISOString(),
  };
  await writeState(next);
};

export const recordTestDiagnostics = async (payload: TestNotificationDiagnostics) => {
  const current = await readState();
  const next: NotificationDiagnosticsState = {
    ...current,
    lastTest: payload,
    updatedAt: new Date().toISOString(),
  };
  await writeState(next);
};

export const clearNotificationDiagnostics = async () => {
  await AsyncStorage.removeItem(DIAGNOSTICS_KEY);
};
