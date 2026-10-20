/**
 * The bottom of Today: the screens that used to sit on More and are opened
 * from Today, there whether or not they have something waiting (Next up and
 * Also waiting only show them when they do).
 */
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ChevronRight, ListChecks, Send, Sunrise } from "lucide-react-native";
import { NAV } from "@/lib/app-nav";
import { Radius, Space, Type, useColors } from "@/lib/theme";

const SHORTCUTS = [
  { href: NAV.briefing, label: "tools.briefing", Icon: Sunrise },
  { href: NAV.checklist, label: "tools.checklist", Icon: ListChecks },
  { href: NAV.outreach, label: "tools.flightControl", Icon: Send },
] as const;

export function TodayShortcuts() {
  const c = useColors();
  const router = useRouter();
  const { t } = useTranslation("profile");
  const { t: tCommon } = useTranslation("common");
  return (
    <View>
      <Text style={{ ...Type.label, color: c.textMuted, marginBottom: Space.sm, marginLeft: Space.xs }}>{tCommon("nav.goTo")}</Text>
      <View style={{ borderRadius: Radius.lg, borderWidth: 1, borderColor: c.cardBorder, backgroundColor: c.card, overflow: "hidden" }}>
        {SHORTCUTS.map(({ href, label, Icon }, i) => (
          <Pressable
            key={href}
            onPress={() => router.push(href)}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: Space.md,
              paddingHorizontal: Space.lg,
              paddingVertical: Space.md,
              borderTopWidth: i > 0 ? 1 : 0,
              borderTopColor: c.divider,
              backgroundColor: pressed ? c.primaryDim : "transparent",
            })}
          >
            <Icon size={18} color={c.primary} strokeWidth={2} />
            <Text style={{ ...Type.bodyBold, color: c.text, flex: 1 }}>{t(label)}</Text>
            <ChevronRight size={18} color={c.textDim} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
