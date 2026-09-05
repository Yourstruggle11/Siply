export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
  "2xl": 48,
  "3xl": 64,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const typography = {
  displayLarge: {
    fontSize: 32,
    fontWeight: "700" as const,
    letterSpacing: -0.5,
  },
  titleLarge: {
    fontSize: 22,
    fontWeight: "600" as const,
  },
  titleMedium: {
    fontSize: 18,
    fontWeight: "600" as const,
  },
  body: {
    fontSize: 16,
    fontWeight: "400" as const,
  },
  bodySmall: {
    fontSize: 14,
    fontWeight: "400" as const,
  },
  caption: {
    fontSize: 12,
    fontWeight: "500" as const,
  },
};

export const lightColors = {
  background: "#F8FAFB",
  surface: "#FFFFFF",
  surfaceElevated: "#F0F4F6",
  textPrimary: "#1A1D21",
  textSecondary: "#5A6370",
  accent: "#3B82C4",
  accentSoft: "#E8F2FB",
  success: "#2DA67A",
  warning: "#D4930A",
  border: "#DDE2E7",
};

export const darkColors = {
  background: "#0C0F12",
  surface: "#161A1F",
  surfaceElevated: "#1E2328",
  textPrimary: "#E8ECF0",
  textSecondary: "#9CA3AB",
  accent: "#5BA3E0",
  accentSoft: "#1A2A3A",
  success: "#3EBF8E",
  warning: "#EAA820",
  border: "#2A2F36",
};

export type Theme = {
  colors: typeof lightColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
};

export const lightTheme: Theme = {
  colors: lightColors,
  spacing,
  radius,
  typography,
};

export const darkTheme: Theme = {
  colors: darkColors,
  spacing,
  radius,
  typography,
};
