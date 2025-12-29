import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Screen } from "../../src/shared/components/Screen";
import { Card } from "../../src/shared/components/Card";
import { Field } from "../../src/shared/components/Field";
import { PrimaryButton } from "../../src/features/hydration/ui/components/PrimaryButton";
import { ProgressBar } from "../../src/features/hydration/ui/components/ProgressBar";
import { useTheme } from "../../src/shared/theme/ThemeProvider";
import { useHydration } from "../../src/features/hydration/state/hydrationStore";
import { useHydrationPlan } from "../../src/shared/hooks/useHydrationPlan";
import { formatTimeForDisplay } from "../../src/core/time";

export default function HomeScreen() {
  const theme = useTheme();
  const { addConsumed } = useHydration();
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
    void addConsumed(plan.mlPerReminder);
  };

  const handleAddAmount = () => {
    const parsed = Number.parseInt(customAmount, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      void addConsumed(parsed);
      setCustomAmount("");
      setShowAddAmount(false);
    }
  };

  return (
    <Screen scroll>
      <View style={styles.container}>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Today</Text>

        <Card>
          <View style={styles.progressHeader}>
            <Text style={[styles.progressText, { color: theme.colors.textPrimary }]}>
              {plan.consumedMl} ml of {plan.targetMl} ml
            </Text>
          </View>
          <ProgressBar progress={progress} />
        </Card>

        <Card>
          <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
            Next sip: ~{plan.mlPerReminder} ml ({plan.sipsPerReminder} sips)
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
    marginBottom: 12,
  },
  progressText: {
    fontSize: 16,
    fontWeight: "500",
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
});
