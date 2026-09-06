import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { Screen } from "../src/shared/components/Screen";
import { Button } from "../src/shared/components/Button";
import { useTheme } from "../src/shared/theme/ThemeProvider";
import { processBackupUri } from "../src/features/hydration/backup/import";

export default function UnmatchedRoute() {
  const theme = useTheme();
  const router = useRouter();
  const url = Linking.useURL();
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!url) return;

    // Check if the URL is a Siply backup file (via file association intent)
    // The intent filter might produce file:// or content:// URIs, or siply://...
    if (url.includes(".siply.json")) {
      setProcessing(true);
      
      // We pass the raw intent URL to the import processor.
      // expo-file-system can read from content:// URIs directly on Android.
      processBackupUri(url).finally(() => {
        setProcessing(false);
        // After processing (success, error, or cancel), redirect back to home.
        router.replace("/");
      });
    }
  }, [url, router]);

  if (processing) {
    return (
      <Screen>
        <View style={styles.container}>
          <Text style={[styles.title, { color: theme.colors.textPrimary, ...theme.typography.titleLarge }]}>
            Processing backup...
          </Text>
        </View>
      </Screen>
    );
  }

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
