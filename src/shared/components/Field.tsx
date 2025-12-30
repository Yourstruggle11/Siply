import React from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

type FieldProps = TextInputProps & {
  label: string;
  helper?: string;
};

export const Field = ({ label, helper, style, ...props }: FieldProps) => {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.colors.textSecondary }]}>{label}</Text>
      <TextInput
        {...props}
        style={[
          styles.input,
          {
            color: theme.colors.textPrimary,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radius.md,
          },
          style,
        ]}
        placeholderTextColor={theme.colors.textSecondary}
      />
      {helper ? <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>{helper}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  helper: {
    fontSize: 12,
  },
});
