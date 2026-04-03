/**
 * Chat Diagnostics Module
 *
 * Computes step-by-step diagnostic data for the AI to reference when
 * troubleshooting user issues. Rather than the AI guessing at formulas,
 * this module runs the actual engine calculations and formats them as
 * readable diagnostic strings injected into the system prompt.
 *
 * Each diagnostic function returns a plain string (or null if not applicable).
 */

import { createClient } from "@/lib/supabase/server";
import { computeGCI, computeWeightedGCI } from "@/lib/types/database";
import { fmtCurrency } from "@/lib/formatters";
import {
  seasonalFractionElapsed,
  paceVsGoalPercent,
  projectYearEndGCI,
} from "@agent-runway/core/engines/projection-engine";
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
  business_structure: string;
  gst_registered: boolean;
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
  ]);

  if (!settings) return "\n[DIAGNOSTIC: No user settings found — user may not have completed onboarding]";

  const s = settings as UserSettings;
  const closedTx = (allTransactions ?? []).filter(
    (tx) => tx.status === "closed" && tx.date?.startsWith(String(currentYear)),
  ) as Transaction[];
  const pipelineDeals = (pipeline ?? []) as PipelineDeal[];
  const expenses = (expenseCategories ?? []) as ExpenseCategory[];

  const ytdGCI = closedTx.reduce((sum, tx) => sum + computeGCI(tx), 0);
  const pipelineWeighted = pipelineDeals.reduce((sum, d) => sum + computeWeightedGCI(d), 0);

  const diagnosticParts: string[] = [];

  for (const topic of dataTopics) {
    const diag = buildTopicDiagnostic(topic, s, closedTx, pipelineDeals, expenses, clients ?? [], ytdGCI, pipelineWeighted, currentYear);
    if (diag) diagnosticParts.push(diag);
  }

  if (diagnosticParts.length === 0) return "";

  return `\n\nDIAGNOSTIC DATA (step-by-step calculations for this user — reference these when troubleshooting):\n${diagnosticParts.join("\n\n")}`;
}

// ─── Topic-Specific Diagnostics ───────────────────────────────────────────────

function buildTopicDiagnostic(
  topic: TroubleshootingTopic,
  settings: UserSettings,
  closedTx: Transaction[],
  pipeline: PipelineDeal[],
  expenses: ExpenseCategory[],
  clients: { id: string; status: string; last_contact_at: string | null; created_at: string }[],
  ytdGCI: number,
  pipelineWeighted: number,
  currentYear: number,
): string | null {
  switch (topic) {
    case "runway-score":
      return diagRunwayScore(settings, closedTx, pipeline, expenses, ytdGCI, pipelineWeighted);
    case "tax":
      return diagTax(settings, closedTx, expenses, ytdGCI);
    case "pipeline":
      return diagPipeline(settings, pipeline, pipelineWeighted, ytdGCI);
    case "expenses":
      return diagExpenses(expenses, ytdGCI);
    case "forecast":
      return diagForecast(settings, closedTx, ytdGCI, pipelineWeighted);
    case "crm":
      return diagCRM(clients);
    case "flight-control":
      return diagFlightControl(clients);
    case "transactions":
      return diagTransactions(settings, closedTx, ytdGCI);
    case "settings":
      return diagSettings(settings);
    case "survival":
      return diagSurvival(settings, expenses, ytdGCI);
    case "benchmark":
      return diagBenchmark(settings, ytdGCI, closedTx.length);
    default:
      return null;
  }
}

// ─── Individual Diagnostic Builders ───────────────────────────────────────────

function diagRunwayScore(
  s: UserSettings,
  closedTx: Transaction[],
  pipeline: PipelineDeal[],
  expenses: ExpenseCategory[],
  ytdGCI: number,
  pipelineWeighted: number,
): string {
  const fraction = seasonalFractionElapsed(s.seasonal_weights);
  const pacePercent = s.goal_gci > 0 ? paceVsGoalPercent(s.goal_gci, ytdGCI, fraction) : 0;

  // Pace Score: map [-50, +50] → [0, 100]
  const paceScore = Math.max(0, Math.min(100, ((pacePercent + 50) / 100) * 100));

  // Pipeline Score
  const remainingGoal = Math.max(0, s.goal_gci - ytdGCI);
  let pipelineScore: number;
  if (remainingGoal <= 0) {
    pipelineScore = 100;
  } else {
    const ratio = pipelineWeighted / remainingGoal;
    if (ratio >= 1.5) pipelineScore = 100;
    else if (ratio >= 1.0) pipelineScore = 80 + (ratio - 1.0) / 0.5 * 20;
    else if (ratio >= 0.5) pipelineScore = 50 + (ratio - 0.5) / 0.5 * 30;
    else pipelineScore = 20 + ratio / 0.5 * 30;
  }

  // Expense Score
  const totalExpenses = expenses.reduce(
    (sum, cat) => sum + (cat.expense_items ?? []).reduce((s, i) => s + Number(i.ytd_amount ?? 0), 0),
    0,
  );
  const expenseRatio = ytdGCI > 0 ? totalExpenses / ytdGCI : 0;
  let expenseScore: number;
  if (ytdGCI === 0) expenseScore = 50;
  else if (expenseRatio > 0.5) expenseScore = 30;
  else if (expenseRatio > 0.35) expenseScore = 55;
  else if (expenseRatio > 0.25) expenseScore = 75;
  else expenseScore = 90;

  // Survival Score
  const monthsElapsed = Math.max(1, new Date().getMonth() + 1);
  const monthlyExpenses = totalExpenses / monthsElapsed;
  const monthlyIncome = ytdGCI / monthsElapsed;
  const netBurn = monthlyExpenses - monthlyIncome;
  const cashReserve = s.cash_reserve ?? 0;
  let runwayMonths: number;
  let survivalScore: number;

  if (cashReserve <= 0) {
    runwayMonths = -1;
    survivalScore = 50;
  } else if (netBurn <= 0) {
    runwayMonths = 24;
    survivalScore = 95;
  } else {
    runwayMonths = Math.min(24, cashReserve / netBurn);
    if (runwayMonths >= 6) survivalScore = 95;
    else if (runwayMonths >= 4) survivalScore = 75;
    else if (runwayMonths >= 2) survivalScore = 50;
    else if (runwayMonths >= 1) survivalScore = 25;
    else survivalScore = 10;
  }

  // Benchmark Score (simplified — just use 50 as placeholder without full CREA data)
  const benchmarkScore = 50;

  const finalScore =
    paceScore * 0.35 +
    pipelineScore * 0.25 +
    expenseScore * 0.15 +
    survivalScore * 0.15 +
    benchmarkScore * 0.10;

  const grade =
    finalScore >= 92 ? "A+" :
    finalScore >= 85 ? "A" :
    finalScore >= 75 ? "B" :
    finalScore >= 62 ? "C" :
    finalScore >= 50 ? "D" : "F";

  return `[RUNWAY SCORE BREAKDOWN]
Score: ${Math.round(finalScore)} (${grade})
├─ Pace (35%): ${Math.round(paceScore)}/100 — ${pacePercent >= 0 ? "+" : ""}${Math.round(pacePercent)}% vs goal, seasonal fraction: ${(fraction * 100).toFixed(1)}%
├─ Pipeline (25%): ${Math.round(pipelineScore)}/100 — ${fmtCurrency(pipelineWeighted)} weighted vs ${fmtCurrency(remainingGoal)} remaining goal
├─ Expenses (15%): ${Math.round(expenseScore)}/100 — ratio: ${(expenseRatio * 100).toFixed(1)}% (${fmtCurrency(totalExpenses)} / ${fmtCurrency(ytdGCI)})
├─ Survival (15%): ${Math.round(survivalScore)}/100 — ${runwayMonths === -1 ? "not configured" : `${runwayMonths.toFixed(1)} months`} (cash: ${fmtCurrency(cashReserve)})
└─ Benchmark (10%): ${benchmarkScore}/100 (approximated)
Weakest: ${getWeakest({ pace: paceScore * 0.35, pipeline: pipelineScore * 0.25, expenses: expenseScore * 0.15, survival: survivalScore * 0.15, benchmark: benchmarkScore * 0.10 })}`;
}

function diagTax(
  s: UserSettings,
  closedTx: Transaction[],
  expenses: ExpenseCategory[],
  ytdGCI: number,
): string {
  const splitMatch = s.split_preset?.match(/p(\d+)_(\d+)/);
  const agentPct = splitMatch ? Number(splitMatch[1]) / 100 : 1;

  const totalExpenses = expenses.reduce(
    (sum, cat) => sum + (cat.expense_items ?? []).reduce((s, i) => s + Number(i.ytd_amount ?? 0), 0),
    0,
  );

  const fraction = seasonalFractionElapsed(s.seasonal_weights);
  const projectedGCI = fraction > 0 ? ytdGCI / fraction : s.goal_gci || 0;
  const projectedAgentNet = projectedGCI * agentPct;
  const annualizedExpenses = fraction > 0 ? totalExpenses / fraction : totalExpenses;
  const netSEIncome = Math.max(0, projectedAgentNet - annualizedExpenses);

  // CPP calculation
  const cpp1Base = Math.min(Math.max(0, netSEIncome - 3500), 71300 - 3500);
  const cpp1 = cpp1Base * 0.119;
  const cpp2Base = Math.min(Math.max(0, netSEIncome - 71300), 81200 - 71300);
  const cpp2 = cpp2Base * 0.08;

  const taxableIncome = Math.max(0, netSEIncome - cpp1 * 0.5 - cpp2);
  const dealCount = closedTx.length;
  const projectedDeals = fraction > 0 ? dealCount / fraction : dealCount || 1;

  return `[TAX DIAGNOSTIC]
Province: ${s.province}
Business Structure: ${s.business_structure ?? "sole_prop"}
GST/HST Registered: ${s.gst_registered ? "Yes" : "No"}
Projected Annual GCI: ${fmtCurrency(projectedGCI)}
Agent Split: ${(agentPct * 100).toFixed(0)}% → Projected Agent Net: ${fmtCurrency(projectedAgentNet)}
Annualized Expenses: ${fmtCurrency(annualizedExpenses)}
Net Self-Employment Income: ${fmtCurrency(netSEIncome)}
CPP1: ${fmtCurrency(cpp1)} (on ${fmtCurrency(cpp1Base)} @ 11.90%)
CPP2: ${fmtCurrency(cpp2)} (on ${fmtCurrency(cpp2Base)} @ 8.00%)
Taxable Income (after CPP deductions): ${fmtCurrency(taxableIncome)}
Projected Deal Count: ~${Math.round(projectedDeals)}
Est. Per-Deal Set-Aside: See Forecast page for exact figure`;
}

function diagPipeline(
  s: UserSettings,
  pipeline: PipelineDeal[],
  pipelineWeighted: number,
  ytdGCI: number,
): string {
  const stageCount: Record<string, number> = {};
  const stageValue: Record<string, number> = {};
  for (const d of pipeline) {
    const stage = d.stage || "unknown";
    stageCount[stage] = (stageCount[stage] ?? 0) + 1;
    stageValue[stage] = (stageValue[stage] ?? 0) + computeWeightedGCI(d);
  }

  const remainingGoal = Math.max(0, (s.goal_gci || 0) - ytdGCI);
  const coverageRatio = remainingGoal > 0 ? pipelineWeighted / remainingGoal : Infinity;

  const stageLines = Object.entries(stageCount)
    .map(([stage, count]) => `  ${stage}: ${count} deals, ${fmtCurrency(stageValue[stage] ?? 0)} weighted`)
    .join("\n");

  return `[PIPELINE DIAGNOSTIC]
Total Pipeline Deals: ${pipeline.length}
Total Weighted GCI: ${fmtCurrency(pipelineWeighted)}
Remaining Goal Gap: ${fmtCurrency(remainingGoal)}
Coverage Ratio: ${coverageRatio === Infinity ? "Goal met" : coverageRatio.toFixed(2) + "x"}
By Stage:
${stageLines || "  (empty pipeline)"}
Avg Deal GCI Needed to Fill Gap: ${remainingGoal > 0 && pipeline.length > 0 ? fmtCurrency(remainingGoal / Math.max(1, Math.ceil(remainingGoal / (ytdGCI / Math.max(1, pipeline.length))))) : "N/A"}`;
}

function diagExpenses(expenses: ExpenseCategory[], ytdGCI: number): string {
  const categoryTotals: { name: string; ytd: number; recurring: number }[] = [];

  let totalYTD = 0;
  let totalRecurring = 0;

  for (const cat of expenses) {
    const ytd = (cat.expense_items ?? []).reduce((s, i) => s + Number(i.ytd_amount ?? 0), 0);
    const recurring = (cat.expense_items ?? []).reduce((s, i) => s + Number(i.monthly_recurring ?? 0), 0);
    if (ytd > 0 || recurring > 0) {
      categoryTotals.push({ name: cat.name, ytd, recurring });
      totalYTD += ytd;
      totalRecurring += recurring;
    }
  }

  const ratio = ytdGCI > 0 ? (totalYTD / ytdGCI) * 100 : 0;
  const ratingLabel = ytdGCI === 0 ? "N/A (no GCI)" :
    ratio > 50 ? "WARNING" :
    ratio > 35 ? "Concerning" :
    ratio > 30 ? "Needs attention" :
    ratio > 25 ? "Healthy" : "Excellent";

  const catLines = categoryTotals
    .sort((a, b) => b.ytd - a.ytd)
    .slice(0, 8)
    .map((c) => `  ${c.name}: YTD ${fmtCurrency(c.ytd)}${c.recurring > 0 ? ` + ${fmtCurrency(c.recurring)}/mo recurring` : ""}`)
    .join("\n");

  return `[EXPENSE DIAGNOSTIC]
YTD Expenses: ${fmtCurrency(totalYTD)}
Monthly Recurring: ${fmtCurrency(totalRecurring)}
Expense Ratio: ${ratio.toFixed(1)}% (${ratingLabel})
YTD GCI (denominator): ${fmtCurrency(ytdGCI)}
Top Categories:
${catLines || "  (no expenses logged)"}`;
}

function diagForecast(
  s: UserSettings,
  closedTx: Transaction[],
  ytdGCI: number,
  pipelineWeighted: number,
): string {
  const fraction = seasonalFractionElapsed(s.seasonal_weights);
  const rawProjection = fraction > 0 ? ytdGCI / fraction : 0;
  const projectedGCI = rawProjection + pipelineWeighted * 0.5;

  const splitMatch = s.split_preset?.match(/p(\d+)_(\d+)/);
  const agentPct = splitMatch ? Number(splitMatch[1]) / 100 : 1;

  const projectedAgentNet = projectedGCI * agentPct;
  const monthlyFees = (s.monthly_brokerage_fee ?? 0) * 12;
  const dealCount = closedTx.length;
  const projectedDeals = fraction > 0 ? Math.round(dealCount / fraction) : dealCount;
  const perDealFees = projectedDeals * (projectedGCI / Math.max(1, projectedDeals)) * (s.tx_fee_rate_pct ?? 0);
  const cappedFees = s.tx_fee_annual_cap > 0 ? Math.min(perDealFees, s.tx_fee_annual_cap) : perDealFees;

  const pacePercent = s.goal_gci > 0 ? paceVsGoalPercent(s.goal_gci, ytdGCI, fraction) : 0;
  const remainingGoal = Math.max(0, (s.goal_gci || 0) - ytdGCI - pipelineWeighted);
  const avgDealGCI = dealCount > 0 ? ytdGCI / dealCount : 0;
  const dealsNeeded = avgDealGCI > 0 ? Math.ceil(remainingGoal / avgDealGCI) : 0;

  return `[FORECAST DIAGNOSTIC]
Seasonal Fraction Elapsed: ${(fraction * 100).toFixed(1)}%
YTD Closed GCI: ${fmtCurrency(ytdGCI)} (${dealCount} deals)
Pipeline Weighted: ${fmtCurrency(pipelineWeighted)}
Raw Projection (YTD ÷ fraction): ${fmtCurrency(rawProjection)}
+ Pipeline Adjustment (50%): ${fmtCurrency(pipelineWeighted * 0.5)}
= Projected Year-End GCI: ${fmtCurrency(projectedGCI)}
Conservative (−15%): ${fmtCurrency(projectedGCI * 0.85)}
Optimistic (+15%): ${fmtCurrency(projectedGCI * 1.15)}
Waterfall Preview:
  Projected GCI: ${fmtCurrency(projectedGCI)}
  − Brokerage Share: ${fmtCurrency(projectedGCI - projectedAgentNet)}
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
  const activeStatuses = ["boarding", "taxiing", "approach", "in_flight"];

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
  const activeStatuses = ["boarding", "taxiing", "approach", "in_flight"];
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

function diagTransactions(
  s: UserSettings,
  closedTx: Transaction[],
  ytdGCI: number,
): string {
  const splitMatch = s.split_preset?.match(/p(\d+)_(\d+)/);
  const agentPct = splitMatch ? Number(splitMatch[1]) / 100 : 1;
  const avgDeal = closedTx.length > 0 ? ytdGCI / closedTx.length : 0;

  // Check for GCI overrides
  const overrideCount = closedTx.filter((tx) => tx.gci_override != null && tx.gci_override > 0).length;

  // Check for both-sides deals
  const gciValues = closedTx.map((tx) => computeGCI(tx));
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
GST/HST Registered: ${s.gst_registered ? "Yes" : "No"}
Home Office Method: ${s.home_office_method ?? "none"}
Vehicle Business Use: ${s.vehicle_business_pct ?? 0}%
Seasonal Weights: ${s.seasonal_weights ? `Custom [${s.seasonal_weights.join(", ")}]` : "National default"}
CREA Board: ${s.board_code || "NOT SET"}`;
}

function diagSurvival(
  s: UserSettings,
  expenses: ExpenseCategory[],
  ytdGCI: number,
): string {
  const totalExpenses = expenses.reduce(
    (sum, cat) => sum + (cat.expense_items ?? []).reduce((s, i) => s + Number(i.ytd_amount ?? 0), 0),
    0,
  );
  const monthsElapsed = Math.max(1, new Date().getMonth() + 1);
  const monthlyExpenses = totalExpenses / monthsElapsed;
  const monthlyRecurring = expenses.reduce(
    (sum, cat) => sum + (cat.expense_items ?? []).reduce((s, i) => s + Number(i.monthly_recurring ?? 0), 0),
    0,
  );
  const monthlyIncome = ytdGCI / monthsElapsed;
  const netBurn = monthlyExpenses - monthlyIncome;
  const cashReserve = s.cash_reserve ?? 0;

  let runwayMonths: number;
  let riskLevel: string;

  if (cashReserve <= 0) {
    runwayMonths = -1;
    riskLevel = "Not Configured";
  } else if (netBurn <= 0) {
    runwayMonths = 24;
    riskLevel = "Strong (cash-flow positive)";
  } else {
    runwayMonths = Math.min(24, cashReserve / netBurn);
    riskLevel = runwayMonths >= 6 ? "Strong" :
      runwayMonths >= 4 ? "Healthy" :
      runwayMonths >= 2 ? "Warning" : "CRITICAL";
  }

  return `[SURVIVAL DIAGNOSTIC]
Cash Reserve: ${fmtCurrency(cashReserve)}
Monthly Avg Expenses: ${fmtCurrency(monthlyExpenses)} (from ${monthsElapsed} months of data)
Monthly Recurring Expenses: ${fmtCurrency(monthlyRecurring)}
Monthly Avg Income: ${fmtCurrency(monthlyIncome)}
Net Monthly Burn: ${fmtCurrency(Math.max(0, netBurn))}${netBurn <= 0 ? " (cash-flow positive)" : ""}
Runway: ${runwayMonths === -1 ? "Not Configured" : `${runwayMonths.toFixed(1)} months`}
Risk Level: ${riskLevel}`;
}

function diagBenchmark(
  s: UserSettings,
  ytdGCI: number,
  dealCount: number,
): string {
  const years = s.experience_years ?? 0;
  const cohort = years <= 2 ? "Rookie" : years <= 5 ? "Growth" : years <= 10 ? "Established" : "Top Producer";
  const benchmarks: Record<string, { median: number; deals: number; avgPrice: number }> = {
    Rookie: { median: 42000, deals: 4, avgPrice: 380000 },
    Growth: { median: 78000, deals: 7, avgPrice: 400000 },
    Established: { median: 96000, deals: 8, avgPrice: 420000 },
    "Top Producer": { median: 145000, deals: 12, avgPrice: 460000 },
  };
  const bm = benchmarks[cohort];

  const fraction = seasonalFractionElapsed(s.seasonal_weights);
  const projectedGCI = fraction > 0 ? ytdGCI / fraction : 0;
  const vsMedian = bm.median > 0 ? ((projectedGCI / bm.median) * 100).toFixed(0) : "N/A";

  return `[BENCHMARK DIAGNOSTIC]
Experience: ${years} years → Cohort: ${cohort}
Cohort Median GCI: ${fmtCurrency(bm.median)} / ${bm.deals} deals
Your Projected Annual GCI: ${fmtCurrency(projectedGCI)}
Your YTD Deals: ${dealCount}
Projected vs Cohort Median: ${vsMedian}%
National Median (all agents): $96,000 / 8 deals`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeakest(components: Record<string, number>): string {
  let weakest = "";
  let minValue = Infinity;
  for (const [name, value] of Object.entries(components)) {
    if (value < minValue) {
      minValue = value;
      weakest = name;
    }
  }
  return weakest ? `${weakest} (contributing ${minValue.toFixed(1)} points)` : "none";
}
