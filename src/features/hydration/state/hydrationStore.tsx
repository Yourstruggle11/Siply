import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from "react";
import { DEFAULT_SETTINGS } from "../../../core/constants";
import { hydrateStorage, persistOnboarding, persistProgress, persistSettings } from "../../../core/storage/migrations";
import { getDateKey } from "../../../core/time";
import { HydrationProgress, HydrationSettings, OnboardingState } from "../domain/types";

type HydrationState = {
  settings: HydrationSettings;
  progress: HydrationProgress;
  onboarding: OnboardingState;
  hydrated: boolean;
};

type HydrationAction =
  | { type: "hydrate"; payload: Omit<HydrationState, "hydrated"> }
  | { type: "setSettings"; payload: HydrationSettings }
  | { type: "setProgress"; payload: HydrationProgress }
  | { type: "setOnboarding"; payload: OnboardingState };

type HydrationContextValue = HydrationState & {
  updateSettings: (patch: Partial<HydrationSettings>) => Promise<void>;
  addConsumed: (amountMl: number) => Promise<void>;
  resetToday: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  refreshProgressDate: () => Promise<void>;
};

const initialState: HydrationState = {
  settings: DEFAULT_SETTINGS,
  progress: { date: getDateKey(new Date()), consumedMl: 0 },
  onboarding: { completed: false },
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
      dispatch({ type: "setProgress", payload: next });
      await persistProgress(next);
    },
    [state.progress]
  );

  const resetToday = useCallback(async () => {
    const todayKey = getDateKey(new Date());
    const next: HydrationProgress = { date: todayKey, consumedMl: 0 };
    dispatch({ type: "setProgress", payload: next });
    await persistProgress(next);
  }, []);

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
    }),
    [state, updateSettings, addConsumed, resetToday, completeOnboarding, refreshProgressDate]
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
