import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleProp, ViewStyle } from "react-native";
import { Card } from "./Card";

type AnimatedCardProps = {
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
};

export const AnimatedCard = ({ children, delay = 0, style }: AnimatedCardProps) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        delay,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, fadeAnim, slideAnim]);

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [{ translateY: slideAnim }],
      }}
    >
      <Card style={style}>{children}</Card>
    </Animated.View>
  );
};
