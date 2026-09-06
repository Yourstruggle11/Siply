import { describe, it, expect, beforeEach } from "vitest";
import { computeHydrationPlan } from "../domain/calculations";
import { DEFAULT_SETTINGS } from "../../../core/constants";
import { useHydrationStore } from "../state/hydrationStore";
import { getDateKey } from "../../../core/time";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  }
}));

describe("computeHydrationPlan", () => {
  it("computes plan based on remaining ml", () => {
    const settings = { ...DEFAULT_SETTINGS, targetLiters: 2.0 };
    const plan = computeHydrationPlan(settings, 2000);
    expect(plan).not.toBeNull();
    expect(plan?.mlPerReminder).toBeGreaterThan(0);
  });
});

describe("Zustand Store Actions", () => {
  beforeEach(() => {
    useHydrationStore.setState({
      settings: DEFAULT_SETTINGS,
      progress: { date: getDateKey(new Date()), consumedMl: 0 },
      history: {},
      quickLog: { presets: [250, 500, 750], lastUsedMl: null },
      onboarding: { completed: false },
    });
  });

  it("addConsumed adds to progress and history", async () => {
    const store = useHydrationStore.getState();
    await store.addConsumed(250);
    const updated = useHydrationStore.getState();
    expect(updated.progress.consumedMl).toBe(250);
    const todayKey = getDateKey(new Date());
    expect(updated.history[todayKey].totalMl).toBe(250);
    expect(updated.quickLog.lastUsedMl).toBe(250);
  });

  it("undoLastLog reverts the previous addConsumed", async () => {
    const store = useHydrationStore.getState();
    await store.addConsumed(250);
    const added = useHydrationStore.getState();
    expect(added.progress.consumedMl).toBe(250);

    // §4.3 — undoLastLog takes no parameters; store reads last entry from entries
    await added.undoLastLog();
    
    const reverted = useHydrationStore.getState();
    expect(reverted.progress.consumedMl).toBe(0);
    const todayKey = getDateKey(new Date());
    expect(reverted.history[todayKey].totalMl).toBe(0);
  });

  it("updateSettings modifies settings", async () => {
    const store = useHydrationStore.getState();
    await store.updateSettings({ sipMl: 100 });
    const updated = useHydrationStore.getState();
    expect(updated.settings.sipMl).toBe(100);
  });

  it("resetToday resets progress and today history", async () => {
    const store = useHydrationStore.getState();
    await store.addConsumed(500);
    await store.resetToday();
    const updated = useHydrationStore.getState();
    expect(updated.progress.consumedMl).toBe(0);
    const todayKey = getDateKey(new Date());
    expect(updated.history[todayKey].totalMl).toBe(0);
  });

  it("completeOnboarding sets onboarding to true", async () => {
    const store = useHydrationStore.getState();
    await store.completeOnboarding();
    const updated = useHydrationStore.getState();
    expect(updated.onboarding.completed).toBe(true);
  });

  it("refreshProgressDate updates date if next day", async () => {
    useHydrationStore.setState({
      progress: { date: "2020-01-01", consumedMl: 500 },
    });
    const store = useHydrationStore.getState();
    const changed = await store.refreshProgressDate();
    const updated = useHydrationStore.getState();
    expect(changed).toBe(true);
    expect(updated.progress.date).not.toBe("2020-01-01");
    expect(updated.progress.consumedMl).toBe(0);
  });

  it("updateQuickLogPresets stores presets as-is (dedup is caller's responsibility)", async () => {
    const store = useHydrationStore.getState();
    const presets = [
      { id: "a", name: "A", icon: "cup-water", amountMl: 100 },
      { id: "b", name: "B", icon: "cup-water", amountMl: 200 },
      { id: "c", name: "C", icon: "cup-water", amountMl: 300 },
    ];
    await store.updateQuickLogPresets(presets);
    const updated = useHydrationStore.getState();
    // Store does NOT dedup — validation and dedup is caller's responsibility.
    expect(updated.quickLog.presets).toEqual(presets);
  });
});
