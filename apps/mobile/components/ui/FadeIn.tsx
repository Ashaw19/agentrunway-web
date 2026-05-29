/**
 * FadeIn — Staggered entrance animation for content sections.
 * Children slide up and fade in with configurable delay for staggering.
 *
 * Honors `useReducedMotion()` — when reduced motion is enabled the children
 * render in their final state instantly (no fade, no slide). This is the
 * orchestration backbone for the Dashboard's staggered page-load reveal, so
 * the reduced-motion short-circuit here covers every wrapped section.
 */

import React, { useEffect } from "react";
import { type ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
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
  const reduceMotion = useReducedMotion();
  // Seed shared values at final state when reduced motion is on so the first
  // frame is already correct (no flash of hidden content).
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const translateY = useSharedValue(reduceMotion ? 0 : slideDistance);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration, easing: Easing.out(Easing.cubic) })
    );
    translateY.value = withDelay(
      delay,
      withSpring(0, { damping: 20, stiffness: 200, mass: 0.8 })
    );
  }, [delay, duration, opacity, translateY, reduceMotion]);

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
