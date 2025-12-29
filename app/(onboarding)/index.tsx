import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../../src/shared/components/Screen";
import { PrimaryButton } from "../../src/features/hydration/ui/components/PrimaryButton";
import { useTheme } from "../../src/shared/theme/ThemeProvider";
import { TAGLINE, DEFAULT_SETTINGS } from "../../src/core/constants";
import { useHydration } from "../../src/features/hydration/state/hydrationStore";

export default function WelcomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { updateSettings, completeOnboarding } = useHydration();

  const handleSkip = async () => {
    await updateSettings(DEFAULT_SETTINGS);
    await completeOnboarding();
    router.replace("/(tabs)");
  };

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Siply</Text>
          <Text style={[styles.tagline, { color: theme.colors.textSecondary }]}>{TAGLINE}</Text>
          <Text style={[styles.body, { color: theme.colors.textPrimary }]}>
            Siply spaces your water intake across the day with quiet reminders.
          </Text>
          <Text style={[styles.note, { color: theme.colors.textSecondary }]}>
            Silent or Do Not Disturb may mute sounds.
          </Text>
        </View>
        <View style={styles.actions}>
          <PrimaryButton label="Get started" onPress={() => router.push("/(onboarding)/target")} />
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
    gap: 12,
    paddingTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "600",
  },
  tagline: {
    fontSize: 14,
    letterSpacing: 0.4,
  },
  body: {
    fontSize: 16,
    lineHeight: 22,
    marginTop: 12,
  },
  note: {
    fontSize: 13,
  },
  actions: {
    gap: 12,
    paddingBottom: 12,
  },
});
