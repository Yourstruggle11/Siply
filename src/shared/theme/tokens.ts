export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
};

export const typography = {
  title: {
    fontSize: 24,
    fontWeight: "600" as const,
  },
  body: {
    fontSize: 16,
    fontWeight: "400" as const,
  },
  caption: {
    fontSize: 13,
    fontWeight: "400" as const,
  },
};

export const lightColors = {
  background: "#F5F6F7",
  surface: "#FFFFFF",
  textPrimary: "#1C1E21",
  textSecondary: "#6C7076",
  accent: "#6B7C8D",
  border: "#D9DDE1",
};

export const darkColors = {
  background: "#0F1113",
  surface: "#171A1D",
  textPrimary: "#ECEFF1",
  textSecondary: "#A1A7AE",
  accent: "#6B7C8D",
  border: "#2A2E33",
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
