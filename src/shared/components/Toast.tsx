import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, Pressable } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

type ToastProps = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  visible: boolean;
  onHide: () => void;
  durationMs?: number;
};

export const Toast = ({ message, actionLabel, onAction, visible, onHide, durationMs = 3000 }: ToastProps) => {
  const theme = useTheme();
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(animatedValue, {
        toValue: 1,
        useNativeDriver: true,
        friction: 8,
        tension: 40,
      }).start();

      const timer = setTimeout(() => {
        onHide();
      }, durationMs);
      return () => clearTimeout(timer);
    } else {
      Animated.timing(animatedValue, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, animatedValue, durationMs, onHide]);

  if (!visible && animatedValue.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) === 0) {
    return null; // completely hidden
  }

  const translateY = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [50, 0],
  });

  return (
    <Animated.View style={[styles.container, { backgroundColor: theme.colors.surfaceElevated, transform: [{ translateY }], opacity: animatedValue }]}>
      <Text style={[styles.message, { color: theme.colors.textPrimary }]}>{message}</Text>
      {actionLabel && onAction && (
        <Pressable onPress={onAction} style={styles.actionButton} accessibilityRole="button" accessibilityLabel={actionLabel}>
          <Text style={[styles.actionText, { color: theme.colors.accent }]}>{actionLabel}</Text>
        </Pressable>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 24,
    left: 24,
    right: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 8,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  message: {
    fontSize: 14,
    flex: 1,
  },
  actionButton: {
    marginLeft: 16,
    padding: 8,
    minHeight: 48,
    justifyContent: "center",
  },
  actionText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
