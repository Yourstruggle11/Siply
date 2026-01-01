import React, { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Screen } from "../../src/shared/components/Screen";
import { AnimatedCard } from "../../src/shared/components/AnimatedCard";
import { PulsingTitle } from "../../src/shared/components/PulsingTitle";
import { Field } from "../../src/shared/components/Field";
import { TimeField } from "../../src/shared/components/TimeField";
import { ToggleRow } from "../../src/shared/components/ToggleRow";
import { PrimaryButton } from "../../src/features/hydration/ui/components/PrimaryButton";
import { useTheme } from "../../src/shared/theme/ThemeProvider";
import {
  MAX_NOTIFICATIONS_PER_DAY,
  ENABLE_DIAGNOSTICS,
  MIN_INTERVAL_MINUTES,
  NUDGE_MINUTES,
  QUICK_LOG_MAX_PRESETS,
  QUICK_LOG_MIN_PRESETS,
  REMINDER_TARGET_ML,
  TAGLINE,
} from "../../src/core/constants";
import { parseTimeToMinutes } from "../../src/core/time";
import { useHydration } from "../../src/features/hydration/state/hydrationStore";
import { useNotificationPermission } from "../../src/shared/hooks/useNotificationPermission";
import {
  cancelAllNotifications,
  rescheduleNotifications,
  sendTestNotification,
} from "../../src/features/hydration/notifications/notifier";
import {
  clearNotificationDiagnostics,
  loadNotificationDiagnostics,
  NotificationDiagnosticsState,
} from "../../src/features/hydration/notifications/diagnostics";
import {
  computeAutoPlan,
  computeSipsPerReminder,
  getWindowMinutes,
  litersToMl,
} from "../../src/features/hydration/domain/calculations";

export default function SettingsScreen() {
  const theme = useTheme();
  const { settings, updateSettings, resetToday, progress, quickLog, updateQuickLogPresets } =
    useHydration();

  const [draft, setDraft] = useState(() => ({
    target: settings.targetLiters.toFixed(1),
    windowStart: settings.windowStart,
    windowEnd: settings.windowEnd,
    sipMl: String(settings.sipMl),
    escalationEnabled: settings.escalationEnabled,
    soundEnabled: settings.soundEnabled,
    appearanceMode: settings.appearanceMode,
    gentleGoalEnabled: settings.gentleGoalEnabled,
    gentleGoalThreshold: String(settings.gentleGoalThreshold),
  }));

  const [newPreset, setNewPreset] = useState("");
  const [calcWeight, setCalcWeight] = useState("");
  const [calcActivity, setCalcActivity] = useState<"low" | "medium" | "high">("low");
  const [calcClimateHot, setCalcClimateHot] = useState(false);
  const { permission, requestPermission, openSettings } = useNotificationPermission();
  const [diagnostics, setDiagnostics] = useState<NotificationDiagnosticsState | null>(null);
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [permissionsSnapshot, setPermissionsSnapshot] =
    useState<Notifications.NotificationPermissionsStatus | null>(null);
  const [channels, setChannels] = useState<Notifications.NotificationChannel[] | null>(null);
  const [scheduledCount, setScheduledCount] = useState(0);
  const [scheduledNext, setScheduledNext] = useState<string[]>([]);

  useEffect(() => {
    setDraft({
      target: settings.targetLiters.toFixed(1),
      windowStart: settings.windowStart,
      windowEnd: settings.windowEnd,
      sipMl: String(settings.sipMl),
      escalationEnabled: settings.escalationEnabled,
      soundEnabled: settings.soundEnabled,
      appearanceMode: settings.appearanceMode,
      gentleGoalEnabled: settings.gentleGoalEnabled,
      gentleGoalThreshold: String(settings.gentleGoalThreshold),
    });
  }, [settings]);

  const formatTimestamp = (value?: string) => {
    if (!value) {
      return "Never";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString();
  };

  const refreshDiagnostics = async () => {
    setDiagnosticLoading(true);
    try {
      const [permissionsState, scheduled, stored] = await Promise.all([
        Notifications.getPermissionsAsync(),
        Notifications.getAllScheduledNotificationsAsync(),
        loadNotificationDiagnostics(),
      ]);
      setPermissionsSnapshot(permissionsState);
      setDiagnostics(stored);

      const dates = scheduled
        .map((item) => {
          const trigger = item.trigger as { date?: string | number | Date } | null;
          if (!trigger || trigger.date === undefined || trigger.date === null) {
            return null;
          }
          const date = new Date(trigger.date);
          return Number.isNaN(date.getTime()) ? null : date;
        })
        .filter((value): value is Date => value !== null)
        .sort((a, b) => a.getTime() - b.getTime());

      setScheduledCount(scheduled.length);
      setScheduledNext(dates.slice(0, 5).map((date) => date.toLocaleString()));

      if (Platform.OS === "android") {
        const channelList = await Notifications.getNotificationChannelsAsync();
        setChannels(channelList ?? []);
      } else {
        setChannels(null);
      }
    } finally {
      setDiagnosticLoading(false);
    }
  };

  const buildDiagnosticsExport = () => {
    const lines: string[] = [];
    lines.push("Siply notification diagnostics");
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`App ownership: ${Constants.appOwnership ?? "unknown"}`);
    lines.push(`Platform: ${Platform.OS} ${Platform.Version}`);
    lines.push(
      `Build version: ${Constants.nativeAppVersion ?? "unknown"} (${Constants.nativeBuildVersion ?? "n/a"})`
    );
    if (permissionsSnapshot) {
      lines.push(
        `Permissions: status=${permissionsSnapshot.status} granted=${
          permissionsSnapshot.granted ? "yes" : "no"
        } canAskAgain=${permissionsSnapshot.canAskAgain ? "yes" : "no"}`
      );
      lines.push(`Permissions raw: ${JSON.stringify(permissionsSnapshot)}`);
    } else {
      lines.push("Permissions: unknown");
    }
    lines.push(`Scheduled count: ${scheduledCount}`);
    if (scheduledNext.length) {
      lines.push(`Next reminders: ${scheduledNext.join(" | ")}`);
    }
    if (diagnostics?.lastSchedule) {
      lines.push(`Last reschedule: ${diagnostics.lastSchedule.at}`);
      lines.push(
        `Reschedule result: requested=${diagnostics.lastSchedule.result.requested} scheduled=${diagnostics.lastSchedule.result.scheduled} failed=${diagnostics.lastSchedule.result.failed}`
      );
      if (diagnostics.lastSchedule.result.errors.length) {
        lines.push(`Reschedule errors: ${diagnostics.lastSchedule.result.errors.join(" | ")}`);
      }
    }
    if (diagnostics?.lastTest) {
      lines.push(
        `Last test: ${diagnostics.lastTest.at} success=${diagnostics.lastTest.success ? "yes" : "no"}`
      );
      if (diagnostics.lastTest.error) {
        lines.push(`Test error: ${diagnostics.lastTest.error}`);
      }
    }
    if (channels && channels.length) {
      lines.push("Android channels:");
      channels.forEach((channel) => {
        lines.push(
          `- ${channel.id} | importance=${channel.importance} | sound=${channel.sound ?? "none"} | vibrate=${
            channel.enableVibrate ? "yes" : "no"
          }`
        );
      });
    }
    return lines.join("\n");
  };

  const handleExportDiagnostics = async () => {
    if (exporting) {
      return;
    }
    setExporting(true);
    setExportStatus(null);
    const payload = buildDiagnosticsExport();
    try {
      await Share.share({ message: payload });
      setExportStatus("Opened share sheet. Use Copy to clipboard if needed.");
    } catch {
      setExportStatus("Failed to export diagnostics.");
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (ENABLE_DIAGNOSTICS) {
      void refreshDiagnostics();
    }
  }, []);

  const normalizedSettings = useMemo(() => {
    const parsedTarget = Number.parseFloat(draft.target);
    const startMinutes = parseTimeToMinutes(draft.windowStart);
    const endMinutes = parseTimeToMinutes(draft.windowEnd);
    const hasValidWindow =
      startMinutes !== null &&
      endMinutes !== null &&
      getWindowMinutes({ ...settings, windowStart: draft.windowStart, windowEnd: draft.windowEnd }) > 0;
    const parsedSip = Number.parseInt(draft.sipMl, 10);
    const parsedThreshold = Number.parseInt(draft.gentleGoalThreshold, 10);
    const normalizedThreshold =
      Number.isFinite(parsedThreshold) && parsedThreshold >= 50 && parsedThreshold <= 100
        ? parsedThreshold
        : settings.gentleGoalThreshold;

    return {
      targetLiters:
        Number.isFinite(parsedTarget) && parsedTarget > 0 ? parsedTarget : settings.targetLiters,
      windowStart: hasValidWindow ? draft.windowStart : settings.windowStart,
      windowEnd: hasValidWindow ? draft.windowEnd : settings.windowEnd,
      sipMl: Number.isFinite(parsedSip) && parsedSip > 0 ? parsedSip : settings.sipMl,
      escalationEnabled: draft.escalationEnabled,
      soundEnabled: draft.soundEnabled,
      appearanceMode: draft.appearanceMode,
      gentleGoalEnabled: draft.gentleGoalEnabled,
      gentleGoalThreshold: normalizedThreshold,
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
      draft.appearanceMode !== settings.appearanceMode ||
      draft.gentleGoalEnabled !== settings.gentleGoalEnabled ||
      draft.gentleGoalThreshold !== String(settings.gentleGoalThreshold),
    [draft, settings]
  );

  const handleSave = async () => {
    await updateSettings(normalizedSettings);
  };

  const handleAddPreset = () => {
    if (quickLog.presets.length >= QUICK_LOG_MAX_PRESETS) {
      return;
    }
    const parsed = Number.parseInt(newPreset, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    if (quickLog.presets.includes(parsed)) {
      setNewPreset("");
      return;
    }
    const next = [...quickLog.presets, parsed];
    void updateQuickLogPresets(next);
    setNewPreset("");
  };

  const movePreset = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= quickLog.presets.length) {
      return;
    }
    const next = [...quickLog.presets];
    const [moved] = next.splice(index, 1);
    next.splice(nextIndex, 0, moved);
    void updateQuickLogPresets(next);
  };

  const removePreset = (index: number) => {
    if (quickLog.presets.length <= QUICK_LOG_MIN_PRESETS) {
      return;
    }
    const next = quickLog.presets.filter((_item, idx) => idx !== index);
    void updateQuickLogPresets(next);
  };

  const suggestedMl = useMemo(() => {
    const weight = Number.parseFloat(calcWeight);
    if (!Number.isFinite(weight) || weight <= 0) {
      return null;
    }
    const basePerKg = calcActivity === "high" ? 40 : calcActivity === "medium" ? 35 : 30;
    const climateFactor = calcClimateHot ? 1.1 : 1.0;
    return Math.round(weight * basePerKg * climateFactor);
  }, [calcActivity, calcClimateHot, calcWeight]);

  const applySuggestedGoal = () => {
    if (!suggestedMl) {
      return;
    }
    const liters = (suggestedMl / 1000).toFixed(1);
    setDraft((prev) => ({ ...prev, target: liters }));
  };


  return (
    <Screen scroll>
      <View style={styles.container}>
        <PulsingTitle text="Settings" style={styles.title} />

        {isDirty ? (
          <AnimatedCard style={styles.saveBar} delay={60}>
            <Text style={[styles.saveText, { color: theme.colors.textPrimary }]}>Unsaved changes</Text>
            <PrimaryButton label="Save changes" onPress={handleSave} />
          </AnimatedCard>
        ) : null}

        <AnimatedCard delay={100}>
          <Text style={[styles.aboutTitle, { color: theme.colors.textPrimary }]}>Siply</Text>
          <Text style={[styles.aboutTagline, { color: theme.colors.textSecondary }]}>{TAGLINE}</Text>
        </AnimatedCard>

        <AnimatedCard style={styles.section} delay={140}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Daily target</Text>
          <Field
            label="Target liters"
            value={draft.target}
            onChangeText={(value) => setDraft((prev) => ({ ...prev, target: value }))}
            keyboardType="decimal-pad"
          />
        </AnimatedCard>

        <AnimatedCard style={styles.section} delay={180}>
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
        </AnimatedCard>

        <AnimatedCard style={styles.section} delay={220}>
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
          {permission ? (
            <View style={styles.permissionRow}>
              <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
                Permission: {permission.granted ? "allowed" : "denied"}
              </Text>
              {!permission.granted ? (
                <PrimaryButton
                  label={permission.canAskAgain ? "Allow notifications" : "Open settings"}
                  variant="secondary"
                  onPress={permission.canAskAgain ? requestPermission : openSettings}
                />
              ) : null}
            </View>
          ) : null}
        </AnimatedCard>

        <AnimatedCard style={styles.section} delay={260}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Gentle goals</Text>
          <ToggleRow
            label="Enable gentle goal"
            helper="Counts a good day when you reach the threshold."
            value={draft.gentleGoalEnabled}
            onValueChange={(value) => setDraft((prev) => ({ ...prev, gentleGoalEnabled: value }))}
          />
          <Field
            label="Threshold percent (50-100)"
            value={draft.gentleGoalThreshold}
            onChangeText={(value) => setDraft((prev) => ({ ...prev, gentleGoalThreshold: value }))}
            keyboardType="number-pad"
          />
        </AnimatedCard>

        <AnimatedCard style={styles.section} delay={300}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Quick log presets</Text>
          <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
            Add, remove, or reorder your cup sizes.
          </Text>
          <View style={styles.presetList}>
            {quickLog.presets.map((amount, index) => (
              <View
                key={`preset-row-${amount}-${index}`}
                style={[styles.presetRow, { borderColor: theme.colors.border }]}
              >
                <Text style={[styles.presetLabel, { color: theme.colors.textPrimary }]}>{amount} ml</Text>
                <View style={styles.presetActions}>
                  <Pressable
                    onPress={() => movePreset(index, -1)}
                    style={({ pressed }) => [
                      styles.iconButton,
                      { borderColor: theme.colors.border, opacity: pressed ? 0.6 : 1 },
                    ]}
                  >
                    <Text style={[styles.iconText, { color: theme.colors.textSecondary }]}>Up</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => movePreset(index, 1)}
                    style={({ pressed }) => [
                      styles.iconButton,
                      { borderColor: theme.colors.border, opacity: pressed ? 0.6 : 1 },
                    ]}
                  >
                    <Text style={[styles.iconText, { color: theme.colors.textSecondary }]}>Down</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => removePreset(index)}
                    disabled={quickLog.presets.length <= QUICK_LOG_MIN_PRESETS}
                    style={({ pressed }) => [
                      styles.iconButton,
                      {
                        borderColor: theme.colors.border,
                        opacity: quickLog.presets.length <= QUICK_LOG_MIN_PRESETS ? 0.4 : pressed ? 0.6 : 1,
                      },
                    ]}
                  >
                    <Text style={[styles.iconText, { color: theme.colors.textSecondary }]}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
          <View style={styles.presetAddRow}>
            <View style={styles.presetAddField}>
              <Field
                label="Add cup size (ml)"
                value={newPreset}
                onChangeText={setNewPreset}
                keyboardType="number-pad"
                placeholder="150"
              />
            </View>
            <PrimaryButton
              label="Add"
              onPress={handleAddPreset}
              disabled={quickLog.presets.length >= QUICK_LOG_MAX_PRESETS}
            />
          </View>
          <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
            {quickLog.presets.length}/{QUICK_LOG_MAX_PRESETS} presets
          </Text>
        </AnimatedCard>

        <AnimatedCard style={styles.section} delay={340}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Goal calculator</Text>
          <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
            General estimate only. Not medical advice.
          </Text>
          <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
            Based on 30-40 ml per kg, adjusted for activity and climate.
          </Text>
          <Field
            label="Weight (kg)"
            value={calcWeight}
            onChangeText={setCalcWeight}
            keyboardType="decimal-pad"
            placeholder="70"
          />
          <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>Activity level</Text>
          <View style={styles.optionRow}>
            {(["low", "medium", "high"] as const).map((level) => (
              <Pressable
                key={`activity-${level}`}
                onPress={() => setCalcActivity(level)}
                style={[
                  styles.optionButton,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: calcActivity === level ? theme.colors.accent : theme.colors.surface,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    { color: calcActivity === level ? theme.colors.surface : theme.colors.textPrimary },
                  ]}
                >
                  {level}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>Climate</Text>
          <Pressable
            onPress={() => setCalcClimateHot((value) => !value)}
            style={[
              styles.optionButton,
              {
                borderColor: theme.colors.border,
                backgroundColor: calcClimateHot ? theme.colors.accent : theme.colors.surface,
              },
            ]}
          >
            <Text
              style={[
                styles.optionText,
                { color: calcClimateHot ? theme.colors.surface : theme.colors.textPrimary },
              ]}
            >
              Hot climate
            </Text>
          </Pressable>
          {suggestedMl ? (
            <View style={styles.suggestionRow}>
              <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
                Suggested goal: {suggestedMl} ml ({(suggestedMl / 1000).toFixed(1)} L)
              </Text>
              <PrimaryButton label="Use suggested goal" onPress={applySuggestedGoal} />
            </View>
          ) : null}
        </AnimatedCard>

        <AnimatedCard style={styles.section} delay={380}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Appearance</Text>
          <ToggleRow
            label="Dark mode"
            helper="Overrides system theme."
            value={draft.appearanceMode === "dark"}
            onValueChange={(value) =>
              setDraft((prev) => ({ ...prev, appearanceMode: value ? "dark" : "light" }))
            }
          />
        </AnimatedCard>

        <AnimatedCard style={styles.section} delay={420}>
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
        </AnimatedCard>

        {ENABLE_DIAGNOSTICS ? (
          <AnimatedCard style={styles.section} delay={460}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
              Notification diagnostics
            </Text>
            <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
              Use this panel to verify permissions, channels, and scheduled reminders.
            </Text>
            <View style={styles.diagnosticGroup}>
              <View style={styles.diagnosticRow}>
                <Text style={[styles.diagnosticLabel, { color: theme.colors.textSecondary }]}>
                  App ownership
                </Text>
                <Text style={[styles.diagnosticValue, { color: theme.colors.textPrimary }]}>
                  {Constants.appOwnership ?? "unknown"}
                </Text>
              </View>
              <View style={styles.diagnosticRow}>
                <Text style={[styles.diagnosticLabel, { color: theme.colors.textSecondary }]}>
                  Platform
                </Text>
                <Text style={[styles.diagnosticValue, { color: theme.colors.textPrimary }]}>
                  {Platform.OS} {String(Platform.Version)}
                </Text>
              </View>
              <View style={styles.diagnosticRow}>
                <Text style={[styles.diagnosticLabel, { color: theme.colors.textSecondary }]}>
                  Build version
                </Text>
                <Text style={[styles.diagnosticValue, { color: theme.colors.textPrimary }]}>
                  {Constants.nativeAppVersion ?? "unknown"} ({Constants.nativeBuildVersion ?? "n/a"})
                </Text>
              </View>
              <View style={styles.diagnosticRow}>
                <Text style={[styles.diagnosticLabel, { color: theme.colors.textSecondary }]}>
                  Permissions
                </Text>
                <Text style={[styles.diagnosticValue, { color: theme.colors.textPrimary }]}>
                  {permissionsSnapshot
                    ? `${permissionsSnapshot.status} | granted=${permissionsSnapshot.granted ? "yes" : "no"}`
                    : "unknown"}
                </Text>
              </View>
              <View style={styles.diagnosticRow}>
                <Text style={[styles.diagnosticLabel, { color: theme.colors.textSecondary }]}>
                  Can ask again
                </Text>
                <Text style={[styles.diagnosticValue, { color: theme.colors.textPrimary }]}>
                  {permissionsSnapshot ? (permissionsSnapshot.canAskAgain ? "yes" : "no") : "unknown"}
                </Text>
              </View>
              <View style={styles.diagnosticRow}>
                <Text style={[styles.diagnosticLabel, { color: theme.colors.textSecondary }]}>
                  Scheduled count
                </Text>
                <Text style={[styles.diagnosticValue, { color: theme.colors.textPrimary }]}>
                  {scheduledCount}
                </Text>
              </View>
              <View style={styles.diagnosticRow}>
                <Text style={[styles.diagnosticLabel, { color: theme.colors.textSecondary }]}>
                  Next reminders
                </Text>
                <Text style={[styles.diagnosticValue, { color: theme.colors.textPrimary }]}>
                  {scheduledNext.length ? scheduledNext.join(" | ") : "none"}
                </Text>
              </View>
              <View style={styles.diagnosticRow}>
                <Text style={[styles.diagnosticLabel, { color: theme.colors.textSecondary }]}>
                  Last reschedule
                </Text>
                <Text style={[styles.diagnosticValue, { color: theme.colors.textPrimary }]}>
                  {formatTimestamp(diagnostics?.lastSchedule?.at)}
                </Text>
              </View>
              <View style={styles.diagnosticRow}>
                <Text style={[styles.diagnosticLabel, { color: theme.colors.textSecondary }]}>
                  Last reschedule result
                </Text>
                <Text style={[styles.diagnosticValue, { color: theme.colors.textPrimary }]}>
                  {diagnostics?.lastSchedule
                    ? `requested=${diagnostics.lastSchedule.result.requested} scheduled=${diagnostics.lastSchedule.result.scheduled} failed=${diagnostics.lastSchedule.result.failed}`
                    : "none"}
                </Text>
              </View>
              {diagnostics?.lastSchedule?.result.errors?.length ? (
                <Text style={[styles.diagnosticDetail, { color: theme.colors.textSecondary }]}>
                  Errors: {diagnostics.lastSchedule.result.errors.join(" | ")}
                </Text>
              ) : null}
              <View style={styles.diagnosticRow}>
                <Text style={[styles.diagnosticLabel, { color: theme.colors.textSecondary }]}>
                  Last test
                </Text>
                <Text style={[styles.diagnosticValue, { color: theme.colors.textPrimary }]}>
                  {diagnostics?.lastTest
                    ? `${formatTimestamp(diagnostics.lastTest.at)} | success=${
                        diagnostics.lastTest.success ? "yes" : "no"
                      }`
                    : "none"}
                </Text>
              </View>
              {diagnostics?.lastTest?.error ? (
                <Text style={[styles.diagnosticDetail, { color: theme.colors.textSecondary }]}>
                  Test error: {diagnostics.lastTest.error}
                </Text>
              ) : null}
              {channels && channels.length ? (
                <View style={styles.diagnosticSection}>
                  <Text style={[styles.diagnosticLabel, { color: theme.colors.textSecondary }]}>
                    Android channels
                  </Text>
                  {channels.map((channel) => (
                    <Text
                      key={`channel-${channel.id}`}
                      style={[styles.diagnosticDetail, { color: theme.colors.textSecondary }]}
                    >
                      {channel.id} | importance={channel.importance} | sound={channel.sound ?? "none"} | vibrate=
                      {channel.enableVibrate ? "yes" : "no"}
                    </Text>
                  ))}
                </View>
              ) : null}
              {permissionsSnapshot ? (
                <Text style={[styles.diagnosticDetail, { color: theme.colors.textSecondary }]}>
                  Raw permissions: {JSON.stringify(permissionsSnapshot)}
                </Text>
              ) : null}
            </View>
            <View style={styles.diagnosticActions}>
              <PrimaryButton
                label={diagnosticLoading ? "Refreshing..." : "Refresh diagnostics"}
                variant="secondary"
                onPress={refreshDiagnostics}
              />
              <PrimaryButton
                label={exporting ? "Exporting..." : "Export diagnostics"}
                variant="secondary"
                onPress={handleExportDiagnostics}
              />
              <PrimaryButton
                label="Clear diagnostics"
                variant="secondary"
                onPress={async () => {
                  await clearNotificationDiagnostics();
                  setDiagnostics(null);
                  setScheduledCount(0);
                  setScheduledNext([]);
                }}
              />
            </View>
            {exportStatus ? (
              <Text style={[styles.diagnosticDetail, { color: theme.colors.textSecondary }]}>
                {exportStatus}
              </Text>
            ) : null}
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
  permissionRow: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  field: {
    flex: 1,
  },
  presetList: {
    gap: 10,
  },
  presetRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  presetLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
  presetActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  iconButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  iconText: {
    fontSize: 12,
    fontWeight: "600",
  },
  presetAddRow: {
    gap: 10,
  },
  presetAddField: {
    flex: 1,
  },
  optionRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  optionButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: "flex-start",
  },
  optionText: {
    fontSize: 13,
    textTransform: "capitalize",
  },
  suggestionRow: {
    gap: 10,
  },
  actionGroup: {
    gap: 10,
  },
  diagnosticGroup: {
    gap: 8,
  },
  diagnosticRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  diagnosticLabel: {
    fontSize: 12,
    flex: 1,
  },
  diagnosticValue: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "right",
    flex: 1,
  },
  diagnosticDetail: {
    fontSize: 11,
    lineHeight: 16,
  },
  diagnosticSection: {
    gap: 6,
  },
  diagnosticActions: {
    gap: 10,
    marginTop: 4,
  },
});
