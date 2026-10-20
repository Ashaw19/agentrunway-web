/**
 * "Bring it back": a Next up card's Later. The choices are core's
 * (laterChoices through the phone's clock guard, lib/next-up-clock.ts): in an
 * hour, tonight (not offered from 19:00) and tomorrow morning (08:00).
 *
 * A handful client's Later is the server's hold, shared with web Flight
 * Control; any other card is put off on this phone only (correction 15). The
 * dashboard decides which; this sheet only asks when.
 *
 * LaterChoiceList is the same list inside the Dismiss sheet's "Later".
 */

import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { LaterChoice } from "@agent-runway/core/lib/suggestion-dismissals";
import { Sheet } from "@/components/ui/Sheet";
import { Radius, Space, Type, useColors } from "@/lib/theme";

const LATER_KEYS: Readonly<Record<LaterChoice, string>> = {
  in_an_hour: "later.inAnHour",
  tonight: "later.tonight",
  tomorrow: "later.tomorrow",
};

/** One tappable choice in a Next up sheet. */
export function SheetOption({
  label,
  onPress,
  disabled = false,
  busy = false,
  tone = "normal",
  trailing,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone?: "normal" | "quiet";
  trailing?: ReactNode;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: Space.sm,
        minHeight: 48,
        paddingHorizontal: Space.lg,
        paddingVertical: Space.md,
        borderRadius: Radius.md,
        borderWidth: 1,
        borderColor: c.cardBorder,
        backgroundColor: pressed ? c.primaryDim : c.card,
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <Text style={[Type.bodyBold, { color: tone === "quiet" ? c.textMuted : c.text, flex: 1 }]}>{label}</Text>
      {busy ? <ActivityIndicator size="small" color={c.primary} /> : trailing}
    </Pressable>
  );
}

/** The Later choices as a list (here and inside the Dismiss sheet). */
export function LaterChoiceList({
  choices,
  onPick,
  busy = null,
  disabled = false,
}: {
  choices: readonly LaterChoice[];
  onPick: (choice: LaterChoice) => void;
  /** The choice being saved, if any: the others wait. */
  busy?: LaterChoice | null;
  /** Something else is being saved: every choice waits. */
  disabled?: boolean;
}) {
  const { t } = useTranslation("home");
  return (
    <View style={{ gap: Space.sm }}>
      {choices.map((choice) => (
        <SheetOption
          key={choice}
          label={t(LATER_KEYS[choice])}
          onPress={() => onPick(choice)}
          disabled={busy !== null ? busy !== choice : disabled}
          busy={busy === choice}
        />
      ))}
    </View>
  );
}

export function LaterSheet({
  visible,
  choices,
  onPick,
  onClose,
  busy = null,
}: {
  visible: boolean;
  choices: readonly LaterChoice[];
  onPick: (choice: LaterChoice) => void;
  onClose: () => void;
  busy?: LaterChoice | null;
}) {
  const { t } = useTranslation("home");
  return (
    <Sheet visible={visible} onClose={() => busy === null && onClose()} title={t("later.title")}>
      <View style={{ paddingBottom: Space.lg }}>
        <LaterChoiceList choices={choices} onPick={onPick} busy={busy} />
      </View>
    </Sheet>
  );
}
