import React from 'react';
import { FlexWidget, SvgWidget } from 'react-native-android-widget';

export interface SiplyAndroidWidgetProps {
  consumedMl: number;
  targetMl: number;
  percentage: number;
  nextReminderLabel: string;
}

export function SiplyCircularWidget({ consumedMl, targetMl, percentage, nextReminderLabel }: SiplyAndroidWidgetProps) {
  const displayPercentage = Math.min(percentage, 100);
  const radius = 60; // Slightly smaller to leave room for the glow
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (circumference * displayPercentage) / 100;

  const svgContent = `
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Premium dark gradient background -->
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1A2A3A" />
          <stop offset="100%" stop-color="#0C0F12" />
        </linearGradient>
        
        <!-- Vibrant ring gradient -->
        <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#5BA3E0" />
          <stop offset="100%" stop-color="#3B82C4" />
        </linearGradient>
      </defs>

      <!-- Background -->
      <rect x="0" y="0" width="200" height="200" fill="url(#bgGrad)" />

      <!-- Translucent Track -->
      <circle 
        cx="100" cy="88" r="${radius}" 
        stroke="#FFFFFF" stroke-width="12" fill="none" 
        opacity="0.05"
      />
      
      <!-- Simulated Neon Glow (Safe for Android VectorDrawable) -->
      <circle 
        cx="100" cy="88" r="${radius}" 
        stroke="url(#ringGrad)" stroke-width="22" fill="none" 
        stroke-dasharray="${circumference}" 
        stroke-dashoffset="${strokeDashoffset}" 
        stroke-linecap="round"
        opacity="0.15"
        transform="rotate(-90 100 88)"
      />
      <circle 
        cx="100" cy="88" r="${radius}" 
        stroke="url(#ringGrad)" stroke-width="16" fill="none" 
        stroke-dasharray="${circumference}" 
        stroke-dashoffset="${strokeDashoffset}" 
        stroke-linecap="round"
        opacity="0.25"
        transform="rotate(-90 100 88)"
      />
      
      <!-- Main Progress Bar -->
      <circle 
        cx="100" cy="88" r="${radius}" 
        stroke="url(#ringGrad)" stroke-width="12" fill="none" 
        stroke-dasharray="${circumference}" 
        stroke-dashoffset="${strokeDashoffset}" 
        stroke-linecap="round"
        transform="rotate(-90 100 88)"
      />
      
      <!-- Water Drop Icon -->
      <text x="100" y="60" font-family="sans-serif" font-size="16" fill="#5BA3E0" text-anchor="middle">💧</text>

      <!-- Percentage -->
      <text x="100" y="98" font-family="sans-serif" font-size="38" font-weight="bold" fill="#FFFFFF" text-anchor="middle" alignment-baseline="middle">${percentage}%</text>
      
      <!-- Progress Text (ml) -->
      <text x="100" y="122" font-family="sans-serif" font-size="12" font-weight="600" fill="#9CA3AB" text-anchor="middle">${consumedMl} / ${targetMl} ml</text>
      
      <!-- Next reminder -->
      <text x="100" y="166" font-family="sans-serif" font-size="9" font-weight="bold" fill="#5BA3E0" text-anchor="middle" letter-spacing="1">NEXT REMINDER</text>
      <text x="100" y="181" font-family="sans-serif" font-size="10" font-weight="600" fill="#E8ECF0" text-anchor="middle">${nextReminderLabel}</text>
    </svg>
  `;

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0C0F12',
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
