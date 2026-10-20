/**
 * The top of the dashboard: the AGENT RUNWAY mark, "Good morning/afternoon/
 * evening, <first name>" (the band of the Atlantic hour), one line of
 * context, and the day's progress with the activity streak ("2 of 5 done
 * today · 6-day streak"; the streak from 2 days, nothing said when it
 * breaks).
 *
 * The top-right slot is kept for the Runway Score badge: `badge`, or an
 * empty space of the badge's size so the greeting wraps the same either way.
 * `account` sits at the end of the mark's row: your initials, which open You
 * (settings), as the App Store and Music put your picture at the top.
 */

import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { NextUpView } from "@agent-runway/core/lib/next-up/build";
import type { TimeBand } from "@agent-runway/core/lib/next-up/rules";
import { Radius, Space, useColors } from "@/lib/theme";
import { contextLine, greetingLine, progressLine } from "@/lib/next-up-copy";

/** The score badge's size: the slot it sits in. */
export const BADGE_SLOT = 50;

export interface WelcomeHeaderProps {
  firstName: string;
  band: TimeBand;
  context: NextUpView["context"];
  progress: NextUpView["progress"];
  streak: number;
  badge?: ReactNode;
  account?: ReactNode;
}

export function WelcomeHeader({ firstName, band, context, progress, streak, badge, account }: WelcomeHeaderProps) {
  const c = useColors();
  const { t } = useTranslation("home");
  const clear = context.kind === "all_clear";
  const progressText = progressLine(progress, streak, t);

  return (
    <View style={{ paddingTop: Space.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 32 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1.5, color: c.textMuted }}>AGENT</Text>
          <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1.5, color: c.primary, marginLeft: 4 }}>RUNWAY</Text>
        </View>
        {account}
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: Space.md, marginTop: Space.xs }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            accessibilityRole="header"
            style={{ fontSize: 26, fontWeight: "800", letterSpacing: -0.5, lineHeight: 30, color: c.text }}
          >
            {greetingLine(band, firstName, t)}
          </Text>
          <View
            style={{
              alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, marginTop: 9,
              paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.pill,
              backgroundColor: clear ? c.successDim : c.primaryDim,
            }}
          >
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: clear ? c.success : c.primary }} />
            <Text
              style={{ fontSize: 12, fontWeight: "600", color: clear ? c.success : c.primary, flexShrink: 1 }}
              numberOfLines={1}
            >
              {contextLine(context, t)}
            </Text>
          </View>
        </View>
        {badge ?? <View style={{ width: BADGE_SLOT, height: BADGE_SLOT }} />}
      </View>
      {progressText ? (
        <Text style={{ fontSize: 12, fontWeight: "600", color: c.textMuted, marginTop: Space.sm }}>{progressText}</Text>
      ) : null}
    </View>
  );
}
