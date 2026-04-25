/**
 * Chat Diagnostics Module
 *
 * FORMATTING LAYER ONLY — all computation is delegated to canonical engines.
 *
 * Fetches data from Supabase, passes it to shared engine functions, and
 * formats the results into readable diagnostic strings for the AI system prompt.
 *
 * Each diagnostic function returns a plain string (or null if not applicable).
 */

import { createClient } from "@/lib/supabase/server";
import { computeGCI, computeWeightedGCI } from "@/lib/types/database";
import { fmtCurrency } from "@/lib/formatters";
import {
  seasonalFractionElapsed,
  paceVsGoalPercent,
  projectedYearEndGCI,
  projectedYearEndTransactions,
} from "@agent-runway/core/engines/projection-engine";
import {
  compute as computeRunwayScore,
} from "@agent-runway/core/engines/runway-score-engine";
import { buildHealthReport } from "@agent-runway/core/engines/health-report";
import {
  survivalResult as computeSurvivalResult,
} from "@agent-runway/core/engines/survival-engine";
import {
  computeEffectiveCashForSurvival,
  computeProjectedNetForTax,
} from "@agent-runway/core/engines/effective-cash";
import type { UserSettings as CanonicalUserSettings } from "@agent-runway/core/types/database";
import {
  compare as benchmarkCompare,
  COHORT_LABELS,
} from "@agent-runway/core/engines/benchmark-engine";
import {
  calculate as calculateTax,
} from "@agent-runway/core/engines/canadian-tax-engine";
import type { Province } from "@agent-runway/core/types/database";
import type { TroubleshootingTopic } from "./troubleshooting-classifier";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserSettings {
  user_id: string;
  province: string;
  goal_gci: number;
  cash_reserve: number;
  experience_years: number;
  split_preset: string;
  monthly_brokerage_fee: number;
  tx_fee_rate_pct: number;
  tx_fee_annual_cap: number;
  post_cap_rate_pct: number;
  seasonal_weights: number[] | null;
  use_national_seasonality: boolean;
  national_quarter_pcts: number[] | null;
  business_structure: string;
  gst_hst_registered: boolean;
  business_number: string | null;
  home_office_method: string;
  vehicle_business_pct: number;
  board_code: string | null;
  [key: string]: unknown;
}

interface Transaction {
  date: string;
  sale_price: number;
  commission_pct: number;
  team_split_pct: number;
  gci_override: number | null;
  status: string;
}

interface PipelineDeal {
  estimated_price: number;
  estimated_commission_pct: number;
  probability_override: number | null;
  stage: string;
}

interface ExpenseCategory {
  name: string;
  expense_items?: {
    ytd_amount?: number | string;
    monthly_recurring?: number | string;
  }[];
}

// ─── Shared computed context passed to each diagnostic function ───────────────

interface ReferralRow {
  direction: string;
  status: string;
  referral_fee_pct: number;
  estimated_value: number;
  actual_fee_paid: number | null;
}

interface DiagContext {
  settings: UserSettings;
  closedTx: Transaction[];
  pipelineDeals: PipelineDeal[];
  expenses: ExpenseCategory[];
  clients: { id: string; status: string; last_contact_at: string | null; created_at: string }[];
  referrals: ReferralRow[];
  ytdGCI: number;
  pipelineWeighted: number;
  currentYear: number;
  engineFraction: number;
  monthlyRecurring: number;
  expensesYTD: number;
}

// ─── Main Diagnostic Builder ──────────────────────────────────────────────────

/**
 * Build diagnostic context for the given topics. Returns a formatted string
 * to inject into the system prompt, or empty string if no diagnostics apply.
 */
export async function buildDiagnostics(
  userId: string,
  topics: TroubleshootingTopic[],
): Promise<string> {
  // Skip diagnostics for topics that don't need data
  const dataTopics = topics.filter(
    (t) => !["social", "voice", "onboarding", "general", "import"].includes(t),
  );
  if (dataTopics.length === 0) return "";

  const supabase = await createClient();
  const currentYear = new Date().getFullYear();

  // Fetch all data in parallel
  const [
    { data: settings },
    { data: allTransactions },
    { data: pipeline },
    { data: expenseCategories },
    { data: clients },
    { data: historyItems },
    { data: receiptExpenses },
    { data: referralRows },
  ] = await Promise.all([
    supabase.from("user_settings").select("*").eq("user_id", userId).single(),
    supabase
      .from("transactions")
      .select("date, sale_price, commission_pct, team_split_pct, gci_override, status")
      .eq("user_id", userId),
    supabase
      .from("pipeline_deals")
      .select("estimated_price, estimated_commission_pct, probability_override, stage")
      .eq("user_id", userId),
    supabase
      .from("expense_categories")
      .select("name, expense_items(ytd_amount, monthly_recurring)")
      .eq("user_id", userId),
    supabase
      .from("clients")
      .select("id, status, last_contact_at, created_at")
      .eq("user_id", userId)
      .is("archived_at", null),
    supabase
      .from("history_items")
      .select("year, annual_tx, annual_gci, quarter_gci")
      .eq("user_id", userId),
    supabase
      .from("receipt_expenses")
      .select("total_amount")
      .eq("user_id", userId)
      .gte("expense_date", `${currentYear}-01-01`),
    supabase
      .from("referrals")
      .select("direction, status, referral_fee_pct, estimated_value, actual_fee_paid")
      .eq("user_id", userId),
  ]);

  if (!settings) return "\n[DIAGNOSTIC: No user settings found — user may not have completed onboarding]";

  const s = settings as UserSettings;
  const closedTx = (allTransactions ?? []).filter(
    (tx) => tx.status === "closed" && tx.date?.startsWith(String(currentYear)),
  ) as Transaction[];
  const pipelineDeals = (pipeline ?? []) as PipelineDeal[];
  const expenses = (expenseCategories ?? []) as ExpenseCategory[];

  const ytdGCI = closedTx.reduce(
    (sum, tx) => sum + computeGCI(tx as Parameters<typeof computeGCI>[0]),
    0,
  );
  const pipelineWeighted = pipelineDeals.reduce(
    (sum, d) => sum + computeWeightedGCI(d as Parameters<typeof computeWeightedGCI>[0]),
    0,
  );

  // ── Compute agent-specific seasonal weights (same logic as chat route / dashboard) ──
  const agentSeasonalWeights = (() => {
    const withData = (historyItems ?? []).filter((h: Record<string, unknown>) =>
      (h.quarter_gci as number[] | null)?.some((v: number) => (v ?? 0) > 0),
    );
    if (withData.length < 2) return null;
    const avgQ = [0, 1, 2, 3].map((q) =>
      withData.reduce((sum: number, h: Record<string, unknown>) =>
        sum + (((h.quarter_gci as number[])?.[q]) ?? 0), 0) / withData.length,
    );
    const total = avgQ.reduce((a, b) => a + b, 0);
    return total > 0 ? avgQ.map((v) => v / total) : null;
  })();

  const engineSeasonalWeights = agentSeasonalWeights
    ?? (s.use_national_seasonality
      ? (s.national_quarter_pcts ?? [0.25, 0.25, 0.25, 0.25])
      : [0.25, 0.25, 0.25, 0.25]);
  const engineFraction = seasonalFractionElapsed(engineSeasonalWeights);

  // Compute total YTD expenses and monthly recurring (same formula as dashboard)
  let monthlyRecurring = 0;
  for (const cat of expenses) {
    for (const item of cat.expense_items ?? []) {
      monthlyRecurring += Number(item.monthly_recurring ?? 0);
    }
  }
  const receiptTotal = (receiptExpenses ?? []).reduce(
    (sum: number, r: { total_amount?: number | string }) => sum + Number(r.total_amount ?? 0), 0,
  );
  const expNow = new Date();
  const expMonthsElapsed = expNow.getMonth() + 1; // 1-12, consistent with dashboard engine
  const recurringYTDEstimate = monthlyRecurring * expMonthsElapsed;
  const expensesYTD = Math.max(receiptTotal, recurringYTDEstimate);

  const ctx: DiagContext = {
    settings: s,
    closedTx,
    pipelineDeals,
    expenses,
    clients: clients ?? [],
    referrals: (referralRows ?? []) as ReferralRow[],
    ytdGCI,
    pipelineWeighted,
    currentYear,
    engineFraction,
    monthlyRecurring,
    expensesYTD,
  };

  const diagnosticParts: string[] = [];

  for (const topic of dataTopics) {
    const diag = buildTopicDiagnostic(topic, ctx);
    if (diag) diagnosticParts.push(diag);
  }

  if (diagnosticParts.length === 0) return "";

  return `\n\nDIAGNOSTIC DATA (step-by-step calculations for this user — reference these when troubleshooting):\n${diagnosticParts.join("\n\n")}`;
}

// ─── Topic-Specific Diagnostics ───────────────────────────────────────────────

function buildTopicDiagnostic(
  topic: TroubleshootingTopic,
  ctx: DiagContext,
): string | null {
  switch (topic) {
    case "runway-score":
      return diagRunwayScore(ctx);
    case "tax":
      return diagTax(ctx);
    case "pipeline":
      return diagPipeline(ctx);
    case "expenses":
      return diagExpenses(ctx);
    case "forecast":
      return diagForecast(ctx);
    case "crm":
      return diagCRM(ctx.clients);
    case "flight-control":
      return diagFlightControl(ctx.clients);
    case "transactions":
      return diagTransactions(ctx);
    case "settings":
      return diagSettings(ctx.settings);
    case "survival":
      return diagSurvival(ctx);
    case "benchmark":
      return diagBenchmark(ctx);
    case "referrals":
      return diagReferrals(ctx.referrals);
    default:
      return null;
  }
}

// ─── Individual Diagnostic Builders ───────────────────────────────────────────

/**
 * diagRunwayScore: delegates to buildHealthReport → benchmarkCompare →
 * computeSurvivalResult → computeRunwayScore, then formats results.
 */
function diagRunwayScore(ctx: DiagContext): string {
  const { settings: s, ytdGCI, pipelineWeighted, engineFraction, monthlyRecurring, expensesYTD, closedTx, pipelineDeals } = ctx;

  // 1. Health Report (pace, pipeline, expense sub-scores)
  const healthReport = buildHealthReport(
    ytdGCI, s.goal_gci ?? 0, engineFraction, pipelineWeighted, expensesYTD,
  );

  // 2. Projection for benchmark
  const projGCI = projectedYearEndGCI(
    ytdGCI, pipelineWeighted, engineFraction, s.goal_gci ?? 0,
  );

  // 3. Benchmark (actual industry-cohort percentile, not hardcoded 50)
  const benchmark = benchmarkCompare(projGCI, s.experience_years ?? null);

  // 4. Survival — cash input MUST be cashPosition.effectiveCash (not raw
  //    cash_reserve) to match dashboard + chat. Diagnostic runs through
  //    the AI; a wrong number here puts Captain back in the 2026-04-17
  //    failure mode. See memory/feedback_data_consistency_protocol.md.
  const projDeals = projectedYearEndTransactions(
    closedTx.length, pipelineDeals.length, engineFraction,
  );
  const { cashPosition: diagCashPos } = computeEffectiveCashForSurvival({
    settings: s as unknown as CanonicalUserSettings,
    ytdGCI,
    expensesYTD,
    monthlyRecurring,
    projectedGCI: projGCI,
    projectedDealCount: projDeals,
    fraction: engineFraction,
  });
  const survival = computeSurvivalResult(
    s.monthly_brokerage_fee ?? 0,
    monthlyRecurring,
    diagCashPos.effectiveCash,
    0,
  );

  // 5. Composite Runway Score
  const runwayScore = computeRunwayScore(
    healthReport, benchmark.percentile, survival.months,
  );

  // Format the canonical results
  const pacePercent = s.goal_gci > 0 ? paceVsGoalPercent(s.goal_gci, ytdGCI, engineFraction) : 0;
  const remainingGoal = Math.max(0, (s.goal_gci ?? 0) - ytdGCI);
  const expenseRatio = ytdGCI > 0 ? expensesYTD / ytdGCI : 0;

  // Find weakest component from canonical score
  const weakest = runwayScore.components.reduce((min, c) =>
    c.score * c.weightValue < min.score * min.weightValue ? c : min,
    runwayScore.components[0],
  );

  return `[RUNWAY SCORE BREAKDOWN]
Score: ${runwayScore.score} — ${runwayScore.stateLabel} (grade ${runwayScore.grade}) — v${runwayScore.version}
├─ ${runwayScore.components.map((c) => `${c.label} (${c.weight}): ${c.score}/100`).join("\n├─ ")}
Pace detail: ${pacePercent >= 0 ? "+" : ""}${Math.round(pacePercent)}% vs goal, seasonal fraction: ${(engineFraction * 100).toFixed(1)}%
Pipeline detail: ${fmtCurrency(pipelineWeighted)} weighted vs ${fmtCurrency(remainingGoal)} remaining goal
Expense detail: ratio ${(expenseRatio * 100).toFixed(1)}% (${fmtCurrency(expensesYTD)} / ${fmtCurrency(ytdGCI)})
Survival detail: ${survival.label} (risk: ${survival.riskLevel})${survival.monthlyBurn > 0 ? `, burn: ${fmtCurrency(survival.monthlyBurn)}/mo` : ""}
Benchmark detail: ${benchmark.percentile}th percentile in ${COHORT_LABELS[benchmark.cohort]} cohort
Weakest: ${weakest.label} (${weakest.score}/100, contributing ${(weakest.score * weakest.weightValue).toFixed(1)} points)`;
}

/**
 * diagTax: delegates to calculateTax() from canadian-tax-engine.
 * Shows step-by-step values but all final numbers come from the engine.
 */
function diagTax(ctx: DiagContext): string {
  const { settings: s, closedTx, ytdGCI, engineFraction, expensesYTD, monthlyRecurring } = ctx;

  const splitMatch = s.split_preset?.match(/p(\d+)_(\d+)/);
  const agentPct = splitMatch ? Number(splitMatch[1]) / 100 : 1;

  const projGCI = projectedYearEndGCI(
    ytdGCI, ctx.pipelineWeighted, engineFraction, s.goal_gci ?? 0,
  );

  // D-2 fix (Audit 1 2026-04-22): replaced local inline formula
  // `projGCI * agentPct - (expensesYTD / engineFraction)` with canonical
  // helper that matches dashboard-content.tsx:596-603 exactly. The old
  // formula ignored tx fees + monthly brokerage × 12 and double-applied
  // season scaling. `projectedAgentNet` is retained below as a display-
  // only intermediate for the diagnostic line — the *engine input* is
  // now the canonical netSEIncome.
  const projectedAgentNet = projGCI * agentPct;
  const netSEIncome = computeProjectedNetForTax({
    projectedGCI: projGCI,
    expensesYTD,
    monthlyRecurring,
    settings: s as unknown as CanonicalUserSettings,
  });

  const projDeals = projectedYearEndTransactions(
    closedTx.length, ctx.pipelineDeals.length, engineFraction,
  );

  // Delegate to canonical tax engine
  const taxResult = calculateTax(
    netSEIncome,
    (s.province ?? "ontario") as Province,
    projDeals,
  );

  return `[TAX DIAGNOSTIC]
Province: ${s.province}
Business Structure: ${s.business_structure ?? "sole_prop"}
GST/HST Registered: ${(s.gst_hst_registered || !!s.business_number) ? "Yes" : "No"}
Projected Annual GCI: ${fmtCurrency(projGCI)}
Agent Split: ${(agentPct * 100).toFixed(0)}% → Projected Agent Net (split only): ${fmtCurrency(projectedAgentNet)}
Net Self-Employment Income (after tx fees, brokerage fees, and expenses): ${fmtCurrency(netSEIncome)}
CPP1: ${fmtCurrency(taxResult.cpp1Contribution)}
CPP2: ${fmtCurrency(taxResult.cpp2Contribution)}
Total CPP: ${fmtCurrency(taxResult.totalCPP)}
Federal Tax: ${fmtCurrency(taxResult.federalTax)}
Provincial Tax: ${fmtCurrency(taxResult.provincialTax)}
Total Tax: ${fmtCurrency(taxResult.totalTax)}
Total Burden (tax + CPP): ${fmtCurrency(taxResult.totalBurden)}
Effective Rate: ${(taxResult.effectiveRate * 100).toFixed(1)}%
Quarterly Instalment: ${fmtCurrency(taxResult.quarterlyEstimate)}
Projected Deal Count: ~${Math.round(projDeals)}
Per-Deal Set-Aside: ${fmtCurrency(taxResult.perDealSetAside)}`;
}

/**
 * diagPipeline: uses the same linear pipeline score formula as health-report.ts.
 */
function diagPipeline(ctx: DiagContext): string {
  const { settings: s, pipelineDeals, pipelineWeighted, ytdGCI } = ctx;

  const stageCount: Record<string, number> = {};
  const stageValue: Record<string, number> = {};
  for (const d of pipelineDeals) {
    const stage = d.stage || "unknown";
    stageCount[stage] = (stageCount[stage] ?? 0) + 1;
    stageValue[stage] = (stageValue[stage] ?? 0) + computeWeightedGCI(d as Parameters<typeof computeWeightedGCI>[0]);
  }

  const remainingGoal = Math.max(0, (s.goal_gci || 0) - ytdGCI);
  const coverageRatio = remainingGoal > 0 ? pipelineWeighted / remainingGoal : Infinity;

  // Pipeline score — same linear formula as health-report.ts
  let pipelineScore: number;
  if (remainingGoal > 0 && pipelineWeighted > 0) {
    pipelineScore = Math.min(100, Math.round((pipelineWeighted / remainingGoal) * 100));
  } else if ((s.goal_gci ?? 0) > 0 && ytdGCI >= (s.goal_gci ?? 0)) {
    pipelineScore = 90;
  } else {
    pipelineScore = 65;
  }

  const stageLines = Object.entries(stageCount)
    .map(([stage, count]) => `  ${stage}: ${count} deals, ${fmtCurrency(stageValue[stage] ?? 0)} weighted`)
    .join("\n");

  return `[PIPELINE DIAGNOSTIC]
Total Pipeline Deals: ${pipelineDeals.length}
Total Weighted GCI: ${fmtCurrency(pipelineWeighted)}
Remaining Goal Gap: ${fmtCurrency(remainingGoal)}
Coverage Ratio: ${coverageRatio === Infinity ? "Goal met" : coverageRatio.toFixed(2) + "x"}
Pipeline Sub-Score: ${pipelineScore}/100 (linear: weighted ÷ remaining × 100, capped at 100)
By Stage:
${stageLines || "  (empty pipeline)"}`;
}

/**
 * diagExpenses: matches health-report.ts logic exactly.
 * v1.2: 35 when GCI > 0 but no expenses (not 50).
 */
function diagExpenses(ctx: DiagContext): string {
  const { expenses, ytdGCI, expensesYTD, monthlyRecurring } = ctx;

  const categoryTotals: { name: string; ytd: number; recurring: number }[] = [];

  for (const cat of expenses) {
    const ytd = (cat.expense_items ?? []).reduce((s, i) => s + Number(i.ytd_amount ?? 0), 0);
    const recurring = (cat.expense_items ?? []).reduce((s, i) => s + Number(i.monthly_recurring ?? 0), 0);
    if (ytd > 0 || recurring > 0) {
      categoryTotals.push({ name: cat.name, ytd, recurring });
    }
  }

  const ratio = ytdGCI > 0 ? (expensesYTD / ytdGCI) * 100 : 0;

  // Expense score — same logic as health-report.ts
  let expenseScore: number;
  if (ytdGCI > 0 && expensesYTD > 0) {
    const r = expensesYTD / ytdGCI;
    if (r > 0.5) expenseScore = 30;
    else if (r > 0.35) expenseScore = 55;
    else if (r > 0.25) expenseScore = 75;
    else expenseScore = 90;
  } else if (ytdGCI > 0 && expensesYTD === 0) {
    expenseScore = 35; // v1.2: incomplete data penalty
  } else {
    expenseScore = 50; // no GCI yet
  }

  // Emit the raw ratio bucket as a state-only descriptor — no editorial
  // labels. Personas layer interpretation per their own voice rules.
  // Removed 2026-04-22 (Audit 2): "WARNING", "Concerning", "Needs attention"
  // were editorial judgments on an engine-computed ratio; keeping them
  // forced downstream personas to either echo them verbatim (violating
  // info-not-advice) or contradict the diagnostic text.
  const ratioBucket = ytdGCI === 0 ? "N/A (no GCI)" :
    ratio > 50 ? "above 50%" :
    ratio > 35 ? "above 35%" :
    ratio > 30 ? "above 30%" :
    ratio > 25 ? "above 25%" : "at or below 25%";

  const catLines = categoryTotals
    .sort((a, b) => b.ytd - a.ytd)
    .slice(0, 8)
    .map((c) => `  ${c.name}: YTD ${fmtCurrency(c.ytd)}${c.recurring > 0 ? ` + ${fmtCurrency(c.recurring)}/mo recurring` : ""}`)
    .join("\n");

  return `[EXPENSE DIAGNOSTIC]
YTD Expenses: ${fmtCurrency(expensesYTD)}
Monthly Recurring: ${fmtCurrency(monthlyRecurring)}
Expense Ratio: ${ratio.toFixed(1)}% (ratio bucket: ${ratioBucket})
Expense Sub-Score: ${expenseScore}/100
YTD GCI (denominator): ${fmtCurrency(ytdGCI)}
Top Categories:
${catLines || "  (no expenses logged)"}`;
}

/**
 * diagForecast: delegates to projectedYearEndGCI() from projection-engine
 * with agent-specific seasonal weights (same as dashboard / chat route).
 */
function diagForecast(ctx: DiagContext): string {
  const { settings: s, closedTx, ytdGCI, pipelineWeighted, engineFraction, pipelineDeals } = ctx;

  // Use canonical projection engine (includes early-year dampening)
  const projGCI = projectedYearEndGCI(
    ytdGCI, pipelineWeighted, engineFraction, s.goal_gci ?? 0,
  );
  const projDeals = projectedYearEndTransactions(
    closedTx.length, pipelineDeals.length, engineFraction,
  );

  const splitMatch = s.split_preset?.match(/p(\d+)_(\d+)/);
  const agentPct = splitMatch ? Number(splitMatch[1]) / 100 : 1;

  const projectedAgentNet = projGCI * agentPct;
  const monthlyFees = (s.monthly_brokerage_fee ?? 0) * 12;
  const perDealFees = projDeals * (projGCI / Math.max(1, projDeals)) * (s.tx_fee_rate_pct ?? 0);
  const cappedFees = s.tx_fee_annual_cap > 0 ? Math.min(perDealFees, s.tx_fee_annual_cap) : perDealFees;

  const pacePercent = s.goal_gci > 0 ? paceVsGoalPercent(s.goal_gci, ytdGCI, engineFraction) : 0;
  const remainingGoal = Math.max(0, (s.goal_gci || 0) - ytdGCI - pipelineWeighted);
  const avgDealGCI = closedTx.length > 0 ? ytdGCI / closedTx.length : 0;
  const dealsNeeded = avgDealGCI > 0 ? Math.ceil(remainingGoal / avgDealGCI) : 0;

  return `[FORECAST DIAGNOSTIC]
Seasonal Fraction Elapsed: ${(engineFraction * 100).toFixed(1)}%
YTD Closed GCI: ${fmtCurrency(ytdGCI)} (${closedTx.length} deals)
Pipeline Weighted: ${fmtCurrency(pipelineWeighted)}
Projected Year-End GCI: ${fmtCurrency(projGCI)} (canonical engine — includes early-year dampening + pipeline adj)
Projected Year-End Deals: ${projDeals}
Conservative (−15%): ${fmtCurrency(projGCI * 0.85)}
Optimistic (+15%): ${fmtCurrency(projGCI * 1.15)}
Waterfall Preview:
  Projected GCI: ${fmtCurrency(projGCI)}
  − Brokerage Share: ${fmtCurrency(projGCI - projectedAgentNet)}
  − Monthly Fees (×12): ${fmtCurrency(monthlyFees)}
  − Per-Deal Fees (capped): ${fmtCurrency(cappedFees)}
  = Pre-expense/tax Net: ${fmtCurrency(projectedAgentNet - monthlyFees - cappedFees)}
Pace vs Goal: ${pacePercent >= 0 ? "+" : ""}${Math.round(pacePercent)}%
Remaining Goal Gap: ${fmtCurrency(remainingGoal)}
Deals Needed: ~${dealsNeeded} (at avg ${fmtCurrency(avgDealGCI)}/deal)`;
}

function diagCRM(
  clients: { id: string; status: string; last_contact_at: string | null; created_at: string }[],
): string {
  const statusCounts: Record<string, number> = {};
  let stale14 = 0;
  let stale30 = 0;
  const now = Date.now();
  const day14 = 14 * 24 * 60 * 60 * 1000;
  const day30 = 30 * 24 * 60 * 60 * 1000;
  const activeStatuses = ["boarding", "in_flight"];

  for (const c of clients) {
    statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1;
    if (activeStatuses.includes(c.status) && c.last_contact_at) {
      const elapsed = now - new Date(c.last_contact_at).getTime();
      if (elapsed > day30) stale30++;
      else if (elapsed > day14) stale14++;
    } else if (activeStatuses.includes(c.status) && !c.last_contact_at) {
      // Never contacted = stale
      stale30++;
    }
  }

  const statusLines = Object.entries(statusCounts)
    .map(([status, count]) => `  ${status}: ${count}`)
    .join("\n");

  return `[CRM DIAGNOSTIC]
Total Active Clients: ${clients.length}
By Status:
${statusLines || "  (no clients)"}
Stale Leads (14+ days, dashboard): ${stale14 + stale30}
Stale Leads (30+ days, CRM insights): ${stale30}
Never Contacted: ${clients.filter((c) => !c.last_contact_at && activeStatuses.includes(c.status)).length}`;
}

function diagFlightControl(
  clients: { id: string; status: string; last_contact_at: string | null; created_at: string }[],
): string {
  const activeStatuses = ["boarding", "in_flight"];
  const activeClients = clients.filter((c) => activeStatuses.includes(c.status));
  const now = Date.now();
  const day14 = 14 * 24 * 60 * 60 * 1000;

  const recentlyContacted = activeClients.filter(
    (c) => c.last_contact_at && now - new Date(c.last_contact_at).getTime() < day14,
  ).length;

  const eligible = activeClients.length - recentlyContacted;

  return `[FLIGHT CONTROL DIAGNOSTIC]
Active Clients: ${activeClients.length}
Recently Contacted (within 14 days, suppressed): ${recentlyContacted}
Eligible for Outreach: ${eligible}
Note: Birthday outreach bypasses the 14-day suppression rule`;
}

function diagTransactions(ctx: DiagContext): string {
  const { settings: s, closedTx, ytdGCI } = ctx;

  const splitMatch = s.split_preset?.match(/p(\d+)_(\d+)/);
  const agentPct = splitMatch ? Number(splitMatch[1]) / 100 : 1;
  const avgDeal = closedTx.length > 0 ? ytdGCI / closedTx.length : 0;

  // Check for GCI overrides
  const overrideCount = closedTx.filter((tx) => tx.gci_override != null && tx.gci_override > 0).length;

  // Check for both-sides deals
  const gciValues = closedTx.map((tx) => computeGCI(tx as Parameters<typeof computeGCI>[0]));
  const minGCI = gciValues.length > 0 ? Math.min(...gciValues) : 0;
  const maxGCI = gciValues.length > 0 ? Math.max(...gciValues) : 0;

  return `[TRANSACTION DIAGNOSTIC]
YTD Closed Deals: ${closedTx.length}
YTD GCI: ${fmtCurrency(ytdGCI)}
Agent Split: ${(agentPct * 100).toFixed(0)}% → Agent Net: ${fmtCurrency(ytdGCI * agentPct)}
Average Deal GCI: ${fmtCurrency(avgDeal)}
GCI Range: ${fmtCurrency(minGCI)} – ${fmtCurrency(maxGCI)}
Deals with GCI Override: ${overrideCount}
Per-Deal Fee Rate: ${((s.tx_fee_rate_pct ?? 0) * 100).toFixed(1)}%
Annual Fee Cap: ${s.tx_fee_annual_cap > 0 ? fmtCurrency(s.tx_fee_annual_cap) : "None"}`;
}

function diagSettings(s: UserSettings): string {
  const splitMatch = s.split_preset?.match(/p(\d+)_(\d+)/);
  const splitLabel = splitMatch ? `${splitMatch[1]}/${splitMatch[2]}` : s.split_preset || "Not set";

  return `[SETTINGS DIAGNOSTIC]
Province: ${s.province || "NOT SET"}
Business Structure: ${s.business_structure ?? "sole_prop"}
Commission Split: ${splitLabel}
Monthly Brokerage Fee: ${fmtCurrency(s.monthly_brokerage_fee ?? 0)}
Per-Deal Fee: ${((s.tx_fee_rate_pct ?? 0) * 100).toFixed(1)}%
Annual Fee Cap: ${s.tx_fee_annual_cap > 0 ? fmtCurrency(s.tx_fee_annual_cap) : "None"}
Post-Cap Rate: ${((s.post_cap_rate_pct ?? 0) * 100).toFixed(1)}%
Cash Reserve: ${fmtCurrency(s.cash_reserve ?? 0)}
Annual GCI Goal: ${s.goal_gci > 0 ? fmtCurrency(s.goal_gci) : "NOT SET"}
Experience Years: ${s.experience_years ?? "NOT SET"}
GST/HST Registered: ${(s.gst_hst_registered || !!s.business_number) ? "Yes" : "No"}
Home Office Method: ${s.home_office_method ?? "none"}
Vehicle Business Use: ${s.vehicle_business_pct ?? 0}%
Seasonal Weights: ${s.seasonal_weights ? `Custom [${s.seasonal_weights.join(", ")}]` : "National default"}`;
}

/**
 * diagSurvival: delegates to survivalResult() from survival-engine.
 * Uses recurring expenses only for burn (not total YTD / months).
 */
function diagSurvival(ctx: DiagContext): string {
  const { settings: s, monthlyRecurring, ytdGCI, pipelineWeighted, engineFraction, expensesYTD, closedTx, pipelineDeals } = ctx;

  // Cash input MUST be cashPosition.effectiveCash (not raw cash_reserve) to
  // match dashboard + chat. See memory/feedback_data_consistency_protocol.md.
  const projGCIforSurvival = projectedYearEndGCI(
    ytdGCI, pipelineWeighted, engineFraction, s.goal_gci ?? 0,
  );
  const projDealsForSurvival = projectedYearEndTransactions(
    closedTx.length, pipelineDeals.length, engineFraction,
  );
  const { cashPosition: diagSurvivalCashPos } = computeEffectiveCashForSurvival({
    settings: s as unknown as CanonicalUserSettings,
    ytdGCI,
    expensesYTD,
    monthlyRecurring,
    projectedGCI: projGCIforSurvival,
    projectedDealCount: projDealsForSurvival,
    fraction: engineFraction,
  });
  const survival = computeSurvivalResult(
    s.monthly_brokerage_fee ?? 0,
    monthlyRecurring,
    diagSurvivalCashPos.effectiveCash,
    0, // conservative: no pipeline income estimate
  );

  const monthsElapsed = Math.max(1, new Date().getMonth() + 1);
  const monthlyAvgIncome = ytdGCI / monthsElapsed;

  return `[SURVIVAL DIAGNOSTIC]
Manual Cash Reserve (raw settings field): ${fmtCurrency(s.cash_reserve ?? 0)}
Effective Cash (implied position — what Survival actually uses): ${fmtCurrency(diagSurvivalCashPos.effectiveCash)}
Monthly Brokerage Fee: ${fmtCurrency(s.monthly_brokerage_fee ?? 0)}
Monthly Recurring Expenses: ${fmtCurrency(monthlyRecurring)}
Total Monthly Burn: ${fmtCurrency(survival.monthlyBurn)}
Monthly Avg Income (for context): ${fmtCurrency(monthlyAvgIncome)}
Runway: ${survival.label}
Risk Level: ${survival.riskLevel === "notConfigured" ? "Not Configured" : survival.riskLevel.charAt(0).toUpperCase() + survival.riskLevel.slice(1)}`;
}

function diagReferrals(referrals: ReferralRow[]): string {
  const inbound = referrals.filter((r) => r.direction === "inbound");
  const outbound = referrals.filter((r) => r.direction === "outbound");

  const statusCounts: Record<string, number> = {};
  for (const r of referrals) {
    statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
  }

  const totalEstimatedFees = referrals.reduce((sum, r) => {
    return sum + (r.estimated_value ?? 0) * (r.referral_fee_pct ?? 0.25);
  }, 0);
  const totalActualFees = referrals.reduce((sum, r) => sum + (r.actual_fee_paid ?? 0), 0);
  const avgFeePct = referrals.length > 0
    ? referrals.reduce((sum, r) => sum + (r.referral_fee_pct ?? 0.25), 0) / referrals.length
    : 0.25;

  const statusLines = Object.entries(statusCounts)
    .map(([status, count]) => `  ${status}: ${count}`)
    .join("\n");

  return `[REFERRALS DIAGNOSTIC]
Total Referrals: ${referrals.length}
Inbound (received from partners): ${inbound.length}
Outbound (sent to partners): ${outbound.length}
By Status:
${statusLines || "  (none)"}
Avg Referral Fee %: ${(avgFeePct * 100).toFixed(0)}%
Total Estimated Fees: ${fmtCurrency(totalEstimatedFees)}
Total Actual Fees Paid/Received: ${fmtCurrency(totalActualFees)}`;
}

/**
 * diagBenchmark: delegates to compare() from benchmark-engine.
 * Uses projectedYearEndGCI for proper projection with seasonal weights.
 */
function diagBenchmark(ctx: DiagContext): string {
  const { settings: s, ytdGCI, pipelineWeighted, engineFraction, closedTx } = ctx;

  const projGCI = projectedYearEndGCI(
    ytdGCI, pipelineWeighted, engineFraction, s.goal_gci ?? 0,
  );

  // Canonical benchmark engine
  const benchmark = benchmarkCompare(projGCI, s.experience_years ?? null);

  return `[BENCHMARK DIAGNOSTIC]
Experience: ${s.experience_years ?? 0} years → Cohort: ${COHORT_LABELS[benchmark.cohort]}
Cohort Median GCI: ${fmtCurrency(benchmark.cohortMedianGCI)}
Your Projected Annual GCI: ${fmtCurrency(projGCI)}
Your YTD Deals: ${closedTx.length}
Percentile in Cohort: ${benchmark.percentile}th
National Percentile: ${benchmark.nationalPercentile}th
${benchmark.distanceToNextTier != null && benchmark.nextTierLabel
    ? `Distance to ${benchmark.nextTierLabel}: ${fmtCurrency(benchmark.distanceToNextTier)} more projected GCI`
    : "Currently in highest tier"}`;
}
