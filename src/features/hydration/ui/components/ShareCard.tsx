import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../../../../shared/theme/ThemeProvider";
import { ProgressRing } from "../../../../shared/components/ProgressRing";

type ShareCardProps = {
  progress: number;
  consumedMl: number;
  targetMl: number;
  currentStreak: number;
  bestStreak: number;
  averageIntake: number;
  daysTracked: number;
  insight: string | null;
};

export const ShareCard = ({
  progress,
  consumedMl,
  targetMl,
  currentStreak,
  bestStreak,
  averageIntake,
  daysTracked,
  insight,
}: ShareCardProps) => {
  const theme = useTheme();
  const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Siply</Text>
      
      <View style={styles.ringRow}>
        <ProgressRing size={140} strokeWidth={12} progress={progress} />
        <View style={styles.ringText}>
          <Text style={[styles.percent, { color: theme.colors.textPrimary }]}>{percent}%</Text>
          <Text style={[styles.caption, { color: theme.colors.textSecondary }]}>today</Text>
        </View>
      </View>
      
      <View style={{ alignItems: "center", marginBottom: 8 }}>
        <Text style={[styles.statText, { color: theme.colors.textPrimary }]}>
          {consumedMl} ml of {targetMl} ml
        </Text>
      </View>

      <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

      <View style={styles.grid}>
        <View style={styles.gridCol}>
          <Text style={[styles.gridLabel, { color: theme.colors.textSecondary }]}>Current Streak</Text>
          <Text style={[styles.gridValue, { color: theme.colors.textPrimary }]}>{currentStreak} days</Text>
        </View>
        <View style={styles.gridCol}>
          <Text style={[styles.gridLabel, { color: theme.colors.textSecondary }]}>Best Streak</Text>
          <Text style={[styles.gridValue, { color: theme.colors.textPrimary }]}>{bestStreak} days</Text>
        </View>
        <View style={styles.gridCol}>
          <Text style={[styles.gridLabel, { color: theme.colors.textSecondary }]}>Avg Intake</Text>
          <Text style={[styles.gridValue, { color: theme.colors.textPrimary }]}>{Math.round(averageIntake)} ml/day</Text>
        </View>
        <View style={styles.gridCol}>
          <Text style={[styles.gridLabel, { color: theme.colors.textSecondary }]}>Tracked</Text>
          <Text style={[styles.gridValue, { color: theme.colors.textPrimary }]}>{daysTracked} days</Text>
        </View>
      </View>

      {insight && (
        <>
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          <View style={[styles.insightBanner, { backgroundColor: theme.colors.accentSoft }]}>
            <MaterialCommunityIcons name="lightbulb-on-outline" size={20} color={theme.colors.accent} />
            <Text style={[styles.insightText, { color: theme.colors.textPrimary }]}>
              {insight}
            </Text>
          </View>
        </>
      )}
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
    marginVertical: 4,
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
  statText: {
    fontSize: 15,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    width: "100%",
    opacity: 0.5,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 16,
    columnGap: 12,
  },
  gridCol: {
    width: "47%",
    gap: 4,
  },
  gridLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  gridValue: {
    fontSize: 15,
    fontWeight: "600",
  },
  insightBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  insightText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },
});
