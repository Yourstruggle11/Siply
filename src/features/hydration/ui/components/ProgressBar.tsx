import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { useTheme } from "../../../../shared/theme/ThemeProvider";

type ProgressBarProps = {
  progress: number;
};

export const ProgressBar = ({ progress }: ProgressBarProps) => {
  const theme = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const animatedWidth = useRef(new Animated.Value(0)).current;
  const clamped = Math.max(0, Math.min(1, progress));

  useEffect(() => {
    if (trackWidth <= 0) {
      return;
    }
    Animated.timing(animatedWidth, {
      toValue: trackWidth * clamped,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [animatedWidth, clamped, trackWidth]);

  return (
    <View
      style={[styles.track, { backgroundColor: theme.colors.border }]}
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
    >
      <Animated.View
        style={[
          styles.fill,
          {
            backgroundColor: theme.colors.accent,
            width: animatedWidth,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    height: 10,
    borderRadius: 6,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
  },
});
