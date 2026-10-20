/**
 * "Not now for <name>?": the menu behind a handful card's ⋯ button. The
 * choices are core's dismissChoicesFor (a consent-lapsing card can't be
 * stopped), the same as web Flight Control's Dismiss:
 *
 *   Already talked to them   Call / Text / In person: logs that contact
 *   Later                    in an hour / tonight / tomorrow morning
 *   Skip this time           this one reason only; the next can come up
 *   Stop suggesting          3 months / 6 months / Move to the Hangar
 *                            (the Hangar asks first)
 *
 * The rows open in place rather than in a second sheet (iOS shows one
 * modal at a time). The dashboard does the writes; this sheet only asks.
 */

import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import type { DismissChoice, LaterChoice } from "@agent-runway/core/lib/suggestion-dismissals";
import { Sheet } from "@/components/ui/Sheet";
import { Radius, Space, Type, useColors } from "@/lib/theme";
import { LaterChoiceList, SheetOption } from "./LaterSheet";

export type TalkedType = "call" | "text" | "meeting";

export type DismissPick =
  | { kind: "talked"; type: TalkedType }
  | { kind: "later"; choice: LaterChoice }
  | { kind: "skip" }
  | { kind: "stop"; choice: "3_months" | "6_months" }
  | { kind: "hangar" };

/** One key per pick, for the busy state. */
export function pickKey(pick: DismissPick): string {
  switch (pick.kind) {
    case "talked": return `talked:${pick.type}`;
    case "later": return `later:${pick.choice}`;
    case "stop": return `stop:${pick.choice}`;
    default: return pick.kind;
  }
}

const TALKED: readonly { type: TalkedType; key: string }[] = [
  { type: "call", key: "dismiss.call" },
  { type: "text", key: "dismiss.text" },
  { type: "meeting", key: "dismiss.inPerson" },
];

export function DismissSheet({
  visible,
  name,
  choices,
  laterChoices,
  busy = null,
  onPick,
  onClose,
}: {
  visible: boolean;
  /** The client's name; blank reads "this client". */
  name: string;
  /** What this card offers (dismissChoicesFor, less Skip when the card has no occurrence). */
  choices: readonly DismissChoice[];
  laterChoices: readonly LaterChoice[];
  /** pickKey of the pick being saved, if any. */
  busy?: string | null;
  onPick: (pick: DismissPick) => void;
  onClose: () => void;
}) {
  const c = useColors();
  const { t } = useTranslation("home");
  const [open, setOpen] = useState<"already_talked" | "later" | "stop" | null>(null);

  // Each card starts with the rows closed.
  useEffect(() => {
    if (visible) setOpen(null);
  }, [visible]);

  const who = name.trim() || t("dismiss.thisClient");
  const saving = busy !== null;
  const toggle = (row: "already_talked" | "later" | "stop") => setOpen((cur) => (cur === row ? null : row));
  const chevron = (row: "already_talked" | "later" | "stop") =>
    open === row ? <ChevronDown size={18} color={c.textDim} /> : <ChevronRight size={18} color={c.textDim} />;

  const confirmHangar = () => {
    Alert.alert(
      t("dismiss.hangarConfirmTitle", { name: who }),
      t("dismiss.hangarConfirmBody"),
      [
        { text: t("dismiss.cancel"), style: "cancel" },
        { text: t("dismiss.hangar"), onPress: () => onPick({ kind: "hangar" }) },
      ],
    );
  };

  return (
    <Sheet visible={visible} onClose={() => !saving && onClose()} title={t("dismiss.title", { name: who })} maxHeight="90%">
      <View style={{ gap: Space.sm, paddingBottom: Space.lg }}>
        {choices.includes("already_talked") && (
          <View style={{ gap: Space.sm }}>
            <SheetOption
              label={t("dismiss.alreadyTalked")}
              onPress={() => toggle("already_talked")}
              disabled={saving}
              trailing={chevron("already_talked")}
            />
            {open === "already_talked" && (
              <View style={{ flexDirection: "row", gap: Space.sm, paddingLeft: Space.md }}>
                {TALKED.map(({ type, key }) => {
                  const k = pickKey({ kind: "talked", type });
                  return (
                    <Pressable
                      key={type}
                      onPress={() => onPick({ kind: "talked", type })}
                      disabled={saving}
                      accessibilityRole="button"
                      accessibilityLabel={t(key)}
                      style={({ pressed }) => ({
                        paddingHorizontal: Space.lg,
                        paddingVertical: Space.sm,
                        minHeight: 40,
                        justifyContent: "center",
                        borderRadius: Radius.pill,
                        borderWidth: 1,
                        borderColor: c.primaryBorder,
                        backgroundColor: busy === k || pressed ? c.primary : c.primaryDim,
                        opacity: saving && busy !== k ? 0.5 : 1,
                      })}
                    >
                      <Text style={[Type.caption, { fontWeight: "700", color: busy === k ? "#FFFFFF" : c.primary }]}>{t(key)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {choices.includes("later") && (
          <View style={{ gap: Space.sm }}>
            <SheetOption label={t("dismiss.later")} onPress={() => toggle("later")} disabled={saving} trailing={chevron("later")} />
            {open === "later" && (
              <View style={{ paddingLeft: Space.md }}>
                <LaterChoiceList
                  choices={laterChoices}
                  onPick={(choice) => onPick({ kind: "later", choice })}
                  busy={busy?.startsWith("later:") ? (busy.slice("later:".length) as LaterChoice) : null}
                  disabled={saving}
                />
              </View>
            )}
          </View>
        )}

        {choices.includes("skip") && (
          <SheetOption
            label={t("dismiss.skip")}
            onPress={() => onPick({ kind: "skip" })}
            disabled={saving && busy !== "skip"}
            busy={busy === "skip"}
          />
        )}

        {choices.includes("stop") && (
          <View style={{ gap: Space.sm }}>
            <SheetOption label={t("dismiss.stop")} onPress={() => toggle("stop")} disabled={saving} trailing={chevron("stop")} />
            {open === "stop" && (
              <View style={{ gap: Space.sm, paddingLeft: Space.md }}>
                <SheetOption
                  label={t("dismiss.threeMonths")}
                  onPress={() => onPick({ kind: "stop", choice: "3_months" })}
                  disabled={saving && busy !== "stop:3_months"}
                  busy={busy === "stop:3_months"}
                />
                <SheetOption
                  label={t("dismiss.sixMonths")}
                  onPress={() => onPick({ kind: "stop", choice: "6_months" })}
                  disabled={saving && busy !== "stop:6_months"}
                  busy={busy === "stop:6_months"}
                />
                <SheetOption
                  label={t("dismiss.hangar")}
                  onPress={confirmHangar}
                  disabled={saving && busy !== "hangar"}
                  busy={busy === "hangar"}
                  tone="quiet"
                />
              </View>
            )}
          </View>
        )}
      </View>
    </Sheet>
  );
}
