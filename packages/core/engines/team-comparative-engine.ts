/**
 * Team Comparative Engine
 *
 * Generates agent-facing insights that compare an individual agent's
 * performance to team averages. These insights reference the team leader
 * by first name and suggest coaching conversations.
 *
 * Example output:
 *   "Others on your team are spending 12% less quarterly on marketing —
 *    consider discussing your marketing budget with Erin"
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface TeamComparativeInput {
  /** The individual agent's metrics */
  agent: {
    ytd_gci: number;
    deal_count: number;
    pipeline_count: number;
    pipeline_value: number;
    goal_gci: number | null;
    /** Agent's expense ratio (expenses / GCI). null if Tier 3 / not shared */
    expense_ratio: number | null;
    /** YTD touchpoints (calls + emails + texts + meetings + showings) */
    ytd_touchpoints: number;
  };
  /** Team averages (computed from org_agent_performance) */
  team: {
    avg_ytd_gci: number;
    avg_deal_count: number;
    avg_pipeline_count: number;
    avg_pipeline_value: number;
    avg_expense_ratio: number | null;
    avg_ytd_touchpoints: number;
    member_count: number;
  };
  /** Team leader's first name — used in suggestions */
  leaderFirstName: string;
  /** Team name */
  teamName: string;
  /** Seasonal fraction for pace calculations */
  seasonalFraction: number;
}

export interface TeamComparativeInsight {
  id: string;
  category:
    | "pace"
    | "pipeline"
    | "deal_size"
    | "activity"
    | "expense"
    | "coaching";
  severity: "praise" | "info" | "warning";
  title: string;
  message: string;
  /** Priority for sorting (higher = more important) */
  priority: number;
}

// ── Generator ────────────────────────────────────────────────────────────────

export function generateTeamComparativeInsights(
  input: TeamComparativeInput,
  limit: number = 5,
): TeamComparativeInsight[] {
  const { agent, team, leaderFirstName, seasonalFraction } = input;
  const insights: TeamComparativeInsight[] = [];

  // ── 1. Pace comparison ────────────────────────────────────────────────
  if (agent.goal_gci && agent.goal_gci > 0 && seasonalFraction > 0) {
    const expectedGci = agent.goal_gci * seasonalFraction;
    const agentPace = agent.ytd_gci / expectedGci;
    // Note: team goal data (avg_goal_gci) is not available in the input,
    // so we cannot compute a meaningful team pace. We only flag agents
    // who are significantly behind their own goal pace.

    if (agentPace < 0.75) {
      insights.push({
        id: "pace_behind_team",
        category: "pace",
        severity: "warning",
        title: "Behind team pace",
        message: `You're at ${Math.round(agentPace * 100)}% of your goal pace. Consider reviewing your pipeline strategy with ${leaderFirstName}.`,
        priority: 90,
      });
    } else if (agentPace >= 1.25) {
      insights.push({
        id: "pace_ahead",
        category: "pace",
        severity: "praise",
        title: "Leading the pack",
        message: `You're ${Math.round((agentPace - 1) * 100)}% ahead of pace — one of the strongest performances on the team. Keep it up.`,
        priority: 50,
      });
    }
  }

  // ── 2. Pipeline coverage comparison ───────────────────────────────────
  if (team.avg_pipeline_count > 0) {
    const agentPipelineRatio =
      agent.pipeline_count > 0
        ? agent.pipeline_count / team.avg_pipeline_count
        : 0;

    if (agentPipelineRatio < 0.5 && agent.deal_count > 0) {
      insights.push({
        id: "pipeline_low_vs_team",
        category: "pipeline",
        severity: "warning",
        title: "Pipeline is light",
        message: `Your pipeline has ${agent.pipeline_count} deal${agent.pipeline_count !== 1 ? "s" : ""} — the team averages ${Math.round(team.avg_pipeline_count)}. Building more pipeline could help secure your year. Worth discussing lead sources with ${leaderFirstName}.`,
        priority: 85,
      });
    } else if (agentPipelineRatio > 2.0) {
      insights.push({
        id: "pipeline_strong",
        category: "pipeline",
        severity: "praise",
        title: "Pipeline depth",
        message: `Your pipeline is ${Math.round(agentPipelineRatio)}x the team average — you're well-positioned for the coming months.`,
        priority: 40,
      });
    }
  }

  // ── 3. Deal size comparison ───────────────────────────────────────────
  if (agent.deal_count > 0 && team.avg_deal_count > 0) {
    const agentAvgDeal = agent.ytd_gci / agent.deal_count;
    const teamAvgDeal = team.avg_ytd_gci / team.avg_deal_count;

    if (teamAvgDeal > 0) {
      const ratio = agentAvgDeal / teamAvgDeal;

      if (ratio < 0.7) {
        insights.push({
          id: "deal_size_low",
          category: "deal_size",
          severity: "info",
          title: "Smaller average deals",
          message: `Your average deal GCI is $${Math.round(agentAvgDeal).toLocaleString()} vs the team average of $${Math.round(teamAvgDeal).toLocaleString()}. Consider whether targeting higher-value listings could boost your earnings — ${leaderFirstName} might have insights on market positioning.`,
          priority: 60,
        });
      } else if (ratio > 1.5) {
        insights.push({
          id: "deal_size_high",
          category: "deal_size",
          severity: "praise",
          title: "Premium market positioning",
          message: `Your average deal GCI is ${Math.round((ratio - 1) * 100)}% higher than the team average. Strong market positioning.`,
          priority: 35,
        });
      }
    }
  }

  // ── 4. Activity / touchpoint comparison ───────────────────────────────
  if (team.avg_ytd_touchpoints > 0) {
    const ratio = agent.ytd_touchpoints / team.avg_ytd_touchpoints;

    if (ratio < 0.4) {
      insights.push({
        id: "activity_low",
        category: "activity",
        severity: "warning",
        title: "Low client engagement",
        message: `You've logged ${agent.ytd_touchpoints} client touchpoints YTD — the team averages ${Math.round(team.avg_ytd_touchpoints)}. Consistent outreach correlates with higher production. Consider reviewing your contact strategy with ${leaderFirstName}.`,
        priority: 75,
      });
    } else if (ratio > 2.0) {
      insights.push({
        id: "activity_high",
        category: "activity",
        severity: "praise",
        title: "Client engagement leader",
        message: `Your client touchpoints are ${Math.round(ratio)}x the team average. Your outreach consistency is a competitive advantage.`,
        priority: 30,
      });
    }
  }

  // ── 5. Expense ratio comparison (only if Tier 2 data shared) ──────────
  if (
    agent.expense_ratio !== null &&
    team.avg_expense_ratio !== null &&
    team.avg_expense_ratio > 0
  ) {
    const diff =
      ((agent.expense_ratio - team.avg_expense_ratio) /
        team.avg_expense_ratio) *
      100;

    if (diff > 20) {
      insights.push({
        id: "expense_high_vs_team",
        category: "expense",
        severity: "info",
        title: "Higher expense ratio",
        message: `Others on your team are spending ${Math.round(Math.abs(diff))}% less relative to GCI. Consider discussing your expense strategy with ${leaderFirstName} — there may be cost-saving opportunities.`,
        priority: 55,
      });
    } else if (diff < -20) {
      insights.push({
        id: "expense_efficient",
        category: "expense",
        severity: "praise",
        title: "Efficient operations",
        message: `Your expense ratio is ${Math.round(Math.abs(diff))}% lower than the team average. You're running a lean operation.`,
        priority: 25,
      });
    }
  }

  // Sort by priority (highest first) and limit
  return insights.sort((a, b) => b.priority - a.priority).slice(0, limit);
}
