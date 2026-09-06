import React, { useMemo, useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import Svg, { Path, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';

export type ChartType = "line" | "bar";

interface LineChartProps {
  data: number[];
  type: ChartType;
  height?: number;
  goalMl?: number;
}

export const LineChart: React.FC<LineChartProps> = ({ data, type, height = 150, goalMl }) => {
  const [width, setWidth] = useState(0);
  const theme = useTheme();
  
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const maxVal = Math.max(...data, goalMl || 0, 100);

  const pathAndBars = useMemo(() => {
    if (width === 0 || data.length === 0) return { path: '', bars: [] };
    
    // For line chart, distribute points across the full width
    const xStep = data.length > 1 ? width / (data.length - 1) : width;
    const scaleY = (val: number) => height - (val / maxVal) * height;

    let pathStr = '';
    const bars: {x: number, y: number, w: number, h: number, val: number}[] = [];

    // For bar chart, calculate individual bar width and spacing
    const barWidth = Math.max(1, (width / data.length) * 0.7);
    const cellWidth = width / data.length;

    data.forEach((val, i) => {
      // Line chart coords
      const xLine = i * xStep;
      const y = scaleY(val);

      if (i === 0) {
        pathStr += `M ${xLine} ${y} `;
      } else {
        const prevX = (i - 1) * xStep;
        const prevY = scaleY(data[i - 1]);
        const cp1x = prevX + xStep / 2;
        const cp1y = prevY;
        const cp2x = xLine - xStep / 2;
        const cp2y = y;
        pathStr += `C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${xLine} ${y} `;
      }

      // Bar chart coords
      bars.push({
        x: (i * cellWidth) + (cellWidth - barWidth) / 2,
        y,
        w: barWidth,
        h: height - y,
        val
      });
    });

    return { path: pathStr, bars };
  }, [width, data, height, maxVal]);

  const goalY = goalMl ? height - (goalMl / maxVal) * height : -1;

  return (
    <View style={[{ height, width: '100%' }, styles.container]} onLayout={onLayout}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Defs>
             <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
               <Stop offset="0" stopColor={theme.colors.accent} stopOpacity="0.4" />
               <Stop offset="1" stopColor={theme.colors.accent} stopOpacity="0" />
             </LinearGradient>
          </Defs>
          
          {goalMl && goalY >= 0 && (
            <Path 
              d={`M 0 ${goalY} L ${width} ${goalY}`} 
              stroke={theme.colors.textSecondary} 
              strokeWidth="1" 
              strokeDasharray="4,4" 
              opacity={0.5} 
            />
          )}

          {type === "line" && pathAndBars.path !== '' && (
            <>
              <Path
                d={`${pathAndBars.path} L ${width} ${height} L 0 ${height} Z`}
                fill="url(#grad)"
              />
              <Path
                d={pathAndBars.path}
                fill="none"
                stroke={theme.colors.accent}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}

          {type === "bar" && pathAndBars.bars.map((bar, i) => (
            <Rect
              key={i}
              x={bar.x}
              y={bar.y}
              width={bar.w}
              height={bar.h}
              fill={bar.val >= (goalMl || maxVal) ? theme.colors.accent : theme.colors.border}
              rx={Math.min(bar.w / 2, 4)}
            />
          ))}
        </Svg>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  }
});
