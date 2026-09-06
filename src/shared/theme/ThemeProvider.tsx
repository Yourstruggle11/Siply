import React, { createContext, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";
import { darkTheme, lightTheme, Theme } from "./tokens";

const ThemeContext = createContext<Theme>(lightTheme);

type ThemeProviderProps = {
  children: React.ReactNode;
  mode?: "light" | "dark" | "system";
};

export const ThemeProvider = ({ children, mode }: ThemeProviderProps) => {
  // @ts-ignore
  const colorScheme = useColorScheme();
  const theme = useMemo(() => {
    if (mode === "dark") {
      return darkTheme;
    }
    if (mode === "light") {
      return lightTheme;
    }
    return colorScheme === "dark" ? darkTheme : lightTheme;
  }, [colorScheme, mode]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
