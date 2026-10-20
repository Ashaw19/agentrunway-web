/**
 * The title row every list tab shares (Clients, Deals, Money): the same size,
 * the same place, buttons on the right. Before 2026-10-20 Clients used h1
 * and Deals hero.
 */
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Space, Type, useColors } from "@/lib/theme";

export function TabHeader({ title, right, children }: { title: string; right?: ReactNode; children?: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ paddingHorizontal: Space.xl, paddingTop: Space.xl, paddingBottom: Space.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 40, gap: Space.sm }}>
        <Text accessibilityRole="header" style={[Type.h1, { color: c.text, flexShrink: 1 }]} numberOfLines={1}>
          {title}
        </Text>
        {right ? <View style={{ flexDirection: "row", alignItems: "center", gap: Space.sm }}>{right}</View> : null}
      </View>
      {children}
    </View>
  );
}
