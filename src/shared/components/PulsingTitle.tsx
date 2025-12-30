import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleProp, TextStyle } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

type PulsingTitleProps = {
  text: string;
  style?: StyleProp<TextStyle>;
  pulseScale?: number;
  durationMs?: number;
};

export const PulsingTitle = ({
  text,
  style,
  pulseScale = 1.02,
  durationMs = 2000,
}: PulsingTitleProps) => {
  const theme = useTheme();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: pulseScale,
          duration: durationMs,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: durationMs,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => {
      animation.stop();
    };
  }, [durationMs, pulseAnim, pulseScale]);

  return (
    <Animated.Text
      style={[
        { color: theme.colors.textPrimary, transform: [{ scale: pulseAnim }] },
        style,
      ]}
    >
      {text}
    </Animated.Text>
  );
};
