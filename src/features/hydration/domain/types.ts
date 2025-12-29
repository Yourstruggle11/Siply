export type HydrationSettings = {
  targetLiters: number;
  windowStart: string;
  windowEnd: string;
  intervalMinutes: number;
  sipMl: number;
  escalationEnabled: boolean;
  soundEnabled: boolean;
  appearanceMode: "light" | "dark";
};

export type HydrationProgress = {
  date: string;
  consumedMl: number;
};

export type OnboardingState = {
  completed: boolean;
};

export type HydrationPlan = {
  targetMl: number;
  remindersPerDay: number;
  mlPerReminder: number;
  sipsPerReminder: number;
  nextReminderAt: Date | null;
};
