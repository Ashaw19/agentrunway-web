/**
 * Badge — Small status pill with color-tinted background.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors, Space, Radius, Type } from "@/lib/theme";

type BadgeSize = "sm" | "md";

interface BadgeProps {
  label: string;
  color?: string;
  size?: BadgeSize;
}

export function Badge({ label, color, size = "md" }: BadgeProps) {
  const c = useColors();
  const tint = color ?? c.primary;

  const isSm = size === "sm";
  const textStyle = isSm ? Type.micro : Type.caption;
  const paddingH = isSm ? Space.sm : Space.md;
  const paddingV = isSm ? 2 : Space.xs;

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: tint + "18",
          paddingHorizontal: paddingH,
          paddingVertical: paddingV,
          borderRadius: Radius.pill,
        },
      ]}
    >
      <Text style={[textStyle, { color: tint }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
  },
});

export default Badge;
