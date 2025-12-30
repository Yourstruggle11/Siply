import * as Haptics from "expo-haptics";

export const triggerLightHaptic = async () => {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Ignore haptic errors for unsupported devices.
  }
};
