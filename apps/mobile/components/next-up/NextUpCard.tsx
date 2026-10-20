/**
 * One card on the dashboard's Next up stack: "NEXT UP" and "1 OF N", who or
 * what it's about, and the buttons that suit its job (core cardActions).
 *
 * The colour is by kind. Only overdue tasks use the red family: red is for
 * overdue items only. A deal deadline is amber, never red.
 *
 * `index` is the card's place in the stack, from 0 (shown as "1 OF N").
 * `busy` greys the buttons out while a tap is being handled; there is no
 * open-ended "drafting" state.
 */

import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import {
  Briefcase,
  Calendar,
  Car,
  Check,
  ChevronRight,
  Clock,
  ListChecks,
  Mail,
  MessageSquare,
  Mic,
  MoreHorizontal,
  Phone,
  Receipt,
  Sparkles,
} from "lucide-react-native";
import {
  cardActions,
  type NextUpAction,
  type NextUpCard as Card,
  type NextUpKind,
} from "@agent-runway/core/lib/next-up/build";
import { getInitials } from "@/lib/theme";
import { actionLabel, cardCopy, laterAsIcon } from "@/lib/next-up-copy";
import { useDataStore } from "@/stores/data-store";

/** The card's height; the stack sizes its pages and ghost cards from it. */
export const CARD_HEIGHT = 176;

export interface CardTone {
  /** Dark to light, top-left to bottom-right. */
  gradient: [string, string, string];
  /** "NEXT UP" and "1 OF N". */
  tint: string;
  /** The line under the title. */
  sub: string;
  /** Text on the solid first button. */
  ink: string;
}

export const CARD_TONES: Readonly<Record<NextUpKind, CardTone>> = {
  new_lead:         { gradient: ["#1E1B4B", "#3730A3", "#4F46E5"], tint: "#C7D2FE", sub: "#E0E7FF", ink: "#312E81" },
  handful_client:   { gradient: ["#0C1E4F", "#1D4ED8", "#3B5EF6"], tint: "#BFDBFE", sub: "#DBEAFE", ink: "#1E3A8A" },
  deal_deadline:    { gradient: ["#451A03", "#92400E", "#D97706"], tint: "#FDE68A", sub: "#FEF3C7", ink: "#78350F" },
  overdue_tasks:    { gradient: ["#450A0A", "#991B1B", "#DC2626"], tint: "#FECACA", sub: "#FEE2E2", ink: "#7F1D1D" },
  tasks_today:      { gradient: ["#2E1065", "#5B21B6", "#7C3AED"], tint: "#DDD6FE", sub: "#EDE9FE", ink: "#4C1D95" },
  briefing:         { gradient: ["#082F49", "#0369A1", "#0284C7"], tint: "#BAE6FD", sub: "#E0F2FE", ink: "#0C4A6E" },
  schedule:         { gradient: ["#042F2E", "#0F766E", "#0D9488"], tint: "#99F6E4", sub: "#CCFBF1", ink: "#134E4A" },
  messages_ready:   { gradient: ["#1E1B4B", "#4338CA", "#6366F1"], tint: "#C7D2FE", sub: "#E0E7FF", ink: "#3730A3" },
  voice_note:       { gradient: ["#3B0764", "#7E22CE", "#9333EA"], tint: "#E9D5FF", sub: "#F3E8FF", ink: "#581C87" },
  undated_receipts: { gradient: ["#022C22", "#047857", "#059669"], tint: "#A7F3D0", sub: "#D1FAE5", ink: "#064E3B" },
  trips:            { gradient: ["#0F172A", "#334155", "#475569"], tint: "#CBD5E1", sub: "#E2E8F0", ink: "#1E293B" },
};

type Icon = typeof Phone;

const KIND_ICONS: Readonly<Record<NextUpKind, Icon>> = {
  new_lead: Phone,
  handful_client: Phone,
  deal_deadline: Briefcase,
  overdue_tasks: Clock,
  tasks_today: ListChecks,
  briefing: Sparkles,
  schedule: Calendar,
  messages_ready: Mail,
  voice_note: Mic,
  undated_receipts: Receipt,
  trips: Car,
};

const ACTION_ICONS: Readonly<Partial<Record<NextUpAction, Icon>>> = {
  call: Phone,
  text: MessageSquare,
  later: Clock,
  mark_one_done: Check,
  record_voice_note: Mic,
};

/** Kinds whose square shows how many (the rest show initials or an icon). */
const COUNTED: readonly NextUpKind[] = ["overdue_tasks", "tasks_today", "briefing", "messages_ready", "undated_receipts"];

export interface NextUpCardProps {
  card: Card;
  index: number;
  total: number;
  onAction: (action: NextUpAction, card: Card) => void;
  busy?: boolean;
}

export function NextUpCard({ card, index, total, onAction, busy = false }: NextUpCardProps) {
  const { t, i18n } = useTranslation("home");
  const tone = CARD_TONES[card.kind];
  const leadCreatedAt = useDataStore((s) =>
    card.kind === "new_lead" && card.clientId ? s.clients.find((c) => c.id === card.clientId)?.created_at ?? null : null);
  const copy = cardCopy(card, t, { locale: i18n.language, now: new Date(), leadCreatedAt });
  const actions = cardActions(card);
  // Labels still shrink with an ellipsis as a last resort.
  const laterRound = laterAsIcon(actions, t);

  const KindIcon = KIND_ICONS[card.kind];
  // A count for the kinds about many items, else the client's initials, else the kind's icon.
  const square = COUNTED.includes(card.kind)
    ? card.count < 100 ? String(card.count) : null
    : card.clientId && card.clientName ? getInitials(card.clientName) : null;

  const press = (action: NextUpAction) => {
    if (busy) return;
    try { Haptics.selectionAsync(); } catch {}
    onAction(action, card);
  };

  return (
    <LinearGradient
      colors={tone.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ height: CARD_HEIGHT, borderRadius: 22, paddingVertical: 14, paddingHorizontal: 15, overflow: "hidden" }}
    >
      {/* Soft light in the top-right corner, as in the mockup. */}
      <View
        pointerEvents="none"
        style={{ position: "absolute", right: -40, top: -40, width: 150, height: 150, borderRadius: 75, backgroundColor: "rgba(255,255,255,0.10)" }}
      />

      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1.4, color: tone.tint }}>{t("stack.title")}</Text>
        <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1.4, color: tone.tint }}>
          {t("stack.position", { index: index + 1, total })}
        </Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 10 }}>
        <View
          style={{
            width: 36, height: 36, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.16)",
            alignItems: "center", justifyContent: "center",
          }}
        >
          {square ? (
            <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 13 }}>{square}</Text>
          ) : (
            <KindIcon size={17} color="#FFFFFF" strokeWidth={2.2} />
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 17, fontWeight: "800", letterSpacing: -0.2, color: "#FFFFFF" }} numberOfLines={1}>
            {copy.title}
          </Text>
          {copy.detail ? (
            <Text style={{ fontSize: 12, marginTop: 2, color: tone.sub }} numberOfLines={1}>{copy.detail}</Text>
          ) : null}
          {copy.note ? (
            <Text style={{ fontSize: 11, lineHeight: 15, marginTop: 2, color: tone.sub, opacity: 0.85 }} numberOfLines={2}>
              {copy.note}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={{ flex: 1 }} />

      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
        {actions.map((action, i) => {
          const ActionIcon = ACTION_ICONS[action];
          const label = actionLabel(action, t);
          const solid = i === 0;
          if (action === "dismiss" || (action === "later" && laterRound)) {
            const RoundIcon = action === "dismiss" ? MoreHorizontal : Clock;
            return (
              <Pressable
                key={action}
                onPress={() => press(action)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={label}
                hitSlop={6}
                style={({ pressed }) => ({
                  width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", flexShrink: 0,
                  backgroundColor: "rgba(255,255,255,0.16)", opacity: busy ? 0.5 : pressed ? 0.75 : 1,
                })}
              >
                <RoundIcon size={15} color="#FFFFFF" strokeWidth={2.4} />
              </Pressable>
            );
          }
          return (
            <Pressable
              key={action}
              onPress={() => press(action)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={label}
              // 32pt tall: the slop brings the target near 44pt without crowding the row.
              hitSlop={6}
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", gap: 5, height: 32, paddingHorizontal: 12, borderRadius: 16,
                flexShrink: 1, minWidth: 0,
                backgroundColor: solid ? "#FFFFFF" : "rgba(255,255,255,0.16)",
                opacity: busy ? 0.5 : pressed ? 0.8 : 1,
              })}
            >
              {ActionIcon ? <ActionIcon size={13} color={solid ? tone.ink : "#FFFFFF"} strokeWidth={2.4} /> : null}
              <Text style={{ fontSize: 12, fontWeight: "700", color: solid ? tone.ink : "#FFFFFF", flexShrink: 1 }} numberOfLines={1}>
                {label}
              </Text>
              {!ActionIcon && solid ? <ChevronRight size={12} color={tone.ink} strokeWidth={2.6} /> : null}
            </Pressable>
          );
        })}
        {busy ? <ActivityIndicator size="small" color="#FFFFFF" style={{ marginLeft: 2 }} /> : null}
      </View>
    </LinearGradient>
  );
}
