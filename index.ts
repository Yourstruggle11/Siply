import "./src/features/hydration/notifications/backgroundTask";
import { registerBackgroundNotificationActions } from "./src/features/hydration/notifications/notificationActionTask";
import "expo-router/entry";
import { Platform } from "react-native";
import { registerAndroidWidget } from "./src/features/hydration/widgets/AndroidWidgetTaskHandler";

if (Platform.OS === "android") {
  void registerBackgroundNotificationActions().catch((error) => {
    console.warn("Siply: failed to register notification action task", error);
  });
  registerAndroidWidget();
}
