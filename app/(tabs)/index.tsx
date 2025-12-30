import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Screen } from "../../src/shared/components/Screen";
import { AnimatedCard } from "../../src/shared/components/AnimatedCard";
import { AnimatedProgressValue } from "../../src/shared/components/AnimatedProgressValue";
import { AnimatedStatRow } from "../../src/shared/components/AnimatedStatRow";
import { PulsingTitle } from "../../src/shared/components/PulsingTitle";
import { Field } from "../../src/shared/components/Field";
import { PrimaryButton } from "../../src/features/hydration/ui/components/PrimaryButton";
import { ProgressBar } from "../../src/features/hydration/ui/components/ProgressBar";
import { useTheme } from "../../src/shared/theme/ThemeProvider";
import { useHydration } from "../../src/features/hydration/state/hydrationStore";
import { useHydrationPlan } from "../../src/shared/hooks/useHydrationPlan";
import { formatTimeForDisplay } from "../../src/core/time";
import { triggerLightHaptic } from "../../src/shared/haptics";
import { useNotificationPermission } from "../../src/shared/hooks/useNotificationPermission";

export default function HomeScreen() {
  const theme = useTheme();
  const { addConsumed, quickLog } = useHydration();
  const { permission, requestPermission, openSettings } = useNotificationPermission();
  const requestedRef = useRef(false);
  const plan = useHydrationPlan();
  const [showAddAmount, setShowAddAmount] = useState(false);
  const [customAmount, setCustomAmount] = useState("");

  const progress = useMemo(() => {
    if (plan.targetMl <= 0) {
      return 0;
    }
    return Math.min(1, plan.consumedMl / plan.targetMl);
  }, [plan.consumedMl, plan.targetMl]);

  const handleQuickAdd = () => {
    void triggerLightHaptic();
    void addConsumed(plan.mlPerReminder);
  };

  const handleAddAmount = () => {
    const parsed = Number.parseInt(customAmount, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      void triggerLightHaptic();
      void addConsumed(parsed);
      setCustomAmount("");
      setShowAddAmount(false);
    }
  };

  const handleQuickLog = (amountMl: number) => {
    void triggerLightHaptic();
    void addConsumed(amountMl);
  };

  useEffect(() => {
    if (!permission || permission.granted || !permission.canAskAgain) {
      return;
    }
    if (requestedRef.current) {
      return;
    }
    requestedRef.current = true;
    void requestPermission();
  }, [permission, requestPermission]);

  return (
    <Screen scroll>
      <View style={styles.container}>
        <PulsingTitle text="Today" style={styles.title} />

        {permission && !permission.granted ? (
          <AnimatedCard style={styles.alertCard} delay={80}>
            <Text style={[styles.alertTitle, { color: theme.colors.textPrimary }]}>
              Notifications are off
            </Text>
            <Text style={[styles.alertBody, { color: theme.colors.textSecondary }]}>
              Reminders will not fire until notifications are enabled.
            </Text>
            <PrimaryButton
              label={permission.canAskAgain ? "Allow notifications" : "Open settings"}
              variant="secondary"
              onPress={permission.canAskAgain ? requestPermission : openSettings}
            />
          </AnimatedCard>
        ) : null}

        <AnimatedCard delay={120}>
          <View style={styles.progressHeader}>
            <View style={styles.progressValueRow}>
              <AnimatedProgressValue value={plan.consumedMl} suffix=" ml" style={styles.progressValue} />
              <Text style={[styles.progressSubtext, { color: theme.colors.textSecondary }]}>
                of {plan.targetMl} ml
              </Text>
            </View>
            <AnimatedStatRow
              label="Remaining"
              value={`${plan.remainingMl} ml`}
              delay={160}
              labelStyle={[styles.progressSubtext, { color: theme.colors.textSecondary }]}
              valueStyle={[styles.progressSubtext, { color: theme.colors.textSecondary }]}
            />
          </View>
          <ProgressBar progress={progress} />
        </AnimatedCard>

        <AnimatedCard delay={180}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Quick log</Text>
          <View style={styles.quickLogRow}>
            {quickLog.presets.map((amount) => {
              const isActive = quickLog.lastUsedMl === amount;
              return (
                <Pressable
                  key={`preset-${amount}`}
                  onPress={() => handleQuickLog(amount)}
                  style={[
                    styles.presetButton,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: isActive ? theme.colors.accent : theme.colors.surface,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.presetText,
                      { color: isActive ? theme.colors.surface : theme.colors.textPrimary },
                    ]}
                  >
                    {amount} ml
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.quickLogHint, { color: theme.colors.textSecondary }]}>
            Customize presets in Settings.
          </Text>
        </AnimatedCard>

        <AnimatedCard delay={240} style={styles.statCard}>
          <AnimatedStatRow
            label="Next sip"
            value={
              plan.targetMet
                ? "Target met for today"
                : `~${plan.mlPerReminder} ml (${plan.sipsPerReminder} sips)`
            }
            delay={260}
            labelStyle={styles.label}
            valueStyle={styles.labelValue}
          />
          <AnimatedStatRow
            label="Next reminder"
            value={plan.nextReminderAt ? formatTimeForDisplay(plan.nextReminderAt) : "Not scheduled"}
            delay={300}
            labelStyle={styles.label}
            valueStyle={styles.labelValue}
          />
        </AnimatedCard>

        <View style={styles.actions}>
          <PrimaryButton label="I drank" onPress={handleQuickAdd} />
          <PrimaryButton
            label={showAddAmount ? "Cancel" : "Add amount"}
            variant="secondary"
            onPress={() => setShowAddAmount((value) => !value)}
          />
        </View>

        {showAddAmount ? (
          <AnimatedCard delay={300}>
            <View style={styles.addRow}>
              <Field
                label="Amount (ml)"
                value={customAmount}
                onChangeText={setCustomAmount}
                keyboardType="number-pad"
                placeholder="250"
              />
              <PrimaryButton label="Add" onPress={handleAddAmount} />
            </View>
          </AnimatedCard>
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
  progressHeader: {
    marginBottom: 8,
    gap: 6,
  },
  progressValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  progressValue: {
    fontSize: 16,
    fontWeight: "600",
  },
  progressSubtext: {
    fontSize: 13,
  },
  label: {
    fontSize: 14,
  },
  labelValue: {
    fontSize: 14,
    textAlign: "right",
  },
  actions: {
    gap: 12,
  },
  statCard: {
    gap: 10,
  },
  addRow: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  quickLogRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 10,
  },
  presetButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  presetText: {
    fontSize: 14,
    fontWeight: "600",
  },
  quickLogHint: {
    fontSize: 12,
    marginTop: 10,
  },
  alertCard: {
    gap: 10,
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  alertBody: {
    fontSize: 13,
  },
});
