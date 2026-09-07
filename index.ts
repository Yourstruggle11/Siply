import "expo-router/entry";
import { Platform } from "react-native";
import { registerAndroidWidget } from "./src/features/hydration/widgets/AndroidWidgetTaskHandler";

if (Platform.OS === "android") {
  registerAndroidWidget();
}
