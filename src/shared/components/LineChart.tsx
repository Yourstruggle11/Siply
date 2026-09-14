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
  const horizontalInset = 6;
  const topInset = 6;
  const bottomInset = 4;
  const plotWidth = Math.max(0, width - horizontalInset * 2);
  const plotBottom = height - bottomInset;
  const plotHeight = Math.max(1, plotBottom - topInset);
  
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const maxVal = Math.max(...data, goalMl || 0, 100);

  const pathAndBars = useMemo(() => {
    if (width === 0 || data.length === 0) return { path: '', bars: [], points: [] };
    
    const xStep = data.length > 1 ? plotWidth / (data.length - 1) : plotWidth;
    const scaleY = (val: number) => plotBottom - (val / maxVal) * plotHeight;

    let pathStr = '';
    const bars: {x: number, y: number, w: number, h: number, val: number}[] = [];
    const points: {x: number, y: number, val: number}[] = [];

    // For bar chart, calculate individual bar width and spacing
    const barWidth = Math.max(1, (plotWidth / data.length) * 0.7);
    const cellWidth = plotWidth / data.length;

    data.forEach((val, i) => {
      // Line chart coords
      const xLine = horizontalInset + i * xStep;
      const y = scaleY(val);

      if (i === 0) {
        pathStr += `M ${xLine} ${y} `;
      } else {
        const prevX = horizontalInset + (i - 1) * xStep;
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
        x: horizontalInset + (i * cellWidth) + (cellWidth - barWidth) / 2,
        y,
        w: barWidth,
        h: plotBottom - y,
        val
      });
    });

    return { path: pathStr, bars, points };
  }, [bottomInset, data, height, horizontalInset, maxVal, plotBottom, plotHeight, plotWidth]);

  const goalY = goalMl ? plotBottom - (goalMl / maxVal) * plotHeight : -1;

  const handleTouch = (e: any) => {
    if (width === 0 || data.length === 0) return;
    const x = e.nativeEvent.locationX;
    let index = 0;
    
    if (type === 'bar') {
      const cellWidth = plotWidth / data.length;
      index = Math.floor((x - horizontalInset) / cellWidth);
    } else {
      const xStep = data.length > 1 ? plotWidth / (data.length - 1) : plotWidth;
      index = Math.round((x - horizontalInset) / xStep);
    }
    
    index = Math.max(0, Math.min(index, data.length - 1));
    setCursorIndex(index);
  };

  const selectedX = cursorIndex === null
    ? 0
    : type === 'line'
      ? pathAndBars.points[cursorIndex]?.x ?? 0
      : (pathAndBars.bars[cursorIndex]?.x ?? 0) + (pathAndBars.bars[cursorIndex]?.w ?? 0) / 2;
  const selectedY = cursorIndex === null
    ? 0
    : type === 'line'
      ? pathAndBars.points[cursorIndex]?.y ?? 0
      : pathAndBars.bars[cursorIndex]?.y ?? 0;
  const tooltipWidth = 104;
  const tooltipHeight = labels ? 42 : 30;
  const tooltipX = Math.max(0, Math.min(selectedX - tooltipWidth / 2, width - tooltipWidth));
  const tooltipY = selectedY < tooltipHeight + 12
    ? Math.max(4, height - tooltipHeight - 6)
    : 4;

  return (
    <View 
      style={[{ height, width: '100%' }, styles.container]} 
      onLayout={onLayout}
      onStartShouldSetResponder={() => true}
      onResponderGrant={handleTouch}
      onResponderMove={handleTouch}
      onResponderTerminate={() => setCursorIndex(null)}
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
              d={`M ${horizontalInset} ${goalY} L ${width - horizontalInset} ${goalY}`}
              stroke={theme.colors.textSecondary} 
              strokeWidth="1" 
              strokeDasharray="4,4" 
              opacity={0.5} 
            />
          )}

          {type === "line" && pathAndBars.path !== '' && (
            <>
              <Path
                d={`${pathAndBars.path} L ${width - horizontalInset} ${plotBottom} L ${horizontalInset} ${plotBottom} Z`}
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
                    d={`M ${pathAndBars.points[cursorIndex].x} ${topInset} L ${pathAndBars.points[cursorIndex].x} ${plotBottom}`}
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
                x={tooltipX}
                y={tooltipY}
                width={tooltipWidth}
                height={tooltipHeight}
                rx={6}
                fill={theme.colors.surfaceElevated}
                opacity={0.95}
              />
              <SvgText
                x={tooltipX + tooltipWidth / 2}
                y={tooltipY + 17}
                fill={theme.colors.textPrimary}
                fontSize={12}
                fontWeight="bold"
                textAnchor="middle"
              >
                {data[cursorIndex]} ml
              </SvgText>
              {labels && labels[cursorIndex] && (
                <SvgText
                  x={tooltipX + tooltipWidth / 2}
                  y={tooltipY + 33}
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
