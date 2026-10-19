/**
 * "Also waiting": one row per section with something no stack card covers,
 * with its count and a chevron. Tapping a row opens its section.
 *
 * A Checklist row holding exactly one task (swipeTaskId) can be marked done
 * in place: `onSwipeDone(taskId)`. Its accessibility action "Mark done"
 * calls it today; the swipe gesture itself comes with the card actions
 * (it needs a GestureHandlerRootView at the app's root, which the app
 * doesn't have yet).
 *
 * The Checklist count is red only while an overdue task waits in it
 * (`checklistOverdue`); red is for overdue items only.
 */

import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Briefcase, ChevronRight, Clock, Mail, Phone, Receipt, UserPlus } from "lucide-react-native";
import type { AlsoWaitingRow, SectionKey } from "@agent-runway/core/lib/next-up/build";
import { Radius, Space, shadows, useColors, useTheme } from "@/lib/theme";
import { rowCopy } from "@/lib/next-up-copy";
import { useDataStore } from "@/stores/data-store";

export interface AlsoWaitingListProps {
  rows: AlsoWaitingRow[];
  onOpen: (s: SectionKey) => void;
  onSwipeDone: (taskId: string) => void;
  /** An overdue task waits in the Checklist row (lib/next-up-view checklistRowHasOverdue). */
  checklistOverdue?: boolean;
}

type Icon = typeof Clock;

const SECTION_ICONS: Readonly<Record<SectionKey, Icon>> = {
  checklist: Clock,
  new_leads: UserPlus,
  deals: Briefcase,
  handful: Phone,
  messages: Mail,
  receipts: Receipt,
};

export function AlsoWaitingList({ rows, onOpen, onSwipeDone, checklistOverdue = false }: AlsoWaitingListProps) {
  const c = useColors();
  const { mode } = useTheme();
  const sh = shadows(mode);
  const { t } = useTranslation("home");
  const tasks = useDataStore((s) => s.tasks);

  if (rows.length === 0) return null;

  const colour = (section: SectionKey): { fg: string; bg: string } => {
    switch (section) {
      case "checklist": return checklistOverdue ? { fg: c.danger, bg: c.dangerDim } : { fg: c.primary, bg: c.primaryDim };
      case "new_leads": return { fg: c.warning, bg: c.warningDim };
      case "deals":     return { fg: "#64748B", bg: "rgba(100,116,139,0.16)" };
      case "handful":   return { fg: c.cyan, bg: c.cyanDim };
      case "messages":  return { fg: "#6366F1", bg: "rgba(99,102,241,0.16)" };
      case "receipts":  return { fg: c.success, bg: c.successDim };
    }
  };

  return (
    <View>
      <Text style={{ fontSize: 13, fontWeight: "800", color: c.text, marginBottom: Space.sm, paddingHorizontal: Space.xs }}>
        {t("alsoWaiting.title")}
      </Text>
      <View
        style={[
          { backgroundColor: c.card, borderRadius: Radius.xl, borderWidth: 1, borderColor: c.cardBorder, overflow: "hidden" },
          sh.card,
        ]}
      >
        {rows.map((row, i) => {
          const taskTitle = row.swipeTaskId ? tasks.find((task) => task.id === row.swipeTaskId)?.title ?? null : null;
          const copy = rowCopy(row, t, taskTitle);
          const { fg, bg } = colour(row.section);
          const SectionIcon = SECTION_ICONS[row.section];
          const swipeTaskId = row.swipeTaskId;
          return (
            <Pressable
              key={row.section}
              onPress={() => onOpen(row.section)}
              accessibilityRole="button"
              accessibilityLabel={[copy.title, copy.detail, String(row.count)].filter(Boolean).join(", ")}
              accessibilityActions={swipeTaskId ? [{ name: "markDone", label: t("alsoWaiting.markDone") }] : undefined}
              onAccessibilityAction={(e) => {
                if (e.nativeEvent.actionName === "markDone" && swipeTaskId) onSwipeDone(swipeTaskId);
              }}
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 10, paddingHorizontal: 12,
                borderTopWidth: i > 0 ? 1 : 0, borderTopColor: c.divider,
                backgroundColor: pressed ? c.primaryDim : "transparent",
              })}
            >
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
                <SectionIcon size={16} color={fg} strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: c.text }} numberOfLines={1}>{copy.title}</Text>
                {copy.detail ? (
                  <Text style={{ fontSize: 11, color: c.textDim, marginTop: 1 }} numberOfLines={1}>{copy.detail}</Text>
                ) : null}
              </View>
              <View style={{ backgroundColor: bg, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11.5, fontWeight: "800", color: fg }}>{row.count}</Text>
              </View>
              <ChevronRight size={14} color={c.textFaint} strokeWidth={2.4} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
