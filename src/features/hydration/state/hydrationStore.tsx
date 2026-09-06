import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_QUICK_LOG_PRESETS,
  DEFAULT_SETTINGS,
  QUICK_LOG_MAX_PRESETS,
  QUICK_LOG_MIN_PRESETS,
  SCHEMA_VERSION,
} from "../../../core/constants";
import {
  hydrateStorage,
  normalizeOnboarding,
  normalizeProgress,
  normalizeQuickLog,
  normalizeSettings,
} from "../../../core/storage/migrations";
import { getDateKey } from "../../../core/time";
import { litersToMl } from "../domain/calculations";
import {
  HydrationHistory,
  HydrationProgress,
  HydrationSettings,
  OnboardingState,
  QuickLogState,
} from "../domain/types";
import {
  resetHistoryForDate,
  trimHistory,
  updateHistoryForLog,
  undoHistoryForLog,
  normalizeHistory,
} from "../domain/history";

export type HydrationState = {
  settings: HydrationSettings;
  progress: HydrationProgress;
  onboarding: OnboardingState;
  quickLog: QuickLogState;
  history: HydrationHistory;
  hydrated: boolean;
};

type HydrationActions = {
  updateSettings: (patch: Partial<HydrationSettings>) => Promise<void>;
  addConsumed: (amountMl: number) => Promise<void>;
  undoLastLog: (amountMl: number, hour: number) => Promise<void>;
  resetToday: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  refreshProgressDate: () => Promise<boolean>;
  updateQuickLogPresets: (presets: DrinkPreset[]) => Promise<void>;
  setHydrated: (hydrated: boolean) => void;
};

export type HydrationStore = HydrationState & HydrationActions;

export const migrateStorage = async (persistedState: unknown, version: number) => {
  const todayKey = getDateKey(new Date());
  
  if (!persistedState || Object.keys(persistedState as any).length === 0) {
    const legacyState = await hydrateStorage();
    return legacyState as any;
  }

  const state = persistedState as Partial<HydrationState>;
  return {
    settings: normalizeSettings(state.settings ?? null),
    progress: normalizeProgress(state.progress ?? null, todayKey),
    onboarding: normalizeOnboarding(state.onboarding ?? null),
    quickLog: normalizeQuickLog(state.quickLog ?? null),
    history: normalizeHistory(state.history ?? null),
  } as any;
};

export const useHydrationStore = create<HydrationStore>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      progress: { date: getDateKey(new Date()), consumedMl: 0 },
      onboarding: { completed: false },
      quickLog: { presets: DEFAULT_QUICK_LOG_PRESETS, lastUsedMl: null, lastLogAt: null },
      history: {},
      hydrated: false,

      setHydrated: (hydrated: boolean) => set({ hydrated }),

      updateSettings: async (patch: Partial<HydrationSettings>) => {
        set((state) => ({
          settings: { ...state.settings, ...patch },
        }));
      },

      addConsumed: async (amountMl: number) => {
        const { progress, history, settings, quickLog } = get();
        const todayKey = getDateKey(new Date());
        const baseProgress =
          progress.date === todayKey
            ? progress
            : { date: todayKey, consumedMl: 0 };

        const nextProgress: HydrationProgress = {
          date: todayKey,
          consumedMl: Math.max(0, baseProgress.consumedMl + amountMl),
        };

        const goalMl = litersToMl(settings.targetLiters);
        const goodThresholdMl = Math.round(
          (goalMl * settings.gentleGoalThreshold) / 100
        );

        const updatedHistory = updateHistoryForLog(
          history,
          new Date(),
          amountMl,
          goalMl,
          goodThresholdMl
        );
        const trimmedHistory = trimHistory(updatedHistory, new Date());

        const quickLogNext: QuickLogState = {
          ...quickLog,
          lastUsedMl: amountMl > 0 ? amountMl : quickLog.lastUsedMl,
          lastLogAt: amountMl > 0 ? new Date().toISOString() : quickLog.lastLogAt,
        };

        set({
          progress: nextProgress,
          history: trimmedHistory,
          quickLog: quickLogNext,
        });
      },

      undoLastLog: async (amountMl: number, hour: number) => {
        const { progress, history } = get();
        const todayKey = getDateKey(new Date());

        if (progress.date !== todayKey || progress.consumedMl < amountMl) {
          return;
        }

        const nextProgress: HydrationProgress = {
          date: todayKey,
          consumedMl: Math.max(0, progress.consumedMl - amountMl),
        };

        const now = new Date();
        now.setHours(hour);

        const revertedHistory = undoHistoryForLog(history, now, amountMl);

        set({
          progress: nextProgress,
          history: revertedHistory,
        });
      },

      resetToday: async () => {
        const { history, settings } = get();
        const todayKey = getDateKey(new Date());
        const nextProgress: HydrationProgress = { date: todayKey, consumedMl: 0 };
        const goalMl = litersToMl(settings.targetLiters);
        const goodThresholdMl = Math.round(
          (goalMl * settings.gentleGoalThreshold) / 100
        );
        const nextHistory = resetHistoryForDate(history, todayKey, goalMl, goodThresholdMl);

        set({
          progress: nextProgress,
          history: nextHistory,
        });
      },

      completeOnboarding: async () => {
        set({ onboarding: { completed: true } });
      },

      refreshProgressDate: async () => {
        const { progress } = get();
        const todayKey = getDateKey(new Date());
        if (progress.date === todayKey) {
          return false;
        }
        const nextProgress: HydrationProgress = { date: todayKey, consumedMl: 0 };
        set({ progress: nextProgress });
        return true;
      },

      updateQuickLogPresets: async (presets: DrinkPreset[]) => {
        const { quickLog } = get();
        // Assume passed presets are pre-validated by the UI
        const finalPresets = presets.slice(0, QUICK_LOG_MAX_PRESETS);
        
        // Ensure minimum
        if (finalPresets.length < QUICK_LOG_MIN_PRESETS) {
          // Fill from defaults if they removed too many
          const missing = QUICK_LOG_MIN_PRESETS - finalPresets.length;
          finalPresets.push(...DEFAULT_QUICK_LOG_PRESETS.slice(0, missing));
        }

        set({
          quickLog: {
            ...quickLog,
            presets: finalPresets,
          },
        });
      },
    }),
    {
      name: "siply:hydration_store:v1",
      storage: createJSONStorage(() => AsyncStorage),
      version: SCHEMA_VERSION,
      migrate: migrateStorage,
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHydrated(true);
        }
      },
    }
  )
);

export const useHydration = useHydrationStore;
