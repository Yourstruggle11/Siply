import React, { useEffect } from "react";
import { Dimensions, Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  FadeIn,
  FadeOut,
  runOnJS,
  SlideInDown,
  SlideOutDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "../theme/ThemeProvider";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

type BottomSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  children: React.ReactNode;
};

export const BottomSheet = ({ visible, onDismiss, children }: BottomSheetProps) => {
  const theme = useTheme();
  const translateY = useSharedValue(0);

  // Reset transform when shown
  useEffect(() => {
    if (visible) {
      translateY.value = 0;
    }
  }, [visible, translateY]);

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      // Only allow dragging down
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY > 100 || event.velocityY > 1000) {
        // Dragged enough to dismiss
        translateY.value = withTiming(SCREEN_HEIGHT, { duration: 250 }, () => {
          runOnJS(onDismiss)();
        });
      } else {
        // Snap back
        translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.5)" }]}
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss sheet" />
      </Animated.View>

      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: theme.colors.surface },
            animatedStyle,
          ]}
          entering={SlideInDown.springify().damping(20).stiffness(200)}
          exiting={SlideOutDown.duration(200)}
        >
          <View style={styles.handleContainer}>
            <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
          </View>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 48,
    paddingTop: 12,
    maxHeight: SCREEN_HEIGHT * 0.8,
    elevation: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  handleContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
});
