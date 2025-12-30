import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleProp, Text, TextStyle } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

type AnimatedProgressValueProps = {
  value: number;
  prefix?: string;
  suffix?: string;
  durationMs?: number;
  style?: StyleProp<TextStyle>;
};

export const AnimatedProgressValue = ({
  value,
  prefix = "",
  suffix = "",
  durationMs = 1000,
  style,
}: AnimatedProgressValueProps) => {
  const theme = useTheme();
  const animValue = useRef(new Animated.Value(0)).current;
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const id = animValue.addListener(({ value: next }) => {
      setDisplayValue(Math.round(next));
    });
    return () => {
      animValue.removeListener(id);
    };
  }, [animValue]);

  useEffect(() => {
    animValue.stopAnimation();
    Animated.timing(animValue, {
      toValue: value,
      duration: durationMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [animValue, durationMs, value]);

  return (
    <Text style={[{ color: theme.colors.textPrimary }, style]}>
      {prefix}
      {displayValue}
      {suffix}
    </Text>
  );
};
