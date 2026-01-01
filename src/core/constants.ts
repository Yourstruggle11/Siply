import { HydrationSettings } from "../features/hydration/domain/types";

export const APP_NAME = "Siply";
export const TAGLINE = "drink water, on time.";

export const SCHEMA_VERSION = 2;

export const MIN_INTERVAL_MINUTES = 30;
export const MAX_NOTIFICATIONS_PER_DAY = 48;
export const NUDGE_MINUTES = [5, 10] as const;
export const REMINDER_TARGET_ML = 200;
export const NOTIFICATION_CATEGORY_ID = "siply-reminder";
export const NOTIFICATION_ACTION_LOG = "LOG_DRINK";
export const DEFAULT_GENTLE_GOAL_THRESHOLD = 60;
export const DEFAULT_QUICK_LOG_PRESETS = [100, 200, 250, 500];
export const QUICK_LOG_MIN_PRESETS = 3;
export const QUICK_LOG_MAX_PRESETS = 8;
export const HISTORY_RETENTION_DAYS = 120;
export const ENABLE_DIAGNOSTICS =
  process.env.EXPO_PUBLIC_SIPLY_DIAGNOSTICS === "1" ||
  process.env.EXPO_PUBLIC_SIPLY_DIAGNOSTICS === "true";

export const DEFAULT_SETTINGS: HydrationSettings = {
  targetLiters: 3.0,
  windowStart: "07:00",
  windowEnd: "23:00",
  sipMl: 15,
  escalationEnabled: true,
  soundEnabled: true,
  appearanceMode: "dark",
  gentleGoalEnabled: false,
  gentleGoalThreshold: DEFAULT_GENTLE_GOAL_THRESHOLD,
};
