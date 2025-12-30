import React, { useEffect, useMemo, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { minutesToTimeString, parseTimeToMinutes } from "../../core/time";
import { useTheme } from "../theme/ThemeProvider";

type TimeFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

const toPickerDate = (value: string) => {
  const minutes = parseTimeToMinutes(value);
  const base = new Date();
  if (minutes === null) {
    return base;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  base.setHours(hours, mins, 0, 0);
  return base;
};

const pad2 = (value: number) => String(value).padStart(2, "0");

export const TimeField = ({ label, value, onChange }: TimeFieldProps) => {
  const theme = useTheme();
  const [show, setShow] = useState(false);
  const initialMinutes = useMemo(() => parseTimeToMinutes(value) ?? 0, [value]);
  const [draftMinutes, setDraftMinutes] = useState(initialMinutes);

  const pickerDate = useMemo(() => toPickerDate(value), [value]);
  const selectedHour = Math.floor(draftMinutes / 60);
  const selectedMinute = draftMinutes % 60;

  useEffect(() => {
    if (show) {
      setDraftMinutes(initialMinutes);
    }
  }, [show, initialMinutes]);

  const handleChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (selected) {
      const nextValue = minutesToTimeString(selected.getHours() * 60 + selected.getMinutes());
      onChange(nextValue);
    }
    if (Platform.OS === "android") {
      setShow(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.colors.textSecondary }]}>{label}</Text>
      <Pressable
        onPress={() => setShow(true)}
        style={[
          styles.input,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.md,
          },
        ]}
      >
        <Text style={[styles.value, { color: theme.colors.textPrimary }]}>{value}</Text>
      </Pressable>
      {Platform.OS === "ios" ? (
        <Modal visible={show} transparent animationType="fade">
          <View style={styles.overlay}>
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>{label}</Text>
                <Pressable onPress={() => setShow(false)}>
                  <Text style={[styles.done, { color: theme.colors.textSecondary }]}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker value={pickerDate} mode="time" display="spinner" onChange={handleChange} />
            </View>
          </View>
        </Modal>
      ) : null}
      {Platform.OS === "android" ? (
        <Modal visible={show} transparent animationType="fade">
          <View style={styles.overlay}>
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <View style={styles.modalHeader}>
                <Pressable onPress={() => setShow(false)}>
                  <Text style={[styles.actionText, { color: theme.colors.textSecondary }]}>Cancel</Text>
                </Pressable>
                <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>{label}</Text>
                <Pressable
                  onPress={() => {
                    onChange(minutesToTimeString(draftMinutes));
                    setShow(false);
                  }}
                >
                  <Text style={[styles.actionText, { color: theme.colors.textSecondary }]}>Done</Text>
                </Pressable>
              </View>
              <View style={styles.pickerRow}>
                <View style={styles.pickerColumn}>
                  <Text style={[styles.columnLabel, { color: theme.colors.textSecondary }]}>Hours</Text>
                  <ScrollView style={[styles.list, { borderColor: theme.colors.border }]}>
                    {Array.from({ length: 24 }, (_item, hour) => {
                      const isSelected = hour === selectedHour;
                      return (
                        <Pressable
                          key={`hour-${hour}`}
                          onPress={() => setDraftMinutes(hour * 60 + selectedMinute)}
                          style={[
                            styles.listItem,
                            isSelected && {
                              backgroundColor: theme.colors.background,
                              borderColor: theme.colors.border,
                            },
                          ]}
                        >
                          <Text style={[styles.listText, { color: theme.colors.textPrimary }]}>
                            {pad2(hour)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
                <View style={styles.pickerColumn}>
                  <Text style={[styles.columnLabel, { color: theme.colors.textSecondary }]}>Minutes</Text>
                  <ScrollView style={[styles.list, { borderColor: theme.colors.border }]}>
                    {Array.from({ length: 60 }, (_item, minute) => {
                      const isSelected = minute === selectedMinute;
                      return (
                        <Pressable
                          key={`minute-${minute}`}
                          onPress={() => setDraftMinutes(selectedHour * 60 + minute)}
                          style={[
                            styles.listItem,
                            isSelected && {
                              backgroundColor: theme.colors.background,
                              borderColor: theme.colors.border,
                            },
                          ]}
                        >
                          <Text style={[styles.listText, { color: theme.colors.textPrimary }]}>
                            {pad2(minute)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
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
  },
  value: {
    fontSize: 16,
  },
  done: {
    fontSize: 13,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalCard: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
    textAlign: "center",
  },
  actionText: {
    fontSize: 13,
    minWidth: 60,
    textAlign: "center",
  },
  pickerRow: {
    flexDirection: "row",
    gap: 12,
  },
  pickerColumn: {
    flex: 1,
    gap: 8,
  },
  columnLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  list: {
    borderWidth: 1,
    borderRadius: 14,
    maxHeight: 240,
    paddingVertical: 6,
  },
  listItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginHorizontal: 6,
  },
  listText: {
    fontSize: 16,
  },
});
