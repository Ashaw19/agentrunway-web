/**
 * FadeIn — Staggered entrance animation for content sections.
 * Children slide up and fade in with configurable delay for staggering.
 */

import React, { useEffect } from "react";
import { type ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
  Easing,
} from "react-native-reanimated";

interface FadeInProps {
  /** Delay in ms before animation starts — use for stagger effect */
  delay?: number;
  /** How far to slide up from (in px) — default 16 */
  slideDistance?: number;
  /** Duration of opacity fade — default 400ms */
  duration?: number;
  style?: ViewStyle;
  children: React.ReactNode;
}

export function FadeIn({
  delay = 0,
  slideDistance = 16,
  duration = 400,
  style,
  children,
}: FadeInProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(slideDistance);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration, easing: Easing.out(Easing.cubic) })
    );
    translateY.value = withDelay(
      delay,
      withSpring(0, { damping: 20, stiffness: 200, mass: 0.8 })
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[style, animatedStyle]}>
      {children}
    </Animated.View>
  );
}

export default FadeIn;
