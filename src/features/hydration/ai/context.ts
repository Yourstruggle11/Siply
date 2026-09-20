import { getDateKey } from "../../../core/time";
import { litersToMl } from "../domain/calculations";
import {
  buildDateKeys,
  computeBestHoursByVolume,
  computeHistoryOverview,
  computeSmartInsight,
  computeStreakStats,
  getHourlyVolumeDistribution,
} from "../domain/history";
import type { HydrationState } from "../state/hydrationStore";
import { fingerprintValue } from "./insightCache";
import type { AiHydrationContext } from "./types";

type ContextSource = Pick<HydrationState, "settings" | "progress" | "history">;

export const buildAiHydrationContext = (
  source: ContextSource,
  purpose: AiHydrationContext["purpose"],
  now = new Date()
): AiHydrationContext => {
  const dailyHistoryDays = purpose === "ask" ? 90 : 14;
  const hourlyHistoryDays = 7 as const;
  const goalMl = litersToMl(source.settings.targetLiters);
  const goodThresholdMl = Math.round(
    (goalMl * source.settings.gentleGoalThreshold) / 100
  );
  const localDate = getDateKey(now);
  const overview = computeHistoryOverview(source.history, now, dailyHistoryDays, goalMl);
  const streaks = computeStreakStats(
    source.history,
    now,
    goalMl,
    goodThresholdMl,
    source.settings.gentleGoalEnabled
  );
  const deterministicInsight = computeSmartInsight(source.history, now, goalMl);
  const consumedMl = source.progress.date === localDate ? source.progress.consumedMl : 0;

  const dailyHistory = overview.keys.map((date) => {
    const summary = source.history[date];
    const dayGoalMl = summary?.goalMl ?? goalMl;
    const totalMl = summary?.totalMl ?? 0;
    return {
      date,
      totalMl,
      goalMl: dayGoalMl,
      percentOfGoal: dayGoalMl > 0 ? Math.round((totalMl / dayGoalMl) * 100) : 0,
      logCount:
        summary?.entries?.length ??
        summary?.logHours.reduce((total, count) => total + count, 0) ??
        0,
    };
  });

  const recentHourlyHistory = buildDateKeys(now, hourlyHistoryDays)
    .map((date) => {
      const summary = source.history[date];
      if (!summary) return null;
      const distribution = getHourlyVolumeDistribution(summary);
      return {
        date,
        volumesMl: distribution.volumes.map((value) => Math.round(value)),
        quality: distribution.estimated ? ("estimated" as const) : ("exact" as const),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return {
    version: 2,
    purpose,
    generatedAt: now.toISOString(),
    localDate,
    timezoneOffsetMinutes: now.getTimezoneOffset(),
    preferredDisplayUnit: source.settings.displayUnit,
    valuesUnit: "ml",
    settings: {
      dailyTargetMl: goalMl,
      activeWindow: {
        start: source.settings.windowStart,
        end: source.settings.windowEnd,
      },
      gentleGoal: {
        enabled: source.settings.gentleGoalEnabled,
        thresholdPercent: source.settings.gentleGoalThreshold,
      },
    },
    today: {
      consumedMl,
      remainingMl: Math.max(0, goalMl - consumedMl),
      percentOfGoal: goalMl > 0 ? Math.round((consumedMl / goalMl) * 100) : 0,
    },
    period: {
      startDate: overview.keys[0] ?? localDate,
      endDate: localDate,
      dailyHistoryDays,
      hourlyHistoryDays,
    },
    dailyHistory,
    recentHourlyHistory,
    aggregates: {
      trackedDays: overview.trackedDays,
      averageDailyMl: Math.round(overview.averageDailyMl),
      goalHitRatePercent: overview.goalHitRatePercent,
      currentGoalStreak: streaks.currentStreak,
      bestGoalStreak: streaks.bestStreak,
      last7GoalHits: streaks.last7GoalHits,
      last30GoalHits: streaks.last30GoalHits,
      currentGentleStreak: streaks.currentGoodStreak,
      bestGentleStreak: streaks.bestGoodStreak,
      bestHoursLocal: computeBestHoursByVolume(source.history, now, 30),
      deterministicInsight,
    },
  };
};

export const fingerprintAiContext = (context: AiHydrationContext) => {
  const { generatedAt: _generatedAt, ...stableContext } = context;
  return fingerprintValue(stableContext);
};

/** Stable non-today inputs used to notice imports, edits, and setting changes. */
export const fingerprintAiTrendContext = (context: AiHydrationContext) =>
  fingerprintValue({
    settings: context.settings,
    preferredDisplayUnit: context.preferredDisplayUnit,
    dailyHistory: context.dailyHistory.filter((day) => day.date !== context.localDate),
    recentHourlyHistory: context.recentHourlyHistory.filter(
      (day) => day.date !== context.localDate
    ),
  });
