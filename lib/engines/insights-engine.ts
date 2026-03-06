// InsightsEngine — ported from Swift
// Contextual intelligence: tips, praise, warnings based on real-time data.

import { fmtCurrency } from "@/lib/formatters";
import {
  computeGCI,
  computeWeightedGCI,
  type Transaction,
  type PipelineDeal,
} from "@/lib/types/database";
import {
  seasonalFractionElapsed,
  paceVsGoalPercent,
  dailyPaceRequired,
  daysRemaining,
  dayOfYear,
  trendDirection,
} from "./projection-engine";

// ── Insight Model ───────────────────────────────────────────────────────────

export type InsightType = "praise" | "tip" | "warning" | "info";

export interface Insight {
  id: string;
  type: InsightType;
  icon: string;
  title: string;
  message: string;
  priority: number;
}

// ── Input context ───────────────────────────────────────────────────────────

export interface InsightsInput {
  transactions: Transaction[];
  pipelineDeals: PipelineDeal[];
  goalGCI: number;
  seasonalWeights: number[];
  expensesYTD: number;
  monthlyRecurringExpenses: number;
  capIsConfigured: boolean;
  hasHitCap: boolean;
  gciRemainingToCap: number;
  postCapAgentPct: number;
  estimatedCapMonth: string | null;
  forecastReadiness: number; // 0.0–1.0
}

// ── Engine ───────────────────────────────────────────────────────────────────

let insightCounter = 0;
function nextId(): string {
  return `insight-${++insightCounter}`;
}

export function generateInsights(input: InsightsInput, limit: number = 5): Insight[] {
  const insights: Insight[] = [];

  const currentYear = new Date().getFullYear();
  const closedTx = input.transactions.filter(
    (tx) => tx.status === "closed" && new Date(tx.date).getFullYear() === currentYear,
  );
  const hasTransactions = closedTx.length > 0;
  const ytdGCI = closedTx.reduce((sum, tx) => sum + computeGCI(tx), 0);

  const fraction = seasonalFractionElapsed(input.seasonalWeights);
  const elapsed = dayOfYear();
  const remaining = daysRemaining();

  // ── Pace Analysis ──
  if (input.goalGCI > 0 && ytdGCI > 0) {
    const pacePercent = paceVsGoalPercent(input.goalGCI, ytdGCI, fraction);

    if (pacePercent > 15) {
      insights.push({
        id: nextId(), type: "praise", icon: "gauge",
        title: "Ahead of Pace",
        message: `You're ${Math.round(pacePercent)}% ahead of where you need to be for your ${fmtCurrency(input.goalGCI)} goal.`,
        priority: 90,
      });
    } else if (pacePercent > 0) {
      insights.push({
        id: nextId(), type: "praise", icon: "check-circle",
        title: "On Track",
        message: `You're ${Math.round(pacePercent)}% ahead of goal pace. Steady as she goes.`,
        priority: 70,
      });
    } else if (pacePercent > -15) {
      insights.push({
        id: nextId(), type: "tip", icon: "arrow-up-right",
        title: "Slightly Behind Pace",
        message: `You're ${Math.round(Math.abs(pacePercent))}% behind goal pace. ${remaining} days left to close the gap.`,
        priority: 80,
      });
    } else {
      const dailyNeeded = dailyPaceRequired(input.goalGCI, ytdGCI, remaining);
      insights.push({
        id: nextId(), type: "warning", icon: "alert-triangle",
        title: "Behind Pace",
        message: `You need ${fmtCurrency(dailyNeeded)}/day to reach your goal. Consider adjusting your target or ramping up activity.`,
        priority: 95,
      });
    }
  }

  // ── Average Deal Size ──
  if (hasTransactions) {
    const avgGCI = ytdGCI / closedTx.length;
    if (avgGCI > 0) {
      insights.push({
        id: nextId(), type: "info", icon: "bar-chart",
        title: "Average Deal",
        message: `Your average closed deal earns ${fmtCurrency(avgGCI)} in GCI.`,
        priority: 40,
      });
    }
  }

  // ── Pipeline Insights ──
  if (input.pipelineDeals.length > 0) {
    const firmDeals = input.pipelineDeals.filter(
      (d) => d.stage === "firm" || d.stage === "conditional",
    );
    if (firmDeals.length > 0) {
      const firmGCI = firmDeals.reduce(
        (sum, d) => sum + d.estimated_price * d.estimated_commission_pct,
        0,
      );
      insights.push({
        id: nextId(), type: "tip", icon: "arrow-right-circle",
        title: `${firmDeals.length} Deal${firmDeals.length === 1 ? "" : "s"} Near Close`,
        message: `${fmtCurrency(firmGCI)} in GCI from firm/conditional deals. Follow up to keep them on track.`,
        priority: 75,
      });
    }

    const pipelineWeighted = input.pipelineDeals.reduce(
      (sum, d) => sum + computeWeightedGCI(d),
      0,
    );
    if (pipelineWeighted > 0) {
      insights.push({
        id: nextId(), type: "info", icon: "layers",
        title: "Pipeline Value",
        message: `${fmtCurrency(pipelineWeighted)} in weighted pipeline GCI across ${input.pipelineDeals.length} deal${input.pipelineDeals.length === 1 ? "" : "s"}.`,
        priority: 45,
      });
    }
  }

  // ── Expense Ratio ──
  if (ytdGCI > 0) {
    const totalExpenses =
      input.expensesYTD + (input.monthlyRecurringExpenses * elapsed) / 365 * 12;
    if (totalExpenses > 0) {
      const ratio = totalExpenses / ytdGCI;
      if (ratio > 0.5) {
        insights.push({
          id: nextId(), type: "warning", icon: "alert-circle",
          title: "High Expense Ratio",
          message: `Expenses are ${Math.round(ratio * 100)}% of your GCI. Review your spending categories for optimization opportunities.`,
          priority: 70,
        });
      } else if (ratio > 0.35) {
        insights.push({
          id: nextId(), type: "tip", icon: "dollar-sign",
          title: "Expense Check",
          message: `Expenses are ${Math.round(ratio * 100)}% of GCI. Industry average is 25-35%.`,
          priority: 35,
        });
      }
    }
  }

  // ── Trend Detection ──
  if (hasTransactions) {
    const trend = trendDirection(input.transactions);
    if (trend === "up") {
      insights.push({
        id: nextId(), type: "praise", icon: "trending-up",
        title: "Momentum Building",
        message: "Your recent months show an upward trend in GCI. Keep the momentum going.",
        priority: 55,
      });
    } else if (trend === "down") {
      insights.push({
        id: nextId(), type: "tip", icon: "trending-down",
        title: "Activity Declining",
        message: "Your recent months show a downward trend. This may be seasonal — check your pipeline.",
        priority: 60,
      });
    }
  }

  // ── Commission Cap Intelligence ──
  if (input.capIsConfigured) {
    if (input.hasHitCap) {
      insights.push({
        id: nextId(), type: "praise", icon: "star",
        title: "Commission Cap Reached",
        message: `You've hit your cap threshold. Every additional dollar now earns at ${Math.round(input.postCapAgentPct * 100)}% — your highest earning rate of the year.`,
        priority: 96,
      });
    } else if (input.gciRemainingToCap > 0 && input.gciRemainingToCap < 20_000) {
      const monthText = input.estimatedCapMonth ? ` — est. ${input.estimatedCapMonth}` : "";
      insights.push({
        id: nextId(), type: "tip", icon: "flag",
        title: "Cap Within Reach",
        message: `${fmtCurrency(input.gciRemainingToCap)} away from your commission cap${monthText}. Prioritize closings to flip to your higher split.`,
        priority: 88,
      });
    }
  }

  // ── Forecast Setup Nudge ──
  if (input.forecastReadiness < 0.5 && ytdGCI > 0) {
    insights.push({
      id: nextId(), type: "tip", icon: "sliders",
      title: "Complete Your Forecast",
      message: "Add GCI/transaction goals and a growth plan in the Forecast tab to unlock multi-year projections and a stronger health score.",
      priority: 43,
    });
  }

  // ── Empty State Prompts ──
  if (ytdGCI <= 0 && !hasTransactions) {
    insights.push({
      id: nextId(), type: "tip", icon: "plus-circle",
      title: "Get Started",
      message: "Log your first deal or enter YTD production to unlock projections and insights.",
      priority: 100,
    });
  } else if (input.goalGCI <= 0) {
    insights.push({
      id: nextId(), type: "tip", icon: "target",
      title: "Set a Goal",
      message: "Add a GCI goal in the Forecast tab to unlock pace analysis and progress tracking.",
      priority: 85,
    });
  }

  // Sort by priority (highest first) and limit
  return insights
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit);
}
