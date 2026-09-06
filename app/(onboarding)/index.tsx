import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Svg, { Circle, Path, Defs, LinearGradient, Stop } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  FadeInDown,
} from "react-native-reanimated";
import { Screen } from "../../src/shared/components/Screen";
import { Button } from "../../src/shared/components/Button";
import { useTheme } from "../../src/shared/theme/ThemeProvider";
import { TAGLINE, DEFAULT_SETTINGS } from "../../src/core/constants";
import { useHydrationStore } from "../../src/features/hydration/state/hydrationStore";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function WaterIllustration() {
  const theme = useTheme();
  
  // Create a gentle floating/pulsing animation
  const pulse = useSharedValue(1);
  const floatY = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1, // Infinite
      true
    );
    
    floatY.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 2500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [pulse, floatY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: pulse.value },
      { translateY: floatY.value }
    ]
  }));

  return (
    <View style={styles.illustrationContainer}>
      <Animated.View style={animatedStyle}>
        <Svg width="180" height="180" viewBox="0 0 100 100">
          <Defs>
            <LinearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={theme.colors.accent} stopOpacity="0.8" />
              <Stop offset="1" stopColor={theme.colors.accent} stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Path
            d="M50 15 C50 15, 25 45, 25 65 C25 78.8, 36.2 90, 50 90 C63.8 90, 75 78.8, 75 65 C75 45, 50 15, 50 15 Z"
            fill="url(#waterGrad)"
          />
          {/* Highlight for a glossy, premium feel */}
          <Path
            d="M38 45 C35 55, 38 65, 45 75"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.3"
            fill="none"
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const updateSettings = useHydrationStore((s) => s.updateSettings);
  const completeOnboarding = useHydrationStore((s) => s.completeOnboarding);

  const handleSkip = async () => {
    await updateSettings(DEFAULT_SETTINGS);
    await completeOnboarding();
    router.replace("/(tabs)");
  };

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.content}>
          <Animated.View entering={FadeInDown.duration(600).springify()}>
            <WaterIllustration />
          </Animated.View>
          
          <Animated.View entering={FadeInDown.duration(600).delay(200).springify()}>
            <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Siply</Text>
            <Text style={[styles.tagline, { color: theme.colors.textSecondary }]}>{TAGLINE}</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(600).delay(400).springify()}>
            <Text style={[styles.body, { color: theme.colors.textPrimary }]}>
              A beautiful, intelligent way to track your water intake with quiet reminders perfectly spaced throughout your day.
            </Text>
          </Animated.View>
        </View>
        
        <Animated.View style={styles.actions} entering={FadeInDown.duration(600).delay(600).springify()}>
          <Button label="Get started" onPress={() => router.push("/(onboarding)/target")} />
          <Button label="Skip (use defaults)" variant="secondary" onPress={handleSkip} />
        </Animated.View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "space-between",
  },
  content: {
    gap: 12,
    paddingTop: 40,
    alignItems: "center",
  },
  illustrationContainer: {
    height: 220,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 42,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 16,
    letterSpacing: 1,
    textTransform: "uppercase",
    textAlign: "center",
    marginTop: 8,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    marginTop: 24,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  actions: {
    gap: 12,
    paddingBottom: 24,
    width: "100%",
  },
});
