import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../../../shared/theme/ThemeProvider";

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
};

export const PrimaryButton = ({ label, onPress, variant = "primary", disabled }: PrimaryButtonProps) => {
  const theme = useTheme();
  const isSecondary = variant === "secondary";
  const backgroundColor = isSecondary ? "transparent" : theme.colors.textPrimary;
  const borderColor = isSecondary ? theme.colors.border : "transparent";
  const textColor = isSecondary ? theme.colors.textPrimary : theme.colors.surface;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        {
          borderRadius: theme.radius.lg,
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
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
  },
});
