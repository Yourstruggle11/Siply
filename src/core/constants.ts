import { DrinkPreset, HydrationSettings } from "../features/hydration/domain/types";

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
export const DEFAULT_QUICK_LOG_PRESETS: DrinkPreset[] = [
  { id: "preset-water-250", name: "Glass of Water", icon: "cup-water", amountMl: 250 },
  { id: "preset-coffee-150", name: "Coffee", icon: "coffee", amountMl: 150 },
  { id: "preset-bottle-500", name: "Water Bottle", icon: "bottle-tonic", amountMl: 500 },
];
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
  appearanceMode: "system",
  displayUnit: "ml",
  gentleGoalEnabled: false,
  gentleGoalThreshold: DEFAULT_GENTLE_GOAL_THRESHOLD,
};
