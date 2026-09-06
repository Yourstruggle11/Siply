import React, { useState, useMemo } from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Screen } from "../../src/shared/components/Screen";
import { Field } from "../../src/shared/components/Field";
import { Button } from "../../src/shared/components/Button";
import { useTheme } from "../../src/shared/theme/ThemeProvider";
import { DEFAULT_SETTINGS } from "../../src/core/constants";
import { useHydrationStore } from "../../src/features/hydration/state/hydrationStore";

export default function TargetScreen() {
  const router = useRouter();
  const theme = useTheme();
  const settings = useHydrationStore((s) => s.settings);
  const updateSettings = useHydrationStore((s) => s.updateSettings);
  const completeOnboarding = useHydrationStore((s) => s.completeOnboarding);
  
  const [target, setTarget] = useState(String(settings.targetLiters.toFixed(1)));
  const [calcWeight, setCalcWeight] = useState("");
  const [calcActivity, setCalcActivity] = useState<"low" | "medium" | "high">("medium");
  const [calcClimateHot, setCalcClimateHot] = useState(false);

  const suggestedMl = useMemo(() => {
    const weight = Number.parseFloat(calcWeight);
    if (!Number.isFinite(weight) || weight <= 0) return null;
    const basePerKg = calcActivity === "high" ? 40 : calcActivity === "medium" ? 35 : 30;
    const climateFactor = calcClimateHot ? 1.1 : 1.0;
    return Math.round(weight * basePerKg * climateFactor);
  }, [calcActivity, calcClimateHot, calcWeight]);

  const applySuggestedGoal = () => {
    if (!suggestedMl) return;
    const liters = (suggestedMl / 1000).toFixed(1);
    setTarget(liters);
  };

  const handleContinue = async () => {
    const parsed = Number.parseFloat(target);
    const nextValue = Number.isFinite(parsed) && parsed > 0 ? parsed : settings.targetLiters;
    await updateSettings({ targetLiters: nextValue });
    router.push("/(onboarding)/permissions");
  };

  const handleSkip = async () => {
    await updateSettings(DEFAULT_SETTINGS);
    await completeOnboarding();
    router.replace("/(tabs)");
  };

  return (
    <Screen scroll>
      <View style={styles.container}>
        <View style={styles.content}>
          <Animated.View entering={FadeInDown.duration(500).springify()}>
            <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Daily target</Text>
            <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
              Set how much water you want to drink each day.
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(500).delay(100).springify()}>
            <Field
              label="Target liters"
              value={target}
              onChangeText={setTarget}
              keyboardType="decimal-pad"
              placeholder="3.0"
            />
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(500).delay(200).springify()} style={styles.calcBox}>
            <Text style={[styles.subtitle, { color: theme.colors.textPrimary }]}>Not sure? Calculate it.</Text>
            
            <Field
              label="Weight (kg)"
              value={calcWeight}
              onChangeText={setCalcWeight}
              keyboardType="decimal-pad"
              placeholder="70"
            />
            
            <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>Activity level</Text>
            <View style={styles.optionRow}>
              {(["low", "medium", "high"] as const).map((level) => (
                <Pressable
                  key={`activity-${level}`}
                  onPress={() => setCalcActivity(level)}
                  style={[
                    styles.optionButton,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: calcActivity === level ? theme.colors.accent : "transparent",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.optionText,
                      { color: calcActivity === level ? theme.colors.surface : theme.colors.textPrimary },
                    ]}
                  >
                    {level}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>Climate</Text>
            <Pressable
              onPress={() => setCalcClimateHot((v) => !v)}
              style={[
                styles.optionButton,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: calcClimateHot ? theme.colors.accent : "transparent",
                  alignSelf: "flex-start",
                },
              ]}
            >
              <Text
                style={[
                  styles.optionText,
                  { color: calcClimateHot ? theme.colors.surface : theme.colors.textPrimary },
                ]}
              >
                Hot climate
              </Text>
            </Pressable>

            {suggestedMl ? (
              <View style={styles.suggestionBox}>
                <Text style={[styles.suggestionText, { color: theme.colors.textPrimary }]}>
                  Suggested: {(suggestedMl / 1000).toFixed(1)} L
                </Text>
                <Button label="Apply suggestion" onPress={applySuggestedGoal} />
              </View>
            ) : null}
          </Animated.View>
        </View>

        <Animated.View entering={FadeInDown.duration(500).delay(300).springify()} style={styles.actions}>
          <Button label="Continue" onPress={handleContinue} />
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
    paddingBottom: 24,
  },
  content: {
    gap: 20,
    paddingTop: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  helper: {
    fontSize: 16,
    lineHeight: 24,
    marginTop: 4,
  },
  fieldLabel: {
    fontSize: 13,
    marginTop: 4,
  },
  calcBox: {
    marginTop: 16,
    gap: 12,
  },
  optionRow: {
    flexDirection: "row",
    gap: 8,
  },
  optionButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
  },
  optionText: {
    fontSize: 14,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  suggestionBox: {
    marginTop: 12,
    gap: 12,
  },
  suggestionText: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  actions: {
    gap: 12,
    paddingTop: 24,
  },
});
