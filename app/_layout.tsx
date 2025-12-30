import React, { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import * as Notifications from "expo-notifications";
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
} from "../src/features/hydration/notifications/notifier";
import { useAppForeground } from "../src/shared/hooks/useAppForeground";
import { NOTIFICATION_ACTION_LOG } from "../src/core/constants";

const RootLayoutNav = () => {
  const router = useRouter();
  const segments = useSegments();
  const { settings, onboarding, hydrated, refreshProgressDate, progress, addConsumed } =
    useHydration();

  useEffect(() => {
    void configureNotificationChannels();
    void configureNotificationActions();
  }, []);

  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const forceSound = notification.request.content.data?.forceSound === true;
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
      return;
    }
    const inOnboarding = segments[0] === "(onboarding)";
    if (!onboarding.completed && !inOnboarding) {
      router.replace("/(onboarding)");
    } else if (onboarding.completed && inOnboarding) {
      router.replace("/(tabs)");
    }
  }, [hydrated, onboarding.completed, router, segments]);

  useEffect(() => {
    if (!hydrated || !onboarding.completed) {
      return;
    }
    void rescheduleNotifications(settings, progress.consumedMl);
  }, [hydrated, onboarding.completed, settings, progress.consumedMl]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.actionIdentifier !== NOTIFICATION_ACTION_LOG) {
        return;
      }
      const payload = response.notification.request.content.data?.ml;
      const amount =
        typeof payload === "number"
          ? payload
          : Number.parseInt(typeof payload === "string" ? payload : "", 10);
      if (Number.isFinite(amount) && amount > 0) {
        void addConsumed(amount);
      }
    });

    return () => subscription.remove();
  }, [addConsumed]);

  useAppForeground(() => {
    refreshProgressDate();
    if (hydrated && onboarding.completed) {
      void rescheduleNotifications(settings, progress.consumedMl);
    }
  });

  return <Stack screenOptions={{ headerShown: false }} />;
};

const AppShell = () => {
  const { settings } = useHydration();
  return (
    <SafeAreaProvider>
      <ThemeProvider mode={settings.appearanceMode}>
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
