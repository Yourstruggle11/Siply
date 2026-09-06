import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_QUICK_LOG_PRESETS,
  DEFAULT_SETTINGS,
  ENTRY_RETENTION_DAYS,
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
  DrinkPreset,
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
  /** §4.3 — no parameters: store reads the last entry from history[today].entries */
  undoLastLog: () => Promise<void>;
  resetToday: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  refreshProgressDate: () => Promise<boolean>;
  updateQuickLogPresets: (presets: DrinkPreset[]) => Promise<void>;
  setHydrated: (hydrated: boolean) => void;
};

export type HydrationStore = HydrationState & HydrationActions;

// ---------------------------------------------------------------------------
// §3.3 — migrateStorage with version-gated pattern
// ---------------------------------------------------------------------------
export const migrateStorage = async (persistedState: unknown, version: number) => {
  const todayKey = getDateKey(new Date());

  // Case 1: Empty persisted state — attempt legacy 6-key migration
  if (!persistedState || Object.keys(persistedState as any).length === 0) {
    const legacyState = await hydrateStorage();
    return legacyState as any;
  }

  // Case 2: Non-empty — normalise each slice defensively
  const state = persistedState as Partial<HydrationState>;
  const normalised = {
    settings: normalizeSettings(state.settings ?? null),
    progress: normalizeProgress(state.progress ?? null, todayKey),
    onboarding: normalizeOnboarding(state.onboarding ?? null),
    quickLog: normalizeQuickLog(state.quickLog ?? null),
    history: normalizeHistory(state.history ?? null),
  };

  // Version-specific migrations
  // v2 → v3: entries field is optional on HydrationDaySummary.
  //           normalizeHistory already handles absent entries (they stay
  //           undefined). No data transformation needed — the field is
  //           additive and optional. This block exists as the pattern for
  //           future version-gated migrations.
  if (version < 3) {
    // No-op for v2→v3: entries are undefined on old days by design.
    // Future migrations (e.g. v3→v4) would add transformation logic here.
  }

  return normalised as any;
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

      // §9 — addConsumed: consumedMl sourced from history.totalMl for consistency
      addConsumed: async (amountMl: number) => {
        const { history, settings, quickLog } = get();
        const now = new Date();
        const todayKey = getDateKey(now);

        const goalMl = litersToMl(settings.targetLiters);
        const goodThresholdMl = Math.round(
          (goalMl * settings.gentleGoalThreshold) / 100
        );

        const updatedHistory = updateHistoryForLog(
          history,
          now,
          amountMl,
          goalMl,
          goodThresholdMl
        );
        const trimmedHistory = trimHistory(updatedHistory, now, undefined, ENTRY_RETENTION_DAYS);

        // Derive progress.consumedMl from history for consistency —
        // ensures progress never drifts from the entry-derived totalMl.
        const todaySummary = trimmedHistory[todayKey];
        const nextProgress: HydrationProgress = {
          date: todayKey,
          consumedMl: todaySummary?.totalMl ?? 0,
        };

        const quickLogNext: QuickLogState = {
          ...quickLog,
          lastUsedMl: amountMl > 0 ? amountMl : quickLog.lastUsedMl,
          lastLogAt: amountMl > 0 ? now.toISOString() : quickLog.lastLogAt,
        };

        set({
          progress: nextProgress,
          history: trimmedHistory,
          quickLog: quickLogNext,
        });
      },

      // §4.2.1 — undoLastLog: no parameters; reads last entry from store
      undoLastLog: async () => {
        const { history } = get();
        const todayKey = getDateKey(new Date());

        const nextHistory = undoHistoryForLog(history, todayKey);
        if (nextHistory === history) {
          return; // nothing to undo (no entries for today)
        }

        const todaySummary = nextHistory[todayKey];
        const nextProgress: HydrationProgress = {
          date: todayKey,
          consumedMl: todaySummary?.totalMl ?? 0,
        };

        set({
          progress: nextProgress,
          history: nextHistory,
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
        // Assume passed presets are pre-validated by the UI (dedup is caller's responsibility)
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
