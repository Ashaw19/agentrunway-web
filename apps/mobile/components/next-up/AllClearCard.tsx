/**
 * Shown when the Next up stack is empty: all caught up (or nothing urgent,
 * while "Also waiting" rows remain), and what comes next: the next showing
 * or listing appointment, else the next task, else nothing scheduled.
 */

import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { CheckCircle2 } from "lucide-react-native";
import type { NextUpView } from "@agent-runway/core/lib/next-up/build";
import { Radius, Space, Type, shadows, useColors, useTheme } from "@/lib/theme";
import { allClearCopy } from "@/lib/next-up-copy";

export interface AllClearCardProps {
  allClear: NextUpView["allClear"];
  /** Rows still wait in "Also waiting". */
  hasRows: boolean;
  /** The dashboard's day (YYYY-MM-DD). */
  today: string;
}

export function AllClearCard({ allClear, hasRows, today }: AllClearCardProps) {
  const c = useColors();
  const { mode } = useTheme();
  const sh = shadows(mode);
  const { t, i18n } = useTranslation("home");
  const copy = allClearCopy(allClear, hasRows, today, t, i18n.language);

  return (
    <View
      accessible
      accessibilityLabel={[copy.title, copy.detail].filter(Boolean).join(". ")}
      style={[
        {
          flexDirection: "row", alignItems: "center", gap: Space.md,
          backgroundColor: c.card, borderRadius: Radius.xl, borderWidth: 1, borderColor: c.cardBorder, padding: Space.lg,
        },
        sh.card,
      ]}
    >
      <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: c.successDim, alignItems: "center", justifyContent: "center" }}>
        <CheckCircle2 size={20} color={c.success} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ ...Type.h3, color: c.text }} numberOfLines={1}>{copy.title}</Text>
        {copy.detail ? (
          <Text style={{ ...Type.caption, color: c.textDim, marginTop: 2 }} numberOfLines={2}>{copy.detail}</Text>
        ) : null}
      </View>
    </View>
  );
}
