import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

type HourlyBarChartProps = {
  logHours: Record<number, number>;
  goalMl: number;
};

export const HourlyBarChart = ({ logHours, goalMl }: HourlyBarChartProps) => {
  const theme = useTheme();

  // We want to show the last 24 hours, but typically a day view goes from 0 to 23.
  const hours = Array.from({ length: 24 }, (_, i) => i);
  
  // Find the maximum value to scale the chart, or use a minimum of 500ml for scaling
  const maxMl = Math.max(500, ...Object.values(logHours));

  return (
    <View style={styles.container}>
      <View style={styles.chartArea}>
        {hours.map((hour) => {
          const ml = logHours[hour] || 0;
          const heightPct = Math.max(0, Math.min(100, (ml / maxMl) * 100));

          // Only show labels for some hours (e.g. 0, 6, 12, 18) to avoid crowding
          const showLabel = hour % 6 === 0;

          return (
            <View key={`hour-${hour}`} style={styles.barContainer}>
              <View style={styles.barBackground}>
                <View
                  style={[
                    styles.barFill,
                    {
                      height: `${heightPct}%`,
                      backgroundColor: theme.colors.accent,
                    },
                  ]}
                />
              </View>
              {showLabel && (
                <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
                  {hour}h
                </Text>
              )}
            </View>
          );
        })}
      </View>
      <View style={[styles.axisLine, { backgroundColor: theme.colors.border }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 120,
    marginTop: 16,
    marginBottom: 8,
  },
  chartArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 8,
  },
  barContainer: {
    alignItems: "center",
    width: "4%",
    height: "100%",
  },
  barBackground: {
    flex: 1,
    width: 6,
    backgroundColor: "transparent",
    justifyContent: "flex-end",
    alignItems: "center",
    marginBottom: 6,
  },
  barFill: {
    width: "100%",
    borderRadius: 3,
  },
  axisLine: {
    height: 1,
    width: "100%",
    position: "absolute",
    bottom: 24, // above labels
  },
  label: {
    fontSize: 10,
    position: "absolute",
    bottom: 0,
  },
});
