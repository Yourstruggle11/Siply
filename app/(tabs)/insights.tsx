import React, { useEffect, useMemo, useRef, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import { Screen } from "../../src/shared/components/Screen";
import { Card } from "../../src/shared/components/Card";
import { ProgressBar } from "../../src/features/hydration/ui/components/ProgressBar";
import { PrimaryButton } from "../../src/features/hydration/ui/components/PrimaryButton";
import { ShareCard } from "../../src/features/hydration/ui/components/ShareCard";
import { useTheme } from "../../src/shared/theme/ThemeProvider";
import { useHydration } from "../../src/features/hydration/state/hydrationStore";
import { litersToMl } from "../../src/features/hydration/domain/calculations";
import {
  buildDateKeys,
  computeBestHours,
  computeStreakStats,
  getSummaryForDate,
} from "../../src/features/hydration/domain/history";

const formatDayLabel = (dateKey: string) => {
  try {
    const date = new Date(`${dateKey}T00:00:00`);
    return date.toLocaleDateString([], { weekday: "short" });
  } catch {
    return dateKey.slice(5);
  }
};

const formatHour = (hour: number) => {
  const safe = hour % 24;
  const label = safe === 0 ? 12 : safe > 12 ? safe - 12 : safe;
  const suffix = safe >= 12 ? "PM" : "AM";
  return `${label} ${suffix}`;
};

export default function InsightsScreen() {
  const theme = useTheme();
  const { settings, progress, history } = useHydration();
  const [sharing, setSharing] = useState(false);
  const viewShotRef = useRef<any>(null);
  const viewShotComponentRef = useRef<React.ComponentType<any> | null>(null);
  const [shareReady, setShareReady] = useState(false);
  const shareEnabled = Constants.appOwnership !== "expo";
  const ViewShotComponent = viewShotComponentRef.current;

  const goalMl = useMemo(() => litersToMl(settings.targetLiters), [settings.targetLiters]);
  const goodThresholdMl = useMemo(
    () => Math.round((goalMl * settings.gentleGoalThreshold) / 100),
    [goalMl, settings.gentleGoalThreshold]
  );

  const last7Summaries = useMemo(() => {
    const today = new Date();
    return buildDateKeys(today, 7).map((key) =>
      getSummaryForDate(history, key, goalMl, goodThresholdMl)
    );
  }, [goodThresholdMl, goalMl, history]);

  const weeklyTotal = useMemo(
    () => last7Summaries.reduce((sum, entry) => sum + entry.totalMl, 0),
    [last7Summaries]
  );

  const streaks = useMemo(
    () => computeStreakStats(history, new Date(), goalMl, goodThresholdMl, settings.gentleGoalEnabled),
    [goodThresholdMl, goalMl, history, settings.gentleGoalEnabled]
  );

  const bestHours = useMemo(() => computeBestHours(history, new Date(), 30), [history]);

  useEffect(() => {
    if (!shareEnabled) {
      return;
    }
    let mounted = true;
    import("react-native-view-shot")
      .then((module) => {
        if (!mounted) {
          return;
        }
        viewShotComponentRef.current = module.default as React.ComponentType<any>;
        setShareReady(true);
      })
      .catch(() => {
        if (!mounted) {
          return;
        }
        viewShotComponentRef.current = null;
        setShareReady(false);
      });
    return () => {
      mounted = false;
    };
  }, [shareEnabled]);

  const handleShare = async () => {
    if (!shareEnabled || !shareReady || !viewShotRef.current || sharing) {
      return;
    }
    setSharing(true);
    try {
      const uri = await viewShotRef.current.capture?.();
      if (!uri) {
        return;
      }
      let shared = false;
      try {
        const Sharing = await import("expo-sharing");
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri);
          shared = true;
        }
      } catch {
        shared = false;
      }
      if (!shared) {
        await Share.share({ url: uri, message: "Siply progress" });
      }
    } finally {
      setSharing(false);
    }
  };

  return (
    <Screen scroll>
      <View style={styles.container}>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Insights</Text>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Today</Text>
          <Text style={[styles.value, { color: theme.colors.textPrimary }]}>
            {progress.consumedMl} ml of {goalMl} ml
          </Text>
          <ProgressBar progress={goalMl > 0 ? progress.consumedMl / goalMl : 0} />
        </Card>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Last 7 days</Text>
          <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
            Weekly total: {weeklyTotal} ml
          </Text>
          <View style={styles.list}>
            {last7Summaries.map((entry) => (
              <View key={`day-${entry.date}`} style={styles.dayRow}>
                <Text style={[styles.dayLabel, { color: theme.colors.textSecondary }]}>
                  {formatDayLabel(entry.date)}
                </Text>
                <View style={styles.dayBar}>
                  <ProgressBar progress={entry.goalMl > 0 ? entry.totalMl / entry.goalMl : 0} />
                </View>
                <Text style={[styles.dayValue, { color: theme.colors.textPrimary }]}>
                  {entry.totalMl} ml
                </Text>
              </View>
            ))}
          </View>
        </Card>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Streaks</Text>
          <View style={styles.statRow}>
            <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>Current streak</Text>
            <Text style={[styles.statValue, { color: theme.colors.textPrimary }]}>
              {streaks.currentStreak} days
            </Text>
          </View>
          <View style={styles.statRow}>
            <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>Best streak</Text>
            <Text style={[styles.statValue, { color: theme.colors.textPrimary }]}>
              {streaks.bestStreak} days
            </Text>
          </View>
          <View style={styles.statRow}>
            <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>Goal hits (7d)</Text>
            <Text style={[styles.statValue, { color: theme.colors.textPrimary }]}>
              {streaks.last7GoalHits}
            </Text>
          </View>
          <View style={styles.statRow}>
            <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>Goal hits (30d)</Text>
            <Text style={[styles.statValue, { color: theme.colors.textPrimary }]}>
              {streaks.last30GoalHits}
            </Text>
          </View>
          {settings.gentleGoalEnabled && streaks.currentGoodStreak !== null ? (
            <>
              <View style={styles.statRow}>
                <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>Good day streak</Text>
                <Text style={[styles.statValue, { color: theme.colors.textPrimary }]}>
                  {streaks.currentGoodStreak} days
                </Text>
              </View>
              <View style={styles.statRow}>
                <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>Best good day streak</Text>
                <Text style={[styles.statValue, { color: theme.colors.textPrimary }]}>
                  {streaks.bestGoodStreak ?? 0} days
                </Text>
              </View>
            </>
          ) : null}
        </Card>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Best hours</Text>
          <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
            {bestHours.length > 0 ? bestHours.map(formatHour).join(", ") : "Not enough data yet."}
          </Text>
        </Card>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Share</Text>
          <PrimaryButton
            label={sharing ? "Preparing..." : "Share progress"}
            onPress={handleShare}
            disabled={!shareEnabled || !shareReady || sharing}
          />
          {!shareEnabled ? (
            <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
              Share requires a development build. Expo Go does not include the capture module.
            </Text>
          ) : null}
        </Card>

        {shareReady && ViewShotComponent ? (
          <View style={styles.captureContainer} pointerEvents="none">
            <ViewShotComponent ref={viewShotRef} options={{ format: "png", quality: 1 }}>
              <ShareCard
                progress={goalMl > 0 ? progress.consumedMl / goalMl : 0}
                consumedMl={progress.consumedMl}
                targetMl={goalMl}
                currentStreak={streaks.currentStreak}
              />
            </ViewShotComponent>
          </View>
        ) : null}
      </View>
    </Screen>
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
  value: {
    fontSize: 16,
    fontWeight: "600",
  },
  list: {
    gap: 10,
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dayLabel: {
    width: 42,
    fontSize: 12,
    textTransform: "uppercase",
  },
  dayBar: {
    flex: 1,
  },
  dayValue: {
    width: 64,
    fontSize: 12,
    textAlign: "right",
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statLabel: {
    fontSize: 14,
  },
  statValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  captureContainer: {
    position: "absolute",
    left: -9999,
    top: 0,
  },
});
