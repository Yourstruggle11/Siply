export type AppearanceMode = "light" | "dark" | "system";
export type DisplayUnit = "ml" | "fl oz" | "cups";
export type ReminderTone = "encouraging" | "minimal" | "playful";

export type HydrationSettings = {
  targetLiters: number;
  windowStart: string; // HH:mm
  windowEnd: string;
  sipMl: number;
  escalationEnabled: boolean;
  soundEnabled: boolean;
  appearanceMode: AppearanceMode;
  displayUnit: DisplayUnit;
  gentleGoalEnabled: boolean;
  gentleGoalThreshold: number;
  tone?: ReminderTone;
};

export type HydrationProgress = {
  date: string;
  consumedMl: number;
};

export type OnboardingState = {
  completed: boolean;
};

export type DrinkPreset = {
  id: string;
  name: string;
  icon: string;
  amountMl: number;
};

export type QuickLogState = {
  presets: DrinkPreset[];
  lastUsedMl: number | null;
  lastLogAt: string | null;
};

export type LogEntry = {
  /** Stable unique ID (Date.now-based with random suffix for same-ms safety). */
  id: string;
  /** ISO 8601 timestamp of when this entry was logged. */
  timestamp: string;
  /** Amount consumed in ml. Always > 0. */
  amountMl: number;
};

export type HydrationDaySummary = {
  date: string;
  totalMl: number;
  goalMl: number;
  goodThresholdMl: number;
  logHours: number[];

  /**
   * Per-entry log for this day. Present for recent days (within the 7-day
   * entry retention window). Absent for older days or pre-migration history.
   *
   * When present, this is the SOURCE OF TRUTH. totalMl and logHours are
   * derived from entries and kept in sync for cheap reads.
   *
   * When absent (undefined), totalMl and logHours are the only data
   * available (legacy / summary-only mode).
   */
  entries?: LogEntry[];
};

export type HydrationHistory = Record<string, HydrationDaySummary>;

export type HydrationPlan = {
  targetMl: number;
  remindersPerDay: number;
  mlPerReminder: number;
  sipsPerReminder: number;
  nextReminderAt: Date | null;
  targetMet: boolean;
  remainingMl: number;
  consumedMl: number;
};
