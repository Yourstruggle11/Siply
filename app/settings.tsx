import React, { useEffect, useMemo, useState } from "react";
import { Alert, AppState, Image, Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Screen } from "../src/shared/components/Screen";
import { AnimatedCard } from "../src/shared/components/AnimatedCard";
import { PulsingTitle } from "../src/shared/components/PulsingTitle";
import { ToggleRow } from "../src/shared/components/ToggleRow";
import { Button } from "../src/shared/components/Button";
import { useTheme } from "../src/shared/theme/ThemeProvider";
import { ENABLE_DIAGNOSTICS, TAGLINE } from "../src/core/constants";
import { useHydrationStore } from "../src/features/hydration/state/hydrationStore";
import { useNotificationPermission } from "../src/shared/hooks/useNotificationPermission";
import { sendTestNotificationDetailed } from "../src/features/hydration/notifications/notifier";
import { forceReconcile } from "../src/features/hydration/notifications/scheduleEngine";
import { useScheduleSnapshot } from "../src/shared/hooks/useScheduleSnapshot";
import {
  clearNotificationDiagnostics,
  loadNotificationDiagnostics,
  NotificationDiagnosticsState,
} from "../src/features/hydration/notifications/diagnostics";
import { exportBackup } from "../src/features/hydration/backup/export";
import { importBackup } from "../src/features/hydration/backup/import";
import { STORAGE_KEYS } from "../src/core/storage/keys";
import { ensureFirstLaunchAt, getJson } from "../src/core/storage/storage";
import { clearAiInsightCache } from "../src/features/hydration/ai/insightCache";
import { clearAiHistoryArtifactCaches } from "../src/features/hydration/ai/historyArtifacts";
import { useAiSettings } from "../src/features/hydration/ai/state";
import {
  APP_ICON_OPTIONS,
  AppIconId,
  getSelectedAppIcon,
  selectAppIcon,
  supportsAppIconSelection,
} from "../src/shared/appIcon";
import { analyzeWeekendAwareness, WEEKEND_MIN_WEEKS } from "../src/features/hydration/domain/schedulingIntelligence";
import {
  getPreciseTimingStatus,
  openPreciseTimingSettings,
} from "../src/features/hydration/notifications/preciseTiming";

export default function SettingsScreen() {
  const router = useRouter();
  const theme = useTheme();
  
  const settings = useHydrationStore((s) => s.settings);
  const progress = useHydrationStore((s) => s.progress);
  const quickLog = useHydrationStore((s) => s.quickLog);
  const history = useHydrationStore((s) => s.history);
  const updateSettings = useHydrationStore((s) => s.updateSettings);
  const resetToday = useHydrationStore((s) => s.resetToday);
  const { preferences, setAutomaticInsightsEnabled, configuredProviders } = useAiSettings();

  // Backup loading states
  const [backupExporting, setBackupExporting] = useState(false);
  const [backupImporting, setBackupImporting] = useState(false);
  const [showBackupReminder, setShowBackupReminder] = useState(false);
  const [aiCacheStatus, setAiCacheStatus] = useState<string | null>(null);
  const [selectedAppIcon, setSelectedAppIcon] = useState<AppIconId>(() => getSelectedAppIcon());
  const [changingAppIcon, setChangingAppIcon] = useState<AppIconId | null>(null);
  const [appIconError, setAppIconError] = useState<string | null>(null);

  const { permission, requestPermission, openSettings } = useNotificationPermission();
  const { snapshot: scheduleSnapshot, refresh: refreshScheduleSnapshot } = useScheduleSnapshot();
  const [diagnostics, setDiagnostics] = useState<NotificationDiagnosticsState | null>(null);
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [diagnosticReadError, setDiagnosticReadError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [notificationAction, setNotificationAction] = useState<"reschedule" | "test" | null>(null);
  const [notificationActionStatus, setNotificationActionStatus] = useState<string | null>(null);
  const [permissionsSnapshot, setPermissionsSnapshot] = useState<Notifications.NotificationPermissionsStatus | null>(null);
  const [channels, setChannels] = useState<Notifications.NotificationChannel[] | null>(null);
  const [scheduledCount, setScheduledCount] = useState(0);
  const [scheduledNext, setScheduledNext] = useState<string[]>([]);
  const [preciseTiming, setPreciseTiming] = useState({ supported: false, enabled: false });
  const weekendAwareness = useMemo(() => analyzeWeekendAwareness(history), [history]);
  const showNotificationDiagnostics = ENABLE_DIAGNOSTICS;

  const refreshPreciseTiming = React.useCallback(async () => {
    setPreciseTiming(await getPreciseTimingStatus());
  }, []);

  useEffect(() => {
    void refreshPreciseTiming();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshPreciseTiming();
    });
    return () => subscription.remove();
  }, [refreshPreciseTiming]);

  const handleAppIconChange = async (icon: AppIconId) => {
    if (!supportsAppIconSelection || changingAppIcon || selectedAppIcon === icon) return;

    setChangingAppIcon(icon);
    setAppIconError(null);
    try {
      const appliedIcon = await selectAppIcon(icon);
      setSelectedAppIcon(appliedIcon);
    } catch {
      setAppIconError("Siply couldn't change the app icon. Please try again.");
    } finally {
      setChangingAppIcon(null);
    }
  };

  const handleExportBackup = async () => {
    if (backupExporting) return;
    setBackupExporting(true);
    try {
      await exportBackup();
      setShowBackupReminder(false);
    } finally {
      setBackupExporting(false);
    }
  };

  const handleImportBackup = async () => {
    if (backupImporting) return;
    setBackupImporting(true);
    try {
      await importBackup();
    } finally {
      setBackupImporting(false);
    }
  };

  const formatTimestamp = (value?: string) => {
    if (!value) return "Never";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  };

  const refreshDiagnostics = async () => {
    setDiagnosticLoading(true);
    setDiagnosticReadError(null);
    try {
      const [permissionsResult, scheduledResult, storedResult] = await Promise.allSettled([
        Notifications.getPermissionsAsync(),
        Notifications.getAllScheduledNotificationsAsync(),
        loadNotificationDiagnostics(),
      ]);

      const readErrors: string[] = [];
      if (permissionsResult.status === "fulfilled") {
        setPermissionsSnapshot(permissionsResult.value);
      } else {
        readErrors.push(`permissions: ${String(permissionsResult.reason)}`);
      }
      if (storedResult.status === "fulfilled") {
        setDiagnostics(storedResult.value);
      } else {
        readErrors.push(`stored diagnostics: ${String(storedResult.reason)}`);
      }

      const scheduled = scheduledResult.status === "fulfilled" ? scheduledResult.value : [];
      if (scheduledResult.status === "rejected") {
        readErrors.push(`scheduled notifications: ${String(scheduledResult.reason)}`);
      }

      const dates = scheduled
        .map((item) => {
          const trigger = item.trigger as { date?: string | number | Date } | null;
          if (!trigger || trigger.date === undefined || trigger.date === null) return null;
          const date = new Date(trigger.date);
          return Number.isNaN(date.getTime()) ? null : date;
        })
        .filter((value): value is Date => value !== null)
        .sort((a, b) => a.getTime() - b.getTime());

      setScheduledCount(scheduled.length);
      setScheduledNext(dates.slice(0, 5).map((date) => date.toLocaleString()));

      if (Platform.OS === "android") {
        try {
          const channelList = await Notifications.getNotificationChannelsAsync();
          setChannels(channelList ?? []);
        } catch (error) {
          readErrors.push(`notification channels: ${error instanceof Error ? error.message : String(error)}`);
          setChannels(null);
        }
      } else {
        setChannels(null);
      }
      setDiagnosticReadError(readErrors.length ? readErrors.join(" | ") : null);
    } finally {
      setDiagnosticLoading(false);
    }
  };

  const handleManualReschedule = async () => {
    if (notificationAction) return;
    setNotificationAction("reschedule");
    setNotificationActionStatus(null);
    try {
      const result = await forceReconcile({
        settings,
        consumedMl: progress.consumedMl,
        lastLogAt: quickLog.lastLogAt,
        history,
        source: "manual_repair",
      });
      await Promise.all([refreshDiagnostics(), refreshScheduleSnapshot()]);

      if (result.health === "channel_blocked") {
        const message = "Android is blocking the Siply reminder channel. Re-enable it in system notification settings.";
        setNotificationActionStatus(message);
        Alert.alert("Reminder channel is off", message, [
          { text: "Cancel", style: "cancel" },
          { text: "Open settings", onPress: openSettings },
        ]);
      } else if (result.health === "schedule_failed") {
        const detail = result.errors[0] ?? "The device scheduler did not accept the reminder plan.";
        const message = "Siply couldn't verify the reminder schedule. It will retry automatically.";
        setNotificationActionStatus(message);
        Alert.alert(
          "Reminders could not be restored",
          ENABLE_DIAGNOSTICS
            ? `${message}\n\nTechnical details: ${detail}\n\nUse Export diagnostics below to share the report.`
            : message
        );
      } else if (result.health === "partially_scheduled") {
        const detail = result.errors[0] ?? "Only part of the reminder plan was accepted.";
        const message = "Some reminders were restored. Siply will retry the remaining reminders automatically.";
        setNotificationActionStatus(message);
        Alert.alert(
          "Some reminders were restored",
          ENABLE_DIAGNOSTICS ? `${message}\n\nTechnical details: ${detail}` : message
        );
      } else {
        setNotificationActionStatus(`Reminder schedule verified (${result.scheduledCount}/${result.desiredCount}).`);
        Alert.alert("Reminders restored", "Siply verified the current reminder schedule with your device.");
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const message = "Siply couldn't verify the reminder schedule. It will retry automatically.";
      setNotificationActionStatus(message);
      await Promise.all([refreshDiagnostics(), refreshScheduleSnapshot()]);
      Alert.alert(
        "Reminders could not be restored",
        ENABLE_DIAGNOSTICS
          ? `${message}\n\nTechnical details: ${detail}\n\nUse Export diagnostics below to share the report.`
          : message
      );
    } finally {
      setNotificationAction(null);
    }
  };

  const handleTestNotification = async () => {
    if (notificationAction) return;
    setNotificationAction("test");
    setNotificationActionStatus(null);
    try {
      const result = await sendTestNotificationDetailed();
      await Promise.all([refreshDiagnostics(), refreshScheduleSnapshot()]);
      if (result.success) {
        setNotificationActionStatus("Test notification scheduled. It should appear within a few seconds.");
        Alert.alert("Test notification scheduled", "It should appear within a few seconds.");
        return;
      }

      const detail = result.error ?? "The device did not accept the test notification.";
      const message = result.reason === "permission_denied"
        ? "Notifications are disabled for Siply. Enable notification permission and try again."
        : result.reason === "queue_full"
          ? "Siply's notification queue is currently full."
          : "Your device couldn't schedule the test notification.";
      setNotificationActionStatus(message);
      Alert.alert(
        "Test notification failed",
        ENABLE_DIAGNOSTICS
          ? `${message}\n\nTechnical details: ${detail}\n\nUse Export diagnostics below to share the report.`
          : message
      );
    } finally {
      setNotificationAction(null);
    }
  };

  const buildDiagnosticsExport = () => {
    const lines: string[] = [];
    lines.push("Siply notification diagnostics");
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`App ownership: ${Constants.appOwnership ?? "unknown"}`);
    lines.push(`Platform: ${Platform.OS} ${Platform.Version}`);
    lines.push(`Build version: ${Constants.nativeAppVersion ?? "unknown"} (${Constants.nativeBuildVersion ?? "n/a"})`);
    if (permissionsSnapshot) {
      lines.push(`Permissions: status=${permissionsSnapshot.status} granted=${permissionsSnapshot.granted ? "yes" : "no"} canAskAgain=${permissionsSnapshot.canAskAgain ? "yes" : "no"}`);
      lines.push(`Permissions raw: ${JSON.stringify(permissionsSnapshot)}`);
    } else {
      lines.push("Permissions: unknown");
    }
    lines.push(`Scheduled count: ${scheduledCount}`);
    lines.push(`Precise timing: supported=${preciseTiming.supported ? "yes" : "no"} enabled=${preciseTiming.enabled ? "yes" : "no"}`);
    if (scheduledNext.length) {
      lines.push(`Next reminders: ${scheduledNext.join(" | ")}`);
    }
    if (scheduleSnapshot) {
      lines.push(`Schedule health: ${scheduleSnapshot.health}`);
      lines.push(`Schedule source: ${scheduleSnapshot.triggerSource}`);
      lines.push(`Schedule plan: ${scheduleSnapshot.planId} revision=${scheduleSnapshot.revision}`);
      lines.push(`Schedule computed: ${scheduleSnapshot.computedAt}`);
      lines.push(`Schedule verified: ${scheduleSnapshot.verifiedAt}`);
      lines.push(`Schedule counts: desired=${scheduleSnapshot.desiredCount} scheduled=${scheduleSnapshot.scheduledCount} verifiedFamilies=${scheduleSnapshot.verifiedFamilyIds.length}`);
      lines.push(`Schedule capacity: planned=${scheduleSnapshot.plannedCount ?? scheduleSnapshot.desiredCount} suppressedOptional=${scheduleSnapshot.suppressedOptionalCount ?? 0} suppressedBase=${scheduleSnapshot.suppressedBaseCount ?? 0}`);
      if (scheduleSnapshot.errors.length) {
        lines.push(`Schedule errors: ${scheduleSnapshot.errors.join(" | ")}`);
      }
    } else {
      lines.push("Schedule snapshot: unavailable");
    }
    if (diagnosticReadError) {
      lines.push(`Diagnostics read error: ${diagnosticReadError}`);
    }
    if (diagnostics?.lastSchedule) {
      lines.push(`Last reschedule: ${diagnostics.lastSchedule.at}`);
      lines.push(`Reschedule result: requested=${diagnostics.lastSchedule.result.requested} scheduled=${diagnostics.lastSchedule.result.scheduled} failed=${diagnostics.lastSchedule.result.failed}`);
      if (diagnostics.lastSchedule.result.errors.length) {
        lines.push(`Reschedule errors: ${diagnostics.lastSchedule.result.errors.join(" | ")}`);
      }
    }
    if (diagnostics?.lastTest) {
      lines.push(`Last test: ${diagnostics.lastTest.at} success=${diagnostics.lastTest.success ? "yes" : "no"}`);
      if (diagnostics.lastTest.error) {
        lines.push(`Test error: ${diagnostics.lastTest.error}`);
      }
    }
    if (diagnostics?.events.length) {
      lines.push(`Recent scheduler events (${diagnostics.events.length}, retained for up to 7 days):`);
      diagnostics.events.slice(-50).forEach((event) => {
        lines.push(`- ${event.at} | ${event.type} | ${JSON.stringify(event)}`);
      });
    }
    if (channels && channels.length) {
      lines.push("Android channels:");
      channels.forEach((channel) => {
        lines.push(`- ${channel.id} | importance=${channel.importance} | sound=${channel.sound ?? "none"} | vibrate=${channel.enableVibrate ? "yes" : "no"}`);
      });
    } else if (Platform.OS === "android") {
      lines.push("Android channels: none or unavailable");
    }
    return lines.join("\n");
  };

  const handleExportDiagnostics = async () => {
    if (exporting) return;
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
    if (showNotificationDiagnostics) {
      void refreshDiagnostics();
    }
  }, [showNotificationDiagnostics]);

  useEffect(() => {
    const checkBackupStatus = async () => {
      try {
        const lastExportStr = await getJson<string>(STORAGE_KEYS.lastExportAt);
        const firstLaunchStr = await ensureFirstLaunchAt();
        
        const lastExport = lastExportStr ? new Date(lastExportStr) : null;
        const firstLaunch = new Date(firstLaunchStr);
        
        const comparisonDate = lastExport || firstLaunch;
        const daysSince = (Date.now() - comparisonDate.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysSince > 30) {
          setShowBackupReminder(true);
        }
      } catch (err) {
        // ignore
      }
    };
    void checkBackupStatus();
  }, []);

  return (
    <Screen scroll>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable 
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backButton,
              { opacity: pressed ? 0.6 : 1 }
            ]}
          >
            <MaterialIcons name="arrow-back" size={28} color={theme.colors.textPrimary} />
          </Pressable>
          <PulsingTitle text="Settings" style={styles.title} />
          <View style={{ width: 28 }} />
        </View>

        <AnimatedCard delay={100}>
          <Text style={[styles.aboutTitle, { color: theme.colors.textPrimary }]}>Siply</Text>
          <Text style={[styles.aboutTagline, { color: theme.colors.textSecondary }]}>{TAGLINE}</Text>
        </AnimatedCard>

        <View style={styles.groupHeader}>
          <MaterialIcons name="palette" size={20} color={theme.colors.accent} />
          <View style={styles.groupHeaderCopy}>
            <Text style={[styles.groupTitle, { color: theme.colors.textPrimary }]}>Personalization</Text>
            <Text style={[styles.groupDescription, { color: theme.colors.textSecondary }]}>Make Siply feel at home on this device.</Text>
          </View>
        </View>

        <AnimatedCard style={styles.section} delay={140}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Appearance & app icon</Text>
          <View style={styles.optionRow}>
            {(["light", "dark", "system"] as const).map((mode) => (
              <Pressable
                key={`mode-${mode}`}
                onPress={() => updateSettings({ appearanceMode: mode })}
                style={[
                  styles.optionButton,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: settings.appearanceMode === mode ? theme.colors.accent : theme.colors.surface,
                  },
                ]}
              >
                <Text style={[styles.optionText, { color: settings.appearanceMode === mode ? theme.colors.surface : theme.colors.textPrimary }]}>
                  {mode}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.appIconGroup}>
            <View style={styles.appIconHeading}>
              <Text style={[styles.appIconTitle, { color: theme.colors.textPrimary }]}>App icon</Text>
              {changingAppIcon ? (
                <Text style={[styles.appIconStatus, { color: theme.colors.textSecondary }]}>Changing…</Text>
              ) : null}
            </View>
            <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>Choose how Siply appears on this device.</Text>
            <View style={styles.appIconOptions}>
              {APP_ICON_OPTIONS.map((option) => {
                const selected = selectedAppIcon === option.id;
                const changing = changingAppIcon === option.id;

                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="radio"
                    accessibilityLabel={`${option.label} app icon`}
                    accessibilityState={{ selected, disabled: !supportsAppIconSelection || Boolean(changingAppIcon) }}
                    disabled={!supportsAppIconSelection || Boolean(changingAppIcon)}
                    onPress={() => void handleAppIconChange(option.id)}
                    style={({ pressed }) => [
                      styles.appIconOption,
                      {
                        borderColor: selected ? theme.colors.accent : theme.colors.border,
                        backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surface,
                        opacity: pressed || changing ? 0.72 : 1,
                      },
                    ]}
                  >
                    <Image source={option.preview} style={styles.appIconPreview} />
                    <View style={styles.appIconCopy}>
                      <Text style={[styles.appIconLabel, { color: theme.colors.textPrimary }]}>{option.label}</Text>
                      <Text style={[styles.appIconDescription, { color: theme.colors.textSecondary }]}>{option.description}</Text>
                    </View>
                    <MaterialIcons
                      name={selected ? "radio-button-checked" : "radio-button-unchecked"}
                      size={22}
                      color={selected ? theme.colors.accent : theme.colors.textSecondary}
                    />
                  </Pressable>
                );
              })}
            </View>
            {!supportsAppIconSelection ? (
              <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>Icon selection will be available in the next installed Android or iOS build.</Text>
            ) : null}
            {appIconError ? <Text style={[styles.helper, { color: theme.colors.warning }]}>{appIconError}</Text> : null}
          </View>
        </AnimatedCard>

        <View style={styles.groupHeader}>
          <MaterialIcons name="notifications-none" size={20} color={theme.colors.accent} />
          <View style={styles.groupHeaderCopy}>
            <Text style={[styles.groupTitle, { color: theme.colors.textPrimary }]}>Reminders</Text>
            <Text style={[styles.groupDescription, { color: theme.colors.textSecondary }]}>Choose how reminders reach you and personalize their timing.</Text>
          </View>
        </View>

        <AnimatedCard style={styles.section} delay={180}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Reminder preferences</Text>
          <View style={{ gap: 8, marginBottom: 8 }}>
            <Text style={[{ color: theme.colors.textPrimary, fontSize: 15, fontWeight: "500" }]}>Tone</Text>
            <View style={styles.optionRow}>
              {(["encouraging", "minimal", "playful"] as const).map((tone) => (
                <Pressable
                  key={`tone-${tone}`}
                  onPress={() => updateSettings({ tone })}
                  style={[
                    styles.optionButton,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: settings.tone === tone ? theme.colors.accent : theme.colors.surface,
                    },
                  ]}
                >
                  <Text style={[styles.optionText, { color: settings.tone === tone ? theme.colors.surface : theme.colors.textPrimary }]}>
                    {tone}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <ToggleRow
            label="Nudges"
            helper="Adds +5 and +10 minute follow-ups to as many as four reminder moments across the day."
            value={settings.escalationEnabled}
            onValueChange={(value) => updateSettings({ escalationEnabled: value })}
          />
          <ToggleRow
            label="Sound"
            helper="Uses system sound if allowed."
            value={settings.soundEnabled}
            onValueChange={(value) => updateSettings({ soundEnabled: value })}
          />
          {permission ? (
            <View style={styles.permissionRow}>
              <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
                Permission: {permission.granted ? "allowed" : "denied"}
              </Text>
              {!permission.granted ? (
                <Button
                  label={permission.canAskAgain ? "Allow notifications" : "Open settings"}
                  variant="secondary"
                  onPress={permission.canAskAgain ? requestPermission : openSettings}
                />
              ) : null}
            </View>
          ) : null}
          {Platform.OS === "android" && preciseTiming.supported ? (
            <View style={styles.permissionRow}>
              <View style={styles.smartSettingHeader}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[styles.smartSettingTitle, { color: theme.colors.textPrimary }]}>Precise reminder timing</Text>
                  <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>Lets Android deliver reminders more accurately during idle and battery-saving periods. Device settings can still cause delays.</Text>
                </View>
                <Text style={[styles.smartSettingStatus, { color: preciseTiming.enabled ? theme.colors.accent : theme.colors.textSecondary }]}>{preciseTiming.enabled ? "Enabled" : "Not enabled"}</Text>
              </View>
              <Button
                label={preciseTiming.enabled ? "Manage precise timing" : "Enable precise timing"}
                variant="secondary"
                onPress={() => void openPreciseTimingSettings()}
              />
            </View>
          ) : null}
        </AnimatedCard>

        <AnimatedCard style={styles.section} delay={210}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Personalized reminders</Text>
          <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>Optional features that learn from your routine while keeping your target and active window in control.</Text>
          <ToggleRow
            label="Weekend rhythm"
            helper={weekendAwareness.eligible
              ? "Uses your established weekend timing while staying inside your active window."
              : weekendAwareness.reason === "no_difference"
                ? "Your weekday and weekend routines currently look similar."
                : `Still learning · ${weekendAwareness.observedWeeks} of ${WEEKEND_MIN_WEEKS} weeks observed`}
            value={settings.weekendAwarenessEnabled}
            disabled={!weekendAwareness.eligible && !settings.weekendAwarenessEnabled}
            onValueChange={(value) => {
              if (value && !weekendAwareness.eligible) {
                Alert.alert(
                  "Still learning your routine",
                  `Siply needs at least ${WEEKEND_MIN_WEEKS} weeks, six weekend days, and twelve weekdays with logs before Weekend rhythm becomes available.`
                );
                return;
              }
              void updateSettings({ weekendAwarenessEnabled: value });
            }}
          />
          {!weekendAwareness.eligible && !settings.weekendAwarenessEnabled ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => Alert.alert(
                "Still learning your routine",
                weekendAwareness.reason === "no_difference"
                  ? "Siply has enough history, but your weekday and weekend start times are currently too similar to make a separate schedule useful."
                  : `Siply needs at least ${WEEKEND_MIN_WEEKS} weeks, six weekend days, and twelve weekdays with logs before Weekend rhythm becomes available.`
              )}
            >
              <Text style={[styles.helper, { color: theme.colors.accent }]}>Why is this unavailable?</Text>
            </Pressable>
          ) : null}
          <ToggleRow
            label="Extra catch-up nudge"
            helper={settings.escalationEnabled
              ? "Allows one additional +5/+10 minute nudge family when you are substantially behind pace."
              : "Turn on Nudges first to use this option."}
            value={settings.escalationEnabled && settings.urgencyExtraNudgeEnabled}
            disabled={!settings.escalationEnabled}
            onValueChange={(value) => void updateSettings({ urgencyExtraNudgeEnabled: value })}
          />
        </AnimatedCard>

        <View style={styles.groupHeader}>
          <MaterialIcons name="auto-awesome" size={20} color={theme.colors.accent} />
          <View style={styles.groupHeaderCopy}>
            <Text style={[styles.groupTitle, { color: theme.colors.textPrimary }]}>AI</Text>
            <Text style={[styles.groupDescription, { color: theme.colors.textSecondary }]}>Optional answers and interpretations using your own provider key.</Text>
          </View>
        </View>

        <AnimatedCard style={styles.section} delay={200}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>AI features</Text>
          <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
            Bring your own provider key. Requests go directly from this device to your selected provider; Siply has no AI server.
          </Text>
          <ToggleRow
            label="Automatic AI insights"
            helper="Adds optional AI annotations, previous-day recaps, and Sunday weekly reviews in History. Local insights always keep working."
            value={preferences.automaticInsightsEnabled}
            onValueChange={(value) => void setAutomaticInsightsEnabled(value)}
          />
          <View style={styles.actionGroup}>
            <Button
              label={configuredProviders.length ? "Manage AI providers" : "Connect an AI provider"}
              onPress={() => router.push("/ai-settings")}
            />
            <Button label="Ask Siply" variant="secondary" onPress={() => router.push("/ask-siply")} />
          </View>
        </AnimatedCard>

        <View style={styles.groupHeader}>
          <MaterialIcons name="shield" size={20} color={theme.colors.accent} />
          <View style={styles.groupHeaderCopy}>
            <Text style={[styles.groupTitle, { color: theme.colors.textPrimary }]}>Data & privacy</Text>
            <Text style={[styles.groupDescription, { color: theme.colors.textSecondary }]}>Back up local data and manage saved AI output.</Text>
          </View>
        </View>

        <AnimatedCard style={styles.section} delay={220}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Backup & saved AI</Text>
          {showBackupReminder ? (
            <View style={{ backgroundColor: theme.colors.accentSoft, padding: 12, borderRadius: 8, marginBottom: 8 }}>
              <Text style={[{ color: theme.colors.textPrimary, ...theme.typography.bodySmall, fontWeight: "600", marginBottom: 4 }]}>
                Time for a backup?
              </Text>
              <Text style={[{ color: theme.colors.textSecondary, ...theme.typography.caption }]}>
                It's been over 30 days since your last backup (or since you started using Siply). We recommend exporting your data regularly.
              </Text>
            </View>
          ) : null}
          <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
            Export your settings and history to a .siply.json file, or restore from a previous backup.
          </Text>
          <View style={styles.actionGroup}>
            <Button
              label={backupExporting ? "Exporting…" : "Export backup"}
              onPress={handleExportBackup}
              disabled={backupExporting || backupImporting}
            />
            <Button
              label={backupImporting ? "Importing…" : "Import backup"}
              variant="secondary"
              onPress={handleImportBackup}
              disabled={backupExporting || backupImporting}
            />
            <Button
              label="Delete saved AI insights"
              variant="secondary"
              onPress={() => {
                Alert.alert(
                  "Delete saved AI insights?",
                  "This removes cached AI annotations, daily recaps, and weekly reviews. Provider keys and hydration data will not be changed.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: () => {
                        void Promise.all([
                          clearAiInsightCache(),
                          clearAiHistoryArtifactCaches(),
                        ]).then(() => setAiCacheStatus("Saved AI insights deleted."));
                      },
                    },
                  ]
                );
              }}
            />
          </View>
          {aiCacheStatus ? <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>{aiCacheStatus}</Text> : null}
        </AnimatedCard>

        <View style={styles.groupHeader}>
          <MaterialIcons name="build" size={20} color={theme.colors.accent} />
          <View style={styles.groupHeaderCopy}>
            <Text style={[styles.groupTitle, { color: theme.colors.textPrimary }]}>Maintenance</Text>
            <Text style={[styles.groupDescription, { color: theme.colors.textSecondary }]}>Repair reminders, test delivery, or restart today.</Text>
          </View>
        </View>

        <AnimatedCard style={styles.section} delay={260}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Reminder & day tools</Text>
          <View style={styles.actionGroup}>
            <Button
              label={notificationAction === "reschedule" ? "Rescheduling..." : "Reschedule notifications"}
              onPress={handleManualReschedule}
              disabled={notificationAction !== null}
            />
            <Button
              label={notificationAction === "test" ? "Scheduling test..." : "Test notification (sound)"}
              variant="secondary"
              onPress={handleTestNotification}
              disabled={notificationAction !== null}
            />
            <Button
              label="Reset today's progress"
              variant="secondary"
              onPress={() => void resetToday()}
            />
          </View>
          {notificationActionStatus ? (
            <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
              {notificationActionStatus}
            </Text>
          ) : null}
        </AnimatedCard>

        {showNotificationDiagnostics ? (
          <AnimatedCard style={styles.section} delay={300}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
              Notification diagnostics
            </Text>
            <View style={styles.diagnosticGroup}>
              <View style={styles.diagnosticRow}>
                <Text style={[styles.diagnosticLabel, { color: theme.colors.textSecondary }]}>App ownership</Text>
                <Text style={[styles.diagnosticValue, { color: theme.colors.textPrimary }]}>{Constants.appOwnership ?? "unknown"}</Text>
              </View>
              <View style={styles.diagnosticRow}>
                <Text style={[styles.diagnosticLabel, { color: theme.colors.textSecondary }]}>Platform</Text>
                <Text style={[styles.diagnosticValue, { color: theme.colors.textPrimary }]}>{Platform.OS} {String(Platform.Version)}</Text>
              </View>
              <View style={styles.diagnosticRow}>
                <Text style={[styles.diagnosticLabel, { color: theme.colors.textSecondary }]}>Permissions</Text>
                <Text style={[styles.diagnosticValue, { color: theme.colors.textPrimary }]}>
                  {permissionsSnapshot ? `${permissionsSnapshot.status} | granted=${permissionsSnapshot.granted ? "yes" : "no"}` : "unknown"}
                </Text>
              </View>
              <View style={styles.diagnosticRow}>
                <Text style={[styles.diagnosticLabel, { color: theme.colors.textSecondary }]}>Scheduled count</Text>
                <Text style={[styles.diagnosticValue, { color: theme.colors.textPrimary }]}>{scheduledCount}</Text>
              </View>
              <View style={styles.diagnosticRow}>
                <Text style={[styles.diagnosticLabel, { color: theme.colors.textSecondary }]}>Schedule health</Text>
                <Text style={[styles.diagnosticValue, { color: theme.colors.textPrimary }]}>
                  {scheduleSnapshot?.health ?? "unavailable"}
                </Text>
              </View>
              <View style={styles.diagnosticRow}>
                <Text style={[styles.diagnosticLabel, { color: theme.colors.textSecondary }]}>Desired / verified</Text>
                <Text style={[styles.diagnosticValue, { color: theme.colors.textPrimary }]}>
                  {scheduleSnapshot ? `${scheduleSnapshot.desiredCount} / ${scheduleSnapshot.scheduledCount}` : "unavailable"}
                </Text>
              </View>
              <View style={styles.diagnosticRow}>
                <Text style={[styles.diagnosticLabel, { color: theme.colors.textSecondary }]}>Trigger source</Text>
                <Text style={[styles.diagnosticValue, { color: theme.colors.textPrimary }]}>
                  {scheduleSnapshot?.triggerSource ?? "unavailable"}
                </Text>
              </View>
              <View style={styles.diagnosticRow}>
                <Text style={[styles.diagnosticLabel, { color: theme.colors.textSecondary }]}>Next reminders</Text>
                <Text style={[styles.diagnosticValue, { color: theme.colors.textPrimary }]}>{scheduledNext.length ? scheduledNext.join(" | ") : "none"}</Text>
              </View>
            </View>
            {scheduleSnapshot?.errors.length ? (
              <Text selectable style={[styles.diagnosticDetail, { color: theme.colors.textSecondary }]}>
                Schedule errors: {scheduleSnapshot.errors.join(" | ")}
              </Text>
            ) : null}
            {diagnostics?.lastTest ? (
              <Text selectable style={[styles.diagnosticDetail, { color: theme.colors.textSecondary }]}>
                Last test: {diagnostics.lastTest.success ? "success" : `failed — ${diagnostics.lastTest.error ?? "unknown error"}`}
              </Text>
            ) : null}
            {diagnosticReadError ? (
              <Text selectable style={[styles.diagnosticDetail, { color: theme.colors.textSecondary }]}>
                Diagnostics read error: {diagnosticReadError}
              </Text>
            ) : null}
            <View style={styles.diagnosticActions}>
              <Button
                label={diagnosticLoading ? "Refreshing..." : "Refresh diagnostics"}
                variant="secondary"
                onPress={() => void Promise.all([refreshDiagnostics(), refreshScheduleSnapshot()])}
                disabled={diagnosticLoading}
              />
              <Button label={exporting ? "Exporting..." : "Export diagnostics"} variant="secondary" onPress={handleExportDiagnostics} />
              <Button label="Clear diagnostics" variant="secondary" onPress={async () => {
                await clearNotificationDiagnostics();
                setDiagnostics(null);
                setScheduledCount(0);
                setScheduledNext([]);
              }} />
            </View>
            {exportStatus ? (
              <Text style={[styles.diagnosticDetail, { color: theme.colors.textSecondary }]}>{exportStatus}</Text>
            ) : null}
          </AnimatedCard>
        ) : null}

      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    padding: 4,
  },
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
  groupHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  groupHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  groupTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  groupDescription: {
    fontSize: 12,
    lineHeight: 17,
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
  smartSettingHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  smartSettingTitle: {
    fontSize: 16,
  },
  smartSettingStatus: {
    fontSize: 12,
    fontWeight: "600",
  },
  optionRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  optionButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
  },
  optionText: {
    fontSize: 13,
    textTransform: "capitalize",
    fontWeight: "500",
  },
  appIconGroup: {
    gap: 10,
    marginTop: 4,
  },
  appIconHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  appIconTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  appIconStatus: {
    fontSize: 12,
  },
  appIconOptions: {
    gap: 8,
  },
  appIconOption: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderWidth: 1,
    borderRadius: 12,
  },
  appIconPreview: {
    width: 54,
    height: 54,
    borderRadius: 13,
  },
  appIconCopy: {
    flex: 1,
    gap: 3,
  },
  appIconLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  appIconDescription: {
    fontSize: 12,
    lineHeight: 16,
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
    marginTop: 8,
  },
  diagnosticActions: {
    gap: 10,
    marginTop: 12,
  },
});
