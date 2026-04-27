// AdvisorEngine — ported from Swift
// Structured actionable insight cards with evidence, actions, and quantified impact.

import { fmtCurrency } from "../formatters";
import {
  computeGCI,
  getAgentPct,
  type Transaction,
  type PipelineDeal,
  type SplitPreset,
} from "../types/database";
import {
  seasonalFractionElapsed,
  paceVsGoalPercent,
  dailyPaceRequired,
  daysRemaining,
  parseTxDate,
} from "./projection-engine";
import { NATIONAL_MEDIAN_GCI, NATIONAL_MEDIAN_TRANSACTIONS } from "./benchmark-engine";

// ── Advisor Card Model ──────────────────────────────────────────────────────

export type AdvisorCategory =
  | "splitOptimization"
  | "expenseBenchmark"
  | "pipelineHealth"
  | "paceCorrection"
  | "survivalWarning"
  | "marketTiming"
  | "dealSizeAnalysis"
  | "diversification"
  | "benchmarkGap"
  | "capStrategy";

export const ADVISOR_CATEGORY_LABELS: Record<AdvisorCategory, string> = {
  splitOptimization: "Split Optimization",
  expenseBenchmark: "Expense Benchmark",
  pipelineHealth: "Pipeline Health",
  paceCorrection: "Pace Correction",
  survivalWarning: "Survival Warning",
  marketTiming: "Market Timing",
  dealSizeAnalysis: "Deal Size",
  diversification: "Diversification",
  benchmarkGap: "Benchmark Gap",
  capStrategy: "Cap Strategy",
};

export interface AdvisorCard {
  id: string;
  category: AdvisorCategory;
  icon: string;
  title: string;
  evidence: string[];
  action: string;
  estimatedImpact: string;
  impactValue: number;
  priority: number;
}

// ── Input context ───────────────────────────────────────────────────────────

export interface AdvisorInput {
  transactions: Transaction[];
  pipelineDeals: PipelineDeal[];
  goalGCI: number;
  splitPreset: SplitPreset;
  seasonalWeights: number[];
  expensesYTD: number;
  monthlyRecurringExpenses: number;
  projectedYearEndGCI: number;
  marketYoYGrowth: number; // decimal, e.g. 0.08
  benchmarkPercentile: number;
  survivalMonths: number;
  capIsConfigured: boolean;
  hasHitCap: boolean;
  gciRemainingToCap: number;
  postCapAgentPct: number;
}

// ── Engine ───────────────────────────────────────────────────────────────────

let _cardCounter = 0;
function nextId(): string {
  return `advisor-${++_cardCounter}`;
}

export function generateAdvisory(input: AdvisorInput, limit: number = 5): AdvisorCard[] {
  _cardCounter = 0; // Reset per call — prevents unbounded growth & SSR hydration mismatches
  const cards: AdvisorCard[] = [];

  const currentYear = new Date().getFullYear();
  const closedTx = input.transactions.filter(
    (tx) => tx.status === "closed" && parseTxDate(tx.date).getFullYear() === currentYear,
  );
  const ytdGCI = closedTx.reduce((sum, tx) => sum + computeGCI(tx), 0);
  const fraction = seasonalFractionElapsed(input.seasonalWeights);

  // 1. Split Optimization
  const agentPct = getAgentPct(input.splitPreset);
  if (agentPct > 0 && agentPct < 0.85 && ytdGCI > 50_000) {
    const potentialGain = ytdGCI * (0.85 - agentPct);
    cards.push({
      id: nextId(), category: "splitOptimization", icon: "arrow-left-right",
      title: "Negotiate Your Split",
      evidence: [
        `Current split: ${Math.round(agentPct * 100)}/${Math.round((1 - agentPct) * 100)}`,
        `Your production (${fmtCurrency(ytdGCI)} YTD) typically commands 80–90%`,
      ],
      action: "Prepare a production summary for your next brokerage review meeting.",
      estimatedImpact: `+${fmtCurrency(potentialGain)}/yr`,
      impactValue: potentialGain, priority: 85,
    });
  }

  // 2. Expense Benchmarking
  if (ytdGCI > 0 && input.projectedYearEndGCI > 0) {
    // expensesYTD already includes elapsed months of recurring costs,
    // so only add the remaining months to avoid double-counting.
    const currentMonth = new Date().getMonth(); // 0-indexed (Jan=0)
    const remainingMonths = 12 - (currentMonth + 1);
    const annualExpenses = input.expensesYTD + input.monthlyRecurringExpenses * remainingMonths;
    const ratio = annualExpenses / input.projectedYearEndGCI;
    if (ratio > 0.3) {
      const targetExpenses = input.projectedYearEndGCI * 0.25;
      const savings = Math.max(0, annualExpenses - targetExpenses);
      cards.push({
        id: nextId(), category: "expenseBenchmark", icon: "scissors",
        title: "Trim Expenses to Benchmark",
        evidence: [
          `Expense ratio: ${Math.round(ratio * 100)}% of projected GCI`,
          "Industry benchmark: 25–30%",
        ],
        action: "Review your largest expense categories for items to reduce or eliminate.",
        estimatedImpact: `+${fmtCurrency(savings)}/yr net`,
        impactValue: savings, priority: 75,
      });
    }
  }

  // 3. Pipeline Health
  if (input.pipelineDeals.length === 0 && ytdGCI > 10_000) {
    const monthlyPace = fraction > 0 ? ytdGCI / (fraction * 12) : 0;
    cards.push({
      id: nextId(), category: "pipelineHealth", icon: "layers",
      title: "Build Your Pipeline",
      evidence: [
        "No active pipeline deals tracked",
        `Monthly GCI pace: ${fmtCurrency(monthlyPace)}`,
      ],
      action: "Add your active leads and listings to the Pipeline tab for better forecasting.",
      estimatedImpact: "Better accuracy",
      impactValue: monthlyPace * 0.5, priority: 60,
    });
  }

  // 4. Pace Correction
  if (input.goalGCI > 0 && ytdGCI > 0 && fraction > 0.15) {
    const paceVsGoal = paceVsGoalPercent(input.goalGCI, ytdGCI, fraction);
    if (paceVsGoal < -10) {
      const gciGap = input.goalGCI * fraction - ytdGCI;
      const daysLeft = daysRemaining();
      const dailyNeeded = dailyPaceRequired(input.goalGCI, ytdGCI, daysLeft);
      cards.push({
        id: nextId(), category: "paceCorrection", icon: "gauge",
        title: "Close the Pace Gap",
        evidence: [
          `${Math.round(Math.abs(paceVsGoal))}% behind goal pace`,
          `GCI gap: ${fmtCurrency(gciGap)}`,
          `Need ${fmtCurrency(dailyNeeded)}/day for remaining ${daysLeft} days`,
        ],
        action: "Focus on your highest-probability pipeline deals and consider a targeted prospecting push.",
        estimatedImpact: `+${fmtCurrency(gciGap)}`,
        impactValue: gciGap, priority: 90,
      });
    }
  }

  // 5. Survival Warning
  if (input.survivalMonths >= 0 && input.survivalMonths < 3) {
    cards.push({
      id: nextId(), category: "survivalWarning", icon: "alert-triangle",
      title: "Low Cash Runway",
      evidence: [
        `Current runway: ${input.survivalMonths.toFixed(1)} months`,
        "Recommended minimum: 3–6 months of fixed costs",
      ],
      action: "Reduce discretionary spending and prioritize deals closest to closing.",
      estimatedImpact: "Risk reduction",
      impactValue: 50_000, priority: 95,
    });
  }

  // 6. Market Timing — ±2% dead-zone to avoid noise from flat markets
  if (Math.abs(input.marketYoYGrowth) > 0.02) {
    const direction = input.marketYoYGrowth > 0 ? "growing" : "contracting";
    cards.push({
      id: nextId(), category: "marketTiming", icon: "trending-up",
      title: `Market Trend: ${direction.charAt(0).toUpperCase() + direction.slice(1)}`,
      evidence: [
        `Market YoY change: ${input.marketYoYGrowth > 0 ? "+" : ""}${Math.round(input.marketYoYGrowth * 100)}%`,
      ],
      action: input.marketYoYGrowth > 0
        ? "Consider taking on more listings while demand is high."
        : "Focus on buyer representation and price-competitive listings.",
      estimatedImpact: "Strategic",
      impactValue: Math.abs(input.marketYoYGrowth) * 100_000, priority: 50,
    });
  }

  // 7. Deal Size Analysis — only show when agent is below national median per-deal
  if (closedTx.length > 0) {
    const avgGCI = ytdGCI / closedTx.length;
    const nationalAvgPerDeal = NATIONAL_MEDIAN_GCI / NATIONAL_MEDIAN_TRANSACTIONS;
    if (avgGCI > 0 && avgGCI < nationalAvgPerDeal) {
      const targetIncrease = avgGCI * 0.15;
      cards.push({
        id: nextId(), category: "dealSizeAnalysis", icon: "arrow-up-square",
        title: "Increase Average Deal Size",
        evidence: [
          `Current avg GCI: ${fmtCurrency(avgGCI)}/deal`,
          `National median: ${fmtCurrency(nationalAvgPerDeal)}/deal`,
        ],
        action: "Target properties 15–20% above your current average price point.",
        estimatedImpact: `+${fmtCurrency(targetIncrease)}/deal`,
        impactValue: targetIncrease * 8, priority: 55,
      });
    }
  }

  // 8. Diversification
  const allClosed = input.transactions.filter((tx) => tx.status === "closed");
  if (allClosed.length >= 5) {
    const buyers = allClosed.filter((tx) => tx.side === "buyer").length;
    const sellers = allClosed.filter((tx) => tx.side === "seller").length;
    const total = buyers + sellers;
    if (total > 0) {
      const buyerPct = buyers / total;
      if (buyerPct > 0.8 || buyerPct < 0.2) {
        const heavy = buyerPct > 0.8 ? "buyer" : "seller";
        const light = buyerPct > 0.8 ? "listing" : "buyer";
        cards.push({
          id: nextId(), category: "diversification", icon: "git-branch",
          title: "Diversify Deal Mix",
          evidence: [
            `${Math.round(Math.max(buyerPct, 1 - buyerPct) * 100)}% of deals are ${heavy}-side`,
            "Balanced mix reduces seasonal risk",
          ],
          action: `Invest in ${light}-side marketing and referral networks.`,
          estimatedImpact: "Risk reduction",
          impactValue: 15_000, priority: 45,
        });
      }
    }
  }

  // 9. Benchmark Gap
  if (input.benchmarkPercentile < 50 && ytdGCI > 0) {
    const targetGCI = NATIONAL_MEDIAN_GCI;
    const gap = Math.max(0, targetGCI - (input.goalGCI > 0 ? input.goalGCI : ytdGCI * 2));
    if (gap > 0) {
      cards.push({
        id: nextId(), category: "benchmarkGap", icon: "bar-chart-2",
        title: "Close the Benchmark Gap",
        evidence: [
          `You're in the ${input.benchmarkPercentile}th percentile vs established agents`,
          `Median agent GCI: ${fmtCurrency(targetGCI)}`,
        ],
        action: "Set a stretch goal above the established-agent median and review your prospecting strategy.",
        estimatedImpact: `+${fmtCurrency(gap)}/yr`,
        impactValue: gap, priority: 65,
      });
    }
  }

  // 10. Cap Strategy
  if (input.capIsConfigured && !input.hasHitCap) {
    const remaining = input.gciRemainingToCap;
    const prePct = getAgentPct(input.splitPreset);
    if (remaining > 0 && remaining < 30_000 && input.postCapAgentPct > prePct) {
      const annualBenefit = remaining * (input.postCapAgentPct - prePct);
      cards.push({
        id: nextId(), category: "capStrategy", icon: "flag",
        title: "Sprint to Commission Cap",
        evidence: [
          `${fmtCurrency(remaining)} away from cap`,
          `Post-cap split: ${Math.round(input.postCapAgentPct * 100)}% vs current ${Math.round(prePct * 100)}%`,
        ],
        action: "Prioritize closing your highest-GCI pipeline deals to hit cap sooner.",
        estimatedImpact: `+${fmtCurrency(annualBenefit)}`,
        impactValue: annualBenefit, priority: 80,
      });
    }
  }

  return cards
    .sort((a, b) => b.impactValue - a.impactValue)
    .slice(0, limit);
}
