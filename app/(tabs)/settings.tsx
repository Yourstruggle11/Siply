import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Screen } from "../../src/shared/components/Screen";
import { Card } from "../../src/shared/components/Card";
import { Field } from "../../src/shared/components/Field";
import { TimeField } from "../../src/shared/components/TimeField";
import { ToggleRow } from "../../src/shared/components/ToggleRow";
import { PrimaryButton } from "../../src/features/hydration/ui/components/PrimaryButton";
import { useTheme } from "../../src/shared/theme/ThemeProvider";
import {
  MAX_NOTIFICATIONS_PER_DAY,
  MIN_INTERVAL_MINUTES,
  NUDGE_MINUTES,
  REMINDER_TARGET_ML,
  TAGLINE,
} from "../../src/core/constants";
import { parseTimeToMinutes } from "../../src/core/time";
import { useHydration } from "../../src/features/hydration/state/hydrationStore";
import {
  cancelAllNotifications,
  rescheduleNotifications,
  sendTestNotification,
} from "../../src/features/hydration/notifications/notifier";
import {
  computeAutoPlan,
  computeSipsPerReminder,
  getWindowMinutes,
  litersToMl,
} from "../../src/features/hydration/domain/calculations";

export default function SettingsScreen() {
  const theme = useTheme();
  const { settings, updateSettings, resetToday, progress } = useHydration();

  const [draft, setDraft] = useState(() => ({
    target: settings.targetLiters.toFixed(1),
    windowStart: settings.windowStart,
    windowEnd: settings.windowEnd,
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
    const hasValidWindow =
      startMinutes !== null &&
      endMinutes !== null &&
      getWindowMinutes({ ...settings, windowStart: draft.windowStart, windowEnd: draft.windowEnd }) > 0;
    const parsedSip = Number.parseInt(draft.sipMl, 10);

    return {
      targetLiters:
        Number.isFinite(parsedTarget) && parsedTarget > 0 ? parsedTarget : settings.targetLiters,
      windowStart: hasValidWindow ? draft.windowStart : settings.windowStart,
      windowEnd: hasValidWindow ? draft.windowEnd : settings.windowEnd,
      sipMl: Number.isFinite(parsedSip) && parsedSip > 0 ? parsedSip : settings.sipMl,
      escalationEnabled: draft.escalationEnabled,
      soundEnabled: draft.soundEnabled,
      appearanceMode: draft.appearanceMode,
    };
  }, [draft, settings]);

  const previewPlan = useMemo(() => {
    const targetMl = litersToMl(normalizedSettings.targetLiters);
    const windowMinutes = getWindowMinutes(normalizedSettings);
    const factor = normalizedSettings.escalationEnabled ? 1 + NUDGE_MINUTES.length : 1;
    const maxBase = Math.max(1, Math.floor(MAX_NOTIFICATIONS_PER_DAY / factor));
    return computeAutoPlan({
      remainingMl: targetMl,
      windowMinutes,
      minIntervalMinutes: MIN_INTERVAL_MINUTES,
      maxReminders: maxBase,
      desiredReminderMl: REMINDER_TARGET_ML,
    });
  }, [normalizedSettings]);

  const previewMl = previewPlan?.mlPerReminder ?? REMINDER_TARGET_ML;
  const previewSips = computeSipsPerReminder(previewMl, normalizedSettings.sipMl);
  const previewInterval = previewPlan?.intervalMinutes ?? MIN_INTERVAL_MINUTES;

  const isDirty = useMemo(
    () =>
      draft.target !== settings.targetLiters.toFixed(1) ||
      draft.windowStart !== settings.windowStart ||
      draft.windowEnd !== settings.windowEnd ||
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

        {isDirty ? (
          <Card style={styles.saveBar}>
            <Text style={[styles.saveText, { color: theme.colors.textPrimary }]}>Unsaved changes</Text>
            <PrimaryButton label="Save changes" onPress={handleSave} />
          </Card>
        ) : null}

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
          <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
            End time can be after midnight (example: 01:00).
          </Text>
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
          <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
            Reminder spacing: automatic (~{previewInterval} min)
          </Text>
          <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
            One reminder ~= {previewMl} ml ({previewSips} sips)
          </Text>
          <View style={styles.row}>
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

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Actions</Text>
          <View style={styles.actionGroup}>
            <PrimaryButton
              label="Reschedule notifications"
              onPress={() => {
                void rescheduleNotifications(settings, progress.consumedMl);
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
  saveBar: {
    gap: 10,
  },
  saveText: {
    fontSize: 14,
    fontWeight: "500",
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  helper: {
    fontSize: 13,
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
