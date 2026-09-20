import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { canScheduleExactAlarms, openSettings } from "react-native-permissions";
import { STORAGE_KEYS } from "../../../core/storage/keys";

const PROMPT_KEY = "siply:precise_timing_prompt:v1";
const LAST_STATUS_KEY = "siply:precise_timing_status:v1";
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type PromptState = {
  shownCount: number;
  nextEligibleAt: string | null;
  neverShow: boolean;
};

const supported = () => Platform.OS === "android" && Number(Platform.Version) >= 31;

export const getPreciseTimingStatus = async () => {
  if (!supported()) return { supported: false, enabled: false };
  try {
    return { supported: true, enabled: await canScheduleExactAlarms() };
  } catch {
    return { supported: true, enabled: false };
  }
};

export const openPreciseTimingSettings = async () => {
  if (!supported()) return;
  await openSettings("alarms");
};

const readPromptState = async (): Promise<PromptState> => {
  try {
    const raw = await AsyncStorage.getItem(PROMPT_KEY);
    return raw
      ? JSON.parse(raw) as PromptState
      : { shownCount: 0, nextEligibleAt: null, neverShow: false };
  } catch {
    return { shownCount: 0, nextEligibleAt: null, neverShow: false };
  }
};

export const shouldShowPreciseTimingPrompt = async (notificationsGranted: boolean, now = new Date()) => {
  if (!supported() || !notificationsGranted || (await getPreciseTimingStatus()).enabled) return false;
  const [state, firstLaunchRaw] = await Promise.all([
    readPromptState(),
    AsyncStorage.getItem(STORAGE_KEYS.firstLaunchAt),
  ]);
  if (state.neverShow || state.shownCount >= 2) return false;
  let firstLaunch: Date | null = null;
  try {
    firstLaunch = firstLaunchRaw ? new Date(JSON.parse(firstLaunchRaw) as string) : null;
  } catch {
    firstLaunch = null;
  }
  if (!firstLaunch || !Number.isFinite(firstLaunch.getTime())) return false;
  if (now.getTime() - firstLaunch.getTime() < THREE_DAYS_MS) return false;
  if (state.nextEligibleAt && new Date(state.nextEligibleAt) > now) return false;
  return true;
};

/**
 * Detects grant/revocation changes. A changed exact-alarm capability requires
 * reinstalling the pending plan so Android uses the correct trigger type.
 */
export const consumePreciseTimingStatusChange = async () => {
  const status = await getPreciseTimingStatus();
  if (!status.supported) return false;
  const previous = await AsyncStorage.getItem(LAST_STATUS_KEY);
  await AsyncStorage.setItem(LAST_STATUS_KEY, status.enabled ? "enabled" : "disabled");
  return previous !== null && previous !== (status.enabled ? "enabled" : "disabled");
};

export const dismissPreciseTimingPrompt = async (neverShow = false, now = new Date()) => {
  const current = await readPromptState();
  const shownCount = Math.min(2, current.shownCount + 1);
  const next: PromptState = {
    shownCount,
    neverShow: neverShow || shownCount >= 2,
    nextEligibleAt: shownCount < 2
      ? new Date(now.getTime() + THIRTY_DAYS_MS).toISOString()
      : null,
  };
  await AsyncStorage.setItem(PROMPT_KEY, JSON.stringify(next));
};
