import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../src/shared/components/Screen";
import { Button } from "../src/shared/components/Button";
import { useTheme } from "../src/shared/theme/ThemeProvider";

export default function UnmatchedRoute() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Screen>
      <View style={styles.container}>
        <Text style={[styles.title, { color: theme.colors.textPrimary, ...theme.typography.displayLarge }]}>
          Oops!
        </Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary, ...theme.typography.body }]}>
          This screen doesn't exist.
        </Text>
        <Button
          label="Go back home"
          onPress={() => router.replace("/")}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    gap: 16,
  },
  title: {
    textAlign: "center",
  },
  subtitle: {
    textAlign: "center",
    marginBottom: 20,
  },
  button: {
    minWidth: 200,
  },
});
