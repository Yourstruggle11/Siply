import React from 'react';
import { FlexWidget, SvgWidget } from 'react-native-android-widget';
import { SiplyAndroidWidgetProps } from './SiplyCircularWidget';

export function SiplyLinearWidget({
  consumedMl,
  targetMl,
  percentage,
}: SiplyAndroidWidgetProps) {
  const progress = Math.max(0, Math.min(percentage, 100));
  const consumed = Math.max(0, consumedMl);
  const target = Math.max(1, targetMl);
  const remaining = Math.max(target - consumed, 0);

  const progressWidth = 264;
  const progressHeight = 12;
  const filledWidth = (progressWidth * progress) / 100;

  const formattedConsumed = consumed.toLocaleString();
  const formattedTarget = target.toLocaleString();
  const formattedRemaining = remaining.toLocaleString();

  const status =
    progress >= 100
      ? 'Goal reached'
      : `${formattedRemaining} ml left`;

  const svg = `
    <svg
      viewBox="0 0 320 180"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id="water"
          x1="0"
          y1="0"
          x2="1"
          y2="0"
        >
          <stop offset="0%" stop-color="#5BA3E0"/>
          <stop offset="100%" stop-color="#2D7BBE"/>
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.25" />
        </filter>
      </defs>

      <rect
        width="320"
        height="180"
        rx="28"
        fill="#0F1113"
      />

      <text
        x="28"
        y="36"
        font-family="sans-serif"
        font-size="12"
        font-weight="bold"
        fill="#9CA3AB"
        letter-spacing="1"
      >
        SIPLY
      </text>

      <text
        x="292"
        y="36"
        font-family="sans-serif"
        font-size="11"
        font-weight="bold"
        fill="#9CA3AB"
        text-anchor="end"
        letter-spacing="0.5"
      >
        TODAY
      </text>

      <path
        d="M 42 63 C 42 63, 31 77, 31 84 C 31 91, 36 96, 42 96 C 48 96, 53 91, 53 84 C 53 77, 42 63, 42 63 Z"
        fill="url(#water)"
        filter="url(#glow)"
      />

      <text
        x="66"
        y="95"
        font-family="sans-serif"
        font-size="42"
        font-weight="bold"
        fill="#FFFFFF"
      >
        ${formattedConsumed}
      </text>

      <text
        x="66"
        y="112"
        font-family="sans-serif"
        font-size="12"
        font-weight="500"
        fill="#9CA3AB"
      >
        ml consumed
      </text>

      <text
        x="292"
        y="95"
        font-family="sans-serif"
        font-size="36"
        font-weight="bold"
        fill="#5BA3E0"
        text-anchor="end"
      >
        ${Math.round(progress)}%
      </text>

      <rect
        x="28"
        y="130"
        width="${progressWidth}"
        height="${progressHeight}"
        rx="6"
        fill="#1F2328"
      />

      ${
        filledWidth > 0
          ? `
      <rect
        x="28"
        y="130"
        width="${Math.max(filledWidth, 12)}"
        height="${progressHeight}"
        rx="6"
        fill="url(#water)"
      />
      `
          : ''
      }

      <text
        x="28"
        y="162"
        font-family="sans-serif"
        font-size="12"
        font-weight="bold"
        fill="#FFFFFF"
      >
        ${status}
      </text>

      <text
        x="292"
        y="162"
        font-family="sans-serif"
        font-size="12"
        font-weight="500"
        fill="#9CA3AB"
        text-anchor="end"
      >
        Goal: <tspan fill="#FFFFFF" font-weight="bold">${formattedTarget} ml</tspan>
      </text>
    </svg>
  `;

  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        height: 'match_parent',
        backgroundColor: '#0F1113',
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <SvgWidget
        svg={svg}
        style={{
          width: 'match_parent',
          height: 'match_parent',
        }}
      />
    </FlexWidget>
  );
}
