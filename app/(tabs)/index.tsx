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
import { formatLiquid } from "../../src/core/units";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { triggerLightHaptic, triggerSuccessHaptic } from "../../src/shared/haptics";
import { useNotificationPermission } from "../../src/shared/hooks/useNotificationPermission";

interface MockLogEntry {
  id: string;
  timestamp: Date;
  amount: number;
  isReconstructed?: boolean;
}

export default function HomeScreen() {
  const theme = useTheme();
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
  
  const [sessionLogs, setSessionLogs] = useState<MockLogEntry[]>([]);

  useEffect(() => {
    if (globalProgress.consumedMl > 0 && sessionLogs.length === 0) {
      const today = getDateKey(new Date());
      const todayHistory = history[today];
      if (todayHistory && todayHistory.logHours) {
        const reconstructed: MockLogEntry[] = [];
        todayHistory.logHours.forEach((amount, hourIndex) => {
          if (amount > 0) {
            const timeStr = `${hourIndex.toString().padStart(2, "0")}:00`;
            reconstructed.push({
              id: `reconstructed-${hourIndex}`,
              timestamp: setTimeOnDate(new Date(), timeStr),
              amount,
              isReconstructed: true,
            });
          }
        });
        if (reconstructed.length > 0) {
          reconstructed.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
          setSessionLogs(reconstructed);
        }
      }
    }
  }, [globalProgress.consumedMl, history, sessionLogs.length]);

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
      void triggerSuccessHaptic();
    } else {
      void triggerLightHaptic();
    }

    const logId = Date.now().toString();
    setSessionLogs(prev => [
      { id: logId, timestamp: new Date(), amount: amountMl },
      ...prev,
    ]);
  };

  const handleQuickAdd = () => handleLog(plan.mlPerReminder);
  const handlePresetLog = (amountMl: number) => handleLog(amountMl);
  
  const handleCustomAdd = () => {
    const parsed = Number.parseInt(customAmount, 10);
    if (parsed) {
      void handleLog(parsed);
      setCustomAmount("");
      setShowAddAmount(false);
    }
  };

  const handleUndo = (id: string, amount: number, timestamp: Date) => {
    void undoLastLog(amount, timestamp.getHours());
    setSessionLogs(prev => prev.filter(log => log.id !== id));
    void triggerLightHaptic();
  };

  const isInitialEmptyState = sessionLogs.length === 0 && globalProgress.consumedMl === 0;
  
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
            {quickLog.presets.map((preset, index) => {
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
                      { color: isActive ? theme.colors.accent : theme.colors.textPrimary, ...theme.typography.bodySmall, fontWeight: "600" },
                    ]}
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
               {plan.nextReminderAt ? formatTimeForDisplay(plan.nextReminderAt) : "Not scheduled"}
             </Text>
           </View>
        </AnimatedCard>

        {/* Timeline Section */}
        <View style={styles.timelineSection}>
          <Text style={[{ color: theme.colors.textPrimary, ...theme.typography.titleLarge, marginBottom: 16 }]}>
            Today's log
          </Text>
          
          {sessionLogs.length === 0 ? (
            <AnimatedCard delay={200} style={styles.emptyStateCard}>
              <Text style={[{ color: theme.colors.textSecondary, ...theme.typography.body, textAlign: "center", lineHeight: 22 }]}>
                No logs yet today.{"\n"}Tap "I drank" above to add your first sip.
              </Text>
            </AnimatedCard>
          ) : (
            <View style={styles.timelineList}>
              {sessionLogs.map((log, index) => (
                <View key={log.id} style={styles.timelineRow}>
                  <View style={[styles.timelineNode, { backgroundColor: theme.colors.accent }]} />
                  {index < sessionLogs.length - 1 && <View style={[styles.timelineLine, { backgroundColor: theme.colors.border }]} />}
                  <View style={[styles.timelineCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                    <Text style={[{ color: theme.colors.textPrimary, ...theme.typography.body }]}>
                      {formatLiquid(log.amount, settings.displayUnit)}
                    </Text>
                    <Text style={[{ color: theme.colors.textSecondary, ...theme.typography.caption }]}>
                      {formatTimeForDisplay(log.timestamp)}
                    </Text>
                  </View>
                  {index === 0 && !log.isReconstructed && (
                    <Pressable onPress={() => handleUndo(log.id, log.amount, log.timestamp)} style={styles.undoButton}>
                      <Text style={[{ color: theme.colors.accent, ...theme.typography.caption }]}>Undo</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
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
    marginHorizontal: 16,
    padding: 16,
  },
  quickLogRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  presetButton: {
    borderWidth: 1,
    borderRadius: 999, // pill
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44, // touch target
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
