import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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
    const base = weight * 30;
    const activityFactor = calcActivity === "high" ? 1.2 : calcActivity === "medium" ? 1.1 : 1.0;
    const climateFactor = calcClimateHot ? 1.1 : 1.0;
    return Math.round(base * activityFactor * climateFactor);
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
        </Card>

        <Card style={styles.section}>
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
        </Card>

        <Card style={styles.section}>
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
        </Card>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Goal calculator</Text>
          <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
            General estimate only. Not medical advice.
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
});
