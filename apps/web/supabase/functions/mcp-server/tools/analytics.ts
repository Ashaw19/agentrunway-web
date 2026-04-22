import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { McpTool } from "./index.ts";
import { calculate as calculateTax, type Province } from "../lib/canadian-tax-engine.ts";
import {
  computeProjectedNetForTax,
  type EffectiveCashSettingsSlice,
  type SplitPreset,
} from "../lib/effective-cash.ts";
import {
  computeHSTCollected,
  computeHSTNetOwing,
  gstHstLabel,
  gstHstRate,
} from "../lib/hst-engine.ts";
import { CANONICAL_TAX_DISCLAIMER } from "../lib/constants.ts";

// Canonical stage probabilities — mirrors packages/core/types/database.ts PIPELINE_STAGE_DEFAULTS
const PIPELINE_STAGE_DEFAULTS: Record<string, number> = {
  lead: 0.1, showing: 0.25, offer: 0.5, conditional: 0.75, firm: 0.9, closed: 1.0,
};

export function getAnalyticsTools(supabase: SupabaseClient, userId: string): McpTool[] {
  return [
    // ── get_dashboard_kpis ──────────────────────────────────────────────────
    {
      name: "get_dashboard_kpis",
      description:
        "Returns the agent's key performance indicators for the current year: YTD GCI, transaction count, pipeline value, expenses, goal progress, and projected year-end GCI.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: {
        title: "Dashboard KPIs",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async () => {
        const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0];
        const today = new Date().toISOString().split("T")[0];

        const [settingsRes, txRes, pipelineRes, expenseRes] = await Promise.all([
          supabase
            .from("user_settings")
            .select("goal_gci, goal_transactions, ytd_gci, ytd_transactions, province")
            .eq("user_id", userId)
            .maybeSingle(),
          supabase
            .from("transactions")
            .select("sale_price, commission_pct, gci_override, team_split_pct, date, status")
            .eq("user_id", userId)
            .eq("status", "closed")
            .gte("date", yearStart)
            .lte("date", today),
          supabase
            .from("pipeline_deals")
            .select("estimated_price, estimated_commission_pct, stage, probability_override")
            .eq("user_id", userId)
            .neq("stage", "closed"),
          supabase
            .from("expense_items")
            .select("ytd_amount")
            .eq("user_id", userId),
        ]);

        const settings = settingsRes.data;
        const transactions = txRes.data ?? [];
        const deals = pipelineRes.data ?? [];
        const expenses = expenseRes.data ?? [];

        // YTD GCI from closed transactions this year
        const ytdGCI = transactions.reduce((sum, tx) => {
          if (tx.gci_override != null) return sum + tx.gci_override;
          const raw = (tx.sale_price ?? 0) * (tx.commission_pct ?? 0.025);
          return sum + ((tx.team_split_pct != null && tx.team_split_pct > 0)
            ? raw * tx.team_split_pct
            : raw);
        }, 0);

        // Pipeline weighted GCI
        const pipelineWeighted = deals.reduce((sum, deal) => {
          const prob = deal.probability_override ??
            PIPELINE_STAGE_DEFAULTS[deal.stage as keyof typeof PIPELINE_STAGE_DEFAULTS] ??
            0.5;
          const estGCI = (deal.estimated_price ?? 0) * (deal.estimated_commission_pct ?? 0.025);
          return sum + estGCI * prob;
        }, 0);

        // YTD expenses
        const ytdExpenses = expenses.reduce((sum, e) => sum + (e.ytd_amount ?? 0), 0);

        // Year fraction elapsed
        const now = new Date();
        const yearDay = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86_400_000);
        const yearDays = (now.getFullYear() % 4 === 0 && (now.getFullYear() % 100 !== 0 || now.getFullYear() % 400 === 0)) ? 366 : 365;
        const yearFraction = yearDay / yearDays;

        const goalGCI = settings?.goal_gci ?? 0;
        const goalTx = settings?.goal_transactions ?? 0;
        const projectedYearEnd = yearFraction > 0.01 ? Math.round(ytdGCI / yearFraction) : null;
        const goalProgressPct = goalGCI > 0 ? Math.round((ytdGCI / goalGCI) * 100) : null;
        const paceVsGoalPct = goalGCI > 0 && yearFraction > 0
          ? Math.round(((ytdGCI / (goalGCI * yearFraction)) - 1) * 100)
          : null;

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              as_of: today,
              year: now.getFullYear(),
              ytd_gci: Math.round(ytdGCI),
              ytd_transactions: transactions.length,
              ytd_expenses: Math.round(ytdExpenses),
              ytd_net_income: Math.round(ytdGCI - ytdExpenses),
              pipeline_weighted_gci: Math.round(pipelineWeighted),
              pipeline_deal_count: deals.length,
              goal_gci: goalGCI,
              goal_transactions: goalTx,
              goal_progress_pct: goalProgressPct,
              pace_vs_goal_pct: paceVsGoalPct,
              projected_year_end_gci: projectedYearEnd,
              year_pct_elapsed: Math.round(yearFraction * 100),
            }, null, 2),
          }],
        };
      },
    },

    // ── get_runway_score ────────────────────────────────────────────────────
    {
      name: "get_runway_score",
      description:
        "Returns the agent's Runway Score — a 0–100 composite business health grade (A+ to F) based on goal pace, pipeline health, expense control, market benchmark, and financial runway.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: {
        title: "Runway Score",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async () => {
        const { data: settings } = await supabase
          .from("user_settings")
          .select("runway_score_snapshot")
          .eq("user_id", userId)
          .maybeSingle();

        const snapshot = settings?.runway_score_snapshot as
          | { score: number; grade?: string; month?: string; components?: unknown[] }
          | null;

        if (!snapshot?.score) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                available: false,
                message: "Runway Score not yet computed. Open Agent Runway and navigate to the dashboard to generate your score.",
              }, null, 2),
            }],
          };
        }

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              score: snapshot.score,
              // Canonical prose band — mirrors packages/core/engines/runway-score-engine.ts stateLabel()
              stateLabel: stateLabelFromScore(snapshot.score),
              // @deprecated Visual-shorthand letter only; use stateLabel for prose.
              grade: snapshot.grade ?? gradeFromScore(snapshot.score),
              month: snapshot.month ?? null,
              components: snapshot.components ?? null,
            }, null, 2),
          }],
        };
      },
    },

    // ── get_forecast ────────────────────────────────────────────────────────
    {
      name: "get_forecast",
      description:
        "Returns the agent's projected year-end GCI and transaction count based on current pace, pipeline, and historical performance.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: {
        title: "Year-End Forecast",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async () => {
        const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0];
        const today = new Date().toISOString().split("T")[0];

        const [settingsRes, txRes, pipelineRes, historyRes] = await Promise.all([
          supabase
            .from("user_settings")
            .select("goal_gci, goal_transactions")
            .eq("user_id", userId)
            .maybeSingle(),
          supabase
            .from("transactions")
            .select("sale_price, commission_pct, gci_override, team_split_pct, date")
            .eq("user_id", userId)
            .eq("status", "closed")
            .gte("date", yearStart)
            .lte("date", today),
          supabase
            .from("pipeline_deals")
            .select("estimated_price, estimated_commission_pct, stage, probability_override, expected_close_date")
            .eq("user_id", userId)
            .neq("stage", "closed"),
          supabase
            .from("history_items")
            .select("year, annual_gci, annual_tx")
            .eq("user_id", userId)
            .order("year", { ascending: false })
            .limit(3),
        ]);

        const settings = settingsRes.data;
        const transactions = txRes.data ?? [];
        const deals = pipelineRes.data ?? [];
        const history = historyRes.data ?? [];

        // YTD GCI
        const ytdGCI = transactions.reduce((sum, tx) => {
          if (tx.gci_override != null) return sum + tx.gci_override;
          const raw = (tx.sale_price ?? 0) * (tx.commission_pct ?? 0.025);
          return sum + ((tx.team_split_pct != null && tx.team_split_pct > 0)
            ? raw * tx.team_split_pct
            : raw);
        }, 0);

        // Pipeline GCI (high-probability deals expected this year)
        const pipelineThisYear = deals
          .filter((d) => {
            if (!d.expected_close_date) return true;
            return d.expected_close_date.startsWith(String(new Date().getFullYear()));
          })
          .reduce((sum, deal) => {
            const prob = deal.probability_override ??
              PIPELINE_STAGE_DEFAULTS[deal.stage as keyof typeof PIPELINE_STAGE_DEFAULTS] ??
              0.5;
            const estGCI = (deal.estimated_price ?? 0) * (deal.estimated_commission_pct ?? 0.025);
            return sum + estGCI * prob;
          }, 0);

        const now = new Date();
        const yearDay = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86_400_000);
        const yearDays = (now.getFullYear() % 4 === 0 && (now.getFullYear() % 100 !== 0 || now.getFullYear() % 400 === 0)) ? 366 : 365;
        const yearFraction = yearDay / yearDays;

        // Pace-based projection
        const paceProjection = yearFraction > 0.01 ? ytdGCI / yearFraction : null;

        // Blended: 60% pace + 40% pipeline-augmented
        const blended = paceProjection != null
          ? Math.round(paceProjection * 0.6 + (ytdGCI + pipelineThisYear) * 0.4)
          : null;

        const goalGCI = settings?.goal_gci ?? 0;
        const confidence = transactions.length >= 5 ? "high" : transactions.length >= 2 ? "medium" : "low";

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              year: now.getFullYear(),
              as_of: today,
              ytd_gci: Math.round(ytdGCI),
              ytd_transactions: transactions.length,
              pace_projection: paceProjection ? Math.round(paceProjection) : null,
              pipeline_contribution: Math.round(pipelineThisYear),
              blended_projection: blended,
              goal_gci: goalGCI,
              on_track_for_goal: goalGCI > 0 && blended != null ? blended >= goalGCI : null,
              confidence,
              data_points: transactions.length,
              prior_years: history.map((h) => ({
                year: h.year,
                gci: h.annual_gci,
                transactions: h.annual_tx,
              })),
            }, null, 2),
          }],
        };
      },
    },

    // ── get_tax_estimate ────────────────────────────────────────────────────
    {
      name: "get_tax_estimate",
      description:
        "Returns a Canadian income tax estimate for the agent's projected year-end net income, including CPP contributions, federal and provincial tax, effective rate, and quarterly installment amount. ESTIMATE ONLY — not tax advice.",
      inputSchema: {
        type: "object",
        properties: {
          override_income: {
            type: "number",
            description: "Optional: override the projected net income used for the tax estimate. If omitted, uses the current year projection minus YTD expenses.",
          },
        },
        additionalProperties: false,
      },
      annotations: {
        title: "Canadian Tax Estimate",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (args) => {
        const overrideIncome = (args as { override_income?: number }).override_income;
        const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0];
        const today = new Date().toISOString().split("T")[0];

        const [settingsRes, txRes, expenseRes] = await Promise.all([
          supabase
            .from("user_settings")
            .select(
              "goal_gci, province, split_preset, post_cap_threshold_gci, " +
              "post_cap_agent_pct, post_cap_brokerage_pct, tx_fee_rate_pct, " +
              "tx_fee_annual_cap, monthly_brokerage_fee",
            )
            .eq("user_id", userId)
            .maybeSingle(),
          supabase
            .from("transactions")
            .select("sale_price, commission_pct, gci_override, team_split_pct, date")
            .eq("user_id", userId)
            .eq("status", "closed")
            .gte("date", yearStart)
            .lte("date", today),
          supabase
            .from("expense_items")
            .select("ytd_amount, monthly_recurring")
            .eq("user_id", userId),
        ]);

        const settings = settingsRes.data;
        const transactions = txRes.data ?? [];
        const expenses = expenseRes.data ?? [];

        const ytdGCI = transactions.reduce((sum, tx) => {
          if (tx.gci_override != null) return sum + tx.gci_override;
          const raw = (tx.sale_price ?? 0) * (tx.commission_pct ?? 0.025);
          return sum + ((tx.team_split_pct != null && tx.team_split_pct > 0)
            ? raw * tx.team_split_pct
            : raw);
        }, 0);

        const ytdExpenses = expenses.reduce((sum, e) => sum + (e.ytd_amount ?? 0), 0);
        const monthlyRecurring = expenses.reduce(
          (sum, e) => sum + (e.monthly_recurring ?? 0),
          0,
        );

        // Year fraction for projection
        const now = new Date();
        const yearDay = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86_400_000);
        const yearDays = (now.getFullYear() % 4 === 0 && (now.getFullYear() % 100 !== 0 || now.getFullYear() % 400 === 0)) ? 366 : 365;
        const yearFraction = yearDay / yearDays;

        // D-2 fix (Audit 1, 2026-04-22): replaced broken inline formula
        // `projectedGCI - projectedExpenses` (no split, no tx fees, no
        // brokerage monthly × 12 — ~2× off for split agents) with the
        // canonical helper that mirrors the dashboard at
        // packages/core/engines/effective-cash.ts:computeProjectedNetForTax.
        // The helper here is a deliberate Deno copy per Pattern P-2 — keep
        // it in sync with the canonical version. See lib/README.md.
        let netIncome: number;
        if (overrideIncome != null) {
          netIncome = overrideIncome;
        } else if (yearFraction > 0.01 && settings) {
          const projectedGCI = ytdGCI / yearFraction;
          const settingsSlice: EffectiveCashSettingsSlice = {
            split_preset: (settings.split_preset ?? "p100_0") as SplitPreset,
            post_cap_threshold_gci: settings.post_cap_threshold_gci ?? 0,
            post_cap_agent_pct: settings.post_cap_agent_pct ?? 1,
            post_cap_brokerage_pct: settings.post_cap_brokerage_pct ?? 0,
            tx_fee_rate_pct: settings.tx_fee_rate_pct ?? 0,
            tx_fee_annual_cap: settings.tx_fee_annual_cap ?? 0,
            monthly_brokerage_fee: settings.monthly_brokerage_fee ?? 0,
          };
          netIncome = computeProjectedNetForTax({
            projectedGCI,
            expensesYTD: ytdExpenses,
            monthlyRecurring,
            settings: settingsSlice,
            now,
          });
        } else {
          // Very early year or missing settings — fall back to the simple
          // YTD net. Still lands on the canonical floor (no negatives).
          netIncome = Math.max(0, ytdGCI - ytdExpenses);
        }

        netIncome = Math.max(0, Math.round(netIncome));

        const province = (settings?.province ?? "ontario") as Province;
        const projectedDealCount = yearFraction > 0.01
          ? Math.max(1, Math.round(transactions.length / yearFraction))
          : Math.max(1, transactions.length);

        const taxResult = calculateTax(netIncome, province, projectedDealCount);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              disclaimer: CANONICAL_TAX_DISCLAIMER,
              tax_year: taxResult.taxYear,
              province: taxResult.provinceName,
              projected_net_income: netIncome,
              gross_income: Math.round(taxResult.grossIncome),
              cpp1_contribution: Math.round(taxResult.cpp1Contribution),
              cpp2_contribution: Math.round(taxResult.cpp2Contribution),
              total_cpp: Math.round(taxResult.totalCPP),
              federal_tax: Math.round(taxResult.federalTax),
              provincial_tax: Math.round(taxResult.provincialTax),
              total_tax: Math.round(taxResult.totalTax),
              total_burden: Math.round(taxResult.totalBurden),
              effective_rate_pct: Math.round(taxResult.effectiveRate * 100 * 10) / 10,
              quarterly_installment: Math.round(taxResult.quarterlyEstimate),
              per_deal_set_aside: Math.round(taxResult.perDealSetAside),
              projected_deal_count: projectedDealCount,
            }, null, 2),
          }],
        };
      },
    },

    // ── get_hst_status ──────────────────────────────────────────────────────
    // D-4 fix (Audit 1, 2026-04-22): closes the MCP coverage gap on HST.
    // Calls the canonical computeHSTCollected helper (mirrored from
    // packages/core/engines/hst-engine.ts) so every surface — chat, dashboard,
    // reports, forecast, MCP — returns the same HST cash-flow number for the
    // same inputs. Respects both gst_hst_registered and
    // brokerage_withholds_hst: a registered agent whose brokerage remits HST
    // has an agent-side collected amount of $0 (the brokerage holds and
    // remits it to CRA).
    //
    // ESTIMATE ONLY — this is a cash-flow view based on invoiced GCI to date,
    // not a filing return. Verify with an accountant before making any filing
    // or financial decision.
    {
      name: "get_hst_status",
      description:
        "Returns the agent's GST/HST status for the current year: registration flag, YTD GCI, collected amount, ITCs paid on expenses, net owing, remittance path (self vs brokerage), filing frequency, and the next filing period deadline. ESTIMATE ONLY — not tax advice.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: {
        title: "GST/HST Status",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async () => {
        const now = new Date();
        const year = now.getFullYear();
        const yearStart = `${year}-01-01`;
        const today = now.toISOString().split("T")[0];

        const [settingsRes, txRes] = await Promise.all([
          supabase
            .from("user_settings")
            .select(
              "province, gst_hst_registered, brokerage_withholds_hst, " +
              "filing_frequency, gst_hst_paid_on_expenses, business_number",
            )
            .eq("user_id", userId)
            .maybeSingle(),
          supabase
            .from("transactions")
            .select("sale_price, commission_pct, gci_override, team_split_pct, date")
            .eq("user_id", userId)
            .eq("status", "closed")
            .gte("date", yearStart)
            .lte("date", today),
        ]);

        const settings = settingsRes.data;
        const transactions = txRes.data ?? [];

        // Mirrors the YTD GCI computation in get_dashboard_kpis and the
        // dashboard — same columns, same fallback chain.
        const ytdGCI = transactions.reduce((sum, tx) => {
          if (tx.gci_override != null) return sum + tx.gci_override;
          const raw = (tx.sale_price ?? 0) * (tx.commission_pct ?? 0.025);
          return sum + ((tx.team_split_pct != null && tx.team_split_pct > 0)
            ? raw * tx.team_split_pct
            : raw);
        }, 0);

        const province = settings?.province ?? "ontario";
        const hstRate = gstHstRate(province);
        const label = gstHstLabel(province);
        const isRegistered = settings?.gst_hst_registered ?? false;
        const brokerageWithholdsHst = settings?.brokerage_withholds_hst ?? false;
        const filingFrequency = (settings?.filing_frequency ?? "annual") as
          | "monthly"
          | "quarterly"
          | "annual";
        const itcsPaidOnExpenses = settings?.gst_hst_paid_on_expenses ?? 0;

        // Canonical helper — never reimplement.
        const collected = computeHSTCollected({
          ytdGCI,
          hstRate,
          isRegistered,
          brokerageWithholdsHst,
        });
        const netOwing = computeHSTNetOwing({
          hstCollected: collected,
          hstPaidOnExpenses: itcsPaidOnExpenses,
        });

        // Inlined mirror of filing-period-engine.ts next-deadline lookup.
        // Assumes Dec 31 fiscal year-end (standard for most sole-prop
        // realtors). KEEP IN SYNC with
        // packages/core/engines/filing-period-engine.ts:getCurrentFilingPeriod.
        const nextFilingPeriod = getNextFilingDeadline(filingFrequency, now);

        // Remittance path: describes who physically remits — no verbs.
        const remittancePath = !isRegistered
          ? "not_registered"
          : brokerageWithholdsHst
          ? "brokerage_remits"
          : "agent_self_remits";

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              disclaimer: "ESTIMATE ONLY — based on CRA-published rates and the agent's invoiced GCI to date. Not legal or tax advice. Verify with an accountant before making any filing or financial decision.",
              as_of: today,
              year,
              province,
              tax_label: label,
              rate: hstRate,
              is_registered: isRegistered,
              business_number: settings?.business_number ?? null,
              brokerage_withholds_hst: brokerageWithholdsHst,
              remittance_path: remittancePath,
              filing_frequency: filingFrequency,
              ytd_gci: Math.round(ytdGCI),
              ytd_collected: Math.round(collected),
              itcs_paid_on_expenses: Math.round(itcsPaidOnExpenses),
              net_owing: Math.round(netOwing),
              next_filing_period: nextFilingPeriod,
              source: "CRA — canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html",
            }, null, 2),
          }],
        };
      },
    },
  ];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Deliberate mirror of `grade()` in packages/core/engines/runway-score-engine.ts.
// KEEP IN SYNC with the canonical engine. Edge function runs in Deno and
// cannot import the @agent-runway/core package.
// @deprecated for prose use — retained as fallback for snapshot rows missing
// the `grade` field so the visual-shorthand letter still resolves.
function gradeFromScore(score: number): string {
  if (score >= 92) return "A+";
  if (score >= 85) return "A";
  if (score >= 75) return "B";
  if (score >= 62) return "C";
  if (score >= 50) return "D";
  return "F";
}

// Deliberate mirror of `stateLabel()` in packages/core/engines/runway-score-engine.ts.
// KEEP IN SYNC with the canonical engine. This is the ONLY label the MCP tool
// surfaces for prose — Captain renders it verbatim, no translation needed.
// See memory/feedback_tax_information_not_advice.md and CREW_CONSTITUTION's
// money-proximate voice guidance.
function stateLabelFromScore(score: number): "Strong" | "On Track" | "Building" | "At Risk" {
  if (score >= 81) return "Strong";
  if (score >= 61) return "On Track";
  if (score >= 41) return "Building";
  return "At Risk";
}

// ── HST filing-period helper ────────────────────────────────────────────────
// Deliberate mirror of
// packages/core/engines/filing-period-engine.ts — KEEP IN SYNC.
// Assumes Dec 31 fiscal year-end (standard for most sole-prop realtors).
// Returns the filing period whose end is the next upcoming deadline from
// `now`; if the last period of the current year has already ended, returns
// the first period of next year.
function getNextFilingDeadline(
  frequency: "monthly" | "quarterly" | "annual",
  now: Date,
): { label: string; period_start: string; period_end: string; deadline: string } {
  const year = now.getFullYear();
  const todayISO = now.toISOString().split("T")[0];

  const periods = buildFilingPeriods(frequency, year);
  // First period whose deadline is still in the future.
  const next = periods.find((p) => p.deadline >= todayISO);
  if (next) return next;

  // All periods for this year are past — return first period of next year.
  return buildFilingPeriods(frequency, year + 1)[0];
}

function buildFilingPeriods(
  frequency: "monthly" | "quarterly" | "annual",
  year: number,
): Array<{ label: string; period_start: string; period_end: string; deadline: string }> {
  const MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();
  const iso = (y: number, m: number, d: number) =>
    `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  switch (frequency) {
    case "monthly":
      return Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        const deadlineMonth = m === 12 ? 1 : m + 1;
        const deadlineYear = m === 12 ? year + 1 : year;
        const deadlineDay = lastDay(deadlineYear, deadlineMonth);
        return {
          label: `${MONTH_NAMES[i]} ${year}`,
          period_start: iso(year, m, 1),
          period_end: iso(year, m, lastDay(year, m)),
          deadline: iso(deadlineYear, deadlineMonth, deadlineDay),
        };
      });
    case "quarterly":
      return [
        { label: `Q1 ${year}`, period_start: iso(year, 1, 1),  period_end: iso(year, 3, 31),  deadline: iso(year,     4,  30) },
        { label: `Q2 ${year}`, period_start: iso(year, 4, 1),  period_end: iso(year, 6, 30),  deadline: iso(year,     7,  31) },
        { label: `Q3 ${year}`, period_start: iso(year, 7, 1),  period_end: iso(year, 9, 30),  deadline: iso(year,     10, 31) },
        { label: `Q4 ${year}`, period_start: iso(year, 10, 1), period_end: iso(year, 12, 31), deadline: iso(year + 1, 3,  31) },
      ];
    case "annual":
      return [
        { label: `${year}`, period_start: iso(year, 1, 1), period_end: iso(year, 12, 31), deadline: iso(year + 1, 6, 15) },
      ];
  }
}
