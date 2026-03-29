/**
 * Skeleton — Shimmer loading placeholder with sweeping highlight animation.
 * Uses Reanimated for smooth 60fps shimmer on the native UI thread.
 */

import React from "react";
import { type ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
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
  const progress = useSharedValue(0);

  React.useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [progress]);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [0.3, 0.7, 0.3]),
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
