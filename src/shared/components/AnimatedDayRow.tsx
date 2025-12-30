import React, { useEffect, useRef } from "react";
import {
  Animated,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { triggerLightHaptic } from "../haptics";

type AnimatedDayRowProps = {
  label: string;
  value: string | number;
  delay?: number;
  onPress?: () => void;
  enableHaptics?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

export const AnimatedDayRow = ({
  label,
  value,
  delay = 0,
  onPress,
  enableHaptics = false,
  style,
  children,
}: AnimatedDayRowProps) => {
  const theme = useTheme();
  const slideAnim = useRef(new Animated.Value(-50)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const isInteractive = Boolean(onPress || enableHaptics);

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      delay,
      tension: 50,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, [delay, slideAnim]);

  const handlePressIn = () => {
    if (enableHaptics) {
      void triggerLightHaptic();
    }
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      tension: 100,
      friction: 7,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 100,
      friction: 7,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={!isInteractive}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole={onPress ? "button" : undefined}
    >
      <Animated.View
        style={[
          styles.row,
          style,
          {
            transform: [{ translateX: slideAnim }, { scale: scaleAnim }],
          },
        ]}
      >
        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>{label}</Text>
        <View style={styles.center}>{children}</View>
        <Text style={[styles.value, { color: theme.colors.textPrimary }]}>{value}</Text>
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  label: {
    width: 42,
    fontSize: 12,
    textTransform: "uppercase",
  },
  center: {
    flex: 1,
  },
  value: {
    width: 72,
    fontSize: 12,
    textAlign: "right",
  },
});
