import AsyncStorage from "@react-native-async-storage/async-storage";

const WEEKEND_READY_PROMPT_KEY = "siply:weekend_ready_prompt:v1";

export const shouldShowWeekendReadyPrompt = async (eligible: boolean, enabled: boolean) => {
  if (!eligible || enabled) return false;
  return (await AsyncStorage.getItem(WEEKEND_READY_PROMPT_KEY)) !== "shown";
};

export const dismissWeekendReadyPrompt = () =>
  AsyncStorage.setItem(WEEKEND_READY_PROMPT_KEY, "shown");
