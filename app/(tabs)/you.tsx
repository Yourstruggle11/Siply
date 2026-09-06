import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View, Pressable, Text } from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Screen } from "../../src/shared/components/Screen";
import { AnimatedCard } from "../../src/shared/components/AnimatedCard";
import { PulsingTitle } from "../../src/shared/components/PulsingTitle";
import { Field } from "../../src/shared/components/Field";
import { ToggleRow } from "../../src/shared/components/ToggleRow";
import { Button } from "../../src/shared/components/Button";
import { TimeField } from "../../src/shared/components/TimeField";
import { useTheme } from "../../src/shared/theme/ThemeProvider";
import { useHydrationStore } from "../../src/features/hydration/state/hydrationStore";
import { QUICK_LOG_MAX_PRESETS, QUICK_LOG_MIN_PRESETS } from "../../src/core/constants";
import { formatLiquid, convertFromUnit } from "../../src/core/units";
import { DrinkPreset } from "../../src/features/hydration/domain/types";

const PREDEFINED_DRINKS = [
  { id: "water", name: "Water", icon: "cup-water" },
  { id: "coffee", name: "Coffee", icon: "coffee" },
  { id: "tea", name: "Tea", icon: "tea" },
  { id: "juice", name: "Juice", icon: "glass-tulip" },
  { id: "other", name: "Other", icon: "cup" },
];

export default function YouScreen() {
  const theme = useTheme();
  const router = useRouter();

  const settings = useHydrationStore((s) => s.settings);
  const quickLog = useHydrationStore((s) => s.quickLog);
  const updateSettings = useHydrationStore((s) => s.updateSettings);
  const updateQuickLogPresets = useHydrationStore((s) => s.updateQuickLogPresets);

  // Draft state for settings
  const [draft, setDraft] = useState({
    target: settings.targetLiters.toString(),
    windowStart: settings.windowStart,
    windowEnd: settings.windowEnd,
    displayUnit: settings.displayUnit,
    gentleGoalEnabled: settings.gentleGoalEnabled,
    gentleGoalThreshold: settings.gentleGoalThreshold.toString(),
  });

  // Goal Calculator State
  const [calcWeight, setCalcWeight] = useState("");
  const [calcActivity, setCalcActivity] = useState<"low" | "medium" | "high">("medium");
  const [calcClimateHot, setCalcClimateHot] = useState(false);

  // Preset State
  const [presetType, setPresetType] = useState<string>("water");
  const [customPresetName, setCustomPresetName] = useState("");
  const [presetAmount, setPresetAmount] = useState("");

  // Sync draft when settings change
  useEffect(() => {
    setDraft({
      target: settings.targetLiters.toString(),
      windowStart: settings.windowStart,
      windowEnd: settings.windowEnd,
      displayUnit: settings.displayUnit,
      gentleGoalEnabled: settings.gentleGoalEnabled,
      gentleGoalThreshold: settings.gentleGoalThreshold.toString(),
    });
  }, [settings]);

  const isDirty = useMemo(() => {
    return (
      draft.target !== settings.targetLiters.toString() ||
      draft.windowStart !== settings.windowStart ||
      draft.windowEnd !== settings.windowEnd ||
      draft.displayUnit !== settings.displayUnit ||
      draft.gentleGoalEnabled !== settings.gentleGoalEnabled ||
      draft.gentleGoalThreshold !== settings.gentleGoalThreshold.toString()
    );
  }, [draft, settings]);

  const handleSave = async () => {
    const parsedTarget = Number.parseFloat(draft.target);
    const parsedGentle = Number.parseInt(draft.gentleGoalThreshold, 10);
    
    await updateSettings({
      targetLiters: Number.isFinite(parsedTarget) && parsedTarget > 0 ? parsedTarget : settings.targetLiters,
      windowStart: draft.windowStart,
      windowEnd: draft.windowEnd,
      displayUnit: draft.displayUnit,
      gentleGoalEnabled: draft.gentleGoalEnabled,
      gentleGoalThreshold: Number.isFinite(parsedGentle) && parsedGentle >= 50 && parsedGentle <= 100 
        ? parsedGentle 
        : settings.gentleGoalThreshold,
    });
  };

  const handleAddPreset = () => {
    if (quickLog.presets.length >= QUICK_LOG_MAX_PRESETS) return;
    const amountVal = Number.parseFloat(presetAmount);
    if (!Number.isFinite(amountVal) || amountVal <= 0) return;

    // Convert back to ml for storage
    const amountMl = Math.round(convertFromUnit(amountVal, settings.displayUnit));

    const selectedDrink = PREDEFINED_DRINKS.find(d => d.id === presetType) || PREDEFINED_DRINKS[0];
    const finalName = presetType === "other" && customPresetName.trim() !== "" ? customPresetName.trim() : selectedDrink.name;

    const newPreset: DrinkPreset = {
      id: `preset-${Date.now()}`,
      name: finalName,
      icon: selectedDrink.icon,
      amountMl,
    };

    const next = [...quickLog.presets, newPreset];
    void updateQuickLogPresets(next);
    setPresetAmount("");
    setCustomPresetName("");
  };

  const movePreset = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= quickLog.presets.length) return;
    const next = [...quickLog.presets];
    const [moved] = next.splice(index, 1);
    next.splice(nextIndex, 0, moved);
    void updateQuickLogPresets(next);
  };

  const removePreset = (index: number) => {
    if (quickLog.presets.length <= QUICK_LOG_MIN_PRESETS) return;
    const next = quickLog.presets.filter((_item, idx) => idx !== index);
    void updateQuickLogPresets(next);
  };

  const suggestedMl = useMemo(() => {
    const weight = Number.parseFloat(calcWeight);
    if (!Number.isFinite(weight) || weight <= 0) return null;
    const basePerKg = calcActivity === "high" ? 40 : calcActivity === "medium" ? 35 : 30;
    const climateFactor = calcClimateHot ? 1.1 : 1.0;
    return Math.round(weight * basePerKg * climateFactor);
  }, [calcActivity, calcClimateHot, calcWeight]);

  const applySuggestedGoal = () => {
    if (!suggestedMl) return;
    const liters = (suggestedMl / 1000).toFixed(1);
    setDraft((prev) => ({ ...prev, target: liters }));
  };

  return (
    <Screen scroll>
      <View style={styles.container}>
        <View style={styles.header}>
          <PulsingTitle text="You" style={styles.title} />
          <Pressable 
            onPress={() => router.push("/settings")}
            style={({ pressed }) => [
              styles.gearButton,
              { opacity: pressed ? 0.6 : 1 }
            ]}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <MaterialIcons name="settings" size={28} color={theme.colors.textPrimary} />
          </Pressable>
        </View>

        {isDirty ? (
          <AnimatedCard style={styles.saveBar} delay={60}>
            <Text style={[styles.saveText, { color: theme.colors.textPrimary }]}>Unsaved changes</Text>
            <Button label="Save changes" onPress={handleSave} />
          </AnimatedCard>
        ) : null}

        <AnimatedCard style={styles.section} delay={100}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Daily target & Units</Text>
          <Field
            label="Target liters"
            value={draft.target}
            onChangeText={(value) => setDraft((prev) => ({ ...prev, target: value }))}
            keyboardType="decimal-pad"
          />
          <Text style={[styles.helper, { color: theme.colors.textSecondary, marginTop: 12 }]}>Display Unit</Text>
          <View style={styles.optionRow}>
            {(["ml", "fl oz", "cups"] as const).map((unit) => (
              <Pressable
                key={`unit-${unit}`}
                onPress={() => setDraft(prev => ({ ...prev, displayUnit: unit }))}
                style={[
                  styles.optionButton,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: draft.displayUnit === unit ? theme.colors.accent : theme.colors.surface,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    { color: draft.displayUnit === unit ? theme.colors.surface : theme.colors.textPrimary },
                  ]}
                >
                  {unit}
                </Text>
              </Pressable>
            ))}
          </View>
        </AnimatedCard>

        <AnimatedCard style={styles.section} delay={140}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Goal calculator</Text>
          <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
            General estimate only. Not medical advice.
          </Text>
          <Field
            label="Weight (kg)"
            value={calcWeight}
            onChangeText={setCalcWeight}
            keyboardType="decimal-pad"
            placeholder="70"
          />
          <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>Activity level</Text>
          <View style={styles.optionRow}>
            {(["low", "medium", "high"] as const).map((level) => (
              <Pressable
                key={`activity-${level}`}
                onPress={() => setCalcActivity(level)}
                style={[
                  styles.optionButton,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: calcActivity === level ? theme.colors.accent : theme.colors.surface,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    { color: calcActivity === level ? theme.colors.surface : theme.colors.textPrimary },
                  ]}
                >
                  {level}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>Climate</Text>
          <Pressable
            onPress={() => setCalcClimateHot((value) => !value)}
            style={[
              styles.optionButton,
              {
                borderColor: theme.colors.border,
                backgroundColor: calcClimateHot ? theme.colors.accent : theme.colors.surface,
              },
            ]}
          >
            <Text
              style={[
                styles.optionText,
                { color: calcClimateHot ? theme.colors.surface : theme.colors.textPrimary },
              ]}
            >
              Hot climate
            </Text>
          </Pressable>
          {suggestedMl ? (
            <View style={styles.resultContainer}>
              <Text style={[styles.resultText, { color: theme.colors.textPrimary }]}>
                Suggested: {(suggestedMl / 1000).toFixed(1)} L / day
              </Text>
              <Button label="Apply suggestion" onPress={applySuggestedGoal} />
            </View>
          ) : null}
        </AnimatedCard>

        <AnimatedCard style={styles.section} delay={180}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Active window</Text>
          <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
            When do you drink water? (e.g. 09:00 to 21:00)
          </Text>
          <View style={styles.row}>
            <View style={styles.field}>
              <TimeField
                label="Start"
                value={draft.windowStart}
                onChange={(value) => setDraft((prev) => ({ ...prev, windowStart: value }))}
              />
            </View>
            <View style={styles.field}>
              <TimeField
                label="End"
                value={draft.windowEnd}
                onChange={(value) => setDraft((prev) => ({ ...prev, windowEnd: value }))}
              />
            </View>
          </View>
        </AnimatedCard>

        <AnimatedCard style={styles.section} delay={220}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Gentle goals</Text>
          <ToggleRow
            label="Enable gentle goal"
            helper="Counts a good day when you reach the threshold."
            value={draft.gentleGoalEnabled}
            onValueChange={(value) => setDraft((prev) => ({ ...prev, gentleGoalEnabled: value }))}
          />
          <Field
            label="Threshold percent (50-100)"
            value={draft.gentleGoalThreshold}
            onChangeText={(value) => setDraft((prev) => ({ ...prev, gentleGoalThreshold: value }))}
            keyboardType="number-pad"
          />
        </AnimatedCard>

        <AnimatedCard style={styles.section} delay={260}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Quick log presets</Text>
          <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
            Add, remove, or reorder your drink presets.
          </Text>
          <View style={styles.presetList}>
            {quickLog.presets.map((preset, index) => {
              const amount = typeof preset === "number" ? preset : preset.amountMl;
              const name = typeof preset === "object" ? preset.name : `${amount}`;
              const icon = typeof preset === "object" ? preset.icon : "cup-water";
              const id = typeof preset === "object" && preset.id ? preset.id : `preset-${index}-${amount}`;
              return (
              <View
                key={`preset-row-${id}-${index}`}
                style={[styles.presetRow, { borderColor: theme.colors.border }]}
              >
                <View style={styles.presetLabelRow}>
                  <MaterialCommunityIcons name={icon as any} size={20} color={theme.colors.textPrimary} style={{ marginRight: 8 }} />
                  <Text style={[styles.presetLabel, { color: theme.colors.textPrimary }]} numberOfLines={1} ellipsizeMode="tail">{name}</Text>
                  <Text style={[{ color: theme.colors.textSecondary, marginLeft: 8, ...theme.typography.caption }]}>
                    {formatLiquid(amount, settings.displayUnit)}
                  </Text>
                </View>
                <View style={styles.presetActions}>
                  <Pressable
                    onPress={() => movePreset(index, -1)}
                    style={({ pressed }) => [
                      styles.iconButton,
                      { borderColor: theme.colors.border, opacity: pressed ? 0.6 : 1 },
                    ]}
                  >
                    <Text style={[styles.iconText, { color: theme.colors.textSecondary }]}>Up</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => movePreset(index, 1)}
                    style={({ pressed }) => [
                      styles.iconButton,
                      { borderColor: theme.colors.border, opacity: pressed ? 0.6 : 1 },
                    ]}
                  >
                    <Text style={[styles.iconText, { color: theme.colors.textSecondary }]}>Down</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => removePreset(index)}
                    disabled={quickLog.presets.length <= QUICK_LOG_MIN_PRESETS}
                    style={({ pressed }) => [
                      styles.iconButton,
                      {
                        borderColor: theme.colors.border,
                        opacity: quickLog.presets.length <= QUICK_LOG_MIN_PRESETS ? 0.4 : pressed ? 0.6 : 1,
                      },
                    ]}
                  >
                    <Text style={[styles.iconText, { color: theme.colors.textSecondary }]}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            )})}
          </View>
          
          <View style={[styles.presetAddContainer, { borderColor: theme.colors.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary, marginBottom: 8 }]}>Add New Preset</Text>
            
            <View style={[styles.optionRow, { flexWrap: 'wrap', marginBottom: 12 }]}>
              {PREDEFINED_DRINKS.map((drink) => (
                <Pressable
                  key={`drink-${drink.id}`}
                  onPress={() => setPresetType(drink.id)}
                  style={[
                    styles.drinkOptionButton,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: presetType === drink.id ? theme.colors.accent : theme.colors.surface,
                    },
                  ]}
                >
                  <MaterialCommunityIcons 
                    name={drink.icon as any} 
                    size={18} 
                    color={presetType === drink.id ? theme.colors.surface : theme.colors.textPrimary} 
                    style={{ marginBottom: 4 }}
                  />
                  <Text
                    style={[
                      styles.optionText,
                      { color: presetType === drink.id ? theme.colors.surface : theme.colors.textPrimary, fontSize: 12 },
                    ]}
                  >
                    {drink.name}
                  </Text>
                </Pressable>
              ))}
            </View>

            {presetType === "other" && (
              <View style={{ marginBottom: 12 }}>
                <Field
                  label="Custom drink name"
                  value={customPresetName}
                  onChangeText={setCustomPresetName}
                  placeholder="e.g. Protein Shake"
                />
              </View>
            )}

            <View style={styles.presetAddRow}>
              <View style={styles.presetAddField}>
                <Field
                  label={`Amount (${settings.displayUnit})`}
                  value={presetAmount}
                  onChangeText={setPresetAmount}
                  keyboardType="decimal-pad"
                  placeholder="250"
                />
              </View>
              <Button
                label="Add"
                onPress={handleAddPreset}
                disabled={quickLog.presets.length >= QUICK_LOG_MAX_PRESETS}
              />
            </View>
          </View>
          <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
            {quickLog.presets.length}/{QUICK_LOG_MAX_PRESETS} presets
          </Text>
        </AnimatedCard>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
    paddingBottom: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
  },
  gearButton: {
    padding: 8,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 12,
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
  saveBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  saveText: {
    fontSize: 15,
    fontWeight: "600",
  },
  optionRow: {
    flexDirection: "row",
    gap: 8,
  },
  optionButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
  },
  drinkOptionButton: {
    width: '30%',
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 8,
  },
  optionText: {
    fontSize: 14,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  resultContainer: {
    marginTop: 8,
    gap: 12,
  },
  resultText: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  presetList: {
    gap: 8,
  },
  presetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  presetLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  presetLabel: {
    fontSize: 16,
    fontWeight: "500",
    flexShrink: 1,
  },
  presetActions: {
    flexDirection: "row",
    gap: 8,
  },
  iconButton: {
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  iconText: {
    fontSize: 12,
  },
  presetAddContainer: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  presetAddRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
  },
  presetAddField: {
    flex: 1,
  },
});
