export type HydrationSettings = {
  targetLiters: number;
  windowStart: string;
  windowEnd: string;
  sipMl: number;
  escalationEnabled: boolean;
  soundEnabled: boolean;
  appearanceMode: "light" | "dark";
  gentleGoalEnabled: boolean;
  gentleGoalThreshold: number;
};

export type HydrationProgress = {
  date: string;
  consumedMl: number;
};

export type OnboardingState = {
  completed: boolean;
};

export type QuickLogState = {
  presets: number[];
  lastUsedMl: number | null;
};

export type HydrationDaySummary = {
  date: string;
  totalMl: number;
  goalMl: number;
  goodThresholdMl: number;
  logHours: number[];
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
};
