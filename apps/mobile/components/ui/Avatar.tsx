/**
 * Avatar — Circle with initials, colored by name hash or explicit color.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors, Type, getInitials } from "@/lib/theme";

type AvatarSize = "sm" | "md" | "lg";

const SIZES: Record<AvatarSize, number> = {
  sm: 32,
  md: 40,
  lg: 56,
};

const FONT_STYLES: Record<AvatarSize, { fontSize: number; fontWeight: "600" | "700" }> = {
  sm: { fontSize: 12, fontWeight: "600" },
  md: { fontSize: 14, fontWeight: "700" },
  lg: { fontSize: 20, fontWeight: "700" },
};

const PALETTE = [
  "#6366F1",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#06B6D4",
  "#3B82F6",
  "#C8A24E",
];

function nameToColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

interface AvatarProps {
  name: string;
  size?: AvatarSize;
  color?: string;
}

export function Avatar({ name, size = "md", color }: AvatarProps) {
  const c = useColors();
  const dim = SIZES[size];
  const bg = color ?? nameToColor(name);
  const initials = getInitials(name);

  return (
    <View
      style={[
        styles.circle,
        {
          width: dim,
          height: dim,
          borderRadius: dim / 2,
          backgroundColor: bg + "20",
        },
      ]}
    >
      <Text style={[FONT_STYLES[size], { color: bg }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: "center",
    justifyContent: "center",
  },
});

export default Avatar;
