/**
 * "Your numbers", at the bottom of the score sheet: the Key Metrics tiles
 * (YTD GCI, Deals closed, Pipeline value) and Goal Progress, moved here from
 * the old dashboard with the same look and the same data sources (the data
 * store's ytdGci(), ytdDealCount(), pipelineValue(), the active pipeline,
 * closed transactions and settings.goal_gci). The tiles open Deals; the goal
 * opens the forecast. `onOpen` lets the sheet close itself first.
 */

import { useMemo } from "react";
import { Pressable, Text, View, type DimensionValue } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { ArrowRight, Briefcase, Handshake, TrendingUp } from "lucide-react-native";
import { computeGCI } from "@agent-runway/core/types/database";
import { useDataStore } from "@/stores/data-store";
import { Radius, Space, Type, fmtCompact, fmtCurrency, gradients, shadows, useColors, useTheme } from "@/lib/theme";
import { Sparkline } from "@/components/ui/Sparkline";
import { NAV } from "@/lib/app-nav";

export function YourNumbers({ onOpen }: { onOpen: (href: string) => void }) {
  const c = useColors();
  const { mode } = useTheme();
  const g = gradients(mode);
  const sh = shadows(mode);
  const { t } = useTranslation("home");
  const { settings, transactions, pipeline, ytdGci, ytdDealCount, pipelineValue } = useDataStore();

  const gci = ytdGci();
  const deals = ytdDealCount();
  const pipVal = pipelineValue();
  const goalGci = settings?.goal_gci ?? 0;
  const goalPct = goalGci > 0 ? Math.round((gci / goalGci) * 100) : 0;

  // Sparkline data: monthly GCI trend from closed transactions
  const gciSparkData = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const monthCount = Math.max(now.getMonth() + 1, 2);
    const months = new Array(monthCount).fill(0);
    for (const tx of transactions) {
      if (tx.status !== "closed") continue;
      // Local-noon anchor — `transactions.date` is date-only; a bare `new Date()`
      // resolves to UTC midnight = the previous day in every Canadian zone, so a
      // Jan 1 close falls out of the year and every 1st-of-month deal lands in the
      // wrong bucket. Web anchors the same way (dashboard-content.tsx:243).
      const d = new Date(tx.date + "T12:00:00");
      if (d.getFullYear() === year) {
        months[d.getMonth()] += computeGCI(tx);
      }
    }
    return months;
  }, [transactions]);

  // Sparkline data: monthly deal count
  const dealSparkData = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const monthCount = Math.max(now.getMonth() + 1, 2);
    const months = new Array(monthCount).fill(0);
    for (const tx of transactions) {
      if (tx.status !== "closed") continue;
      const d = new Date(tx.date + "T12:00:00"); // date-only column — see gciSparkData
      if (d.getFullYear() === year) months[d.getMonth()]++;
    }
    return months;
  }, [transactions]);

  return (
    <View>
      {/* ── Key metrics ── */}
      <View style={{ flexDirection: "row", gap: Space.md, marginBottom: Space.md }}>
        <MetricCard
          label={t("metrics.ytdGci")}
          value={fmtCompact(gci)}
          icon={<TrendingUp size={16} color={c.gold} />}
          color={c.gold}
          c={c} sh={sh}
          sparkData={gciSparkData}
        />
        <MetricCard
          label={t("metrics.dealsClosed")}
          value={String(deals)}
          icon={<Handshake size={16} color={c.success} />}
          color={c.success}
          c={c} sh={sh}
          sparkData={dealSparkData}
        />
      </View>
      <View style={{ flexDirection: "row", gap: Space.md }}>
        <MetricCard
          label={t("metrics.pipelineValue")}
          value={fmtCompact(pipVal)}
          subtitle={t("metrics.deals", { count: pipeline.length })}
          icon={<Briefcase size={16} color={c.primaryLight} />}
          color={c.primaryLight}
          c={c} sh={sh}
          onPress={() => onOpen(NAV.deals)}
        />
      </View>

      {/* ── Goal progress ── */}
      {goalGci > 0 && (
        <Pressable
          onPress={() => onOpen(NAV.forecast)}
          accessibilityRole="button"
          style={({ pressed }) => [
            {
              marginTop: Space.md,
              backgroundColor: c.card,
              borderRadius: Radius.xl,
              borderWidth: 1,
              borderColor: c.cardBorder,
              padding: Space.lg,
            },
            sh.card,
            pressed && { opacity: 0.85 },
          ]}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Space.md }}>
            <Text style={{ ...Type.label, color: c.textMuted }}>{t("goal.annualGoal")}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: Space.xs }}>
              <Text style={{ ...Type.caption, color: c.primary, fontWeight: "700" }}>{goalPct}%</Text>
              <ArrowRight size={12} color={c.textDim} />
            </View>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: "rgba(128,128,128,0.10)", overflow: "hidden" }}>
            <LinearGradient
              colors={goalPct >= 100 ? (g.successBar as [string, string, ...string[]]) : (g.progressBar as [string, string, ...string[]])}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ height: 8, borderRadius: 4, width: `${Math.min(goalPct, 100)}%` as DimensionValue }}
            />
          </View>
          <Text style={{ ...Type.micro, color: c.textDim, marginTop: Space.sm }}>
            {t("goal.ofGoal", { current: fmtCurrency(gci), goal: fmtCurrency(goalGci) })}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function MetricCard({
  label,
  value,
  subtitle,
  icon,
  color,
  c,
  sh,
  onPress,
  sparkData,
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  c: ReturnType<typeof useColors>;
  sh: ReturnType<typeof shadows>;
  onPress?: () => void;
  sparkData?: number[];
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        {
          flex: 1,
          backgroundColor: c.card,
          borderRadius: Radius.xl,
          borderWidth: 1,
          borderColor: c.cardBorder,
          padding: Space.lg,
          overflow: "hidden",
        },
        sh.card,
        pressed && onPress && { opacity: 0.85, transform: [{ scale: 0.97 }] },
      ]}
    >
      {/* Sparkline watermark behind content */}
      {sparkData && sparkData.length >= 2 && (
        <View style={{ position: "absolute", bottom: 0, right: 0, opacity: 0.5 }}>
          <Sparkline data={sparkData} width={90} height={36} color={color} fill />
        </View>
      )}
      <View style={{ flexDirection: "row", alignItems: "center", gap: Space.sm, marginBottom: Space.sm }}>
        {icon}
        <Text style={{ ...Type.micro, color: c.textDim, flex: 1 }} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={{ fontSize: 24, fontWeight: "900", color, letterSpacing: -0.5 }}>{value}</Text>
      {subtitle ? (
        <Text style={{ ...Type.micro, color: c.textDim, marginTop: 2 }}>{subtitle}</Text>
      ) : null}
    </Pressable>
  );
}
