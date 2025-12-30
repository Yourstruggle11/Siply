import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../../../shared/theme/ThemeProvider";
import { ProgressRing } from "./ProgressRing";

type ShareCardProps = {
  progress: number;
  consumedMl: number;
  targetMl: number;
  currentStreak: number;
};

export const ShareCard = ({ progress, consumedMl, targetMl, currentStreak }: ShareCardProps) => {
  const theme = useTheme();
  const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Siply</Text>
      <View style={styles.ringRow}>
        <ProgressRing
          size={140}
          strokeWidth={12}
          progress={progress}
          trackColor={theme.colors.border}
          fillColor={theme.colors.accent}
        />
        <View style={styles.ringText}>
          <Text style={[styles.percent, { color: theme.colors.textPrimary }]}>{percent}%</Text>
          <Text style={[styles.caption, { color: theme.colors.textSecondary }]}>today</Text>
        </View>
      </View>
      <View style={styles.stats}>
        <Text style={[styles.statText, { color: theme.colors.textPrimary }]}>
          {consumedMl} ml of {targetMl} ml
        </Text>
        <Text style={[styles.caption, { color: theme.colors.textSecondary }]}>
          Current streak: {currentStreak} days
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    width: 320,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
  },
  ringRow: {
    alignItems: "center",
    justifyContent: "center",
  },
  ringText: {
    position: "absolute",
    alignItems: "center",
  },
  percent: {
    fontSize: 28,
    fontWeight: "700",
  },
  caption: {
    fontSize: 12,
  },
  stats: {
    gap: 6,
  },
  statText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
