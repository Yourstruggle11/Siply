import { useCallback, useEffect, useState } from "react";
import { Linking } from "react-native";
import * as Notifications from "expo-notifications";
import { useAppForeground } from "./useAppForeground";

type NotificationPermissionState = {
  granted: boolean;
  canAskAgain: boolean;
  status: Notifications.PermissionStatus;
};

export const useNotificationPermission = () => {
  const [permission, setPermission] = useState<NotificationPermissionState | null>(null);

  const refresh = useCallback(async () => {
    const permissions = await Notifications.getPermissionsAsync();
    setPermission({
      granted: permissions.granted,
      canAskAgain: permissions.canAskAgain ?? true,
      status: permissions.status,
    });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useAppForeground(() => {
    void refresh();
  });

  const request = useCallback(async () => {
    await Notifications.requestPermissionsAsync();
    await refresh();
  }, [refresh]);

  const openSettings = useCallback(async () => {
    try {
      await Linking.openSettings();
    } catch {
      // Ignore errors opening settings.
    }
  }, []);

  return {
    permission,
    refresh,
    requestPermission: request,
    openSettings,
  };
};
