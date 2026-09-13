import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Rect, Text as SvgText, Line } from "react-native-svg";
import { useTheme } from "../theme/ThemeProvider";

type HourlyBarChartProps = {
  hourlyVolumes: number[];
  selectedHour?: number | null;
  onSelectHour?: (hour: number | null) => void;
};

export const HourlyBarChart = ({ hourlyVolumes, selectedHour = null, onSelectHour }: HourlyBarChartProps) => {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const height = 140;
  const paddingBottom = 24;
  const chartHeight = height - paddingBottom;
  
  const hours = Array.from({ length: 24 }, (_, i) => i);
  
  // Scale heights based on actual volume relative to a reasonable peak.
  // E.g., if a user drinks 1000ml in an hour, that's a huge peak. We scale against the max hourly volume,
  // but ensure a minimum scale so tiny sips don't look massive.
  const maxVolume = Math.max(500, ...hourlyVolumes);

  const barWidth = width > 0 ? (width / 24) * 0.6 : 0;
  const barSpacing = width > 0 ? (width / 24) * 0.4 : 0;

  return (
    <View 
      style={styles.container} 
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 && (
        <Svg width={width} height={height}>
          {/* Baseline track for all 24 hours */}
          {hours.map((hour) => {
            const x = (barWidth + barSpacing) * hour + (barSpacing / 2);
            return (
              <Rect
                key={`track-${hour}`}
                x={x}
                y={0}
                width={barWidth}
                height={chartHeight}
                rx={barWidth / 2}
                fill={theme.colors.border}
                opacity={0.3}
              />
            );
          })}

          {/* Active fill bars driven by exact or explicitly estimated volume data */}
          {hours.map((hour) => {
            const ml = hourlyVolumes[hour] || 0;
            if (ml === 0) return null;
            
            const fillHeight = Math.max(barWidth, (ml / maxVolume) * chartHeight);
            const x = (barWidth + barSpacing) * hour + (barSpacing / 2);
            const y = chartHeight - fillHeight;

            return (
              <Rect
                key={`fill-${hour}`}
                x={x}
                y={y}
                width={barWidth}
                height={fillHeight}
                rx={barWidth / 2}
                fill={theme.colors.accent}
                opacity={selectedHour === null || selectedHour === hour ? 1 : 0.3}
              />
            );
          })}

          {/* Invisible Touch Targets for each hour */}
          {hours.map((hour) => {
            const ml = hourlyVolumes[hour] || 0;
            if (ml === 0) return null; // Only allow tapping hours with data
            const x = (barWidth + barSpacing) * hour;
            return (
              <Rect
                key={`touch-${hour}`}
                x={x}
                y={0}
                width={barWidth + barSpacing}
                height={chartHeight}
                fill="transparent"
                onPress={() => {
                  if (onSelectHour) {
                    onSelectHour(selectedHour === hour ? null : hour);
                  }
                }}
              />
            );
          })}

          {/* Clean Axis Line */}
          <Line
            x1={0}
            y1={chartHeight}
            x2={width}
            y2={chartHeight}
            stroke={theme.colors.border}
            strokeWidth={1}
          />

          {/* 4 Clean Labels (12 AM, 6 AM, 12 PM, 6 PM) */}
          {[0, 6, 12, 18].map((hour) => {
            const centerX = (barWidth + barSpacing) * hour + (barWidth / 2) + (barSpacing / 2);
            let x = centerX;
            let textAnchor = "middle";

            if (hour === 0) {
              x = 0;
              textAnchor = "start";
            } else if (hour === 18 && width > 0) {
              // Usually 18 is far enough from right edge, but 23 would need "end"
              // Keep middle for 18 as it's not the last hour.
              x = centerX;
              textAnchor = "middle";
            }

            const label = hour === 0 ? "12 AM" : hour === 12 ? "12 PM" : hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
            return (
              <SvgText
                key={`label-${hour}`}
                x={x}
                y={height - 4}
                fill={theme.colors.textSecondary}
                fontSize={10}
                fontWeight="500"
                textAnchor={textAnchor as any}
              >
                {label}
              </SvgText>
            );
          })}
        </Svg>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 140,
    marginTop: 16,
    marginBottom: 8,
    width: "100%",
  },
});
