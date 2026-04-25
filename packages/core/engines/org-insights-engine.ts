// ── Org Insights Engine ─────────────────────────────────────────────────────
// Generates brokerage-level coaching insights from aggregate agent data.
// Privacy-safe: only uses OrgAgentPerformance (Tier 1/2) — never Tier 3.
// ────────────────────────────────────────────────────────────────────────────

import type { OrgAgentPerformance, OrgInsight, OrgInsightSeverity } from "../types/organizations";
import { paceVsGoalPercent } from "./projection-engine";
import { NATIONAL_MEDIAN_GCI, NATIONAL_MEDIAN_TRANSACTIONS } from "./benchmark-engine";

// ── Input ───────────────────────────────────────────────────────────────────

export interface OrgInsightsInput {
  agents: OrgAgentPerformance[];
  orgGoalGci: number | null;
  seasonalFraction: number;
  anonymize: boolean;
}

// ── Helper ──────────────────────────────────────────────────────────────────

function makeInsight(
  id: number,
  severity: OrgInsightSeverity,
  title: string,
  message: string,
  priority: number,
  agentName?: string,
  agentId?: string,
): OrgInsight {
  return { id: `org-insight-${id}`, severity, title, message, priority, agentName, agentId };
}

function currentQuarterMonths(): number[] {
  const month = new Date().getMonth() + 1; // 1-12
  if (month <= 3) return [1, 2, 3];
  if (month <= 6) return [4, 5, 6];
  if (month <= 9) return [7, 8, 9];
  return [10, 11, 12];
}

function monthsElapsedInQuarter(): number {
  const month = new Date().getMonth() + 1;
  return ((month - 1) % 3) + 1;
}

// ── Main Generator ──────────────────────────────────────────────────────────

export function generateOrgInsights(
  input: OrgInsightsInput,
  limit: number = 10,
): OrgInsight[] {
  const { agents, orgGoalGci, seasonalFraction, anonymize } = input;
  const insights: OrgInsight[] = [];
  let counter = 0;

  const activeAgents = agents.filter((a) => a.status === "active");
  if (activeAgents.length === 0) return [];

  const totalGCI = activeAgents.reduce((s, a) => s + Number(a.ytd_gci), 0);
  const totalDeals = activeAgents.reduce((s, a) => s + Number(a.deal_count), 0);

  const getName = (a: OrgAgentPerformance, idx: number) =>
    anonymize ? `Agent ${String.fromCharCode(65 + (idx % 26))}` : a.agent_name;

  // ── Rule 1: CRITICAL — Empty Pipeline ─────────────────────────────────
  activeAgents.forEach((a, idx) => {
    if (a.pipeline_count === 0 && Number(a.deal_count) > 0) {
      const name = getName(a, idx);
      insights.push(
        makeInsight(
          counter++,
          "critical",
          "No Active Pipeline",
          `${name} has no active pipeline deals \u2014 may need prospecting support.`,
          95,
          name,
          a.user_id,
        ),
      );
    }
  });

  // ── Rule 2: WARNING — Behind Pace (>25%) ──────────────────────────────
  if (seasonalFraction > 0.05) {
    activeAgents.forEach((a, idx) => {
      if (Number(a.goal_gci) <= 0) return;
      const pace = paceVsGoalPercent(Number(a.goal_gci), Number(a.ytd_gci), seasonalFraction);
      if (pace < -25) {
        const name = getName(a, idx);
        insights.push(
          makeInsight(
            counter++,
            "warning",
            "Behind Goal Pace",
            `${name} is ${Math.abs(Math.round(pace))}% behind their annual goal pace.`,
            90,
            name,
            a.user_id,
          ),
        );
      }
    });
  }

  // ── Rule 3: WARNING — No Deals This Quarter (Tier 2 only) ─────────────
  const qMonths = currentQuarterMonths();
  const qElapsed = monthsElapsedInQuarter();
  if (qElapsed >= 1) {
    activeAgents.forEach((a, idx) => {
      if (!a.monthly_gci) return; // Tier 1 agents — skip (no quarterly data)
      if (Number(a.deal_count) === 0) return; // brand-new agent
      const qGCI = qMonths.reduce(
        (sum, m) => sum + (a.monthly_gci?.[String(m)] ?? 0),
        0,
      );
      if (qGCI === 0) {
        const name = getName(a, idx);
        const qLabel = `Q${Math.ceil(qMonths[0] / 3)}`;
        insights.push(
          makeInsight(
            counter++,
            "warning",
            `No Deals in ${qLabel}`,
            `${name} has no closed deals in ${qLabel} so far.`,
            85,
            name,
            a.user_id,
          ),
        );
      }
    });
  }

  // ── Rules 4 & 5: Pipeline Coverage (requires org goal) ────────────────
  if (orgGoalGci && orgGoalGci > 0) {
    const totalPipeline = activeAgents.reduce((s, a) => s + Number(a.pipeline_value), 0);
    const remainingGap = Math.max(0, orgGoalGci - totalGCI);
    const coverage = remainingGap > 0 ? totalPipeline / remainingGap : totalPipeline > 0 ? 999 : 0;

    if (coverage < 1.0 && remainingGap > 0) {
      // Rule 4: WARNING — Low coverage
      insights.push(
        makeInsight(
          counter++,
          "warning",
          "Low Pipeline Coverage",
          `Pipeline coverage is ${coverage.toFixed(1)}x \u2014 organization may fall short of its goal.`,
          80,
        ),
      );
    } else {
      // Rule 5: INFO — Coverage ratio
      insights.push(
        makeInsight(
          counter++,
          "info",
          "Pipeline Coverage",
          `Total pipeline covers ${Math.min(coverage, 99.9).toFixed(1)}x of the remaining org goal gap.`,
          55,
        ),
      );
    }
  }

  // ── Rule 6: INFO — Production Concentration (Pareto) ──────────────────
  if (activeAgents.length >= 5 && totalGCI > 0) {
    const sorted = [...activeAgents].sort(
      (a, b) => Number(b.ytd_gci) - Number(a.ytd_gci),
    );
    const top20Count = Math.max(1, Math.ceil(activeAgents.length * 0.2));
    const top20GCI = sorted.slice(0, top20Count).reduce((s, a) => s + Number(a.ytd_gci), 0);
    const top20Pct = Math.round((top20GCI / totalGCI) * 100);

    if (top20Pct > 60) {
      insights.push(
        makeInsight(
          counter++,
          "info",
          "Production Concentration",
          `Top 20% of agents (${top20Count}) account for ${top20Pct}% of total production.`,
          50,
        ),
      );
    }
  }

  // ── Rule 7: INFO — Avg Deal Size vs Benchmark ─────────────────────────
  if (totalDeals > 0) {
    const orgAvgDealSize = totalGCI / totalDeals;
    const benchmarkAvgDealSize =
      NATIONAL_MEDIAN_GCI / Math.max(1, NATIONAL_MEDIAN_TRANSACTIONS);

    const diff = ((orgAvgDealSize - benchmarkAvgDealSize) / benchmarkAvgDealSize) * 100;
    const comparison = diff > 0 ? `${Math.round(diff)}% above` : `${Math.abs(Math.round(diff))}% below`;

    insights.push(
      makeInsight(
        counter++,
        "info",
        "Average Deal Size",
        `Org avg deal size is $${Math.round(orgAvgDealSize).toLocaleString()} (${comparison} industry benchmark of $${Math.round(benchmarkAvgDealSize).toLocaleString()}).`,
        45,
      ),
    );
  }

  // ── Rule 8: PRAISE — Ahead of Pace (>25%, cap at 3) ──────────────────
  if (seasonalFraction > 0.05) {
    const aheadAgents: { name: string; id: string; pace: number; idx: number }[] = [];
    activeAgents.forEach((a, idx) => {
      if (Number(a.goal_gci) <= 0) return;
      const pace = paceVsGoalPercent(Number(a.goal_gci), Number(a.ytd_gci), seasonalFraction);
      if (pace > 25) {
        aheadAgents.push({ name: getName(a, idx), id: a.user_id, pace, idx });
      }
    });

    aheadAgents
      .sort((a, b) => b.pace - a.pace)
      .slice(0, 3)
      .forEach((a) => {
        insights.push(
          makeInsight(
            counter++,
            "praise",
            "Ahead of Goal",
            `${a.name} is ${Math.round(a.pace)}% ahead of their annual goal.`,
            40,
            a.name,
            a.id,
          ),
        );
      });
  }

  // Sort by priority (highest first) and limit
  return insights.sort((a, b) => b.priority - a.priority).slice(0, limit);
}
