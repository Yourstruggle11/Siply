import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Share, StyleSheet, Text, View, Pressable } from "react-native";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import { Screen } from "../../src/shared/components/Screen";
import { AnimatedCard } from "../../src/shared/components/AnimatedCard";
import { AnimatedStatRow } from "../../src/shared/components/AnimatedStatRow";
import { PulsingTitle } from "../../src/shared/components/PulsingTitle";
import { Button } from "../../src/shared/components/Button";
import { ShareCard } from "../../src/features/hydration/ui/components/ShareCard";
import { CalendarHeatmap } from "../../src/shared/components/CalendarHeatmap";
import { BottomSheet } from "../../src/shared/components/BottomSheet";
import { HourlyBarChart } from "../../src/shared/components/HourlyBarChart";
import { LineChart, ChartType } from "../../src/shared/components/LineChart";
import { useTheme } from "../../src/shared/theme/ThemeProvider";
import { useHydrationStore } from "../../src/features/hydration/state/hydrationStore";
import { litersToMl } from "../../src/features/hydration/domain/calculations";
import { formatLiquid } from "../../src/core/units";
import { formatTimeForDisplay, getDateKey } from "../../src/core/time";
import { ENTRY_RETENTION_DAYS } from "../../src/core/constants";
import {
  buildDateKeys,
  computeBestHoursByVolume,
  computeStreakStats,
  getSummaryForDate,
} from "../../src/features/hydration/domain/history";

const formatHour = (hour: number) => {
  const safe = hour % 24;
  const label = safe === 0 ? 12 : safe > 12 ? safe - 12 : safe;
  const suffix = safe >= 12 ? "PM" : "AM";
  return `${label} ${suffix}`;
};

const formatDateLabel = (dateKey: string) => {
  try {
    const date = new Date(`${dateKey}T00:00:00`);
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return dateKey;
  }
};

export default function HistoryScreen() {
  const theme = useTheme();
  const settings = useHydrationStore((s) => s.settings);
  const progress = useHydrationStore((s) => s.progress);
  const history = useHydrationStore((s) => s.history);
  
  const [sharing, setSharing] = useState(false);
  const [shareReady, setShareReady] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [chartType, setChartType] = useState<ChartType>("line");
  
  const shareEnabled = Constants.appOwnership !== "expo";
  const shareViewRef = useRef<View>(null);
  const captureRefFn = useRef<null | ((view: any, options?: any) => Promise<string>)>(null);

  const goalMl = useMemo(() => litersToMl(settings.targetLiters), [settings.targetLiters]);
  const goodThresholdMl = useMemo(
    () => Math.round((goalMl * settings.gentleGoalThreshold) / 100),
    [goalMl, settings.gentleGoalThreshold]
  );

  const streaks = useMemo(
    () =>
      computeStreakStats(
        history,
        new Date(),
        goalMl,
        goodThresholdMl,
        settings.gentleGoalEnabled
      ),
    [goodThresholdMl, goalMl, history, settings.gentleGoalEnabled]
  );

  // §7.2 — volume-based best hours (uses exact entry data when available,
  // proportional fallback for summary-only days)
  const bestHours = useMemo(() => computeBestHoursByVolume(history, new Date(), 30), [history]);

  const chartData90 = useMemo(() => {
    const keys = buildDateKeys(new Date(), 90);
    return keys.map(k => history[k]?.totalMl || 0);
  }, [history]);

  const averageIntake = useMemo(() => {
    const validDays = chartData90.filter(v => v > 0);
    if (validDays.length === 0) return 0;
    return validDays.reduce((a, b) => a + b, 0) / validDays.length;
  }, [chartData90]);

  const goalHitRate = useMemo(() => {
    if (chartData90.length === 0) return 0;
    const hits = chartData90.filter(v => v >= goalMl).length;
    return Math.round((hits / chartData90.length) * 100);
  }, [chartData90, goalMl]);

  const selectedSummary = useMemo(() => {
    if (!selectedDate) return null;
    return getSummaryForDate(history, selectedDate, goalMl, goodThresholdMl);
  }, [selectedDate, history, goalMl, goodThresholdMl]);

  useEffect(() => {
    if (!shareEnabled) {
      setShareReady(false);
      setShareError(null);
      return;
    }
    let mounted = true;
    import("react-native-view-shot")
      .then((module) => {
        if (!mounted) return;
        if (!module.captureRef) {
          captureRefFn.current = null;
          setShareReady(false);
          setShareError("Capture module unavailable.");
          return;
        }
        captureRefFn.current = module.captureRef;
        setShareReady(true);
        setShareError(null);
      })
      .catch(() => {
        if (!mounted) return;
        captureRefFn.current = null;
        setShareReady(false);
        setShareError("Unable to load the capture module.");
      });
    return () => {
      mounted = false;
    };
  }, [shareEnabled]);

  const handleShare = async () => {
    if (!shareEnabled || !shareReady || !captureRefFn.current || !shareViewRef.current || sharing) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSharing(true);
    try {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      const uri = await captureRefFn.current(shareViewRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });
      if (!uri) {
        setShareError("Capture failed. Try again.");
        return;
      }
      let shared = false;
      try {
        const Sharing = await import("expo-sharing");
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, {
            mimeType: "image/png",
            dialogTitle: "Share progress",
            UTI: "public.png",
          });
          shared = true;
        }
      } catch {
        shared = false;
      }
      if (!shared) {
        await Share.share({ url: uri, message: "Siply progress" });
      }
      setShareError(null);
    } catch {
      setShareError("Capture failed. Try again.");
    } finally {
      setSharing(false);
    }
  };

  const handleSelectDate = (dateKey: string) => {
    void Haptics.selectionAsync();
    setSelectedDate(dateKey);
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <Screen scroll>
        <View style={styles.container}>
          <PulsingTitle text="History & Insights" style={styles.title} />

          {/* New 90-Day Trend Chart */}
          <AnimatedCard style={styles.section} delay={50}>
            <View style={styles.chartHeader}>
              <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
                90-Day Trend
              </Text>
              <View style={styles.chartToggle}>
                <Pressable onPress={() => setChartType("line")} style={[styles.toggleBtn, chartType === "line" && { backgroundColor: theme.colors.surfaceElevated }]}>
                  <Text style={{ color: chartType === "line" ? theme.colors.accent : theme.colors.textSecondary, fontSize: 12, fontWeight: '600' }}>Line</Text>
                </Pressable>
                <Pressable onPress={() => setChartType("bar")} style={[styles.toggleBtn, chartType === "bar" && { backgroundColor: theme.colors.surfaceElevated }]}>
                  <Text style={{ color: chartType === "bar" ? theme.colors.accent : theme.colors.textSecondary, fontSize: 12, fontWeight: '600' }}>Bar</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.trendStats}>
              <View>
                <Text style={[styles.trendStatValue, { color: theme.colors.textPrimary }]}>{formatLiquid(averageIntake, settings.displayUnit)}</Text>
                <Text style={[styles.trendStatLabel, { color: theme.colors.textSecondary }]}>Avg Daily Intake</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.trendStatValue, { color: theme.colors.textPrimary }]}>{goalHitRate}%</Text>
                <Text style={[styles.trendStatLabel, { color: theme.colors.textSecondary }]}>Goal Hit Rate</Text>
              </View>
            </View>
            <View style={{ marginTop: 16 }}>
              <LineChart data={chartData90} type={chartType} height={140} goalMl={goalMl} />
            </View>
          </AnimatedCard>

          {/* Calendar Heatmap */}
          <AnimatedCard style={styles.section} delay={100}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
              Consistency
            </Text>
            <CalendarHeatmap
              selectedDateKey={selectedDate}
              onSelectDate={handleSelectDate}
            />
          </AnimatedCard>

          {/* Streaks */}
          <AnimatedCard style={styles.section} delay={200}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
              Streaks
            </Text>
            <AnimatedStatRow label="Current streak" value={`${streaks.currentStreak} days`} delay={250} />
            <AnimatedStatRow label="Best streak" value={`${streaks.bestStreak} days`} delay={300} />
            <AnimatedStatRow label="Goal hits (7d)" value={streaks.last7GoalHits} delay={350} />
            <AnimatedStatRow label="Goal hits (30d)" value={streaks.last30GoalHits} delay={400} />
            {settings.gentleGoalEnabled && streaks.currentGoodStreak !== null && (
              <>
                <AnimatedStatRow label="Good day streak" value={`${streaks.currentGoodStreak} days`} delay={450} />
                <AnimatedStatRow label="Best good day streak" value={`${streaks.bestGoodStreak ?? 0} days`} delay={500} />
              </>
            )}
          </AnimatedCard>

          {/* Best Hours */}
          <AnimatedCard style={styles.section} delay={550}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
              Best hours
            </Text>
            <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
              {bestHours.length > 0
                ? bestHours.map(formatHour).join(", ")
                : "Not enough data yet."}
            </Text>
          </AnimatedCard>

          {/* Share */}
          <AnimatedCard style={styles.section} delay={650}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
              Share
            </Text>
            <Button
              label={sharing ? "Preparing..." : "Share progress"}
              onPress={handleShare}
              disabled={!shareEnabled || !shareReady || sharing}
            />
            {shareError && <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>{shareError}</Text>}
            {!shareEnabled && (
              <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
                Share requires a development build. Expo Go does not include the capture module.
              </Text>
            )}
          </AnimatedCard>

          {/* Hidden share card for capture */}
          {shareReady && (
            <View ref={shareViewRef} collapsable={false} style={styles.captureContainer} pointerEvents="none">
              <ShareCard
                progress={goalMl > 0 ? progress.consumedMl / goalMl : 0}
                consumedMl={progress.consumedMl}
                targetMl={goalMl}
                currentStreak={streaks.currentStreak}
              />
            </View>
          )}
        </View>
      </Screen>

      {/* Day Detail Bottom Sheet */}
      <BottomSheet visible={!!selectedDate} onDismiss={() => setSelectedDate(null)}>
        {selectedSummary && (
          <View style={styles.sheetContent}>
            <Text style={[styles.sheetTitle, { color: theme.colors.textPrimary }]}>
              {formatDateLabel(selectedSummary.date)}
            </Text>

            <View style={styles.sheetStatRow}>
              <View>
                <Text style={[styles.sheetStatValue, { color: theme.colors.textPrimary }]}>
                  {formatLiquid(selectedSummary.totalMl, settings.displayUnit)}
                </Text>
                <Text style={[styles.sheetStatLabel, { color: theme.colors.textSecondary }]}>
                  Total Consumed
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.sheetStatValue, { color: theme.colors.accent }]}>
                  {selectedSummary.goalMl > 0 ? Math.round((selectedSummary.totalMl / selectedSummary.goalMl) * 100) : 0}%
                </Text>
                <Text style={[styles.sheetStatLabel, { color: theme.colors.textSecondary }]}>
                  of Goal
                </Text>
              </View>
            </View>

            <Text style={[styles.sheetChartTitle, { color: theme.colors.textSecondary }]}>
              Hourly Distribution ({selectedSummary.logHours.reduce((a, b) => a + b, 0)} logs)
            </Text>
            <HourlyBarChart logHours={selectedSummary.logHours} goalMl={selectedSummary.goalMl} />

            {/* §6.2 — Entry list or estimated-activity label */}
            {(() => {
              const entryCutoff = getDateKey(
                new Date(Date.now() - (ENTRY_RETENTION_DAYS - 1) * 24 * 60 * 60 * 1000)
              );
              const hasEntries =
                selectedSummary.entries && selectedSummary.entries.length > 0;
              const withinWindow = selectedSummary.date >= entryCutoff;

              if (hasEntries && withinWindow) {
                const sorted = [...selectedSummary.entries!].sort(
                  (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                );
                return (
                  <View style={styles.entryListSection}>
                    <Text style={[styles.sheetChartTitle, { color: theme.colors.textSecondary, marginTop: 20 }]}>
                      Log Entries
                    </Text>
                    {sorted.map((entry) => (
                      <View key={entry.id} style={[styles.entryRow, { borderColor: theme.colors.border }]}>
                        <Text style={[{ color: theme.colors.textSecondary, ...theme.typography.caption }]}>
                          {formatTimeForDisplay(new Date(entry.timestamp))}
                        </Text>
                        <Text style={[{ color: theme.colors.textPrimary, ...theme.typography.bodySmall, fontWeight: "600" }]}>
                          {formatLiquid(entry.amountMl, settings.displayUnit)}
                        </Text>
                      </View>
                    ))}
                  </View>
                );
              }

              // §6.2 — no entries: show estimated-activity label
              return (
                <View style={styles.estimatedLabelRow}>
                  <Text style={[styles.estimatedLabel, { color: theme.colors.textSecondary }]}>
                    ℹ︎  Estimated activity — exact log times are not available for this day.
                  </Text>
                </View>
              );
            })()}
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
    paddingBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  helper: {
    fontSize: 13,
  },
  captureContainer: {
    position: "absolute",
    left: -9999,
    top: 0,
  },
  sheetContent: {
    paddingHorizontal: 8,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 16,
  },
  sheetStatRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  sheetStatValue: {
    fontSize: 28,
    fontWeight: "700",
  },
  sheetStatLabel: {
    fontSize: 13,
    marginTop: 4,
  },
  sheetChartTitle: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chartToggle: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: 'rgba(150, 150, 150, 0.2)',
    borderRadius: 8,
    overflow: "hidden",
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  trendStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  trendStatValue: {
    fontSize: 24,
    fontWeight: "700",
  },
  trendStatLabel: {
    fontSize: 12,
  },
  entryListSection: {
    marginTop: 4,
  },
  entryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  estimatedLabelRow: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  estimatedLabel: {
    fontSize: 13,
    fontStyle: "italic",
    lineHeight: 18,
  },
});
