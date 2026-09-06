import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

type SkeletonProps = {
  style?: ViewStyle;
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
};

export const Skeleton = ({ style, width, height, borderRadius }: SkeletonProps) => {
  const theme = useTheme();
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [animatedValue]);

  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          backgroundColor: theme.colors.surfaceElevated,
          opacity,
          width: width ?? "100%",
          height: height ?? 20,
          borderRadius: borderRadius ?? theme.radius.md,
        },
        style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  skeleton: {
    overflow: "hidden",
  },
});
