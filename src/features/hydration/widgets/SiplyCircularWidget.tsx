import React from 'react';
import { FlexWidget, SvgWidget } from 'react-native-android-widget';

export interface SiplyAndroidWidgetProps {
  consumedMl: number;
  targetMl: number;
  percentage: number;
}

export function SiplyCircularWidget({ consumedMl, targetMl, percentage }: SiplyAndroidWidgetProps) {
  const displayPercentage = Math.min(percentage, 100);
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (circumference * displayPercentage) / 100;

  const svgContent = `
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#5BA3E0" />
          <stop offset="100%" stop-color="#2D7BBE" />
        </linearGradient>
      </defs>

      <!-- Progress Track -->
      <circle 
        cx="100" cy="85" r="${radius}" 
        stroke="#1F2328" stroke-width="12" fill="none" 
      />
      
      <!-- Progress Bar -->
      <circle 
        cx="100" cy="85" r="${radius}" 
        stroke="url(#ringGrad)" stroke-width="12" fill="none" 
        stroke-dasharray="${circumference}" 
        stroke-dashoffset="${strokeDashoffset}" 
        stroke-linecap="round"
        transform="rotate(-90 100 85)"
      />
      
      <!-- Percentage -->
      <text x="100" y="85" font-family="sans-serif" font-size="34" font-weight="bold" fill="#FFFFFF" text-anchor="middle" alignment-baseline="middle">${percentage}%</text>
      
      <!-- Progress Text -->
      <text x="100" y="115" font-family="sans-serif" font-size="12" fill="#9CA3AB" text-anchor="middle">${consumedMl} / ${targetMl} ml</text>
      
      <!-- Title -->
      <text x="100" y="165" font-family="sans-serif" font-size="15" font-weight="bold" fill="#E8ECF0" text-anchor="middle">Today's Progress</text>
    </svg>
  `;

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0F1113',
        borderRadius: 24,
      }}
    >
      <SvgWidget 
        svg={svgContent} 
        style={{
          width: 'match_parent',
          height: 'match_parent',
        }}
      />
    </FlexWidget>
  );
}
