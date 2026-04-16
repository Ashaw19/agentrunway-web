import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { McpTool } from "./index.ts";
import { calculate as calculateTax, type Province } from "../lib/canadian-tax-engine.ts";

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
              grade: snapshot.grade ?? gradeFromScore(snapshot.score),
              month: snapshot.month ?? null,
              components: snapshot.components ?? null,
              interpretation: interpretScore(snapshot.score),
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
            .select("goal_gci, province")
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
            .select("ytd_amount")
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

        // Year fraction for projection
        const now = new Date();
        const yearDay = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86_400_000);
        const yearDays = (now.getFullYear() % 4 === 0 && (now.getFullYear() % 100 !== 0 || now.getFullYear() % 400 === 0)) ? 366 : 365;
        const yearFraction = yearDay / yearDays;

        // Projected net income
        let netIncome: number;
        if (overrideIncome != null) {
          netIncome = overrideIncome;
        } else if (yearFraction > 0.01) {
          const projectedGCI = ytdGCI / yearFraction;
          const projectedExpenses = ytdExpenses / yearFraction;
          netIncome = projectedGCI - projectedExpenses;
        } else {
          netIncome = ytdGCI - ytdExpenses;
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
              disclaimer: "ESTIMATE ONLY — not legal or tax advice. Consult a CPA.",
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
  ];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function gradeFromScore(score: number): string {
  if (score >= 95) return "A+";
  if (score >= 88) return "A";
  if (score >= 80) return "A-";
  if (score >= 72) return "B+";
  if (score >= 65) return "B";
  if (score >= 58) return "B-";
  if (score >= 50) return "C+";
  if (score >= 42) return "C";
  if (score >= 35) return "D";
  return "F";
}

function interpretScore(score: number): string {
  if (score >= 80) return "Strong — business health is excellent. Maintain current pace.";
  if (score >= 65) return "Good — on track. Monitor pipeline and expense discipline.";
  if (score >= 50) return "Fair — some areas need attention. Review pipeline coverage and goal pace.";
  if (score >= 35) return "Below average — take corrective action. Pipeline or expenses may be off-track.";
  return "Critical — significant gaps detected. Immediate review recommended.";
}
