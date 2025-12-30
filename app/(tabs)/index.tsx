import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Screen } from "../../src/shared/components/Screen";
import { Card } from "../../src/shared/components/Card";
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
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Today</Text>

        {permission && !permission.granted ? (
          <Card style={styles.alertCard}>
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
          </Card>
        ) : null}

        <Card>
          <View style={styles.progressHeader}>
            <Text style={[styles.progressText, { color: theme.colors.textPrimary }]}>
              {plan.consumedMl} ml of {plan.targetMl} ml
            </Text>
            <Text style={[styles.progressSubtext, { color: theme.colors.textSecondary }]}>
              Remaining: {plan.remainingMl} ml
            </Text>
          </View>
          <ProgressBar progress={progress} />
        </Card>

        <Card>
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
        </Card>

        <Card>
          <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
            {plan.targetMet
              ? "Next sip: target met for today"
              : `Next sip: ~${plan.mlPerReminder} ml (${plan.sipsPerReminder} sips)`}
          </Text>
          <Text style={[styles.label, { color: theme.colors.textSecondary, marginTop: 6 }]}>
            Next reminder at {plan.nextReminderAt ? formatTimeForDisplay(plan.nextReminderAt) : "not scheduled"}
          </Text>
        </Card>

        <View style={styles.actions}>
          <PrimaryButton label="I drank" onPress={handleQuickAdd} />
          <PrimaryButton
            label={showAddAmount ? "Cancel" : "Add amount"}
            variant="secondary"
            onPress={() => setShowAddAmount((value) => !value)}
          />
        </View>

        {showAddAmount ? (
          <Card>
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
          </Card>
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
  progressText: {
    fontSize: 16,
    fontWeight: "500",
  },
  progressSubtext: {
    fontSize: 13,
  },
  label: {
    fontSize: 14,
  },
  actions: {
    gap: 12,
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
