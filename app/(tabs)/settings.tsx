import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Screen } from "../../src/shared/components/Screen";
import { Card } from "../../src/shared/components/Card";
import { Field } from "../../src/shared/components/Field";
import { TimeField } from "../../src/shared/components/TimeField";
import { ToggleRow } from "../../src/shared/components/ToggleRow";
import { PrimaryButton } from "../../src/features/hydration/ui/components/PrimaryButton";
import { useTheme } from "../../src/shared/theme/ThemeProvider";
import { TAGLINE, MIN_INTERVAL_MINUTES } from "../../src/core/constants";
import { parseTimeToMinutes } from "../../src/core/time";
import { useHydration } from "../../src/features/hydration/state/hydrationStore";
import {
  cancelAllNotifications,
  rescheduleNotifications,
  sendTestNotification,
} from "../../src/features/hydration/notifications/notifier";

export default function SettingsScreen() {
  const theme = useTheme();
  const { settings, updateSettings, resetToday } = useHydration();

  const [draft, setDraft] = useState(() => ({
    target: settings.targetLiters.toFixed(1),
    windowStart: settings.windowStart,
    windowEnd: settings.windowEnd,
    interval: String(settings.intervalMinutes),
    sipMl: String(settings.sipMl),
    escalationEnabled: settings.escalationEnabled,
    soundEnabled: settings.soundEnabled,
    appearanceMode: settings.appearanceMode,
  }));

  useEffect(() => {
    setDraft({
      target: settings.targetLiters.toFixed(1),
      windowStart: settings.windowStart,
      windowEnd: settings.windowEnd,
      interval: String(settings.intervalMinutes),
      sipMl: String(settings.sipMl),
      escalationEnabled: settings.escalationEnabled,
      soundEnabled: settings.soundEnabled,
      appearanceMode: settings.appearanceMode,
    });
  }, [settings]);

  const normalizedSettings = useMemo(() => {
    const parsedTarget = Number.parseFloat(draft.target);
    const startMinutes = parseTimeToMinutes(draft.windowStart);
    const endMinutes = parseTimeToMinutes(draft.windowEnd);
    const hasValidWindow = startMinutes !== null && endMinutes !== null && endMinutes > startMinutes;
    const parsedInterval = Number.parseInt(draft.interval, 10);
    const parsedSip = Number.parseInt(draft.sipMl, 10);

    return {
      targetLiters:
        Number.isFinite(parsedTarget) && parsedTarget > 0 ? parsedTarget : settings.targetLiters,
      windowStart: hasValidWindow ? draft.windowStart : settings.windowStart,
      windowEnd: hasValidWindow ? draft.windowEnd : settings.windowEnd,
      intervalMinutes:
        Number.isFinite(parsedInterval) && parsedInterval >= MIN_INTERVAL_MINUTES
          ? parsedInterval
          : settings.intervalMinutes,
      sipMl: Number.isFinite(parsedSip) && parsedSip > 0 ? parsedSip : settings.sipMl,
      escalationEnabled: draft.escalationEnabled,
      soundEnabled: draft.soundEnabled,
      appearanceMode: draft.appearanceMode,
    };
  }, [draft, settings]);

  const isDirty = useMemo(
    () =>
      draft.target !== settings.targetLiters.toFixed(1) ||
      draft.windowStart !== settings.windowStart ||
      draft.windowEnd !== settings.windowEnd ||
      draft.interval !== String(settings.intervalMinutes) ||
      draft.sipMl !== String(settings.sipMl) ||
      draft.escalationEnabled !== settings.escalationEnabled ||
      draft.soundEnabled !== settings.soundEnabled ||
      draft.appearanceMode !== settings.appearanceMode,
    [draft, settings]
  );

  const handleSave = async () => {
    await updateSettings(normalizedSettings);
  };

  return (
    <Screen scroll>
      <View style={styles.container}>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Settings</Text>

        <Card>
          <Text style={[styles.aboutTitle, { color: theme.colors.textPrimary }]}>Siply</Text>
          <Text style={[styles.aboutTagline, { color: theme.colors.textSecondary }]}>{TAGLINE}</Text>
        </Card>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Daily target</Text>
          <Field
            label="Target liters"
            value={draft.target}
            onChangeText={(value) => setDraft((prev) => ({ ...prev, target: value }))}
            keyboardType="decimal-pad"
          />
        </Card>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Active window</Text>
          <View style={styles.row}>
            <View style={styles.field}>
              <TimeField
                label="Start"
                value={draft.windowStart}
                onChange={(value) => setDraft((prev) => ({ ...prev, windowStart: value }))}
              />
            </View>
            <View style={styles.field}>
              <TimeField
                label="End"
                value={draft.windowEnd}
                onChange={(value) => setDraft((prev) => ({ ...prev, windowEnd: value }))}
              />
            </View>
          </View>
        </Card>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Reminders</Text>
          <View style={styles.row}>
            <View style={styles.field}>
              <Field
                label="Interval minutes"
                value={draft.interval}
                onChangeText={(value) => setDraft((prev) => ({ ...prev, interval: value }))}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.field}>
              <Field
                label="Sip ml"
                value={draft.sipMl}
                onChangeText={(value) => setDraft((prev) => ({ ...prev, sipMl: value }))}
                keyboardType="number-pad"
              />
            </View>
          </View>
          <ToggleRow
            label="Nudges"
            helper="Extra reminders after 5 and 10 minutes."
            value={draft.escalationEnabled}
            onValueChange={(value) => setDraft((prev) => ({ ...prev, escalationEnabled: value }))}
          />
          <ToggleRow
            label="Sound"
            helper="Uses system sound if allowed."
            value={draft.soundEnabled}
            onValueChange={(value) => setDraft((prev) => ({ ...prev, soundEnabled: value }))}
          />
        </Card>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Appearance</Text>
          <ToggleRow
            label="Dark mode"
            helper="Overrides system theme."
            value={draft.appearanceMode === "dark"}
            onValueChange={(value) =>
              setDraft((prev) => ({ ...prev, appearanceMode: value ? "dark" : "light" }))
            }
          />
        </Card>

        {isDirty ? (
          <Card style={styles.section}>
            <PrimaryButton label="Save changes" onPress={handleSave} />
          </Card>
        ) : null}

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Actions</Text>
          <View style={styles.actionGroup}>
            <PrimaryButton
              label="Reschedule notifications"
              onPress={() => {
                void rescheduleNotifications(settings);
              }}
            />
            <PrimaryButton
              label="Cancel all notifications"
              variant="secondary"
              onPress={() => {
                void cancelAllNotifications();
              }}
            />
            <PrimaryButton
              label="Test notification (sound)"
              variant="secondary"
              onPress={() => {
                void sendTestNotification();
              }}
            />
            <PrimaryButton
              label="Reset today's progress"
              variant="secondary"
              onPress={() => {
                void resetToday();
              }}
            />
          </View>
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
  aboutTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  aboutTagline: {
    fontSize: 13,
    marginTop: 4,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  field: {
    flex: 1,
  },
  actionGroup: {
    gap: 10,
  },
});
