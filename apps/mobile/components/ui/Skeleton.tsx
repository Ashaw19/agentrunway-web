/**
 * Skeleton — Shimmer loading placeholder with sweeping highlight animation.
 * Uses React Native's built-in Animated API for broad compatibility (including Expo Go).
 */

import React, { useEffect, useRef } from "react";
import { Animated, type ViewStyle } from "react-native";
import { useColors, Radius } from "@/lib/theme";

interface SkeletonProps {
  width: number | `${number}%`;
  height: number | `${number}%`;
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
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: c.textFaint,
          overflow: "hidden",
          opacity,
        },
        style,
      ]}
    />
  );
}

export default Skeleton;
