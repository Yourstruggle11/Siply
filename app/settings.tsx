import React, { useEffect, useState } from "react";
import { Alert, Image, Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";
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
import {
  cancelAllNotifications,
  rescheduleNotifications,
  sendTestNotification,
} from "../src/features/hydration/notifications/notifier";
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

export default function SettingsScreen() {
  const router = useRouter();
  const theme = useTheme();
  
  const settings = useHydrationStore((s) => s.settings);
  const progress = useHydrationStore((s) => s.progress);
  const quickLog = useHydrationStore((s) => s.quickLog);
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
  const [diagnostics, setDiagnostics] = useState<NotificationDiagnosticsState | null>(null);
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [permissionsSnapshot, setPermissionsSnapshot] = useState<Notifications.NotificationPermissionsStatus | null>(null);
  const [channels, setChannels] = useState<Notifications.NotificationChannel[] | null>(null);
  const [scheduledCount, setScheduledCount] = useState(0);
  const [scheduledNext, setScheduledNext] = useState<string[]>([]);

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
          if (!trigger || trigger.date === undefined || trigger.date === null) return null;
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
    lines.push(`Build version: ${Constants.nativeAppVersion ?? "unknown"} (${Constants.nativeBuildVersion ?? "n/a"})`);
    if (permissionsSnapshot) {
      lines.push(`Permissions: status=${permissionsSnapshot.status} granted=${permissionsSnapshot.granted ? "yes" : "no"} canAskAgain=${permissionsSnapshot.canAskAgain ? "yes" : "no"}`);
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
    if (channels && channels.length) {
      lines.push("Android channels:");
      channels.forEach((channel) => {
        lines.push(`- ${channel.id} | importance=${channel.importance} | sound=${channel.sound ?? "none"} | vibrate=${channel.enableVibrate ? "yes" : "no"}`);
      });
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
    if (ENABLE_DIAGNOSTICS) {
      void refreshDiagnostics();
    }
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

        <AnimatedCard style={styles.section} delay={140}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Appearance</Text>
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

        <AnimatedCard style={styles.section} delay={180}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Reminders</Text>
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
            helper="Extra reminders after 5 and 10 minutes."
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
        </AnimatedCard>

        <AnimatedCard style={styles.section} delay={200}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Optional AI</Text>
          <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
            Bring your own provider key. Requests go directly from this device to your selected provider; Siply has no AI server.
          </Text>
          <ToggleRow
            label="Automatic AI insights"
            helper="Adds optional AI annotations, daily recaps, and weekly reviews in History. Local insights always keep working."
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

        <AnimatedCard style={styles.section} delay={220}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Data backup</Text>
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

        <AnimatedCard style={styles.section} delay={260}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Actions</Text>
          <View style={styles.actionGroup}>
            <Button
              label="Reschedule notifications"
              onPress={() => void rescheduleNotifications(settings, progress.consumedMl, new Date(), quickLog.lastLogAt)}
            />
            <Button
              label="Cancel all notifications"
              variant="secondary"
              onPress={() => void cancelAllNotifications()}
            />
            <Button
              label="Test notification (sound)"
              variant="secondary"
              onPress={() => void sendTestNotification()}
            />
            <Button
              label="Reset today's progress"
              variant="secondary"
              onPress={() => void resetToday()}
            />
          </View>
        </AnimatedCard>

        {ENABLE_DIAGNOSTICS ? (
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
                <Text style={[styles.diagnosticLabel, { color: theme.colors.textSecondary }]}>Next reminders</Text>
                <Text style={[styles.diagnosticValue, { color: theme.colors.textPrimary }]}>{scheduledNext.length ? scheduledNext.join(" | ") : "none"}</Text>
              </View>
            </View>
            <View style={styles.diagnosticActions}>
              <Button label={diagnosticLoading ? "Refreshing..." : "Refresh diagnostics"} variant="secondary" onPress={refreshDiagnostics} />
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
