import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { darkColors } from "../theme/tokens";

type CardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export const Card = ({ children, style }: CardProps) => {
  const theme = useTheme();
  const isDark = theme.colors.background === darkColors.background;
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
        },
        !isDark && styles.shadow,
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    padding: 16,
  },
  shadow: {
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
});
