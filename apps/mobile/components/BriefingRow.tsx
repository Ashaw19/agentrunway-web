/**
 * BriefingRow — A single actionable item in the Today's Focus list.
 * Severity-coded with icon, title, detail, and action label.
 * Spring-animated press with subtle glow on severity icon.
 */

import { View, Text, Pressable } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import {
  Clock,
  UserPlus,
  TrendingUp,
  Gift,
  CheckSquare,
  AlertCircle,
  Star,
  PlaneTakeoff,
  CakeSlice,
  Award,
  Banknote,
  PhoneCall,
  CalendarClock,
  Home,
  Contact,
  Copy,
  MapPinned,
} from "lucide-react-native";
import { useColors, Space, Radius, Type } from "@/lib/theme";
import type { BriefingItem } from "@/stores/data-store";

const SEVERITY_COLORS: Record<string, string> = {
  urgent: "#EF4444",
  attention: "#F59E0B",
  upcoming: "#3B5EF6",
};

// Icon map covers every type emitted by the canonical engine
// (`computeIntelligenceBriefing` in
// `packages/core/engines/crm-analytics-engine.ts`) plus the mobile-only
// `hot_pipeline` + `task_due_today` supplements. Unknown types fall back
// to `AlertCircle` so future engine additions don't crash the UI — they
// render with the engine-supplied title/detail and a neutral icon.
// See audit red flag #3.
const TYPE_ICONS: Record<string, typeof Clock> = {
  // engine
  vip_overdue: Star,
  uncontacted_lead: UserPlus,
  in_flight_stale: PlaneTakeoff,
  birthday_today: CakeSlice,
  birthday_soon: Gift,
  closing_anniversary: Award,
  mortgage_renewal_window: Banknote,
  mortgage_renewal_due: Banknote,
  past_client_check_in: PhoneCall,
  timeframe_approaching: CalendarClock,
  property_value_milestone: Home,
  no_contact_info: Contact,
  possible_duplicate: Copy,
  listing_appointment_overdue: MapPinned,
  listing_stale: MapPinned,
  // mobile-only supplements
  hot_pipeline: TrendingUp,
  task_due_today: CheckSquare,
  // legacy fallback path (offline cold-start)
  overdue_followup: Clock,
};

const SPRING = { damping: 15, stiffness: 400, mass: 0.8 };

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
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          scale.value = withSpring(0.97, SPRING);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, SPRING);
        }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: Space.md,
          gap: Space.md,
          borderRadius: Radius.lg,
          backgroundColor: c.card,
          borderWidth: 1,
          borderColor: c.cardBorder,
          marginBottom: Space.sm,
        }}
      >
        {/* Severity icon with subtle glow bg */}
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: sevColor + "38",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={16} color={sevColor} strokeWidth={2.2} />
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
            borderRadius: Radius.pill,
            backgroundColor: sevColor + "38",
            borderWidth: 1,
            borderColor: sevColor + "66",
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: "700", color: sevColor, letterSpacing: 0.2 }}>
            {item.actionLabel}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}
