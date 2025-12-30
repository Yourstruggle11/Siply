import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Screen } from "../../src/shared/components/Screen";
import { AnimatedCard } from "../../src/shared/components/AnimatedCard";
import { PulsingTitle } from "../../src/shared/components/PulsingTitle";
import { useTheme } from "../../src/shared/theme/ThemeProvider";

export default function HelpScreen() {
  const theme = useTheme();
  return (
    <Screen scroll>
      <View style={styles.container}>
        <PulsingTitle text="Help" style={styles.title} />
        <AnimatedCard style={styles.section} delay={100}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Notifications</Text>
          <View style={styles.list}>
            <View style={styles.listItem}>
              <Text style={[styles.bullet, { color: theme.colors.textSecondary }]}>•</Text>
              <Text style={[styles.listText, { color: theme.colors.textPrimary }]}>
                Notifications cannot override Silent mode or Do Not Disturb.
              </Text>
            </View>
            <View style={styles.listItem}>
              <Text style={[styles.bullet, { color: theme.colors.textSecondary }]}>•</Text>
              <Text style={[styles.listText, { color: theme.colors.textPrimary }]}>
                If you want sound, keep ringer on and volume up.
              </Text>
            </View>
            <View style={styles.listItem}>
              <Text style={[styles.bullet, { color: theme.colors.textSecondary }]}>•</Text>
              <Text style={[styles.listText, { color: theme.colors.textPrimary }]}>
                When nudges are on, Siply sends two follow-up reminders at +5 and +10 minutes.
              </Text>
            </View>
            <View style={styles.listItem}>
              <Text style={[styles.bullet, { color: theme.colors.textSecondary }]}>•</Text>
              <Text style={[styles.listText, { color: theme.colors.textPrimary }]}>
                Use the “I drank” action on a reminder to log without opening the app.
              </Text>
            </View>
            <View style={styles.listItem}>
              <Text style={[styles.bullet, { color: theme.colors.textSecondary }]}>•</Text>
              <Text style={[styles.listText, { color: theme.colors.textPrimary }]}>
                Android tip: check app notification settings and battery optimization.
              </Text>
            </View>
          </View>
        </AnimatedCard>

        <AnimatedCard style={styles.section} delay={180}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Active window</Text>
          <View style={styles.list}>
            <View style={styles.listItem}>
              <Text style={[styles.bullet, { color: theme.colors.textSecondary }]}>•</Text>
              <Text style={[styles.listText, { color: theme.colors.textPrimary }]}>
                End time can be after midnight, for example 07:00 to 01:00.
              </Text>
            </View>
          </View>
        </AnimatedCard>

        <AnimatedCard style={styles.section} delay={260}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Action buttons</Text>
          <View style={styles.list}>
            <View style={styles.listItem}>
              <Text style={[styles.bullet, { color: theme.colors.textSecondary }]}>•</Text>
              <Text style={[styles.listText, { color: theme.colors.textPrimary }]}>
                Reschedule notifications: rebuilds the next 24 hours of reminders.
              </Text>
            </View>
            <View style={styles.listItem}>
              <Text style={[styles.bullet, { color: theme.colors.textSecondary }]}>•</Text>
              <Text style={[styles.listText, { color: theme.colors.textPrimary }]}>
                Cancel all notifications: stops all scheduled reminders.
              </Text>
            </View>
            <View style={styles.listItem}>
              <Text style={[styles.bullet, { color: theme.colors.textSecondary }]}>•</Text>
              <Text style={[styles.listText, { color: theme.colors.textPrimary }]}>
                Test notification (sound): sends a sample reminder to check volume and vibration.
              </Text>
            </View>
            <View style={styles.listItem}>
              <Text style={[styles.bullet, { color: theme.colors.textSecondary }]}>•</Text>
              <Text style={[styles.listText, { color: theme.colors.textPrimary }]}>
                Reset today’s progress: clears today’s consumed amount.
              </Text>
            </View>
          </View>
        </AnimatedCard>
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
  list: {
    gap: 10,
  },
  listItem: {
    flexDirection: "row",
  },
  bullet: {
    width: 16,
    fontSize: 14,
    lineHeight: 20,
  },
  listText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
  },
});
