import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { Screen } from "../../src/shared/components/Screen";
import { PrimaryButton } from "../../src/features/hydration/ui/components/PrimaryButton";
import { useTheme } from "../../src/shared/theme/ThemeProvider";
import { DEFAULT_SETTINGS } from "../../src/core/constants";
import { useHydration } from "../../src/features/hydration/state/hydrationStore";

export default function PermissionsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { updateSettings, completeOnboarding } = useHydration();

  const handleAllow = async () => {
    await Notifications.requestPermissionsAsync();
    await completeOnboarding();
    router.replace("/(tabs)");
  };

  const handleContinueWithoutSound = async () => {
    await updateSettings({ soundEnabled: false });
    await Notifications.requestPermissionsAsync();
    await completeOnboarding();
    router.replace("/(tabs)");
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
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Allow notifications</Text>
          <Text style={[styles.body, { color: theme.colors.textPrimary }]}>
            Siply uses notifications to remind you to drink water.
          </Text>
          <Text style={[styles.note, { color: theme.colors.textSecondary }]}>
            Notifications cannot override Silent mode or Do Not Disturb.
          </Text>
        </View>
        <View style={styles.actions}>
          <PrimaryButton label="Allow notifications" onPress={handleAllow} />
          <PrimaryButton label="Continue without sound" variant="secondary" onPress={handleContinueWithoutSound} />
          <Pressable onPress={handleSkip}>
            <Text style={[styles.skip, { color: theme.colors.textSecondary }]}>Skip (use defaults)</Text>
          </Pressable>
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
    paddingTop: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
  },
  body: {
    fontSize: 16,
    lineHeight: 22,
  },
  note: {
    fontSize: 13,
  },
  actions: {
    gap: 12,
    paddingBottom: 12,
    alignItems: "center",
  },
  skip: {
    fontSize: 13,
  },
});
