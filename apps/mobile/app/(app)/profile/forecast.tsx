/**
 * Income Forecast Screen
 * Shows YTD GCI pace, projected year-end GCI, goal progress, and pipeline contribution.
 */

import { useMemo } from "react";
import { View, Text, ScrollView, type DimensionValue } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  TrendingUp,
  Target,
  Wallet,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  Zap,
} from "lucide-react-native";
import { useDataStore } from "@/stores/data-store";
import { PIPELINE_STAGE_DEFAULTS } from "@agent-runway/core/types/database";
import { useT } from "@/lib/useT";
import {
  useColors,
  useTheme,
  gradients,
  shadows,
  Space,
  Radius,
  Type,
  fmtCurrency,
  dayOfYear,
} from "@/lib/theme";

const daysInYear = (y: number) => ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 366 : 365;

export default function ForecastScreen() {
  const c = useColors();
  const { mode } = useTheme();
  const g = gradients(mode);
  const sh = shadows(mode);
  const { t } = useT("profile");

  const store = useDataStore();
  const settings = store.settings;
  const ytdGci = store.ytdGci();
  const ytdDeals = store.ytdDealCount();
  const goalGci = settings?.goal_gci ?? 0;
  const goalTx = settings?.goal_transactions ?? 0;

  const forecast = useMemo(() => {
    const doy = dayOfYear();
    const totalDays = daysInYear(new Date().getFullYear());
    const fractionElapsed = Math.max(doy / totalDays, 0.01);
    const daysRemaining = totalDays - doy;

    // Pace-based projection: annualize current rate
    const projectedGci = ytdGci / fractionElapsed;
    const projectedDeals = ytdDeals / fractionElapsed;

    // Pipeline contribution (weighted)
    const pipelineWeighted = store.pipeline.reduce((sum, d) => {
      const prob = d.probability_override ??
        (PIPELINE_STAGE_DEFAULTS[d.stage as keyof typeof PIPELINE_STAGE_DEFAULTS] ?? 0.5);
      return sum + d.estimated_price * d.estimated_commission_pct * prob;
    }, 0);

    // Conservative projection: current + weighted pipeline
    const conservativeGci = ytdGci + pipelineWeighted;

    // Gap analysis
    const gciGap = goalGci > 0 ? goalGci - ytdGci : 0;
    const txGap = goalTx > 0 ? goalTx - ytdDeals : 0;
    const onTrackGci = goalGci > 0 ? projectedGci >= goalGci : true;
    const onTrackTx = goalTx > 0 ? projectedDeals >= goalTx : true;

    // Monthly rate needed to hit goal
    const monthsRemaining = daysRemaining / 30;
    const monthlyGciNeeded = gciGap > 0 && monthsRemaining > 0 ? gciGap / monthsRemaining : 0;
    const monthlyDealsNeeded = txGap > 0 && monthsRemaining > 0 ? txGap / monthsRemaining : 0;

    // Current monthly averages
    const monthsElapsed = Math.max(doy / 30, 0.5);
    const avgMonthlyGci = ytdGci / monthsElapsed;
    const avgMonthlyDeals = ytdDeals / monthsElapsed;

    return {
      projectedGci: Math.round(projectedGci),
      projectedDeals: Math.round(projectedDeals),
      conservativeGci: Math.round(conservativeGci),
      pipelineWeighted: Math.round(pipelineWeighted),
      gciGap: Math.round(gciGap),
      txGap: Math.round(txGap),
      onTrackGci,
      onTrackTx,
      monthlyGciNeeded: Math.round(monthlyGciNeeded),
      monthlyDealsNeeded: Math.round(monthlyDealsNeeded * 10) / 10,
      avgMonthlyGci: Math.round(avgMonthlyGci),
      avgMonthlyDeals: Math.round(avgMonthlyDeals * 10) / 10,
      fractionElapsed,
      daysRemaining,
    };
  }, [ytdGci, ytdDeals, goalGci, goalTx, store.pipeline]);

  const goalPct = goalGci > 0 ? Math.min(Math.round((ytdGci / goalGci) * 100), 100) : 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: Space.xl, paddingBottom: 100, paddingTop: Space.md }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Projection Hero Card ── */}
        <View style={[{ borderRadius: Radius.xl, overflow: "hidden", marginBottom: Space.xxl }, sh.cardLg]}>
          <LinearGradient colors={g.heroCard as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: Space.xxl }}>
            <Text style={{ ...Type.label, color: c.textMuted, marginBottom: Space.sm }}>{t("forecast.projectedYearEndGci")}</Text>
            <Text style={{ fontSize: 36, fontWeight: "800", color: forecast.onTrackGci ? c.success : c.warning, letterSpacing: -1 }}>
              {fmtCurrency(forecast.projectedGci)}
            </Text>
            <Text style={{ ...Type.caption, color: c.textDim, marginTop: Space.sm }}>
              {t("forecast.basedOnPace", { amount: fmtCurrency(forecast.avgMonthlyGci) })}
            </Text>

            {/* Mini goal progress */}
            {goalGci > 0 && (
              <View style={{ marginTop: Space.xl }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Space.sm }}>
                  <Text style={{ ...Type.caption, color: c.textSecondary }}>{t("forecast.earned", { amount: fmtCurrency(ytdGci) })}</Text>
                  <Text style={{ ...Type.caption, color: c.textSecondary, fontWeight: "700" }}>{t("forecast.percentOfGoal", { percent: goalPct, goal: fmtCurrency(goalGci) })}</Text>
                </View>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: "rgba(128,128,128,0.15)", overflow: "hidden" }}>
                  <LinearGradient
                    colors={goalPct >= 100 ? (g.successBar as [string, string, ...string[]]) : (g.progressBar as [string, string, ...string[]])}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={{ height: 8, borderRadius: 4, width: `${Math.min(goalPct, 100)}%` as any }}
                  />
                </View>
              </View>
            )}
          </LinearGradient>
        </View>

        {/* ── Status Cards ── */}
        <View style={{ flexDirection: "row", gap: Space.md, marginBottom: Space.xxl }}>
          <StatusCard
            icon={forecast.onTrackGci ? <CheckCircle2 size={18} color={c.success} /> : <AlertTriangle size={18} color={c.warning} />}
            label={t("forecast.gciPace")}
            value={forecast.onTrackGci ? t("forecast.onTrack") : t("forecast.behind")}
            color={forecast.onTrackGci ? c.success : c.warning}
            c={c} sh={sh}
          />
          <StatusCard
            icon={forecast.onTrackTx ? <CheckCircle2 size={18} color={c.success} /> : <AlertTriangle size={18} color={c.warning} />}
            label={t("forecast.dealPace")}
            value={forecast.onTrackTx ? t("forecast.onTrack") : t("forecast.behind")}
            color={forecast.onTrackTx ? c.success : c.warning}
            c={c} sh={sh}
          />
        </View>

        {/* ── Key Numbers ── */}
        <Text style={{ ...Type.label, color: c.textMuted, marginBottom: Space.md }}>{t("forecast.keyNumbers")}</Text>
        <View style={[{ backgroundColor: c.card, borderRadius: Radius.xl, borderWidth: 1, borderColor: c.cardBorder, overflow: "hidden" }, sh.card]}>
          <NumberRow icon={<TrendingUp size={18} color={c.primary} />} iconBg={c.primaryDim} label={t("forecast.projectedYearEnd")} value={fmtCurrency(forecast.projectedGci)} c={c} />
          <View style={{ height: 1, backgroundColor: c.cardBorder, marginLeft: 56 }} />
          <NumberRow icon={<Wallet size={18} color={c.success} />} iconBg={c.successDim} label={t("forecast.conservativePipeline")} value={fmtCurrency(forecast.conservativeGci)} c={c} />
          <View style={{ height: 1, backgroundColor: c.cardBorder, marginLeft: 56 }} />
          <NumberRow icon={<BarChart3 size={18} color={c.cyan} />} iconBg={c.cyanDim} label={t("forecast.weightedPipelineGci")} value={fmtCurrency(forecast.pipelineWeighted)} c={c} />
          <View style={{ height: 1, backgroundColor: c.cardBorder, marginLeft: 56 }} />
          <NumberRow icon={<Target size={18} color={c.warning} />} iconBg={c.warningDim} label={t("forecast.remainingToGoal")} value={forecast.gciGap > 0 ? fmtCurrency(forecast.gciGap) : t("forecast.goalMet")} c={c} />
        </View>

        {/* ── Monthly Pace ── */}
        {goalGci > 0 && forecast.gciGap > 0 && (
          <>
            <Text style={{ ...Type.label, color: c.textMuted, marginTop: Space.section, marginBottom: Space.md }}>{t("forecast.monthlyPaceRequired")}</Text>
            <View style={[{ backgroundColor: c.card, borderRadius: Radius.xl, borderWidth: 1, borderColor: c.cardBorder, padding: Space.xl }, sh.card]}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: Space.lg }}>
                <PaceColumn
                  label={t("forecast.currentAvg")}
                  gci={fmtCurrency(forecast.avgMonthlyGci)}
                  deals={t("forecast.deals", { count: forecast.avgMonthlyDeals })}
                  color={c.textSecondary}
                  c={c}
                />
                <View style={{ width: 1, backgroundColor: c.cardBorder }} />
                <PaceColumn
                  label={t("forecast.needed")}
                  gci={fmtCurrency(forecast.monthlyGciNeeded)}
                  deals={t("forecast.deals", { count: forecast.monthlyDealsNeeded })}
                  color={forecast.monthlyGciNeeded > forecast.avgMonthlyGci ? c.warning : c.success}
                  c={c}
                />
              </View>

              {forecast.monthlyGciNeeded > forecast.avgMonthlyGci && (
                <View style={{ backgroundColor: c.warningDim, borderRadius: Radius.md, padding: Space.md, flexDirection: "row", alignItems: "center", gap: Space.sm }}>
                  <Zap size={14} color={c.warning} />
                  <Text style={{ ...Type.caption, color: c.warning, flex: 1 }}>
                    {t("forecast.increaseWarning", { amount: fmtCurrency(forecast.monthlyGciNeeded - forecast.avgMonthlyGci) })}
                  </Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* ── Quick Stats ── */}
        <Text style={{ ...Type.label, color: c.textMuted, marginTop: Space.section, marginBottom: Space.md }}>{t("forecast.thisYearSoFar")}</Text>
        <View style={{ flexDirection: "row", gap: Space.md }}>
          <QuickStat label={t("forecast.dealsClosed")} value={String(ytdDeals)} color={c.primary} c={c} sh={sh} />
          <QuickStat label={t("forecast.daysLeft")} value={String(forecast.daysRemaining)} color={c.cyan} c={c} sh={sh} />
          <QuickStat label={t("forecast.pipelineDeals")} value={String(store.pipeline.length)} color={c.purple} c={c} sh={sh} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatusCard({ icon, label, value, color, c, sh }: any) {
  return (
    <View style={[{ flex: 1, backgroundColor: c.card, borderRadius: Radius.xl, borderWidth: 1, borderColor: c.cardBorder, padding: Space.lg, alignItems: "center", gap: Space.sm }, sh.card]}>
      {icon}
      <Text style={{ ...Type.bodyBold, color }}>{value}</Text>
      <Text style={{ ...Type.micro, color: c.textDim }}>{label}</Text>
    </View>
  );
}

function NumberRow({ icon, iconBg, label, value, c }: any) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", padding: Space.lg, gap: Space.md }}>
      <View style={{ width: 36, height: 36, borderRadius: Radius.md, backgroundColor: iconBg, alignItems: "center", justifyContent: "center" }}>
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ ...Type.caption, color: c.textDim }}>{label}</Text>
      </View>
      <Text style={{ ...Type.bodyBold, color: c.text }}>{value}</Text>
    </View>
  );
}

function PaceColumn({ label, gci, deals, color, c }: any) {
  return (
    <View style={{ flex: 1, alignItems: "center", gap: Space.xs }}>
      <Text style={{ ...Type.label, color: c.textDim }}>{label}</Text>
      <Text style={{ ...Type.h2, color }}>{gci}</Text>
      <Text style={{ ...Type.micro, color: c.textDim }}>{deals}</Text>
    </View>
  );
}

function QuickStat({ label, value, color, c, sh }: any) {
  return (
    <View style={[{ flex: 1, backgroundColor: c.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: c.cardBorder, padding: Space.md, alignItems: "center" }, sh.card]}>
      <Text style={{ fontSize: 24, fontWeight: "800", color, letterSpacing: -0.5 }}>{value}</Text>
      <Text style={{ ...Type.micro, color: c.textDim, marginTop: Space.xs }}>{label}</Text>
    </View>
  );
}
