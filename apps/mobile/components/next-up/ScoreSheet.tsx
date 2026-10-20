/**
 * The sheet that opens from the score badge, top to bottom:
 *
 *   the big ring and the grade chip, with the state label, the trend since
 *   last week and (once the save is old) "as of <day>"
 *   the five parts as bars, each with its value
 *   the lowest part and its number
 *   "Full breakdown ›" (the dashboard closes this sheet, then opens the
 *   existing breakdown sheet once this one has finished closing, onDismiss:
 *   iOS shows one modal at a time, lib/score-sheets.ts)
 *   "Your numbers": the key metrics and the annual goal
 *
 * With no score saved yet it keeps the old line sending Andrew to the web
 * dashboard, and "Your numbers" stays (they don't come from the score).
 * The phone only reads the saved score; every colour, grade and label comes
 * from the engine (lib/score-view.ts).
 */

import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react-native";
import { bandColorHexForScore } from "@agent-runway/core/engines/runway-score-engine";
import { Sheet } from "@/components/ui/Sheet";
import { Radius, Space, Type, useColors } from "@/lib/theme";
import { lowestLine, partName, statusLine } from "@/lib/score-sheet-copy";
import type { ScoreView } from "@/lib/score-view";
import { ScoreRing } from "./ScoreBadge";
import { YourNumbers } from "./YourNumbers";

export interface ScoreSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The sheet has finished closing (iOS only; see Sheet). */
  onDismiss?: () => void;
  /** Null until a score has been saved. */
  view: ScoreView | null;
  /** The phone's calendar day (YYYY-MM-DD). */
  today: string;
  onFullBreakdown: () => void;
  /** A tile or the goal was tapped: the dashboard closes this sheet and opens the screen. */
  onOpen: (href: string) => void;
}

export function ScoreSheet({ visible, onClose, onDismiss, view, today, onFullBreakdown, onOpen }: ScoreSheetProps) {
  const c = useColors();
  const { t, i18n } = useTranslation("home");
  const hasParts = !!view && view.components.length > 0;
  const lowest = view ? lowestLine(view, t) : null;

  return (
    <Sheet visible={visible} onClose={onClose} onDismiss={onDismiss} title={t("score.runwayScore")}>
      <View style={{ paddingBottom: Space.lg }}>
        {/* ── The score ── */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: Space.md }}>
          <ScoreRing size={64} stroke={7} score={view?.score ?? null} color={view?.color ?? c.textFaint} track={c.cardBorder}>
            <Text maxFontSizeMultiplier={1.1} style={{ fontSize: 20, fontWeight: "800", color: c.text }}>
              {view ? Math.round(view.score) : "–"}
            </Text>
          </ScoreRing>
          <View style={{ flex: 1, minWidth: 0 }}>
            {view ? (
              <>
                {/* Solid grade chip: full saturation with white text reads in both modes. */}
                <View
                  style={{
                    alignSelf: "flex-start", backgroundColor: view.color,
                    paddingHorizontal: Space.sm + 2, paddingVertical: 3, borderRadius: Radius.sm,
                  }}
                >
                  <Text style={{ color: "#FFFFFF", fontSize: 11, fontWeight: "800" }}>{view.grade}</Text>
                </View>
                <Text style={{ ...Type.caption, color: c.textSecondary, marginTop: Space.xs }} numberOfLines={3}>
                  {statusLine(view, today, t, i18n.language)}
                </Text>
              </>
            ) : (
              <Text style={{ ...Type.body, color: c.textDim }}>{t("scoreSheet.noScore")}</Text>
            )}
          </View>
        </View>

        {/* ── The five parts ── */}
        {view && hasParts ? (
          <View style={{ marginTop: Space.lg }}>
            {view.components.map((comp) => {
              // A part takes the bands of the score itself, from the engine.
              const barColor = bandColorHexForScore(comp.score);
              const value = Math.round(comp.score);
              const name = partName(comp, t);
              return (
                <View
                  key={comp.label}
                  accessible
                  accessibilityLabel={`${name} ${value}`}
                  style={{ flexDirection: "row", alignItems: "center", gap: Space.sm, marginVertical: 5 }}
                >
                  <Text style={{ ...Type.caption, color: c.textSecondary, fontWeight: "600", width: 76 }} numberOfLines={1}>
                    {name}
                  </Text>
                  <View style={{ flex: 1, height: 7, borderRadius: 4, backgroundColor: c.cardBorder, overflow: "hidden" }}>
                    <View
                      style={{
                        height: 7, borderRadius: 4, backgroundColor: barColor,
                        width: `${Math.min(Math.max(comp.score, 0), 100)}%`,
                      }}
                    />
                  </View>
                  <Text style={{ ...Type.caption, color: c.text, fontWeight: "800", width: 30, textAlign: "right" }}>{value}</Text>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* ── The lowest part, and the full breakdown ── */}
        {lowest ? (
          <View style={{ marginTop: Space.md, backgroundColor: c.bg, borderRadius: Radius.lg, padding: Space.md }}>
            <Text style={{ ...Type.caption, color: c.textSecondary }}>{lowest}</Text>
          </View>
        ) : null}
        {hasParts ? (
          <Pressable
            onPress={onFullBreakdown}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Space.xs,
              minHeight: 44, marginTop: Space.xs, opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ ...Type.bodyBold, color: c.primary }}>{t("scoreSheet.fullBreakdown")}</Text>
            <ChevronRight size={16} color={c.primary} />
          </Pressable>
        ) : null}

        {/* ── Your numbers ── */}
        <View style={{ marginTop: Space.xl }}>
          <Text style={{ ...Type.label, color: c.textMuted, marginBottom: Space.md }}>{t("yourNumbers.title")}</Text>
          <YourNumbers onOpen={onOpen} />
        </View>
      </View>
    </Sheet>
  );
}
