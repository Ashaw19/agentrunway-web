/**
 * Team Report Engine
 *
 * Pure-function generators for five report types that team leaders can
 * access. All inputs are aggregate-only (no raw personal data). Reports
 * surface patterns and flags, never individual amounts.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgentActivitySummary {
  user_id: string;
  agent_name: string;
  total_activities: number;
  calls: number;
  emails: number;
  texts: number;
  meetings: number;
  showings: number;
  active_clients: number;
  last_activity_at: string | null;
}

export interface AgentPendingDealsSummary {
  user_id: string;
  agent_name: string;
  pending_count: number;
  pending_value: number;
  avg_probability: number | null;
  nearest_close: string | null;
}

export interface AgentExpenseStatus {
  user_id: string;
  agent_name: string;
  has_expenses_this_quarter: boolean;
  expense_category_count: number;
  has_receipt_uploads: boolean;
}

/** Minimal shape required by team report functions — compatible with
 *  the full OrgAgentPerformance from types/organizations */
export interface TeamReportAgent {
  user_id: string;
  agent_name: string;
  role: string;
  ytd_gci: number;
  deal_count: number;
  pipeline_count: number;
  pipeline_value: number;
  goal_gci: number | null;
  experience_years: number | null;
}

// ── Report outputs ───────────────────────────────────────────────────────────

export interface PipelineHealthReport {
  total_pipeline_value: number;
  total_pipeline_deals: number;
  avg_coverage_ratio: number;
  agents_with_no_pipeline: string[];
  agents_with_low_coverage: { name: string; ratio: number }[];
  summary: string;
}

export interface TransactionsInFlightReport {
  total_pending_deals: number;
  total_pending_value: number;
  agents_with_pending: { name: string; count: number; value: number }[];
  nearest_close: string | null;
  summary: string;
}

export interface CrmConsistencyReport {
  avg_touchpoints_per_agent: number;
  agents_with_low_activity: { name: string; total: number; last_activity: string | null }[];
  agents_with_high_activity: { name: string; total: number }[];
  activity_type_breakdown: {
    calls: number;
    emails: number;
    texts: number;
    meetings: number;
    showings: number;
  };
  summary: string;
}

export interface TaxResponsibilityReport {
  agents_without_expenses: string[];
  agents_without_receipts: string[];
  agents_with_few_categories: { name: string; count: number }[];
  summary: string;
}

export interface ForecastingReport {
  agents_ahead_of_pace: { name: string; pct_ahead: number }[];
  agents_behind_pace: { name: string; pct_behind: number }[];
  agents_without_goals: string[];
  team_avg_pace_pct: number;
  summary: string;
}

// ── Generators ───────────────────────────────────────────────────────────────

export function generatePipelineHealthReport(
  performance: TeamReportAgent[],
): PipelineHealthReport {
  const totalPipeline = performance.reduce((s, a) => s + a.pipeline_value, 0);
  const totalDeals = performance.reduce((s, a) => s + a.pipeline_count, 0);

  const noPipeline = performance
    .filter((a) => a.pipeline_count === 0 && a.deal_count > 0)
    .map((a) => a.agent_name);

  const lowCoverage: { name: string; ratio: number }[] = [];
  let totalRatio = 0;
  let ratioCount = 0;

  for (const a of performance) {
    if (!a.goal_gci || a.goal_gci <= 0) continue;
    const remaining = Math.max(a.goal_gci - a.ytd_gci, 0);
    if (remaining === 0) continue;
    const ratio = a.pipeline_value / remaining;
    totalRatio += ratio;
    ratioCount++;
    if (ratio < 1.0) {
      lowCoverage.push({ name: a.agent_name, ratio: Math.round(ratio * 100) / 100 });
    }
  }

  const avgCoverage = ratioCount > 0 ? totalRatio / ratioCount : 0;

  const parts: string[] = [];
  parts.push(`${totalDeals} deals worth $${Math.round(totalPipeline).toLocaleString()} in the pipeline.`);
  if (noPipeline.length > 0) {
    parts.push(`${noPipeline.length} agent(s) with deals but no active pipeline.`);
  }
  if (lowCoverage.length > 0) {
    parts.push(`${lowCoverage.length} agent(s) below 1.0x pipeline coverage.`);
  }

  return {
    total_pipeline_value: totalPipeline,
    total_pipeline_deals: totalDeals,
    avg_coverage_ratio: Math.round(avgCoverage * 100) / 100,
    agents_with_no_pipeline: noPipeline,
    agents_with_low_coverage: lowCoverage,
    summary: parts.join(" "),
  };
}

export function generateTransactionsInFlightReport(
  pending: AgentPendingDealsSummary[],
): TransactionsInFlightReport {
  const totalDeals = pending.reduce((s, a) => s + a.pending_count, 0);
  const totalValue = pending.reduce((s, a) => s + a.pending_value, 0);

  const withPending = pending
    .filter((a) => a.pending_count > 0)
    .map((a) => ({ name: a.agent_name, count: a.pending_count, value: a.pending_value }))
    .sort((a, b) => b.value - a.value);

  const nearest = pending
    .filter((a) => a.nearest_close)
    .sort((a, b) => (a.nearest_close! > b.nearest_close! ? 1 : -1))[0]?.nearest_close ?? null;

  return {
    total_pending_deals: totalDeals,
    total_pending_value: totalValue,
    agents_with_pending: withPending,
    nearest_close: nearest,
    summary: `${totalDeals} pending deal(s) worth $${Math.round(totalValue).toLocaleString()}. ${withPending.length} agent(s) with active deals.`,
  };
}

export function generateCrmConsistencyReport(
  activities: AgentActivitySummary[],
): CrmConsistencyReport {
  const totalActivities = activities.reduce((s, a) => s + a.total_activities, 0);
  const avg = activities.length > 0 ? totalActivities / activities.length : 0;

  const lowThreshold = Math.max(avg * 0.4, 5);
  const highThreshold = avg * 1.5;

  const low = activities
    .filter((a) => a.total_activities < lowThreshold)
    .map((a) => ({
      name: a.agent_name,
      total: a.total_activities,
      last_activity: a.last_activity_at,
    }))
    .sort((a, b) => a.total - b.total);

  const high = activities
    .filter((a) => a.total_activities > highThreshold)
    .map((a) => ({ name: a.agent_name, total: a.total_activities }))
    .sort((a, b) => b.total - a.total);

  const breakdown = {
    calls: activities.reduce((s, a) => s + a.calls, 0),
    emails: activities.reduce((s, a) => s + a.emails, 0),
    texts: activities.reduce((s, a) => s + a.texts, 0),
    meetings: activities.reduce((s, a) => s + a.meetings, 0),
    showings: activities.reduce((s, a) => s + a.showings, 0),
  };

  return {
    avg_touchpoints_per_agent: Math.round(avg),
    agents_with_low_activity: low,
    agents_with_high_activity: high,
    activity_type_breakdown: breakdown,
    summary: `${totalActivities} total touchpoints YTD (avg ${Math.round(avg)} per agent). ${low.length} agent(s) below average activity.`,
  };
}

export function generateTaxResponsibilityReport(
  expenses: AgentExpenseStatus[],
): TaxResponsibilityReport {
  const noExpenses = expenses
    .filter((a) => !a.has_expenses_this_quarter)
    .map((a) => a.agent_name);

  const noReceipts = expenses
    .filter((a) => !a.has_receipt_uploads)
    .map((a) => a.agent_name);

  const fewCategories = expenses
    .filter((a) => a.expense_category_count > 0 && a.expense_category_count < 3)
    .map((a) => ({ name: a.agent_name, count: a.expense_category_count }));

  const parts: string[] = [];
  if (noExpenses.length > 0) {
    parts.push(`${noExpenses.length} agent(s) haven't logged expenses this quarter.`);
  }
  if (noReceipts.length > 0) {
    parts.push(`${noReceipts.length} agent(s) haven't uploaded receipts this quarter.`);
  }
  if (fewCategories.length > 0) {
    parts.push(`${fewCategories.length} agent(s) tracking fewer than 3 expense categories.`);
  }
  if (parts.length === 0) {
    parts.push("All agents are actively tracking expenses and uploading receipts.");
  }

  return {
    agents_without_expenses: noExpenses,
    agents_without_receipts: noReceipts,
    agents_with_few_categories: fewCategories,
    summary: parts.join(" "),
  };
}

export function generateForecastingReport(
  performance: TeamReportAgent[],
  seasonalFraction: number,
): ForecastingReport {
  const ahead: { name: string; pct_ahead: number }[] = [];
  const behind: { name: string; pct_behind: number }[] = [];
  const noGoals: string[] = [];
  let totalPacePct = 0;
  let paceCount = 0;

  for (const a of performance) {
    if (!a.goal_gci || a.goal_gci <= 0) {
      noGoals.push(a.agent_name);
      continue;
    }

    const expectedGci = a.goal_gci * seasonalFraction;
    if (expectedGci <= 0) continue;

    const pacePct = (a.ytd_gci / expectedGci) * 100;
    totalPacePct += pacePct;
    paceCount++;

    if (pacePct >= 125) {
      ahead.push({ name: a.agent_name, pct_ahead: Math.round(pacePct - 100) });
    } else if (pacePct < 75) {
      behind.push({ name: a.agent_name, pct_behind: Math.round(100 - pacePct) });
    }
  }

  const avgPace = paceCount > 0 ? Math.round(totalPacePct / paceCount) : 0;

  const parts: string[] = [];
  parts.push(`Team pace: ${avgPace}% of expected.`);
  if (ahead.length > 0) parts.push(`${ahead.length} agent(s) ahead of pace.`);
  if (behind.length > 0) parts.push(`${behind.length} agent(s) behind pace.`);
  if (noGoals.length > 0) parts.push(`${noGoals.length} agent(s) without goals set.`);

  return {
    agents_ahead_of_pace: ahead.sort((a, b) => b.pct_ahead - a.pct_ahead),
    agents_behind_pace: behind.sort((a, b) => b.pct_behind - a.pct_behind),
    agents_without_goals: noGoals,
    team_avg_pace_pct: avgPace,
    summary: parts.join(" "),
  };
}
