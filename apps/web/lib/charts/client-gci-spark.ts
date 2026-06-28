/**
 * Per-client cumulative-GCI trajectory, bucketed by deal close-month.
 *
 * This is the single-client scope of the four-KPI `buildKpiSparks` helper in
 * `app/(app)/crm/clients-content.tsx`: same close-date filter (closed, not
 * collapsed), same monthly bucketing, same last-12-active-months window, same
 * cumulative-then-round shape. Kept here as a pure module so the Clients-table
 * hover sparkline and the KPI strip stay character-for-character consistent and
 * the logic is unit-testable (vitest only collects `lib/**`).
 */

import type { SparkPoint } from "@/lib/charts/sparkline-geometry";

/** The minimal deal shape the spark reads — `ClientRecord` is assignable. */
export interface GciSparkDeal {
  close_date: string | null;
  gci: number | null;
  condition_status: string | null;
}

/**
 * Cumulative GCI over a client's closed deals, one point per active close-month
 * (latest 12). Returns `[]` when the client has no closed history; a client with
 * activity in only one month yields a single point, which `Sparkline` (and the
 * hover card) treat as "not enough history" since a line needs two points.
 */
export function buildClientGciSpark(deals: GciSparkDeal[]): SparkPoint[] {
  const ds: { ym: string; gci: number }[] = [];
  for (const d of deals) {
    if (!d.close_date || d.condition_status === "collapsed") continue;
    ds.push({ ym: d.close_date.slice(0, 7), gci: d.gci ?? 0 });
  }
  if (ds.length === 0) return [];

  const months = Array.from(new Set(ds.map((d) => d.ym))).sort();
  const shown = new Set(months.slice(-12));
  let cumGci = 0;
  const out: SparkPoint[] = [];
  for (const m of months) {
    for (const d of ds.filter((x) => x.ym === m)) cumGci += d.gci;
    if (shown.has(m)) out.push({ value: Math.round(cumGci), projected: false });
  }
  return out;
}
