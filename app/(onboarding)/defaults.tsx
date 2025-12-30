import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../../src/shared/components/Screen";
import { AnimatedCard } from "../../src/shared/components/AnimatedCard";
import { Field } from "../../src/shared/components/Field";
import { TimeField } from "../../src/shared/components/TimeField";
import { ToggleRow } from "../../src/shared/components/ToggleRow";
import { PrimaryButton } from "../../src/features/hydration/ui/components/PrimaryButton";
import { useTheme } from "../../src/shared/theme/ThemeProvider";
import {
  DEFAULT_SETTINGS,
  MAX_NOTIFICATIONS_PER_DAY,
  MIN_INTERVAL_MINUTES,
  NUDGE_MINUTES,
  REMINDER_TARGET_ML,
} from "../../src/core/constants";
import { parseTimeToMinutes } from "../../src/core/time";
import { useHydration } from "../../src/features/hydration/state/hydrationStore";
import { HydrationSettings } from "../../src/features/hydration/domain/types";
import {
  computeAutoPlan,
  computeSipsPerReminder,
  getWindowMinutes,
  litersToMl,
} from "../../src/features/hydration/domain/calculations";

export default function DefaultsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { settings, updateSettings, completeOnboarding } = useHydration();
  const [windowStart, setWindowStart] = useState(settings.windowStart);
  const [windowEnd, setWindowEnd] = useState(settings.windowEnd);
  const [sipMl, setSipMl] = useState(String(settings.sipMl));

  const previewSettings = React.useMemo(() => {
    const startMinutes = parseTimeToMinutes(windowStart);
    const endMinutes = parseTimeToMinutes(windowEnd);
    const hasValidWindow =
      startMinutes !== null &&
      endMinutes !== null &&
      getWindowMinutes({ ...settings, windowStart, windowEnd }) > 0;
    const sipValue = Number.parseInt(sipMl, 10);

    return {
      ...settings,
      windowStart: hasValidWindow ? windowStart : settings.windowStart,
      windowEnd: hasValidWindow ? windowEnd : settings.windowEnd,
      sipMl: Number.isFinite(sipValue) && sipValue > 0 ? sipValue : settings.sipMl,
    };
  }, [settings, sipMl, windowEnd, windowStart]);

  const previewPlan = React.useMemo(() => {
    const windowMinutes = getWindowMinutes(previewSettings);
    const targetMl = litersToMl(previewSettings.targetLiters);
    const factor = previewSettings.escalationEnabled ? 1 + NUDGE_MINUTES.length : 1;
    const maxBase = Math.max(1, Math.floor(MAX_NOTIFICATIONS_PER_DAY / factor));
    return computeAutoPlan({
      remainingMl: targetMl,
      windowMinutes,
      minIntervalMinutes: MIN_INTERVAL_MINUTES,
      maxReminders: maxBase,
      desiredReminderMl: REMINDER_TARGET_ML,
    });
  }, [previewSettings]);

  const previewMl = previewPlan?.mlPerReminder ?? REMINDER_TARGET_ML;
  const previewSips = computeSipsPerReminder(previewMl, previewSettings.sipMl);
  const previewInterval = previewPlan?.intervalMinutes ?? MIN_INTERVAL_MINUTES;

  const applyEdits = async () => {
    const patch: Partial<HydrationSettings> = {};
    const startMinutes = parseTimeToMinutes(windowStart);
    const endMinutes = parseTimeToMinutes(windowEnd);
    if (
      startMinutes !== null &&
      endMinutes !== null &&
      getWindowMinutes({ ...settings, windowStart, windowEnd }) > 0
    ) {
      patch.windowStart = windowStart;
      patch.windowEnd = windowEnd;
    } else {
      setWindowStart(settings.windowStart);
      setWindowEnd(settings.windowEnd);
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
          <AnimatedCard delay={80}>
            <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]}>
              Active hours: {previewSettings.windowStart}-{previewSettings.windowEnd}
            </Text>
          </AnimatedCard>
          <AnimatedCard delay={140}>
            <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]}>
              Reminder spacing: auto (~{previewInterval} min)
            </Text>
          </AnimatedCard>
          <AnimatedCard delay={200}>
            <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]}>
              Sip size: {previewSettings.sipMl} ml
            </Text>
          </AnimatedCard>
          <AnimatedCard delay={260}>
            <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]}>
              Nudges: {previewSettings.escalationEnabled ? "on" : "off"}
            </Text>
          </AnimatedCard>
        </View>

        <AnimatedCard style={styles.preview} delay={320}>
          <Text style={[styles.previewText, { color: theme.colors.textPrimary }]}>
            One reminder ~= {previewMl} ml ({previewSips} sips)
          </Text>
        </AnimatedCard>

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
          <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
            End time can be after midnight (example: 01:00).
          </Text>
          <View style={styles.row}>
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
  helper: {
    fontSize: 13,
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
