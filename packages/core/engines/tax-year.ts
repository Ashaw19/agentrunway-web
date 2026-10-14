// TaxYear — which tax year a closed deal's commission is income of.
//
// ESTIMATE ONLY — Not legal or tax advice.
//
// WHY THIS EXISTS
// ---------------
// CRA lets self-employed commission agents report income on the cash method
// (in the fiscal period it is received) or the accrual method (in the period
// it is earned): Guide T4002, Chapter 1, "Reporting methods". The rule text
// is in tax-copy/cra-rules.ts (INCOME_REPORTING_METHOD_RULES).
//
// Until 2026-10-14 every tax figure put a deal in the year of
// `transactions.date`, its closing date. For a cash-method agent a deal that
// closes in December and is paid in January is the next year's income.
//
// THE RULE
// --------
//   tax-year date of a deal
//     = the commission paid date, for a cash-method agent who entered one
//     = the closing date, otherwise (accrual agents, and a blank paid date)
//
// Every tax figure that groups deals by year (the tax estimate, T2125,
// instalments, take-home, the per-deal tax portion, the MCP tax tools) reads
// the year through this file. Production figures (deal counts, GCI by
// closing year, History, the Runway Score, pace and goals) stay on the
// closing date and never call it.

import {
  aggregateRealComp,
  computePlanGross,
  computeRealCompensation,
  toPlanDeals,
  type CompSettingsSlice,
  type PlanGrossResult,
} from "./real-compensation-engine";
import { localISODate } from "../lib/local-date";
import { computeGCI, type Transaction } from "../types/database";

/** `user_settings.income_reporting_method` (migration 00178). */
export type IncomeReportingMethod = "accrual" | "cash";

export const INCOME_REPORTING_METHODS: readonly IncomeReportingMethod[] = ["accrual", "cash"];

/**
 * The agent's method. Accrual unless the setting says exactly "cash": a
 * missing settings row, a missing column (a select that left it out) or an
 * unknown value keeps the closing-date figures every account had before.
 */
export function incomeReportingMethod(
  settings: { income_reporting_method?: string | null } | null | undefined,
): IncomeReportingMethod {
  return settings?.income_reporting_method === "cash" ? "cash" : "accrual";
}

/** The fields this file reads from a `transactions` row. */
export type TaxYearDeal = Pick<Transaction, "date"> & {
  /** `transactions.commission_paid_date`. Optional so a select without it reads as blank. */
  commission_paid_date?: string | null;
};

/** The fields {@link taxYearGCI} reads: the tax year's plus `computeGCI`'s. */
export type TaxYearGCIDeal = TaxYearDeal &
  Pick<Transaction, "sale_price" | "commission_pct" | "team_split_pct" | "gci_override">;

/** The date that puts a deal's commission in a tax year (YYYY-MM-DD). */
export function taxYearDate(deal: TaxYearDeal, method: IncomeReportingMethod): string {
  if (method === "cash" && deal.commission_paid_date) return deal.commission_paid_date;
  return deal.date;
}

/** The tax year a deal's commission is income of. */
export function taxYearOfDeal(deal: TaxYearDeal, method: IncomeReportingMethod): number {
  return Number(taxYearDate(deal, method).slice(0, 4));
}

/** Whether a deal's commission is income of `year`. */
export function isInTaxYear(deal: TaxYearDeal, method: IncomeReportingMethod, year: number): boolean {
  return taxYearOfDeal(deal, method) === year;
}

/**
 * The deals whose commission is income of `year`, in their order. Pass
 * closed deals only: status is not read here.
 */
export function dealsInTaxYear<T extends TaxYearDeal>(
  deals: readonly T[],
  method: IncomeReportingMethod,
  year: number,
): T[] {
  return deals.filter((d) => isInTaxYear(d, method, year));
}

/** GCI reported as income of `year` (`computeGCI` per deal). Closed deals only. */
export function taxYearGCI(
  deals: readonly TaxYearGCIDeal[],
  method: IncomeReportingMethod,
  year: number,
): number {
  return dealsInTaxYear(deals, method, year).reduce((sum, d) => sum + computeGCI(d), 0);
}

/** GCI of the deals that closed in `year`: the production view, the same under both methods. */
export function closingYearGCI(deals: readonly TaxYearGCIDeal[], year: number): number {
  return taxYearGCI(deals, "accrual", year);
}

/**
 * How far `year`'s tax GCI is from its closing-year GCI, on the same rows:
 * commissions paid this year on deals that closed earlier, less commissions
 * on this year's closings paid in a later year. Always 0 for accrual.
 *
 * The rows have to hold both sets: this year's closings and the earlier
 * closings paid this year (see apps/web/lib/tax-year-carry-in.ts).
 */
export function taxYearGCIAdjustment(
  deals: readonly TaxYearGCIDeal[],
  method: IncomeReportingMethod,
  year: number,
): number {
  if (method === "accrual") return 0;
  return taxYearGCI(deals, method, year) - closingYearGCI(deals, year);
}

/**
 * A year-end GCI projection as tax-year income: the production projection
 * (pace on closings, plus the pipeline) moved by {@link taxYearGCIAdjustment}.
 * Deals still to close are assumed paid in the year they close; only paid
 * dates already entered move income between years.
 */
export function taxYearProjectedGCI(projectedGCI: number, adjustment: number): number {
  return Math.max(0, projectedGCI + adjustment);
}

/**
 * Agent income after the plan (split and plan fees, before monthly brokerage
 * fees) on the commissions that are income of `year`: the year-to-date
 * take-home's starting figure, on tax-year income.
 *
 * Simple split: the split of {@link taxYearGCI}. REAL: every deal is priced
 * on its closing date, because REAL's cap runs on closings (pass the cap
 * year's carry-over too: `capYearCarryOver` / `loadCapYearCarryOver`), and
 * the deals whose commission is income of `year` are summed. For an accrual
 * agent this is `computePlanGross(settings, ytdGCI, { deals:
 * toPlanDeals(carryOverTx, ytdTx), windowStart: Jan 1, windowEnd: Jan 1 next })`.
 *
 * A row passed twice (it can be both the cap carry-over and the carry-in)
 * counts once.
 */
export function taxYearPlanGross(
  settings: CompSettingsSlice,
  deals: readonly (TaxYearGCIDeal & { id?: string })[],
  method: IncomeReportingMethod,
  year: number,
  asOf?: string,
): PlanGrossResult {
  const seen = new Set<string>();
  const unique = deals.filter((d) => {
    if (!d.id) return true;
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });

  const gci = taxYearGCI(unique, method, year);
  if (settings.comp_plan !== "real" || unique.length === 0) {
    return computePlanGross(settings, gci, { asOf });
  }

  // Price on closing dates, then place each deal at its tax-year date so the
  // calendar window sums the tax year's deals.
  const yearDate = new Map(unique.flatMap((d) => (d.id ? [[d.id, taxYearDate(d, method)] as const] : [])));
  const priced = computeRealCompensation(settings, toPlanDeals([], unique), asOf ?? localISODate());
  const placed = {
    ...priced,
    deals: priced.deals.map((d) => (d.id && yearDate.has(d.id) ? { ...d, date: yearDate.get(d.id)! } : d)),
  };
  const agg = aggregateRealComp(settings, placed, `${year}-01-01`, `${year + 1}-01-01`);
  return {
    plan: "real",
    grossAfterPlan: agg.agentNet,
    shareBeforePlanFees: agg.agentShare,
    planFees: agg.fees,
    effectiveAgentPct: agg.effectiveAgentPct,
    capState: priced.capState,
  };
}
