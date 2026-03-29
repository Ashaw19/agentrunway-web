/**
 * ScoreBreakdownSheet — Tap the Runway Score to see the 6-component breakdown.
 * Each component shows its weight, individual score, and one-line improvement tip.
 */

import { View, Text } from "react-native";
import {
  TrendingUp,
  Briefcase,
  Receipt,
  Settings,
  BarChart3,
  Shield,
} from "lucide-react-native";
import { Sheet } from "@/components/ui";
import { useColors, Space, Radius, Type, fmtCurrency } from "@/lib/theme";
import { useDataStore } from "@/stores/data-store";

interface ScoreComponent {
  key: string;
  label: string;
  weight: number;
  icon: typeof TrendingUp;
  color: string;
  score: number;
  tip: string;
}

function computeComponents(): ScoreComponent[] {
  const state = useDataStore.getState();
  const settings = state.settings;
  const ytdGCI = state.ytdGci();
  const goalGCI = settings?.goal_gci ?? 0;
  const now = new Date();
  const dayOfYear = Math.floor(
    (Date.now() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000
  );
  const fraction = Math.max(dayOfYear / 365, 0.01);

  // 1. Pace
  let paceScore = 50;
  let paceTip = "Set a GCI goal to track your pace";
  if (goalGCI > 0 && fraction > 0) {
    const expected = goalGCI * fraction;
    const paceVsGoal =
      expected > 0 ? ((ytdGCI - expected) / expected) * 100 : 0;
    const raw = (paceVsGoal + 50) / 100;
    paceScore = Math.round(Math.min(1, Math.max(0, raw)) * 100);
    if (paceScore >= 70) paceTip = "You're ahead of your annual goal pace";
    else if (paceScore >= 40)
      paceTip = "Close to target — a few more deals will put you ahead";
    else
      paceTip = `You need ${fmtCurrency(Math.max(0, expected - ytdGCI))} more to be on pace`;
  }

  // 2. Pipeline
  let pipelineScore = 65;
  let pipelineTip = "Add pipeline deals to improve coverage";
  const remaining = Math.max(0, goalGCI - ytdGCI);
  const pipelineWeightedGCI = state.pipeline.reduce((sum, d) => {
    const prob =
      d.probability_override ??
      ({ lead: 0.1, showing: 0.25, offer: 0.5, conditional: 0.75, firm: 0.9 }[
        d.stage
      ] ?? 0.5);
    return sum + d.estimated_price * d.estimated_commission_pct * prob;
  }, 0);
  if (remaining > 0 && pipelineWeightedGCI > 0) {
    pipelineScore = Math.min(
      100,
      Math.round((pipelineWeightedGCI / remaining) * 100)
    );
    const coverage = (pipelineWeightedGCI / remaining).toFixed(1);
    if (pipelineScore >= 70)
      pipelineTip = `${coverage}x coverage — strong pipeline`;
    else pipelineTip = `${coverage}x coverage — aim for 1.5x or higher`;
  } else if (goalGCI > 0 && ytdGCI >= goalGCI) {
    pipelineScore = 90;
    pipelineTip = "Goal already met — pipeline is bonus";
  }

  // 3. Expenses
  let expenseScore = 80;
  let expenseTip = "Log expenses to get accurate tracking";
  if (ytdGCI > 0) {
    const expensesYTD = state.receipts.reduce(
      (sum, r) => sum + (r.total_amount ?? 0),
      0
    );
    const ratio = expensesYTD / ytdGCI;
    if (ratio > 0.5) {
      expenseScore = 30;
      expenseTip = "Expenses over 50% of GCI — review spending";
    } else if (ratio > 0.35) {
      expenseScore = 55;
      expenseTip = "Expense ratio is high — look for savings";
    } else if (ratio > 0.25) {
      expenseScore = 75;
      expenseTip = "Expense ratio is reasonable";
    } else {
      expenseScore = 90;
      expenseTip = "Excellent expense control";
    }
  }

  // 4. Setup/Readiness
  let readinessScore = 25;
  let readinessTip = "Complete your profile setup for better insights";
  if (settings) {
    let points = 0;
    if ((settings.goal_gci ?? 0) > 0) points += 30;
    if ((settings.goal_transactions ?? 0) > 0) points += 20;
    const growthRates = settings.growth_goal_year_pcts;
    if (growthRates && growthRates.some((r: number) => r > 0)) points += 25;
    if ((settings.cash_reserve ?? 0) > 0) points += 15;
    if (settings.experience_years != null) points += 10;
    readinessScore = points;
    if (readinessScore >= 80) readinessTip = "Profile fully configured";
    else if (readinessScore >= 50)
      readinessTip = "Add cash reserve and growth goals for full score";
    else readinessTip = "Set GCI goal and transaction target on web dashboard";
  }

  // 5. Benchmark
  const benchmarkScore = 50;
  const benchmarkTip = "Benchmark data updates monthly from CREA stats";

  // 6. Survival
  let survivalScore = 50;
  let survivalTip = "Add your cash reserve to calculate survival months";
  const cashReserve = settings?.cash_reserve ?? 0;
  const monthlyFee = settings?.monthly_brokerage_fee ?? 0;
  const monthlyExpenses =
    state.receipts.length > 0
      ? state.receipts.reduce((sum, r) => sum + (r.total_amount ?? 0), 0) /
        Math.max(fraction * 12, 1)
      : monthlyFee;
  if (cashReserve > 0 && monthlyExpenses > 0) {
    const months = cashReserve / monthlyExpenses;
    if (months >= 6) {
      survivalScore = 95;
      survivalTip = `${months.toFixed(0)} months runway — very healthy`;
    } else if (months >= 4) {
      survivalScore = 75;
      survivalTip = `${months.toFixed(0)} months runway — solid`;
    } else if (months >= 2) {
      survivalScore = 50;
      survivalTip = `${months.toFixed(0)} months runway — consider building reserves`;
    } else {
      survivalScore = 25;
      survivalTip = `${months.toFixed(1)} months runway — low buffer`;
    }
  }

  return [
    {
      key: "pace",
      label: "Goal Pace",
      weight: 30,
      icon: TrendingUp,
      color: "#3B5EF6",
      score: paceScore,
      tip: paceTip,
    },
    {
      key: "pipeline",
      label: "Pipeline",
      weight: 20,
      icon: Briefcase,
      color: "#8B5CF6",
      score: pipelineScore,
      tip: pipelineTip,
    },
    {
      key: "expenses",
      label: "Expenses",
      weight: 15,
      icon: Receipt,
      color: "#10B981",
      score: expenseScore,
      tip: expenseTip,
    },
    {
      key: "setup",
      label: "Setup",
      weight: 10,
      icon: Settings,
      color: "#F59E0B",
      score: readinessScore,
      tip: readinessTip,
    },
    {
      key: "benchmark",
      label: "Benchmark",
      weight: 10,
      icon: BarChart3,
      color: "#06B6D4",
      score: benchmarkScore,
      tip: benchmarkTip,
    },
    {
      key: "survival",
      label: "Survival",
      weight: 15,
      icon: Shield,
      color: "#8B5CF6",
      score: survivalScore,
      tip: survivalTip,
    },
  ];
}

function scoreColor(score: number): string {
  if (score >= 75) return "#10B981";
  if (score >= 50) return "#3B5EF6";
  if (score >= 30) return "#F59E0B";
  return "#EF4444";
}

export function ScoreBreakdownSheet({
  visible,
  onClose,
  totalScore,
}: {
  visible: boolean;
  onClose: () => void;
  totalScore: number;
}) {
  const c = useColors();
  const components = computeComponents();

  return (
    <Sheet visible={visible} onClose={onClose} title="Runway Score Breakdown">
      {/* Overall score summary */}
      <View
        style={{
          alignItems: "center",
          marginBottom: Space.xxl,
        }}
      >
        <Text
          style={{
            fontSize: 48,
            fontWeight: "800",
            color: scoreColor(totalScore),
            letterSpacing: -1,
          }}
        >
          {totalScore}
        </Text>
        <Text style={{ ...Type.caption, color: c.textDim }}>out of 100</Text>
      </View>

      {/* Component rows */}
      {components.map((comp, idx) => {
        const Icon = comp.icon;
        const barWidth = Math.max(comp.score, 3);
        return (
          <View key={comp.key}>
            {idx > 0 && (
              <View
                style={{
                  height: 1,
                  backgroundColor: c.divider,
                  marginVertical: Space.sm,
                }}
              />
            )}
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: Space.md,
                paddingVertical: Space.sm,
              }}
            >
              {/* Icon */}
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: Radius.md,
                  backgroundColor: comp.color + "15",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 2,
                }}
              >
                <Icon size={18} color={comp.color} />
              </View>

              {/* Content */}
              <View style={{ flex: 1 }}>
                {/* Label + weight + score */}
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: Space.sm,
                    }}
                  >
                    <Text style={{ ...Type.bodyBold, color: c.text }}>
                      {comp.label}
                    </Text>
                    <Text style={{ ...Type.micro, color: c.textDim }}>
                      {comp.weight}%
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "800",
                      color: scoreColor(comp.score),
                    }}
                  >
                    {comp.score}
                  </Text>
                </View>

                {/* Score bar */}
                <View
                  style={{
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: c.divider,
                    marginTop: Space.sm,
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      height: 4,
                      borderRadius: 2,
                      width: `${barWidth}%` as any,
                      backgroundColor: scoreColor(comp.score),
                    }}
                  />
                </View>

                {/* Tip */}
                <Text
                  style={{
                    ...Type.caption,
                    color: c.textDim,
                    marginTop: Space.xs,
                  }}
                >
                  {comp.tip}
                </Text>
              </View>
            </View>
          </View>
        );
      })}

      {/* Info */}
      <View
        style={{
          marginTop: Space.xl,
          backgroundColor: c.primaryDim,
          borderRadius: Radius.md,
          padding: Space.md,
          borderWidth: 1,
          borderColor: c.primaryBorder,
        }}
      >
        <Text
          style={{
            ...Type.caption,
            color: c.primaryLight,
            textAlign: "center",
          }}
        >
          Your Runway Score updates as you log deals, manage expenses, and grow
          your pipeline. Detailed analytics available on the web dashboard.
        </Text>
      </View>
    </Sheet>
  );
}
