import React from "react";
import { Pressable, StyleSheet, Text, View, Animated } from "react-native";
import * as reactNative from "react-native";
import Svg, { Rect } from "react-native-svg";
import { useTheme } from "../theme/ThemeProvider";
import { useHydrationStore } from "../../features/hydration/state/hydrationStore";
import { getSummaryForDate, buildDateKeys } from "../../features/hydration/domain/history";
import { litersToMl } from "../../features/hydration/domain/calculations";

type CalendarHeatmapProps = {
  selectedDateKey: string | null;
  onSelectDate: (dateKey: string) => void;
};

export const CalendarHeatmap = ({ selectedDateKey, onSelectDate }: CalendarHeatmapProps) => {
  const theme = useTheme();
  const settings = useHydrationStore((s) => s.settings);
  const history = useHydrationStore((s) => s.history);
  
  const goalMl = litersToMl(settings.targetLiters);
  const goodThresholdMl = Math.round((goalMl * settings.gentleGoalThreshold) / 100);

  // Get last 28 days
  const today = new Date();
  const dateKeys = buildDateKeys(today, 28);
  
  const days = dateKeys.map(key => {
    const summary = getSummaryForDate(history, key, goalMl, goodThresholdMl);
    const progress = goalMl > 0 ? summary.totalMl / goalMl : 0;
    return { key, progress };
  });

  // Group into weeks (7 days per column, starting from oldest to newest)
  // dateKeys gives [today, today-1, ..., today-27]. We want chronological order.
  const chronologicalDays = [...days].reverse();

  // Layout params
  const cellSize = 24;
  const gap = 6;
  const cols = 4; // 4 weeks
  const rows = 7; // 7 days a week

  const getColorForProgress = (progress: number) => {
    if (progress === 0) return theme.colors.surfaceElevated;
    
    // Scale opacity based on progress
    const intensity = Math.min(Math.max(progress, 0.2), 1.2); // Cap at 1.2 to allow over-achieving to be fully saturated
    
    // Simple interpolation - in a real app you might use a color library or explicit tokens for steps
    // We'll use the accent color with varying opacity. We know theme.colors.accent is a hex code.
    // However, react-native-svg allows rgba. Let's use opacity attribute on the Rect.
    return theme.colors.accent;
  };

  const getOpacityForProgress = (progress: number) => {
    if (progress === 0) return 1; // background color handles zero
    return 0.3 + 0.7 * Math.min(progress, 1);
  };

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {Array.from({ length: cols }).map((_, colIndex) => (
          <View key={`col-${colIndex}`} style={styles.column}>
            {Array.from({ length: rows }).map((_, rowIndex) => {
              const dayIndex = colIndex * rows + rowIndex;
              const day = chronologicalDays[dayIndex];
              if (!day) return null;

              const isSelected = day.key === selectedDateKey;

const AnimatedCell = ({ day, isSelected, theme, onSelectDate, cellSize }: any) => {
  const scale = React.useRef(new reactNative.Animated.Value(1)).current;

  const handlePress = () => {
    reactNative.Animated.sequence([
      reactNative.Animated.timing(scale, {
        toValue: 0.85,
        duration: 100,
        useNativeDriver: true,
      }),
      reactNative.Animated.spring(scale, {
        toValue: 1,
        friction: 4,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
    onSelectDate(day.key);
  };

  return (
    <reactNative.Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Date ${day.key}, Progress: ${Math.round(day.progress * 100)}%`}
        onPress={handlePress}
        style={[
          styles.cellContainer,
          isSelected && { borderColor: theme.colors.textPrimary }
        ]}
      >
        <Svg width={cellSize} height={cellSize}>
          <Rect
            x={0}
            y={0}
            width={cellSize}
            height={cellSize}
            rx={6}
            fill={day.progress === 0 ? theme.colors.surfaceElevated : theme.colors.accent}
            opacity={day.progress === 0 ? 1 : (0.3 + 0.7 * Math.min(day.progress, 1))}
          />
        </Svg>
      </Pressable>
    </reactNative.Animated.View>
  );
};

// ... inside CalendarHeatmap component ...

              return (
                <AnimatedCell
                  key={day.key}
                  day={day}
                  isSelected={isSelected}
                  theme={theme}
                  onSelectDate={onSelectDate}
                  cellSize={cellSize}
                />
              );
            })}
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        <Text style={[styles.legendText, { color: theme.colors.textSecondary }]}>Less</Text>
        <View style={styles.legendSwatches}>
          <View style={[styles.swatch, { backgroundColor: theme.colors.surfaceElevated }]} />
          <View style={[styles.swatch, { backgroundColor: theme.colors.accent, opacity: 0.3 }]} />
          <View style={[styles.swatch, { backgroundColor: theme.colors.accent, opacity: 0.5 }]} />
          <View style={[styles.swatch, { backgroundColor: theme.colors.accent, opacity: 0.75 }]} />
          <View style={[styles.swatch, { backgroundColor: theme.colors.accent, opacity: 1 }]} />
        </View>
        <Text style={[styles.legendText, { color: theme.colors.textSecondary }]}>More</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
  },
  grid: {
    flexDirection: 'row',
    gap: 6,
  },
  column: {
    flexDirection: 'column',
    gap: 6,
  },
  cellContainer: {
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 8,
    // Negative margin to offset the border width so cells don't shift when selected
    margin: -2,
    padding: 2,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  legendSwatches: {
    flexDirection: 'row',
    gap: 4,
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 12,
  }
});
