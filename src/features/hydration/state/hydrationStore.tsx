import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from "react";
import {
  DEFAULT_QUICK_LOG_PRESETS,
  DEFAULT_SETTINGS,
  QUICK_LOG_MAX_PRESETS,
  QUICK_LOG_MIN_PRESETS,
} from "../../../core/constants";
import {
  hydrateStorage,
  persistHistory,
  persistOnboarding,
  persistProgress,
  persistQuickLog,
  persistSettings,
} from "../../../core/storage/migrations";
import { getDateKey } from "../../../core/time";
import { litersToMl } from "../domain/calculations";
import { HydrationHistory, HydrationProgress, HydrationSettings, OnboardingState, QuickLogState } from "../domain/types";
import { resetHistoryForDate, trimHistory, updateHistoryForLog } from "../domain/history";

type HydrationState = {
  settings: HydrationSettings;
  progress: HydrationProgress;
  onboarding: OnboardingState;
  quickLog: QuickLogState;
  history: HydrationHistory;
  hydrated: boolean;
};

type HydrationAction =
  | { type: "hydrate"; payload: Omit<HydrationState, "hydrated"> }
  | { type: "setSettings"; payload: HydrationSettings }
  | { type: "setProgress"; payload: HydrationProgress }
  | { type: "setOnboarding"; payload: OnboardingState }
  | { type: "setQuickLog"; payload: QuickLogState }
  | { type: "setHistory"; payload: HydrationHistory };

type HydrationContextValue = HydrationState & {
  updateSettings: (patch: Partial<HydrationSettings>) => Promise<void>;
  addConsumed: (amountMl: number) => Promise<void>;
  resetToday: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  refreshProgressDate: () => Promise<void>;
  updateQuickLogPresets: (presets: number[]) => Promise<void>;
};

const initialState: HydrationState = {
  settings: DEFAULT_SETTINGS,
  progress: { date: getDateKey(new Date()), consumedMl: 0 },
  onboarding: { completed: false },
  quickLog: { presets: DEFAULT_QUICK_LOG_PRESETS, lastUsedMl: null },
  history: {},
  hydrated: false,
};

const HydrationContext = createContext<HydrationContextValue | null>(null);

const reducer = (state: HydrationState, action: HydrationAction): HydrationState => {
  switch (action.type) {
    case "hydrate":
      return { ...state, ...action.payload, hydrated: true };
    case "setSettings":
      return { ...state, settings: action.payload };
    case "setProgress":
      return { ...state, progress: action.payload };
    case "setOnboarding":
      return { ...state, onboarding: action.payload };
    case "setQuickLog":
      return { ...state, quickLog: action.payload };
    case "setHistory":
      return { ...state, history: action.payload };
    default:
      return state;
  }
};

export const HydrationProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const hydrate = async () => {
      const snapshot = await hydrateStorage();
      dispatch({
        type: "hydrate",
        payload: snapshot,
      });
    };
    hydrate();
  }, []);

  const updateSettings = useCallback(
    async (patch: Partial<HydrationSettings>) => {
      const next: HydrationSettings = {
        ...state.settings,
        ...patch,
      };
      dispatch({ type: "setSettings", payload: next });
      await persistSettings(next);
    },
    [state.settings]
  );

  const addConsumed = useCallback(
    async (amountMl: number) => {
      const todayKey = getDateKey(new Date());
      const baseProgress =
        state.progress.date === todayKey
          ? state.progress
          : { date: todayKey, consumedMl: 0 };
      const next: HydrationProgress = {
        date: todayKey,
        consumedMl: Math.max(0, baseProgress.consumedMl + amountMl),
      };
      const goalMl = litersToMl(state.settings.targetLiters);
      const goodThresholdMl = Math.round((goalMl * state.settings.gentleGoalThreshold) / 100);
      const updatedHistory = updateHistoryForLog(
        state.history,
        new Date(),
        amountMl,
        goalMl,
        goodThresholdMl
      );
      const trimmedHistory = trimHistory(updatedHistory, new Date());
      const quickLogNext: QuickLogState = {
        ...state.quickLog,
        lastUsedMl: amountMl > 0 ? amountMl : state.quickLog.lastUsedMl,
      };
      dispatch({ type: "setProgress", payload: next });
      dispatch({ type: "setHistory", payload: trimmedHistory });
      dispatch({ type: "setQuickLog", payload: quickLogNext });
      await persistProgress(next);
      await persistHistory(trimmedHistory);
      await persistQuickLog(quickLogNext);
    },
    [state.history, state.progress, state.quickLog, state.settings.gentleGoalThreshold, state.settings.targetLiters]
  );

  const resetToday = useCallback(async () => {
    const todayKey = getDateKey(new Date());
    const next: HydrationProgress = { date: todayKey, consumedMl: 0 };
    const goalMl = litersToMl(state.settings.targetLiters);
    const goodThresholdMl = Math.round((goalMl * state.settings.gentleGoalThreshold) / 100);
    const nextHistory = resetHistoryForDate(state.history, todayKey, goalMl, goodThresholdMl);
    dispatch({ type: "setProgress", payload: next });
    dispatch({ type: "setHistory", payload: nextHistory });
    await persistProgress(next);
    await persistHistory(nextHistory);
  }, [state.history, state.settings.gentleGoalThreshold, state.settings.targetLiters]);

  const completeOnboarding = useCallback(async () => {
    const next: OnboardingState = { completed: true };
    dispatch({ type: "setOnboarding", payload: next });
    await persistOnboarding(next);
  }, []);

  const refreshProgressDate = useCallback(async () => {
    const todayKey = getDateKey(new Date());
    if (state.progress.date === todayKey) {
      return;
    }
    const next: HydrationProgress = { date: todayKey, consumedMl: 0 };
    dispatch({ type: "setProgress", payload: next });
    await persistProgress(next);
  }, [state.progress.date]);

  const updateQuickLogPresets = useCallback(
    async (presets: number[]) => {
      const cleaned = presets
        .map((value) => (typeof value === "number" ? value : Number.parseInt(String(value), 10)))
        .filter((value) => Number.isFinite(value) && value > 0);
      const deduped = Array.from(new Set(cleaned)).slice(0, QUICK_LOG_MAX_PRESETS);
      const finalPresets =
        deduped.length >= QUICK_LOG_MIN_PRESETS ? deduped : state.quickLog.presets;
      const next: QuickLogState = {
        ...state.quickLog,
        presets: finalPresets,
      };
      dispatch({ type: "setQuickLog", payload: next });
      await persistQuickLog(next);
    },
    [state.quickLog]
  );

  useEffect(() => {
    if (!state.hydrated) {
      return;
    }
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const timeout = setTimeout(() => {
      void refreshProgressDate();
    }, nextMidnight.getTime() - now.getTime() + 500);
    return () => clearTimeout(timeout);
  }, [state.hydrated, state.progress.date, refreshProgressDate]);

  const value = useMemo(
    () => ({
      ...state,
      updateSettings,
      addConsumed,
      resetToday,
      completeOnboarding,
      refreshProgressDate,
      updateQuickLogPresets,
    }),
    [
      state,
      updateSettings,
      addConsumed,
      resetToday,
      completeOnboarding,
      refreshProgressDate,
      updateQuickLogPresets,
    ]
  );

  return <HydrationContext.Provider value={value}>{children}</HydrationContext.Provider>;
};

export const useHydration = () => {
  const context = useContext(HydrationContext);
  if (!context) {
    throw new Error("useHydration must be used within HydrationProvider");
  }
  return context;
};
