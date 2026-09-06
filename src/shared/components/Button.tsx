import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
};

export const Button = ({ label, onPress, variant = "primary", disabled }: ButtonProps) => {
  const theme = useTheme();
  
  let backgroundColor = theme.colors.accent;
  let borderColor = "transparent";
  let textColor = theme.colors.surface;

  if (variant === "secondary") {
    backgroundColor = theme.colors.surfaceElevated;
    borderColor = "transparent";
    textColor = theme.colors.textPrimary;
  } else if (variant === "ghost") {
    backgroundColor = "transparent";
    borderColor = theme.colors.accent;
    textColor = theme.colors.accent;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.button,
        {
          borderRadius: theme.radius.full, // pill shape
          backgroundColor,
          borderColor,
          opacity: disabled ? 0.5 : pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      <View>
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48, // Accessibility minimum touch target
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
  },
});
