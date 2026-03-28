/**
 * Skeleton — Shimmer loading placeholder with opacity pulse animation.
 * Uses simple Animated opacity for web-export compatibility.
 */

import React, { useEffect, useRef } from "react";
import { Animated, type ViewStyle } from "react-native";
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
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: c.textFaint,
          opacity,
        },
        style,
      ]}
    />
  );
}

export default Skeleton;
