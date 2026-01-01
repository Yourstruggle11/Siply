import React, { useEffect, useMemo, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { ThemeProvider } from "../src/shared/theme/ThemeProvider";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  HydrationProvider,
  useHydration,
} from "../src/features/hydration/state/hydrationStore";
import {
  configureNotificationChannels,
  configureNotificationActions,
  rescheduleNotifications,
  parseSiplyNotificationId,
} from "../src/features/hydration/notifications/notifier";
import { useAppForeground } from "../src/shared/hooks/useAppForeground";
import { NOTIFICATION_ACTION_LOG } from "../src/core/constants";
import { darkColors, lightColors } from "../src/shared/theme/tokens";
import { useTheme } from "../src/shared/theme/ThemeProvider";

void SplashScreen.preventAutoHideAsync().catch(() => {});

const HANDLED_ACTION_TTL_MS = 24 * 60 * 60 * 1000;
const handledNotificationActions = new Map<string, number>();

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

const markNotificationHandled = (notificationId: string) => {
  const now = Date.now();
  handledNotificationActions.set(notificationId, now);
  if (handledNotificationActions.size <= 50) {
    return;
  }
  for (const [id, timestamp] of handledNotificationActions) {
    if (now - timestamp > HANDLED_ACTION_TTL_MS) {
      handledNotificationActions.delete(id);
    }
  }
};

const RootLayoutNav = () => {
  const router = useRouter();
  const segments = useSegments();
  const theme = useTheme();
  const {
    settings,
    onboarding,
    hydrated,
    refreshProgressDate,
    progress,
    addConsumed,
  } = useHydration();
  const [routeReady, setRouteReady] = useState(false);

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
    void configureNotificationChannels();
    void configureNotificationActions();
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
      setRouteReady(false);
      router.replace(expectedRoot === "(tabs)" ? "/(tabs)" : "/(onboarding)");
      return;
    }
    setRouteReady(true);
  }, [expectedRoot, hydrated, router, segments]);

  useEffect(() => {
    if (!hydrated || !onboarding.completed) {
      return;
    }
    void rescheduleNotifications(settings, progress.consumedMl);
  }, [
    hydrated,
    onboarding.completed,
    settings,
    progress.consumedMl,
    ensureNotificationPermission,
  ]);

  useEffect(() => {
    if (!hydrated || !onboarding.completed) {
      return;
    }
    void ensureNotificationPermission();
  }, [hydrated, onboarding.completed, ensureNotificationPermission]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        if (response.actionIdentifier !== NOTIFICATION_ACTION_LOG) {
          return;
        }
        const notificationId = response.notification.request.identifier;
        if (notificationId) {
          if (handledNotificationActions.has(notificationId)) {
            void Notifications.dismissNotificationAsync(notificationId);
            return;
          }
          markNotificationHandled(notificationId);
          void Notifications.dismissNotificationAsync(notificationId);
        }
        const meta = parseSiplyNotificationId(notificationId);
        const amount = meta?.ml ?? parseMlFromBody(response.notification.request.content.body);
        if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) {
          void addConsumed(amount);
        }
      }
    );

    return () => subscription.remove();
  }, [addConsumed]);

  useAppForeground(() => {
    refreshProgressDate();
    if (hydrated && onboarding.completed) {
      void rescheduleNotifications(settings, progress.consumedMl);
    }
    if (hydrated && onboarding.completed) {
      void ensureNotificationPermission();
    }
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

const AppShell = () => {
  const { settings } = useHydration();
  const isDark = settings.appearanceMode === "dark";
  const statusBarStyle = isDark ? "light" : "dark";
  const statusBarBackground = isDark ? darkColors.background : lightColors.background;
  return (
    <SafeAreaProvider>
      <ThemeProvider mode={settings.appearanceMode}>
        <StatusBar style={statusBarStyle} backgroundColor={statusBarBackground} />
        <RootLayoutNav />
      </ThemeProvider>
    </SafeAreaProvider>
  );
};

export default function RootLayout() {
  return (
    <HydrationProvider>
      <AppShell />
    </HydrationProvider>
  );
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
