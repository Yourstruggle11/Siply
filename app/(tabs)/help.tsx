import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Screen } from "../../src/shared/components/Screen";
import { Card } from "../../src/shared/components/Card";
import { useTheme } from "../../src/shared/theme/ThemeProvider";

export default function HelpScreen() {
  const theme = useTheme();
  return (
    <Screen scroll>
      <View style={styles.container}>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Help</Text>
        <Card>
          <Text style={[styles.body, { color: theme.colors.textPrimary }]}>
            Notifications cannot override Silent mode or Do Not Disturb.
          </Text>
          <Text style={[styles.body, { color: theme.colors.textPrimary, marginTop: 10 }]}>
            If you want sound, keep ringer on and volume up.
          </Text>
          <Text style={[styles.body, { color: theme.colors.textPrimary, marginTop: 10 }]}>
            When nudges are on, Siply sends two follow-up reminders at +5 and +10 minutes.
          </Text>
          <Text style={[styles.body, { color: theme.colors.textPrimary, marginTop: 10 }]}>
            Android tip: check app notification settings and battery optimization.
          </Text>
        </Card>
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
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
});
