/**
 * BriefingRow — A single actionable item in the Today's Focus list.
 * Severity-coded with icon, title, detail, and action label.
 */

import { View, Text, Pressable } from "react-native";
import {
  Clock,
  UserPlus,
  TrendingUp,
  Gift,
  CheckSquare,
  AlertCircle,
} from "lucide-react-native";
import { useColors, Space, Radius, Type } from "@/lib/theme";
import type { BriefingItem } from "@/stores/data-store";

const SEVERITY_COLORS: Record<string, string> = {
  urgent: "#EF4444",
  attention: "#F59E0B",
  upcoming: "#3B5EF6",
};

const TYPE_ICONS: Record<string, typeof Clock> = {
  overdue_followup: Clock,
  uncontacted_lead: UserPlus,
  hot_pipeline: TrendingUp,
  birthday_soon: Gift,
  task_due_today: CheckSquare,
};

export function BriefingRow({
  item,
  onPress,
}: {
  item: BriefingItem;
  onPress?: () => void;
}) {
  const c = useColors();
  const sevColor = SEVERITY_COLORS[item.severity] ?? "#3B5EF6";
  const Icon = TYPE_ICONS[item.type] ?? AlertCircle;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          padding: Space.md,
          gap: Space.md,
          borderRadius: Radius.lg,
          backgroundColor: c.card,
          borderWidth: 1,
          borderColor: c.cardBorder,
          marginBottom: Space.sm,
        },
        pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
      ]}
    >
      {/* Severity icon */}
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: Radius.md,
          backgroundColor: sevColor + "15",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon size={18} color={sevColor} />
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        <Text style={{ ...Type.bodyBold, color: c.text }} numberOfLines={1}>
          {item.title}
        </Text>
        <Text
          style={{ ...Type.caption, color: c.textDim, marginTop: 2 }}
          numberOfLines={1}
        >
          {item.detail}
        </Text>
      </View>

      {/* Action badge */}
      <View
        style={{
          paddingHorizontal: Space.sm + 2,
          paddingVertical: Space.xs + 1,
          borderRadius: Radius.sm,
          backgroundColor: sevColor + "18",
        }}
      >
        <Text style={{ fontSize: 11, fontWeight: "700", color: sevColor }}>
          {item.actionLabel}
        </Text>
      </View>
    </Pressable>
  );
}
