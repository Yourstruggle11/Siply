import "react-native-gesture-handler";
import React, { useEffect, useMemo, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { ActivityIndicator, StyleSheet, View, useColorScheme, Platform, Alert } from "react-native";
import * as Linking from "expo-linking";
import { handleIncomingBackupUrl } from "../src/features/hydration/backup/incoming";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { ThemeProvider } from "../src/shared/theme/ThemeProvider";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  useHydrationStore,
  waitForHydrationPersistence,
} from "../src/features/hydration/state/hydrationStore";
import {
  configureNotificationChannels,
  configureNotificationActions,
  cancelNotificationFamily,
  parseSiplyNotificationId,
  resolveNotificationFamilyId,
  snoozeNotification,
} from "../src/features/hydration/notifications/notifier";
import {
  reconcile as scheduleReconcile,
  forceReconcile as scheduleForceReconcile,
  markReminderFamilyHandled,
  refreshSnapshotCache,
} from "../src/features/hydration/notifications/scheduleEngine";
import { consumePreciseTimingStatusChange } from "../src/features/hydration/notifications/preciseTiming";
import { registerBackgroundFetchAsync } from "../src/features/hydration/notifications/backgroundTask";
import { useAppForeground } from "../src/shared/hooks/useAppForeground";
import { useDayRollover } from "../src/shared/hooks/useDayRollover";
import {
  NOTIFICATION_ACTION_LOG,
  NOTIFICATION_ACTION_DISMISS,
  NOTIFICATION_ACTION_SNOOZE,
  NOTIFICATION_ACTION_SKIP,
  NOTIFICATION_ACTION_VIEW_HISTORY,
} from "../src/core/constants";
import { ensureFirstLaunchAt } from "../src/core/storage/storage";
import { notificationActionDeduplicator } from "../src/features/hydration/notifications/actionDedup";
import { recordNotificationDiagnostic } from "../src/features/hydration/notifications/diagnostics";
import { darkColors, lightColors } from "../src/shared/theme/tokens";
import { useTheme } from "../src/shared/theme/ThemeProvider";
import { NetworkStatusProvider } from "../src/shared/network/NetworkStatusProvider";
import { AiSettingsProvider } from "../src/features/hydration/ai/state";
void SplashScreen.preventAutoHideAsync().catch(() => {});

const parseMlFromBody = (body?: string | null) => {
  if (!body) {
    return undefined;
  }
  const match = body.match(/~?(\d+)\s*ml/i);
  if (!match) {
    return undefined;
  }
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : undefined;
};

const RootLayoutNav = () => {
  const router = useRouter();
  const segments = useSegments();
  const theme = useTheme();
  const settings = useHydrationStore((s) => s.settings);
  const progress = useHydrationStore((s) => s.progress);
  const quickLog = useHydrationStore((s) => s.quickLog);
  const history = useHydrationStore((s) => s.history);
  const onboarding = useHydrationStore((s) => s.onboarding);
  const hydrated = useHydrationStore((s) => s.hydrated);
  const refreshProgressDate = useHydrationStore((s) => s.refreshProgressDate);
  const addConsumed = useHydrationStore((s) => s.addConsumed);
  const [routeReady, setRouteReady] = useState(false);

  useDayRollover(refreshProgressDate);

  const expectedRoot = useMemo(
    () => (onboarding.completed ? "(tabs)" : "(onboarding)"),
    [onboarding.completed]
  );
  useEffect(() => {
    const handleUrl = (url: string | null) => {
      void handleIncomingBackupUrl(url, 500).catch(() => {
        Alert.alert("Import failed", "An unexpected error occurred during import.");
      });
    };

    Linking.getInitialURL().then(handleUrl);
    const subscription = Linking.addEventListener("url", (event) => handleUrl(event.url));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    void ensureFirstLaunchAt().catch((error) => {
      console.warn("Siply: failed to initialize first-launch metadata", error);
    });
  }, []);

  useEffect(() => {
    void configureNotificationChannels().catch((error) => {
      console.warn("Siply: failed to configure notification channels", error);
    });
    void configureNotificationActions().catch((error) => {
      console.warn("Siply: failed to configure notification actions", error);
    });
    void registerBackgroundFetchAsync();
    // Pre-populate the snapshot cache so useHydrationPlan can read it
    void refreshSnapshotCache();
  }, []);

  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const meta = parseSiplyNotificationId(notification.request.identifier);
        const forceSound = meta?.kind === "test";
        return {
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: forceSound || settings.soundEnabled,
          shouldSetBadge: false,
        };
      },
    });
  }, [settings.soundEnabled]);

  useEffect(() => {
    if (!hydrated) {
      setRouteReady(false);
      return;
    }
    const rootSegment = segments[0];
    if (!rootSegment) {
      setRouteReady(false);
      return;
    }
    if (rootSegment !== expectedRoot) {
      if (
        expectedRoot === "(tabs)" &&
        ["settings", "ask-siply", "ai-settings"].includes(String(rootSegment))
      ) {
        // Allow non-tab app screens after onboarding is complete.
      } else {
        setRouteReady(false);
        router.replace(expectedRoot === "(tabs)" ? "/(tabs)" : "/(onboarding)");
        return;
      }
    }
    setRouteReady(true);
  }, [expectedRoot, hydrated, router, segments]);

  // Schedule engine reconcile: fires when hydration state changes meaningfully.
  // Unchanged inputs verify/repair the existing OS plan without shifting it.
  useEffect(() => {
    if (!hydrated || !onboarding.completed) {
      return;
    }
    void waitForHydrationPersistence()
      .catch((error) => {
        console.warn("Siply: hydration persistence did not settle before scheduling", error);
      })
      .then(async () => {
        // Exact-alarm revocation stops the Android app and deletes its exact
        // alarms. Check on cold startup as well as foreground return, then
        // genuinely resubmit the plan rather than trusting Expo's stored IDs.
        const preciseTimingChanged = await consumePreciseTimingStatusChange();
        const fn = preciseTimingChanged ? scheduleForceReconcile : scheduleReconcile;
        return fn({
          settings,
          consumedMl: progress.consumedMl,
          lastLogAt: quickLog.lastLogAt,
          source: preciseTimingChanged ? "exact_timing_change" : "state_change",
          history,
        });
      })
      .catch((error) => {
        console.warn("Siply: state-change reminder reconcile failed", error);
      });
  }, [
    hydrated,
    onboarding.completed,
    progress.consumedMl,
    progress.date,
    quickLog.lastLogAt,
    settings,
    history,
  ]);

  const processNotificationResponse = React.useCallback(
    async (response: Notifications.NotificationResponse) => {
      const action = response.actionIdentifier;
      const notificationId = response.notification.request.identifier;

      const claimNotification = async () => {
        if (!notificationId) {
          return true;
        }
        const isNew = await notificationActionDeduplicator.claimIfUnhandled(
          notificationId
        );
        void Notifications.dismissNotificationAsync(notificationId).catch(() => {});
        return isNew;
      };
      const runClaimed = async (operation: () => Promise<void> | void) => {
        if (!(await claimNotification())) return false;
        try {
          await operation();
          return true;
        } catch (error) {
          if (notificationId) {
            await notificationActionDeduplicator.release(notificationId).catch(() => {});
          }
          throw error;
        }
      };

      const familyId = resolveNotificationFamilyId(
        notificationId,
        response.notification.request.content.data
      );

      if (action === NOTIFICATION_ACTION_DISMISS) {
        if (familyId) {
          await recordNotificationDiagnostic({
            type: "action",
            at: new Date().toISOString(),
            action: "dismissed",
            familyId,
          }).catch(() => {});
        }
        return;
      }

      if (action === NOTIFICATION_ACTION_SKIP) {
        await runClaimed(async () => {
          if (familyId) {
            await markReminderFamilyHandled(familyId, "skipped");
          }
        });
        return;
      }

      if (action === NOTIFICATION_ACTION_SNOOZE) {
        await runClaimed(async () => {
          const meta = parseSiplyNotificationId(notificationId);
          const amount = meta?.ml ?? parseMlFromBody(response.notification.request.content.body);
          if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
            throw new Error("Reminder amount was unavailable for snooze");
          }
          const scheduled = await snoozeNotification(amount, settings, familyId);
          if (familyId) {
            await markReminderFamilyHandled(familyId, scheduled ? "snoozed" : "skipped");
          }
        });
        return;
      }

      if (action === NOTIFICATION_ACTION_VIEW_HISTORY) {
        await runClaimed(() => {
          router.push("/(tabs)/history");
        });
        return;
      }

      if (action !== NOTIFICATION_ACTION_LOG) {
        return;
      }

      await runClaimed(async () => {
        const meta = parseSiplyNotificationId(notificationId);
        const amount = meta?.ml ?? parseMlFromBody(response.notification.request.content.body);
        if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
          throw new Error("Reminder amount was unavailable for logging");
        }
        if (familyId) await cancelNotificationFamily(familyId);
        await addConsumed(amount);
      });
    },
    [addConsumed, router, settings]
  );

  const lastResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (lastResponse) {
      void processNotificationResponse(lastResponse).catch((error) => {
        console.warn("Siply: notification response handling failed", error);
      });
    }
  }, [lastResponse, processNotificationResponse]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => void processNotificationResponse(response).catch((error) => {
        console.warn("Siply: notification response handling failed", error);
      })
    );
    return () => subscription.remove();
  }, [processNotificationResponse]);

  useAppForeground(() => {
    void refreshProgressDate().then((didChange) => {
      if (hydrated && onboarding.completed) {
        // Day changes and exact-alarm capability changes reinstall the plan.
        // Ordinary foregrounding only verifies/repairs without moving times.
        void consumePreciseTimingStatusChange().then((preciseTimingChanged) => {
          const fn = didChange || preciseTimingChanged ? scheduleForceReconcile : scheduleReconcile;
          return fn({
            settings,
            consumedMl: didChange ? 0 : progress.consumedMl,
            lastLogAt: didChange ? null : quickLog.lastLogAt,
            source: didChange ? "day_rollover" : "app_foreground",
            history,
          });
        }).catch((error) => {
          console.warn("Siply: foreground reminder reconcile failed", error);
        });
      }
    }).catch((error) => {
      console.warn("Siply: foreground day refresh failed", error);
    });
  });

  const showLoader = !hydrated || !routeReady;

  useEffect(() => {
    if (!showLoader) {
      void SplashScreen.hideAsync();
    }
  }, [showLoader]);

  return (
    <View style={styles.root}>
      <View style={[styles.stackContainer, showLoader && styles.stackHidden]}>
        <Stack screenOptions={{ headerShown: false }} />
      </View>
      {showLoader ? (
        <View style={[styles.loader, { backgroundColor: theme.colors.background }]}>
          <ActivityIndicator color={theme.colors.textSecondary} />
        </View>
      ) : null}
    </View>
  );
};

import { GestureHandlerRootView } from "react-native-gesture-handler";

const AppShell = () => {
  const settings = useHydrationStore((s) => s.settings);
  // @ts-ignore
  const colorScheme = useColorScheme();
  
  const isDark = 
    settings.appearanceMode === "dark" || 
    (settings.appearanceMode === "system" && colorScheme === "dark");

  const statusBarStyle = isDark ? "light" : "dark";
  const statusBarBackground = isDark ? darkColors.background : lightColors.background;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider mode={settings.appearanceMode}>
          <NetworkStatusProvider>
            <AiSettingsProvider>
              <StatusBar style={statusBarStyle} backgroundColor={statusBarBackground} />
              <RootLayoutNav />
            </AiSettingsProvider>
          </NetworkStatusProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

export default function RootLayout() {
  return <AppShell />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  stackContainer: {
    flex: 1,
  },
  stackHidden: {
    opacity: 0,
  },
  loader: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
