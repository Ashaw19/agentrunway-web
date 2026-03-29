/**
 * Skeleton — Shimmer loading placeholder with sweeping highlight animation.
 * Uses Reanimated for smooth 60fps shimmer on the native UI thread.
 */

import React from "react";
import { View, type ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useColors, Radius } from "@/lib/theme";

interface SkeletonProps {
  width: number | string;
  height: number | string;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({
  width,
  height,
  borderRadius = Radius.sm,
  style,
}: SkeletonProps) {
  const c = useColors();
  const translateX = useSharedValue(-1);

  React.useEffect(() => {
    translateX.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      false
    );
  }, []);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: 0.3 + (1 + Math.sin(translateX.value * Math.PI)) * 0.2,
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: c.textFaint,
          overflow: "hidden",
        },
        shimmerStyle,
        style,
      ]}
    />
  );
}

export default Skeleton;
