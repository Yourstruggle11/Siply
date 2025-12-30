import React, { useEffect, useMemo, useRef, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import { Screen } from "../../src/shared/components/Screen";
import { AnimatedCard } from "../../src/shared/components/AnimatedCard";
import { AnimatedDayRow } from "../../src/shared/components/AnimatedDayRow";
import { AnimatedProgressValue } from "../../src/shared/components/AnimatedProgressValue";
import { AnimatedStatRow } from "../../src/shared/components/AnimatedStatRow";
import { PulsingTitle } from "../../src/shared/components/PulsingTitle";
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
  const [shareReady, setShareReady] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const shareEnabled = Constants.appOwnership !== "expo";
  const shareViewRef = useRef<any>(null);
  const captureRefFn = useRef<null | ((view: any, options?: any) => Promise<string>)>(null);

  const goalMl = useMemo(
    () => litersToMl(settings.targetLiters),
    [settings.targetLiters]
  );
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

  const bestHours = useMemo(
    () => computeBestHours(history, new Date(), 30),
    [history]
  );

  useEffect(() => {
    if (!shareEnabled) {
      setShareReady(false);
      setShareError(null);
      return;
    }
    let mounted = true;
    import("react-native-view-shot")
      .then((module) => {
        if (!mounted) {
          return;
        }
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
        if (!mounted) {
          return;
        }
        captureRefFn.current = null;
        setShareReady(false);
        setShareError("Unable to load the capture module.");
      });
    return () => {
      mounted = false;
    };
  }, [shareEnabled]);

  const handleShare = async () => {
    if (!shareEnabled || !shareReady || !captureRefFn.current || !shareViewRef.current || sharing) {
      return;
    }
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

  return (
    <Screen scroll>
      <View style={styles.container}>
        <PulsingTitle text="Insights" style={styles.title} />

        <AnimatedCard style={styles.section} delay={100}>
          <Text
            style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}
          >
            Today
          </Text>
          <View style={styles.todayValueContainer}>
            <AnimatedProgressValue value={progress.consumedMl} suffix=" ml" style={styles.value} />
            <Text
              style={[styles.goalText, { color: theme.colors.textSecondary }]}
            >
              of {goalMl} ml
            </Text>
          </View>
          <ProgressBar
            progress={goalMl > 0 ? progress.consumedMl / goalMl : 0}
          />
        </AnimatedCard>

        <AnimatedCard style={styles.section} delay={200}>
          <Text
            style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}
          >
            Last 7 days
          </Text>
          <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
            Weekly total: {weeklyTotal} ml
          </Text>
          <View style={styles.list}>
            {last7Summaries.map((entry, index) => (
              <AnimatedDayRow
                key={`day-${entry.date}`}
                label={formatDayLabel(entry.date)}
                value={`${entry.totalMl} ml`}
                delay={250 + index * 50}
                enableHaptics
              >
                <ProgressBar progress={entry.goalMl > 0 ? entry.totalMl / entry.goalMl : 0} />
              </AnimatedDayRow>
            ))}
          </View>
        </AnimatedCard>

        <AnimatedCard style={styles.section} delay={300}>
          <Text
            style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}
          >
            Streaks
          </Text>
          <AnimatedStatRow
            label="Current streak"
            value={`${streaks.currentStreak} days`}
            delay={350}
          />
          <AnimatedStatRow
            label="Best streak"
            value={`${streaks.bestStreak} days`}
            delay={400}
          />
          <AnimatedStatRow
            label="Goal hits (7d)"
            value={streaks.last7GoalHits}
            delay={450}
          />
          <AnimatedStatRow
            label="Goal hits (30d)"
            value={streaks.last30GoalHits}
            delay={500}
          />
          {settings.gentleGoalEnabled && streaks.currentGoodStreak !== null ? (
            <>
              <AnimatedStatRow
                label="Good day streak"
                value={`${streaks.currentGoodStreak} days`}
                delay={550}
              />
              <AnimatedStatRow
                label="Best good day streak"
                value={`${streaks.bestGoodStreak ?? 0} days`}
                delay={600}
              />
            </>
          ) : null}
        </AnimatedCard>

        <AnimatedCard style={styles.section} delay={400}>
          <Text
            style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}
          >
            Best hours
          </Text>
          <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
            {bestHours.length > 0
              ? bestHours.map(formatHour).join(", ")
              : "Not enough data yet."}
          </Text>
        </AnimatedCard>

        <AnimatedCard style={styles.section} delay={500}>
          <Text
            style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}
          >
            Share
          </Text>
          <PrimaryButton
            label={sharing ? "Preparing..." : "Share progress"}
            onPress={handleShare}
            disabled={!shareEnabled || !shareReady || sharing}
          />
          {shareError ? (
            <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
              {shareError}
            </Text>
          ) : null}
          {!shareEnabled ? (
            <Text
              style={[styles.helper, { color: theme.colors.textSecondary }]}
            >
              Share requires a development build. Expo Go does not include the
              capture module.
            </Text>
          ) : null}
        </AnimatedCard>

        {shareReady ? (
          <View
            ref={shareViewRef}
            collapsable={false}
            style={styles.captureContainer}
            pointerEvents="none"
          >
            <ShareCard
              progress={goalMl > 0 ? progress.consumedMl / goalMl : 0}
              consumedMl={progress.consumedMl}
              targetMl={goalMl}
              currentStreak={streaks.currentStreak}
            />
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
  todayValueContainer: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  value: {
    fontSize: 16,
    fontWeight: "600",
  },
  goalText: {
    fontSize: 14,
  },
  list: {
    gap: 10,
  },
  captureContainer: {
    position: "absolute",
    left: -9999,
    top: 0,
  },
});
