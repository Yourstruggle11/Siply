import React from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

type ToggleRowProps = {
  label: string;
  helper?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
};

export const ToggleRow = ({ label, helper, value, onValueChange }: ToggleRowProps) => {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text style={[styles.label, { color: theme.colors.textPrimary }]}>{label}</Text>
        {helper ? <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>{helper}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  text: {
    flex: 1,
    gap: 4,
  },
  label: {
    fontSize: 16,
  },
  helper: {
    fontSize: 12,
  },
});
