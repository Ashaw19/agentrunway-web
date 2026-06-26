// ProjectionEngine helpers — deliberate copy for mcp-server Edge Function.
//
// KEEP IN SYNC with packages/core/engines/projection-engine.ts
// If the canonical helpers there change, mirror the changes here in the same
// commit. Deno edge functions cannot import workspace packages directly, so
// this copy exists per Pattern P-2 (deliberate-duplicate guarded by review).
//
// WHY THIS EXISTS (2026-06-26 cross-surface divergence fix)
// ---------------------------------------------------------
// Before this file, the MCP analytics tools (get_dashboard_kpis, get_forecast,
// get_tax_estimate) each open-coded their OWN projection math — a plain
// `ytdGCI / yearFraction` (no seasonal weighting), a bespoke "60% pace + 40%
// pipeline" blend in get_forecast, and none of them included listing-weighted
// GCI. That meant the Connector returned a different projected GCI than the
// dashboard for the same agent. This mirror lets every MCP tool call the same
// projection the dashboard/chat use.
//
// See:
//   - memory/feedback_data_consistency_protocol.md
//   - memory/findings/dashboard_metric_divergence_fix_2026-06-26.md
//   - apps/web/supabase/functions/mcp-server/lib/README.md

/**
 * Coerce quarter weights into normalized fractions (sum ≈ 1).
 * Mirrors normalizeSeasonalWeights in the canonical engine.
 */
export function normalizeSeasonalWeights(weights: number[] | null | undefined): number[] {
  const uniform = [0.25, 0.25, 0.25, 0.25];
  if (!weights || weights.length !== 4) return uniform;
  const cleaned = weights.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const sum = cleaned.reduce((a, b) => a + b, 0);
  if (sum <= 0) return uniform;
  return cleaned.map((v) => v / sum);
}

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / 86_400_000);
}

function daysInYear(date: Date): number {
  const year = date.getFullYear();
  return (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;
}

function yearFractionElapsed(date: Date): number {
  return dayOfYear(date) / daysInYear(date);
}

/**
 * Fraction of year elapsed, weighted by quarterly seasonality.
 * UTC-anchored — mirrors seasonalFractionElapsed in the canonical engine
 * character-for-character so server (MCP/Deno) and client (dashboard) agree.
 */
export function seasonalFractionElapsed(
  weights: number[],
  date: Date = new Date(),
): number {
  if (!weights || weights.length !== 4) return yearFractionElapsed(date);
  const w = normalizeSeasonalWeights(weights);

  const year = date.getUTCFullYear();
  const qIndex = Math.floor(date.getUTCMonth() / 3);

  const qStartMonth = qIndex * 3;
  const qStart = new Date(Date.UTC(year, qStartMonth, 1));
  const qEnd = new Date(Date.UTC(year, qStartMonth + 3, 1));

  const qTotalDays = Math.max(1, (qEnd.getTime() - qStart.getTime()) / 86_400_000);
  const qElapsedDays = Math.max(0, (date.getTime() - qStart.getTime()) / 86_400_000);
  const withinQ = qElapsedDays / qTotalDays;

  let fraction = 0;
  for (let i = 0; i < qIndex; i++) {
    fraction += w[i];
  }
  fraction += w[qIndex] * withinQ;

  return Math.min(0.999, Math.max(0.01, fraction));
}

/**
 * Project year-end GCI from closed deals + weighted pipeline.
 * Mirrors projectedYearEndGCI in the canonical engine (incl. early-year
 * dampening). Callers pass `pipelineWeighted + listingWeighted` as the second
 * argument, exactly as the dashboard does.
 */
export function projectedYearEndGCI(
  closedGCI: number,
  pipelineWeightedGCI: number,
  seasonalFraction: number,
  goalGCI = 0,
): number {
  if (!isFinite(seasonalFraction) || seasonalFraction <= 0) return closedGCI;
  const paceBasedProjection = closedGCI / seasonalFraction;
  const pipelineAdj = pipelineWeightedGCI * 0.5;
  const rawProjection = paceBasedProjection + pipelineAdj;

  if (seasonalFraction < 0.10) {
    const confidence = Math.min(1, seasonalFraction / 0.10);
    const anchor = goalGCI > 0 ? goalGCI : closedGCI;
    return anchor * (1 - confidence) + rawProjection * confidence;
  }

  return rawProjection;
}

/**
 * Project year-end transaction count.
 * Mirrors projectedYearEndTransactions in the canonical engine.
 */
export function projectedYearEndTransactions(
  closedCount: number,
  pipelineCount: number,
  seasonalFraction: number,
): number {
  if (!isFinite(seasonalFraction) || seasonalFraction <= 0) return closedCount;
  const paceBasedProjection = closedCount / seasonalFraction;
  const raw = Math.round(paceBasedProjection + pipelineCount * 0.3);
  if (seasonalFraction < 0.10) {
    const confidence = Math.min(1, seasonalFraction / 0.10);
    return Math.round(closedCount * (1 - confidence) + raw * confidence);
  }
  return raw;
}

/**
 * Canonical listing-status conversion probabilities.
 * Mirrors LISTING_PROBABILITIES in the canonical engine.
 */
export const LISTING_PROBABILITIES: Record<string, number> = {
  scheduled: 0.15,
  active: 0.40,
};

export interface ListingWeightInput {
  estimated_list_price: number | null | undefined;
  estimated_commission_pct: number | null | undefined;
  status: string;
}

/**
 * Probability-weighted GCI contribution from active listing appointments.
 * Mirrors computeListingWeightedGCI in the canonical engine.
 */
export function computeListingWeightedGCI(
  listings: ReadonlyArray<ListingWeightInput> | null | undefined,
): number {
  if (!listings || listings.length === 0) return 0;
  return listings.reduce((sum, la) => {
    const price = Number(la.estimated_list_price ?? 0);
    const commPct = la.estimated_commission_pct ?? 0.025;
    const prob = LISTING_PROBABILITIES[la.status] ?? 0;
    return sum + price * commPct * prob;
  }, 0);
}
