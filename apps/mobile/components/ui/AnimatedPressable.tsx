/**
 * AnimatedPressable — Pressable with spring-based scale animation.
 * Replaces static opacity-on-press with physics-based spring bounce.
 * Uses Reanimated 3 worklets on the native UI thread for 60fps.
 */

import React from "react";
import { type ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";

interface AnimatedPressableProps {
  onPress?: () => void;
  disabled?: boolean;
  /** Scale when pressed — default 0.97 */
  pressScale?: number;
  /** Enable haptic feedback on press — default false */
  haptic?: boolean;
  style?: ViewStyle | ViewStyle[];
  children: React.ReactNode;
}

const SPRING_CONFIG = {
  damping: 15,
  stiffness: 400,
  mass: 0.8,
};

export function AnimatedPressable({
  onPress,
  disabled,
  pressScale = 0.97,
  haptic = false,
  style,
  children,
}: AnimatedPressableProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const tap = Gesture.Tap()
    .enabled(!disabled)
    .onBegin(() => {
      scale.value = withSpring(pressScale, SPRING_CONFIG);
      opacity.value = withSpring(0.85, { damping: 20, stiffness: 300 });
    })
    .onFinalize(() => {
      scale.value = withSpring(1, SPRING_CONFIG);
      opacity.value = withSpring(1, { damping: 20, stiffness: 300 });
    })
    .onEnd(() => {
      if (haptic) {
        try {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch {}
      }
      if (onPress) onPress();
    });

  return (
    <GestureDetector gesture={tap}>
      <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
    </GestureDetector>
  );
}

export default AnimatedPressable;
