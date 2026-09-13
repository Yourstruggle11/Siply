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
} from "../src/features/hydration/state/hydrationStore";
import {
  configureNotificationChannels,
  configureNotificationActions,
  rescheduleNotifications,
  parseSiplyNotificationId,
  snoozeNotification,
} from "../src/features/hydration/notifications/notifier";
import { registerBackgroundFetchAsync } from "../src/features/hydration/notifications/backgroundTask";
import { useAppForeground } from "../src/shared/hooks/useAppForeground";
import { useDayRollover } from "../src/shared/hooks/useDayRollover";
import {
  NOTIFICATION_ACTION_LOG,
  NOTIFICATION_ACTION_SNOOZE,
  NOTIFICATION_ACTION_SKIP,
  NOTIFICATION_ACTION_VIEW_HISTORY,
} from "../src/core/constants";
import { ensureFirstLaunchAt } from "../src/core/storage/storage";
import { notificationActionDeduplicator } from "../src/features/hydration/notifications/actionDedup";
import { darkColors, lightColors } from "../src/shared/theme/tokens";
import { useTheme } from "../src/shared/theme/ThemeProvider";
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
  const ensureNotificationPermission = React.useCallback(async () => {
    const status = await Notifications.getPermissionsAsync();
    if (status.granted) {
      return;
    }
    if (status.canAskAgain === false) {
      return;
    }
    await Notifications.requestPermissionsAsync();
  }, []);

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
    void configureNotificationChannels();
    void configureNotificationActions();
    void registerBackgroundFetchAsync();
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
      if (expectedRoot === "(tabs)" && rootSegment === "settings") {
        // allow /settings if onboarding is complete
      } else {
        setRouteReady(false);
        router.replace(expectedRoot === "(tabs)" ? "/(tabs)" : "/(onboarding)");
        return;
      }
    }
    setRouteReady(true);
  }, [expectedRoot, hydrated, router, segments]);

  useEffect(() => {
    if (!hydrated || !onboarding.completed) {
      return;
    }
    void rescheduleNotifications(settings, progress.consumedMl, new Date(), quickLog.lastLogAt);
  }, [
    hydrated,
    onboarding.completed,
    settings,
    progress.date,
    progress.consumedMl,
    quickLog.lastLogAt,
    ensureNotificationPermission,
  ]);

  useEffect(() => {
    if (!hydrated || !onboarding.completed) {
      return;
    }
    void ensureNotificationPermission();
  }, [hydrated, onboarding.completed, ensureNotificationPermission]);

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
        void Notifications.dismissNotificationAsync(notificationId);
        return isNew;
      };

      if (action === NOTIFICATION_ACTION_SKIP) {
        await claimNotification();
        return;
      }

      if (action === NOTIFICATION_ACTION_SNOOZE) {
        if (!(await claimNotification())) {
          return;
        }
        const meta = parseSiplyNotificationId(notificationId);
        const amount = meta?.ml ?? parseMlFromBody(response.notification.request.content.body);
        if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) {
          void snoozeNotification(amount, settings);
        }
        return;
      }

      if (action === NOTIFICATION_ACTION_VIEW_HISTORY) {
        if (await claimNotification()) {
          router.push("/(tabs)/history");
        }
        return;
      }

      if (action !== NOTIFICATION_ACTION_LOG) {
        return;
      }

      if (!(await claimNotification())) {
        return;
      }
      const meta = parseSiplyNotificationId(notificationId);
      const amount = meta?.ml ?? parseMlFromBody(response.notification.request.content.body);
      if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) {
        void addConsumed(amount);
      }
    },
    [addConsumed, router, settings]
  );

  const lastResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (lastResponse) {
      void processNotificationResponse(lastResponse);
    }
  }, [lastResponse, processNotificationResponse]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => void processNotificationResponse(response)
    );
    return () => subscription.remove();
  }, [processNotificationResponse]);

  useAppForeground(() => {
    void refreshProgressDate().then((didChange) => {
      if (hydrated && onboarding.completed) {
        if (!didChange) {
          void rescheduleNotifications(settings, progress.consumedMl, new Date(), quickLog.lastLogAt);
        }
        void ensureNotificationPermission();
      }
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
          <StatusBar style={statusBarStyle} backgroundColor={statusBarBackground} />
          <RootLayoutNav />
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
