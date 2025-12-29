import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../../src/shared/components/Screen";
import { Card } from "../../src/shared/components/Card";
import { Field } from "../../src/shared/components/Field";
import { TimeField } from "../../src/shared/components/TimeField";
import { ToggleRow } from "../../src/shared/components/ToggleRow";
import { PrimaryButton } from "../../src/features/hydration/ui/components/PrimaryButton";
import { useTheme } from "../../src/shared/theme/ThemeProvider";
import { DEFAULT_SETTINGS, MIN_INTERVAL_MINUTES } from "../../src/core/constants";
import { parseTimeToMinutes } from "../../src/core/time";
import { useHydration } from "../../src/features/hydration/state/hydrationStore";
import { HydrationSettings } from "../../src/features/hydration/domain/types";
import { computeMlPerReminder, computeSipsPerReminder } from "../../src/features/hydration/domain/calculations";

export default function DefaultsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { settings, updateSettings, completeOnboarding } = useHydration();
  const [windowStart, setWindowStart] = useState(settings.windowStart);
  const [windowEnd, setWindowEnd] = useState(settings.windowEnd);
  const [interval, setInterval] = useState(String(settings.intervalMinutes));
  const [sipMl, setSipMl] = useState(String(settings.sipMl));

  const previewSettings = React.useMemo(() => {
    const startMinutes = parseTimeToMinutes(windowStart);
    const endMinutes = parseTimeToMinutes(windowEnd);
    const hasValidWindow = startMinutes !== null && endMinutes !== null && endMinutes > startMinutes;
    const intervalValue = Number.parseInt(interval, 10);
    const sipValue = Number.parseInt(sipMl, 10);

    return {
      ...settings,
      windowStart: hasValidWindow ? windowStart : settings.windowStart,
      windowEnd: hasValidWindow ? windowEnd : settings.windowEnd,
      intervalMinutes:
        Number.isFinite(intervalValue) && intervalValue >= MIN_INTERVAL_MINUTES
          ? intervalValue
          : settings.intervalMinutes,
      sipMl: Number.isFinite(sipValue) && sipValue > 0 ? sipValue : settings.sipMl,
    };
  }, [interval, settings, sipMl, windowEnd, windowStart]);

  const previewMl = computeMlPerReminder(previewSettings);
  const previewSips = computeSipsPerReminder(previewSettings);

  const applyEdits = async () => {
    const patch: Partial<HydrationSettings> = {};
    const startMinutes = parseTimeToMinutes(windowStart);
    const endMinutes = parseTimeToMinutes(windowEnd);
    if (startMinutes !== null && endMinutes !== null && endMinutes > startMinutes) {
      patch.windowStart = windowStart;
      patch.windowEnd = windowEnd;
    } else {
      setWindowStart(settings.windowStart);
      setWindowEnd(settings.windowEnd);
    }

    const nextInterval = Number.parseInt(interval, 10);
    if (Number.isFinite(nextInterval) && nextInterval >= MIN_INTERVAL_MINUTES) {
      patch.intervalMinutes = nextInterval;
    } else {
      setInterval(String(settings.intervalMinutes));
    }

    const nextSip = Number.parseInt(sipMl, 10);
    if (Number.isFinite(nextSip) && nextSip > 0) {
      patch.sipMl = nextSip;
    } else {
      setSipMl(String(settings.sipMl));
    }

    if (Object.keys(patch).length > 0) {
      await updateSettings(patch);
    }
  };

  const handleContinue = async () => {
    await applyEdits();
    router.push("/(onboarding)/permissions");
  };

  const handleSkip = async () => {
    await updateSettings(DEFAULT_SETTINGS);
    await completeOnboarding();
    router.replace("/(tabs)");
  };

  return (
    <Screen scroll>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>How Siply works</Text>
        </View>

        <View style={styles.cards}>
          <Card>
            <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]}>
              Active hours: {settings.windowStart}-{settings.windowEnd}
            </Text>
          </Card>
          <Card>
            <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]}>
              Reminder interval: {settings.intervalMinutes} minutes
            </Text>
          </Card>
          <Card>
            <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]}>Sip size: {settings.sipMl} ml</Text>
          </Card>
          <Card>
            <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]}>
              Nudges: {settings.escalationEnabled ? "on" : "off"}
            </Text>
          </Card>
        </View>

        <Card style={styles.preview}>
          <Text style={[styles.previewText, { color: theme.colors.textPrimary }]}>
            One reminder ~= {previewMl} ml ({previewSips} sips)
          </Text>
        </Card>

        <View style={styles.editor}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Edit defaults</Text>
          <View style={styles.row}>
            <View style={styles.field}>
              <TimeField label="Window start" value={windowStart} onChange={setWindowStart} />
            </View>
            <View style={styles.field}>
              <TimeField label="Window end" value={windowEnd} onChange={setWindowEnd} />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.field}>
              <Field
                label="Interval minutes"
                value={interval}
                onChangeText={setInterval}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.field}>
              <Field label="Sip ml" value={sipMl} onChangeText={setSipMl} keyboardType="number-pad" />
            </View>
          </View>
          <ToggleRow
            label="Nudges"
            helper="Extra reminders after 5 and 10 minutes."
            value={settings.escalationEnabled}
            onValueChange={(value) => {
              void updateSettings({ escalationEnabled: value });
            }}
          />
        </View>

        <View style={styles.actions}>
          <PrimaryButton label="Continue" onPress={handleContinue} />
          <PrimaryButton label="Skip (use defaults)" variant="secondary" onPress={handleSkip} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 18,
    paddingBottom: 24,
  },
  header: {
    gap: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
  },
  cards: {
    gap: 10,
  },
  cardTitle: {
    fontSize: 15,
  },
  preview: {
    alignItems: "center",
  },
  previewText: {
    fontSize: 15,
    fontWeight: "500",
  },
  editor: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  field: {
    flex: 1,
  },
  actions: {
    gap: 12,
    paddingTop: 6,
  },
});
