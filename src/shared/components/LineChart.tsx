import React, { useMemo, useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import Svg, { Path, Rect, Defs, LinearGradient, Stop, Text as SvgText, Circle } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';

export type ChartType = "line" | "bar";

interface LineChartProps {
  data: number[];
  labels?: string[]; // Corresponding labels for the data points
  type: ChartType;
  height?: number;
  goalMl?: number;
}

export const LineChart: React.FC<LineChartProps> = ({ data, labels, type, height = 150, goalMl }) => {
  const [width, setWidth] = useState(0);
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);
  const theme = useTheme();
  
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const maxVal = Math.max(...data, goalMl || 0, 100);

  const pathAndBars = useMemo(() => {
    if (width === 0 || data.length === 0) return { path: '', bars: [], points: [] };
    
    // For line chart, distribute points across the full width
    const xStep = data.length > 1 ? width / (data.length - 1) : width;
    const scaleY = (val: number) => height - (val / maxVal) * height;

    let pathStr = '';
    const bars: {x: number, y: number, w: number, h: number, val: number}[] = [];
    const points: {x: number, y: number, val: number}[] = [];

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

      points.push({ x: xLine, y, val });

      // Bar chart coords
      bars.push({
        x: (i * cellWidth) + (cellWidth - barWidth) / 2,
        y,
        w: barWidth,
        h: height - y,
        val
      });
    });

    return { path: pathStr, bars, points };
  }, [width, data, height, maxVal]);

  const goalY = goalMl ? height - (goalMl / maxVal) * height : -1;

  const handleTouch = (e: any) => {
    if (width === 0 || data.length === 0) return;
    const x = e.nativeEvent.locationX;
    let index = 0;
    
    if (type === 'bar') {
      const cellWidth = width / data.length;
      index = Math.floor(x / cellWidth);
    } else {
      const xStep = data.length > 1 ? width / (data.length - 1) : width;
      index = Math.round(x / xStep);
    }
    
    index = Math.max(0, Math.min(index, data.length - 1));
    setCursorIndex(index);
  };

  const handleTouchEnd = () => {
    setCursorIndex(null);
  };

  return (
    <View 
      style={[{ height, width: '100%' }, styles.container]} 
      onLayout={onLayout}
      onStartShouldSetResponder={() => true}
      onResponderGrant={handleTouch}
      onResponderMove={handleTouch}
      onResponderRelease={handleTouchEnd}
      onResponderTerminate={handleTouchEnd}
    >
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
              opacity={cursorIndex === null || cursorIndex === i ? 1 : 0.3}
            />
          ))}

          {/* Interactive Scrubbing Tooltip */}
          {cursorIndex !== null && data[cursorIndex] !== undefined && (
            <>
              {type === 'line' && (
                <>
                  <Path
                    d={`M ${pathAndBars.points[cursorIndex].x} 0 L ${pathAndBars.points[cursorIndex].x} ${height}`}
                    stroke={theme.colors.textSecondary}
                    strokeWidth="1"
                    strokeDasharray="4,4"
                  />
                  <Circle
                    cx={pathAndBars.points[cursorIndex].x}
                    cy={pathAndBars.points[cursorIndex].y}
                    r="4"
                    fill={theme.colors.accent}
                    stroke={theme.colors.surface}
                    strokeWidth="2"
                  />
                </>
              )}
              
              <Rect
                x={type === 'line' 
                  ? Math.max(0, Math.min(pathAndBars.points[cursorIndex].x - 40, width - 80)) 
                  : Math.max(0, Math.min(pathAndBars.bars[cursorIndex].x + pathAndBars.bars[cursorIndex].w / 2 - 40, width - 80))}
                y={8}
                width={80}
                height={36}
                rx={6}
                fill={theme.colors.surfaceElevated}
                opacity={0.95}
              />
              <SvgText
                x={type === 'line' 
                  ? Math.max(40, Math.min(pathAndBars.points[cursorIndex].x, width - 40)) 
                  : Math.max(40, Math.min(pathAndBars.bars[cursorIndex].x + pathAndBars.bars[cursorIndex].w / 2, width - 40))}
                y={22}
                fill={theme.colors.textPrimary}
                fontSize={12}
                fontWeight="bold"
                textAnchor="middle"
              >
                {data[cursorIndex]} ml
              </SvgText>
              {labels && labels[cursorIndex] && (
                <SvgText
                  x={type === 'line' 
                    ? Math.max(40, Math.min(pathAndBars.points[cursorIndex].x, width - 40)) 
                    : Math.max(40, Math.min(pathAndBars.bars[cursorIndex].x + pathAndBars.bars[cursorIndex].w / 2, width - 40))}
                  y={36}
                  fill={theme.colors.textSecondary}
                  fontSize={10}
                  textAnchor="middle"
                >
                  {labels[cursorIndex]}
                </SvgText>
              )}
            </>
          )}
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
