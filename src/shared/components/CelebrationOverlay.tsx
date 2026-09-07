import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  withSpring, 
  withDelay, 
  runOnJS, 
  withSequence 
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeProvider';

interface CelebrationOverlayProps {
  streak: number;
  onComplete: () => void;
}

export function CelebrationOverlay({ streak, onComplete }: CelebrationOverlayProps) {
  const theme = useTheme();
  const scale = useSharedValue(0);

  useEffect(() => {
    // Play a burst of haptics for the milestone
    let burstCount = 0;
    const interval = setInterval(() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      burstCount++;
      if (burstCount >= 5) clearInterval(interval);
    }, 120);

    scale.value = withSequence(
      withSpring(1, { damping: 12, stiffness: 100 }),
      withDelay(2500, withTiming(0, { duration: 300 }, (finished) => {
        if (finished) {
          runOnJS(onComplete)();
        }
      }))
    );

    return () => clearInterval(interval);
  }, [onComplete, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={[StyleSheet.absoluteFill, styles.backdrop]} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.card, { backgroundColor: theme.colors.surface, shadowColor: theme.colors.border }, animatedStyle]}>
        <Text style={styles.emoji}>🏆</Text>
        <Text style={[styles.title, { color: theme.colors.textPrimary, ...theme.typography.titleLarge }]}>
          {streak}-Day Streak!
        </Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary, ...theme.typography.body }]}>
          Incredible milestone. Keep it up!
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    zIndex: 100,
    elevation: 100,
  },
  card: {
    padding: 32,
    borderRadius: 24,
    alignItems: 'center',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  emoji: {
    fontSize: 72,
    marginBottom: 16,
  },
  title: {
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
  }
});
