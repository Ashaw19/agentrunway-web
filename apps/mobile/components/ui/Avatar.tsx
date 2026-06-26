/**
 * Avatar — Circle with profile photo or initials fallback.
 * Supports image URLs from avatar_url field.
 */

import React, { useState } from "react";
import { StyleSheet, Text, View, Image } from "react-native";
import { useColors, getInitials } from "@/lib/theme";

type AvatarSize = "sm" | "md" | "lg" | "xl";

const SIZES: Record<AvatarSize, number> = {
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80,
};

const FONT_STYLES: Record<AvatarSize, { fontSize: number; fontWeight: "600" | "700" | "800" }> = {
  sm: { fontSize: 12, fontWeight: "600" },
  md: { fontSize: 14, fontWeight: "700" },
  lg: { fontSize: 20, fontWeight: "700" },
  xl: { fontSize: 28, fontWeight: "800" },
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
  /** URL to profile photo — renders image instead of initials */
  imageUrl?: string | null;
}

export function Avatar({ name, size = "md", color, imageUrl }: AvatarProps) {
  const c = useColors();
  const dim = SIZES[size];
  const bg = color ?? nameToColor(name);
  const initials = getInitials(name);
  const [imgError, setImgError] = useState(false);

  const hasImage = imageUrl && !imgError;

  return (
    <View
      style={[
        styles.circle,
        {
          width: dim,
          height: dim,
          borderRadius: dim / 2,
          backgroundColor: hasImage ? "transparent" : bg + "38",
          overflow: "hidden",
        },
      ]}
    >
      {hasImage ? (
        <Image
          source={{ uri: imageUrl }}
          style={{
            width: dim,
            height: dim,
            borderRadius: dim / 2,
          }}
          onError={() => setImgError(true)}
        />
      ) : (
        <Text style={[FONT_STYLES[size], { color: bg }]}>{initials}</Text>
      )}
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
