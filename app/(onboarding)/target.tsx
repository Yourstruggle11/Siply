import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../../src/shared/components/Screen";
import { Field } from "../../src/shared/components/Field";
import { PrimaryButton } from "../../src/features/hydration/ui/components/PrimaryButton";
import { useTheme } from "../../src/shared/theme/ThemeProvider";
import { DEFAULT_SETTINGS } from "../../src/core/constants";
import { useHydration } from "../../src/features/hydration/state/hydrationStore";

export default function TargetScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { settings, updateSettings, completeOnboarding } = useHydration();
  const [target, setTarget] = useState(String(settings.targetLiters.toFixed(1)));

  const handleContinue = async () => {
    const parsed = Number.parseFloat(target);
    const nextValue = Number.isFinite(parsed) && parsed > 0 ? parsed : settings.targetLiters;
    await updateSettings({ targetLiters: nextValue });
    router.push("/(onboarding)/defaults");
  };

  const handleSkip = async () => {
    await updateSettings(DEFAULT_SETTINGS);
    await completeOnboarding();
    router.replace("/(tabs)");
  };

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Daily water target</Text>
          <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
            Set how much water you want to drink each day.
          </Text>
          <Field
            label="Target liters"
            value={target}
            onChangeText={setTarget}
            keyboardType="decimal-pad"
            placeholder="3.0"
          />
          <Text style={[styles.note, { color: theme.colors.textSecondary }]}>You can change this later.</Text>
        </View>
        <View style={styles.actions}>
          <PrimaryButton label="Continue" onPress={handleContinue} />
          <PrimaryButton label="Skip (use defaults)" variant="secondary" onPress={handleSkip} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "space-between",
  },
  content: {
    gap: 14,
    paddingTop: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
  },
  helper: {
    fontSize: 14,
  },
  note: {
    fontSize: 12,
  },
  actions: {
    gap: 12,
    paddingBottom: 12,
  },
});
