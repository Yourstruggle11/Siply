import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../../../../shared/theme/ThemeProvider";

type ProgressBarProps = {
  progress: number;
};

export const ProgressBar = ({ progress }: ProgressBarProps) => {
  const theme = useTheme();
  const width = Math.max(0, Math.min(1, progress));

  return (
    <View style={[styles.track, { backgroundColor: theme.colors.border }]}>
      <View
        style={[
          styles.fill,
          {
            backgroundColor: theme.colors.accent,
            width: `${width * 100}%`,
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
