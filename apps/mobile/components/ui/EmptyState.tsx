/**
 * EmptyState — Centered placeholder with icon, text, and optional action.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors, Space, Type } from "@/lib/theme";
import { Button } from "./Button";

interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const c = useColors();

  return (
    <View style={styles.container}>
      <View style={[styles.iconWrap, { backgroundColor: c.primaryDim }]}>
        <Ionicons name={icon} size={32} color={c.primary} />
      </View>
      <Text style={[Type.h3, styles.title, { color: c.text }]}>{title}</Text>
      {subtitle && (
        <Text style={[Type.body, styles.subtitle, { color: c.textMuted }]}>
          {subtitle}
        </Text>
      )}
      {actionLabel && onAction && (
        <View style={styles.action}>
          <Button label={actionLabel} onPress={onAction} variant="primary" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Space.xxxl * 2,
    paddingHorizontal: Space.xl,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Space.lg,
  },
  title: {
    textAlign: "center",
    marginBottom: Space.sm,
  },
  subtitle: {
    textAlign: "center",
    maxWidth: 260,
  },
  action: {
    marginTop: Space.xl,
  },
});

export default EmptyState;
