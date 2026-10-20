/**
 * The Runway Score badge in the dashboard's top-right corner: a mini ring in
 * the band colour with the number, and a small trend tag ("▼ 3" or "▲ 2")
 * against the score a week earlier. The glow is red while the score is
 * falling and green while it is rising, and absent otherwise. With no score
 * saved yet it shows "–". Tapping it opens the score sheet.
 *
 * ScoreRing is the ring itself, also used big at the top of the sheet.
 */

import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { Radius, shadows, useColors, useTheme } from "@/lib/theme";
import { badgeLabel, trendTag } from "@/lib/score-sheet-copy";
import type { ScoreView } from "@/lib/score-view";
import { BADGE_SLOT } from "./WelcomeHeader";

/** A ring filled to `score` out of 100 in `color`, over a track, with `children` in the middle. No arc without a score. */
export function ScoreRing({
  size,
  stroke,
  score,
  color,
  track,
  children,
}: {
  size: number;
  stroke: number;
  score: number | null;
  color: string;
  track: string;
  children?: ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = score === null ? 0 : Math.min(Math.max(score, 0), 100) / 100;
  const centre = size / 2;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={centre} cy={centre} r={radius} stroke={track} strokeWidth={stroke} fill="none" />
        {filled > 0 && (
          <Circle
            cx={centre} cy={centre} r={radius}
            stroke={color} strokeWidth={stroke} fill="none"
            strokeDasharray={circumference} strokeDashoffset={circumference * (1 - filled)}
            strokeLinecap="round" transform={`rotate(-90 ${centre} ${centre})`}
          />
        )}
      </Svg>
      {children}
    </View>
  );
}

export function ScoreBadge({ view, onPress }: { view: ScoreView | null; onPress: () => void }) {
  const c = useColors();
  const { mode } = useTheme();
  const sh = shadows(mode);
  const { t } = useTranslation("home");

  const trend = view?.trend ?? null;
  const glow = trend ? (trend.direction === "down" ? c.danger : c.success) : null;

  return (
    <Pressable
      onPress={() => {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={badgeLabel(view, t)}
      hitSlop={8}
      style={({ pressed }) => ({ width: BADGE_SLOT, height: BADGE_SLOT, opacity: pressed ? 0.85 : 1 })}
    >
      <View
        style={[
          {
            width: BADGE_SLOT, height: BADGE_SLOT, borderRadius: BADGE_SLOT / 2, backgroundColor: c.card,
            alignItems: "center", justifyContent: "center",
          },
          glow ? sh.glow(glow) : null,
        ]}
      >
        <ScoreRing size={BADGE_SLOT} stroke={5} score={view?.score ?? null} color={view?.color ?? c.textFaint} track={c.cardBorder}>
          <Text maxFontSizeMultiplier={1.1} style={{ fontSize: 15, fontWeight: "800", color: c.text }}>
            {view ? Math.round(view.score) : "–"}
          </Text>
        </ScoreRing>
      </View>
      {trend && glow ? (
        <View
          style={[
            {
              position: "absolute", bottom: -4, right: -4, backgroundColor: c.card, borderRadius: Radius.pill,
              paddingHorizontal: 5, paddingVertical: 1,
            },
            sh.card,
          ]}
        >
          <Text maxFontSizeMultiplier={1.1} style={{ fontSize: 9, fontWeight: "800", color: glow }}>{trendTag(trend)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
