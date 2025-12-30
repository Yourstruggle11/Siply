import React, { useEffect, useRef } from "react";
import { Animated, StyleProp, StyleSheet, Text, TextStyle, ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

type AnimatedStatRowProps = {
  label: string;
  value: string | number;
  delay?: number;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  valueStyle?: StyleProp<TextStyle>;
};

export const AnimatedStatRow = ({
  label,
  value,
  delay = 0,
  style,
  labelStyle,
  valueStyle,
}: AnimatedStatRowProps) => {
  const theme = useTheme();
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        delay,
        tension: 40,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, fadeAnim, scaleAnim]);

  return (
    <Animated.View
      style={[
        styles.row,
        style,
        {
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      <Text style={[styles.label, { color: theme.colors.textSecondary }, labelStyle]}>{label}</Text>
      <Text style={[styles.value, { color: theme.colors.textPrimary }, valueStyle]}>{value}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  label: {
    fontSize: 14,
    flexShrink: 1,
  },
  value: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "right",
    flexShrink: 1,
  },
});
