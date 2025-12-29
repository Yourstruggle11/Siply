import { HydrationSettings } from "../features/hydration/domain/types";

export const APP_NAME = "Siply";
export const TAGLINE = "drink water, on time.";

export const SCHEMA_VERSION = 1;

export const MIN_INTERVAL_MINUTES = 30;
export const MAX_NOTIFICATIONS_PER_DAY = 48;
export const NUDGE_MINUTES = [5, 10] as const;

export const DEFAULT_SETTINGS: HydrationSettings = {
  targetLiters: 3.0,
  windowStart: "07:00",
  windowEnd: "23:00",
  intervalMinutes: 60,
  sipMl: 15,
  escalationEnabled: true,
  soundEnabled: true,
  appearanceMode: "light",
};
