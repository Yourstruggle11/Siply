import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View, ScrollView } from "react-native";
import { Screen } from "../../src/shared/components/Screen";
import { AnimatedCard } from "../../src/shared/components/AnimatedCard";
import { Field } from "../../src/shared/components/Field";
import { Button } from "../../src/shared/components/Button";
import { ProgressRing } from "../../src/shared/components/ProgressRing";
import { useTheme } from "../../src/shared/theme/ThemeProvider";
import { useHydrationStore } from "../../src/features/hydration/state/hydrationStore";
import { useHydrationPlan } from "../../src/shared/hooks/useHydrationPlan";
import { formatTimeForDisplay, getDateKey, setTimeOnDate } from "../../src/core/time";
import { formatLiquid, parseLiquidInputToMl } from "../../src/core/units";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { triggerLightHaptic, triggerSuccessHaptic } from "../../src/shared/haptics";
import { useNotificationPermission } from "../../src/shared/hooks/useNotificationPermission";
import type { LogEntry } from "../../src/features/hydration/domain/types";
import { CelebrationOverlay } from "../../src/shared/components/CelebrationOverlay";
import { computeStreakStats, computeSmartPresets } from "../../src/features/hydration/domain/history";
import { litersToMl } from "../../src/features/hydration/domain/calculations";
import {
  dismissPreciseTimingPrompt,
  shouldShowPreciseTimingPrompt,
} from "../../src/features/hydration/notifications/preciseTiming";
import { analyzeWeekendAwareness } from "../../src/features/hydration/domain/schedulingIntelligence";
import {
  dismissWeekendReadyPrompt,
  shouldShowWeekendReadyPrompt,
} from "../../src/features/hydration/notifications/intelligentPrompts";

// ---------------------------------------------------------------------------
// Timeline entry shape used for rendering.
// "estimated" = reconstructed from logHours when entries are absent (legacy).
// ---------------------------------------------------------------------------
interface TimelineEntry {
  id: string;
  timestamp: Date;
  amountMl: number;
  isEstimated: boolean;
}

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const addConsumed = useHydrationStore((s) => s.addConsumed);
  const quickLog = useHydrationStore((s) => s.quickLog);
  const globalProgress = useHydrationStore((s) => s.progress);
  const settings = useHydrationStore((s) => s.settings);
  const history = useHydrationStore((s) => s.history);
  const undoLastLog = useHydrationStore((s) => s.undoLastLog);
  const { permission, requestPermission, openSettings } = useNotificationPermission();
  const requestedRef = useRef(false);
  const plan = useHydrationPlan();
  const [showAddAmount, setShowAddAmount] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const [milestoneStreak, setMilestoneStreak] = useState<number | null>(null);
  const [showPreciseTimingPrompt, setShowPreciseTimingPrompt] = useState(false);
  const [showWeekendReadyPrompt, setShowWeekendReadyPrompt] = useState(false);
  const weekendAwareness = useMemo(() => analyzeWeekendAwareness(history), [history]);

  const smartPresets = useMemo(() => {
    // Only recompute periodically or on log, but using new Date() every render is okay for this lightweight function
    return computeSmartPresets(history, new Date(), quickLog.presets, 7);
  }, [history, quickLog.presets]);

  // §6.4 — Timeline entries derived directly from store.
  // history[today].entries is the source of truth for days within the
  // retention window. Falls back to logHours reconstruction (marked
  // estimated) only when entries are absent (pre-migration or same-day
  // app update edge case).
  const timelineEntries = useMemo<TimelineEntry[]>(() => {
    const today = getDateKey(new Date());
    const todayHistory = history[today];

    if (todayHistory?.entries && todayHistory.entries.length > 0) {
      // Exact entries — sorted newest-first for display
      return [...todayHistory.entries]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .map((e: LogEntry) => ({
          id: e.id,
          timestamp: new Date(e.timestamp),
          amountMl: e.amountMl,
          isEstimated: false,
        }));
    }

    // Fallback: reconstruct from logHours (estimated, non-undoable)
    if (todayHistory?.logHours) {
      const reconstructed: TimelineEntry[] = [];
      todayHistory.logHours.forEach((tapCount, hourIndex) => {
        if (tapCount > 0) {
          // logHours records tap count, not ml — we cannot recover individual
          // amounts. Show tap count in display; mark as estimated.
          const timeStr = `${hourIndex.toString().padStart(2, "0")}:00`;
          reconstructed.push({
            id: `estimated-${hourIndex}`,
            timestamp: setTimeOnDate(new Date(), timeStr),
            amountMl: tapCount, // tap count, not ml — displayed with "estimated" label
            isEstimated: true,
          });
        }
      });
      return reconstructed.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }

    return [];
  }, [history]);

  const progressPct = useMemo(() => {
    if (plan.targetMl <= 0) return 0;
    return Math.min(1, plan.consumedMl / plan.targetMl);
  }, [plan.consumedMl, plan.targetMl]);

  useEffect(() => {
    if (!permission || permission.granted || !permission.canAskAgain) return;
    if (requestedRef.current) return;
    requestedRef.current = true;
    void requestPermission();
  }, [permission, requestPermission]);

  useEffect(() => {
    if (!permission) return;
    void shouldShowPreciseTimingPrompt(permission.granted).then(setShowPreciseTimingPrompt);
  }, [permission]);

  useEffect(() => {
    void shouldShowWeekendReadyPrompt(
      weekendAwareness.eligible,
      settings.weekendAwarenessEnabled
    ).then(setShowWeekendReadyPrompt);
  }, [settings.weekendAwarenessEnabled, weekendAwareness.eligible]);

  useEffect(() => {
    if (Platform.OS === 'ios' && plan.targetMl > 0) {
      AccessibilityInfo.announceForAccessibility(
        `Progress: ${Math.round(progressPct * 100)} percent. ${plan.consumedMl} out of ${plan.targetMl} ml consumed.`
      );
    }
  }, [progressPct, plan.consumedMl, plan.targetMl]);

  const handleLog = async (amountMl: number) => {
    if (amountMl <= 0 || !Number.isFinite(amountMl)) return;

    const wasMet = plan.targetMet;
    await addConsumed(amountMl);

    const newTotal = globalProgress.consumedMl + amountMl;
    if (!wasMet && newTotal >= plan.targetMl) {
      const currentHistory = useHydrationStore.getState().history;
      const goalMl = litersToMl(settings.targetLiters);
      const goodThresholdMl = Math.round((goalMl * settings.gentleGoalThreshold) / 100);
      const stats = computeStreakStats(
        currentHistory,
        new Date(),
        goalMl,
        goodThresholdMl,
        settings.gentleGoalEnabled
      );

      if (stats.currentStreak === 7 || stats.currentStreak === 30 || stats.currentStreak === 100) {
        setMilestoneStreak(stats.currentStreak);
      } else {
        void triggerSuccessHaptic();
      }
    } else {
      void triggerLightHaptic();
    }
  };

  const handleQuickAdd = () => handleLog(plan.mlPerReminder);
  const handlePresetLog = (amountMl: number) => handleLog(amountMl);

  const handleCustomAdd = () => {
    const amountMl = parseLiquidInputToMl(customAmount, settings.displayUnit);
    if (amountMl !== null) {
      void handleLog(amountMl);
      setCustomAmount("");
      setShowAddAmount(false);
    }
  };

  // §4.3 — undo: no parameters; store resolves the last entry internally
  const handleUndo = () => {
    void undoLastLog();
    void triggerLightHaptic();
  };

  const todayDateStr = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <Screen scroll>
      <View style={styles.container}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.colors.textPrimary, ...theme.typography.displayLarge }]}>
            Today
          </Text>
          <Text style={[{ color: theme.colors.textSecondary, ...theme.typography.body }]}>
            {todayDateStr}
          </Text>
        </View>

        {permission && !permission.granted ? (
          <AnimatedCard style={styles.alertCard} delay={80}>
            <Text style={[styles.alertTitle, { color: theme.colors.textPrimary, ...theme.typography.titleMedium }]}>
              Notifications are off
            </Text>
            <Text style={[styles.alertBody, { color: theme.colors.textSecondary, ...theme.typography.bodySmall }]}>
              Reminders will not fire until notifications are enabled.
            </Text>
            <Button
              label={permission.canAskAgain ? "Allow notifications" : "Open settings"}
              variant="secondary"
              onPress={permission.canAskAgain ? requestPermission : openSettings}
            />
          </AnimatedCard>
        ) : null}

        {showPreciseTimingPrompt ? (
          <AnimatedCard style={styles.alertCard} delay={90}>
            <Text style={[styles.alertTitle, { color: theme.colors.textPrimary, ...theme.typography.titleMedium }]}>Make reminders more punctual</Text>
            <Text style={[styles.alertBody, { color: theme.colors.textSecondary, ...theme.typography.bodySmall }]}>Android may delay ordinary reminders to save battery. Precise Reminder Timing improves accuracy, although device settings can still cause delays.</Text>
            <View style={styles.promptActions}>
              <Button
                label="Learn more"
                variant="secondary"
                onPress={() => {
                  setShowPreciseTimingPrompt(false);
                  void dismissPreciseTimingPrompt(false);
                  router.push("/settings");
                }}
              />
              <Pressable
                onPress={() => {
                  setShowPreciseTimingPrompt(false);
                  void dismissPreciseTimingPrompt(false);
                }}
                accessibilityRole="button"
              >
                <Text style={[{ color: theme.colors.textSecondary, ...theme.typography.caption, textAlign: "center" }]}>Not now</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setShowPreciseTimingPrompt(false);
                  void dismissPreciseTimingPrompt(true);
                }}
                accessibilityRole="button"
              >
                <Text style={[{ color: theme.colors.textSecondary, ...theme.typography.caption, textAlign: "center" }]}>Don’t show again</Text>
              </Pressable>
            </View>
          </AnimatedCard>
        ) : null}

        {showWeekendReadyPrompt ? (
          <AnimatedCard style={styles.alertCard} delay={95}>
            <Text style={[styles.alertTitle, { color: theme.colors.textPrimary, ...theme.typography.titleMedium }]}>Your weekend rhythm is ready</Text>
            <Text style={[styles.alertBody, { color: theme.colors.textSecondary, ...theme.typography.bodySmall }]}>Siply found a consistent difference in when your weekday and weekend hydration starts. You can now choose weekend-aware reminders in Settings.</Text>
            <View style={styles.promptActions}>
              <Button
                label="Review setting"
                variant="secondary"
                onPress={() => {
                  setShowWeekendReadyPrompt(false);
                  void dismissWeekendReadyPrompt();
                  router.push("/settings");
                }}
              />
              <Pressable
                onPress={() => {
                  setShowWeekendReadyPrompt(false);
                  void dismissWeekendReadyPrompt();
                }}
                accessibilityRole="button"
              >
                <Text style={[{ color: theme.colors.textSecondary, ...theme.typography.caption, textAlign: "center" }]}>Dismiss</Text>
              </Pressable>
            </View>
          </AnimatedCard>
        ) : null}

        {plan.reminderHealth === "schedule_failed" && permission?.granted ? (
          <AnimatedCard style={styles.alertCard} delay={100}>
            <Text style={[styles.alertTitle, { color: theme.colors.textPrimary, ...theme.typography.titleMedium }]}>Restoring reminders</Text>
            <Text style={[styles.alertBody, { color: theme.colors.textSecondary, ...theme.typography.bodySmall }]}>Reminders are temporarily unavailable. Siply is retrying automatically.</Text>
          </AnimatedCard>
        ) : null}

        {/* Hero Section */}
        <View
          style={styles.heroSection}
          accessibilityLiveRegion="polite"
          accessibilityRole="text"
          accessibilityLabel={`Progress: ${Math.round(progressPct * 100)} percent. ${plan.consumedMl} out of ${plan.targetMl} ml consumed.`}
        >
          <ProgressRing progress={progressPct} size={240} strokeWidth={20}>
            <Text style={[{ color: theme.colors.textPrimary, ...theme.typography.displayLarge }]} importantForAccessibility="no">
              {Math.round(progressPct * 100)}%
            </Text>
            <Text style={[{ color: theme.colors.textSecondary, ...theme.typography.caption, marginTop: 4 }]} importantForAccessibility="no">
              {formatLiquid(plan.consumedMl, settings.displayUnit)} / {formatLiquid(plan.targetMl, settings.displayUnit)}
            </Text>
          </ProgressRing>

          <View style={styles.mainCtaContainer}>
            <Button label={`I drank ${formatLiquid(plan.mlPerReminder, settings.displayUnit)}`} onPress={handleQuickAdd} />
            <Pressable
              onPress={() => setShowAddAmount(!showAddAmount)}
              style={styles.customAddButton}
              accessibilityRole="button"
              accessibilityLabel={showAddAmount ? "Cancel custom amount" : "Add a custom amount"}
            >
              <Text style={[{ color: theme.colors.accent, ...theme.typography.bodySmall, fontWeight: "600" }]}>
                {showAddAmount ? "Cancel custom amount" : "+ Add a custom amount"}
              </Text>
            </Pressable>
          </View>
        </View>

        {showAddAmount ? (
          <AnimatedCard delay={100} style={styles.customAddCard}>
            <View style={styles.addRow}>
              <Field
                label={`Custom Amount (${settings.displayUnit})`}
                value={customAmount}
                onChangeText={setCustomAmount}
                keyboardType="number-pad"
                placeholder="e.g. 150"
              />
              <Button label="Log" onPress={handleCustomAdd} />
            </View>
          </AnimatedCard>
        ) : null}

        {/* Quick Log Card */}
        <AnimatedCard delay={120} style={styles.card}>
          <Text style={[{ color: theme.colors.textSecondary, ...theme.typography.caption, marginBottom: 12 }]}>
            Quick log
          </Text>
          <View style={styles.quickLogRow}>
            {smartPresets.map((preset, index) => {
              const amount = typeof preset === "number" ? preset : preset.amountMl;
              const id = typeof preset === "object" && preset.id ? preset.id : `preset-${index}-${amount}`;
              const isActive = quickLog.lastUsedMl === amount;
              return (
                <Pressable
                  key={id}
                  onPress={() => handlePresetLog(amount)}
                  accessibilityRole="button"
                  accessibilityLabel={`Log ${typeof preset === "object" ? preset.name : amount}, ${amount} milliliters`}
                  style={[
                    styles.presetButton,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: isActive ? theme.colors.accentSoft : theme.colors.surfaceElevated,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={typeof preset === "object" && preset.icon ? (preset.icon as any) : "cup-water"}
                    size={20}
                    color={isActive ? theme.colors.accent : theme.colors.textPrimary}
                    style={{ marginBottom: 4 }}
                  />
                  <Text
                    style={[
                      styles.presetName,
                      { color: isActive ? theme.colors.accent : theme.colors.textPrimary, ...theme.typography.bodySmall, fontWeight: "600" },
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {typeof preset === "object" && preset.name ? preset.name : `${amount}`}
                  </Text>
                  <Text style={[{ color: isActive ? theme.colors.accent : theme.colors.textSecondary, fontSize: 11, marginTop: 2 }]}>
                    {formatLiquid(amount, settings.displayUnit)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </AnimatedCard>

        {/* Stats Card */}
        <AnimatedCard delay={160} style={styles.card}>
          <View style={styles.statRow}>
             <View style={styles.statLabelRow}>
               <Text style={[{ color: theme.colors.textSecondary, ...theme.typography.bodySmall }]}>Next sip</Text>
             </View>
             <Text style={[{ color: theme.colors.textPrimary, ...theme.typography.bodySmall, fontWeight: "600" }]}>
               ~{formatLiquid(plan.mlPerReminder, settings.displayUnit)} ({plan.sipsPerReminder} sips)
             </Text>
           </View>
           <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
           <View style={styles.statRow}>
             <View style={styles.statLabelRow}>
               <Text style={[{ color: theme.colors.textSecondary, ...theme.typography.bodySmall }]}>Next reminder</Text>
             </View>
             <Text style={[{ color: theme.colors.textPrimary, ...theme.typography.bodySmall, fontWeight: "600" }]}>
               {plan.nextReminderAt 
                 ? (plan.nextReminderAt.getDate() !== new Date().getDate() 
                     ? `Tomorrow, ${formatTimeForDisplay(plan.nextReminderAt)}` 
                     : formatTimeForDisplay(plan.nextReminderAt)) 
                 : plan.reminderHealth === "schedule_failed"
                   ? "Restoring automatically"
                   : "Not scheduled"}
             </Text>
           </View>
        </AnimatedCard>

        {/* Timeline Section */}
        <View style={styles.timelineSection}>
          <Text style={[{ color: theme.colors.textPrimary, ...theme.typography.titleLarge, marginBottom: 16 }]}>
            Today's log
          </Text>

          {timelineEntries.length === 0 ? (
            <AnimatedCard delay={200} style={styles.emptyStateCard}>
              <Text style={[{ color: theme.colors.textSecondary, ...theme.typography.body, textAlign: "center", lineHeight: 22 }]}>
                No logs yet today.{"\n"}Tap "I drank" above to add your first sip.
              </Text>
            </AnimatedCard>
          ) : (
            <View style={styles.timelineList}>
              {timelineEntries.map((entry, index) => (
                <View key={entry.id} style={styles.timelineRow}>
                  <View style={[styles.timelineNode, { backgroundColor: entry.isEstimated ? theme.colors.textSecondary : theme.colors.accent }]} />
                  {index < timelineEntries.length - 1 && <View style={[styles.timelineLine, { backgroundColor: theme.colors.border }]} />}
                  <View style={[styles.timelineCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                    <Text style={[{ color: theme.colors.textPrimary, ...theme.typography.body }]}>
                      {entry.isEstimated
                        ? `${entry.amountMl} tap${entry.amountMl !== 1 ? "s" : ""}`
                        : formatLiquid(entry.amountMl, settings.displayUnit)}
                    </Text>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[{ color: theme.colors.textSecondary, ...theme.typography.caption }]}>
                        {formatTimeForDisplay(entry.timestamp)}
                      </Text>
                      {entry.isEstimated && (
                        <Text style={[{ color: theme.colors.textSecondary, fontSize: 10, fontStyle: "italic" }]}>
                          estimated
                        </Text>
                      )}
                    </View>
                  </View>
                  {/* Undo available only on the most recent non-estimated entry */}
                  {index === 0 && !entry.isEstimated && (
                    <Pressable onPress={handleUndo} style={styles.undoButton}>
                      <Text style={[{ color: theme.colors.accent, ...theme.typography.caption }]}>Undo</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
      {milestoneStreak !== null && (
        <CelebrationOverlay
          streak={milestoneStreak}
          onComplete={() => setMilestoneStreak(null)}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 20,
    paddingBottom: 40,
    paddingTop: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingHorizontal: 16,
  },
  title: {
    letterSpacing: -0.5,
  },
  heroSection: {
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    marginBottom: 8,
  },
  mainCtaContainer: {
    paddingHorizontal: 16,
    width: '100%',
    gap: 12,
  },
  customAddButton: {
    alignItems: "center",
    paddingVertical: 8,
  },
  customAddCard: {
    marginHorizontal: 16,
    padding: 16,
  },
  addRow: {
    gap: 12,
  },
  card: {
    padding: 16,
  },
  quickLogRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  presetButton: {
    flexBasis: 100,
    flexGrow: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44, // touch target
  },
  promptActions: {
    gap: 10,
  },
  presetName: {
    width: "100%",
    textAlign: "center",
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  statLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  divider: {
    height: 1,
    width: "100%",
    marginVertical: 10,
  },
  alertCard: {
    gap: 10,
    marginHorizontal: 16,
  },
  alertTitle: {},
  alertBody: {},
  timelineSection: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  emptyStateCard: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  timelineList: {
    gap: 0,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    minHeight: 50,
  },
  timelineNode: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 16,
    zIndex: 2,
  },
  timelineLine: {
    position: "absolute",
    left: 5,
    top: 12,
    bottom: -28,
    width: 2,
    zIndex: 1,
  },
  timelineCard: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  undoButton: {
    marginLeft: 12,
    padding: 8,
  },
});
