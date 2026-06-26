/**
 * lib/import/clamp-db-range.ts
 *
 * Single source of truth for clamping imported transaction fields to the DB
 * CHECK ranges defined in migration 00079 (00079_data_integrity_checks.sql):
 *
 *   chk_tx_sale_price_non_negative   CHECK (sale_price >= 0)
 *   chk_tx_sale_price_reasonable     CHECK (sale_price <= 100000000)
 *   chk_tx_commission_pct_range      CHECK (commission_pct >= 0 AND commission_pct <= 0.25)
 *
 * WHY THIS EXISTS (regression history — keep these tests green forever):
 *   A single out-of-range row in a bulk import (e.g. an LLM misread that turns
 *   a 3% commission into 30%, or a column swap that pulls a >$100M sale price)
 *   makes Postgres abort the ENTIRE `.upsert()` batch on the first CHECK
 *   violation. The user sees "Failed to save transactions — re-import this
 *   year", and re-importing the same file reproduces the identical failure
 *   with no recovery path. That is the literal
 *   "onboarding import causes headaches → users don't come back" failure mode
 *   (memory/feedback_import_robustness.md). It shipped as a live crash and was
 *   fixed by commit 779ab9d (2026-06-22).
 *
 *   Before this module the clamp was copy-pasted inline at four bulk-import
 *   write sites (transactions-history-tab.tsx ×2, history-content.tsx ×2). Four
 *   copies of a numeric bound is exactly how the bound drifts back out of sync
 *   and the crash regresses on one path. Centralizing it lets one test lock the
 *   range for all four call sites at once.
 *
 * DESIGN:
 *   • The RANGE is fixed (it mirrors the DB constraint and must never diverge).
 *   • The FALLBACK is caller-supplied, because the two import flows differ:
 *       - transactions-history-tab uses `null` (field genuinely unknown)
 *       - history-content uses 0 / 0.025 (its own missing-value defaults)
 *     gci_override always carries the real GCI, so a clamped secondary field
 *     loses no economic data either way.
 *   • Pure functions, no I/O. Stub-testable.
 */

/** Upper bound for transactions.sale_price (chk_tx_sale_price_reasonable). */
export const SALE_PRICE_MAX = 100_000_000;
/** Lower bound for transactions.sale_price (chk_tx_sale_price_non_negative). */
export const SALE_PRICE_MIN = 0;
/** Upper bound for transactions.commission_pct (chk_tx_commission_pct_range). */
export const COMMISSION_PCT_MAX = 0.25;
/** Lower bound for transactions.commission_pct (chk_tx_commission_pct_range). */
export const COMMISSION_PCT_MIN = 0;

/**
 * Return `value` when it is a finite number inside the sale_price CHECK range,
 * otherwise the caller's `fallback`. Never returns a value that would violate
 * chk_tx_sale_price_non_negative / chk_tx_sale_price_reasonable.
 *
 * `NaN`, `Infinity`, `-Infinity`, `null`, and `undefined` all fall back —
 * `Number.isFinite` rejects every non-finite input, which is why a garbage
 * row can no longer poison the batch.
 */
export function clampSalePrice<F>(
  value: number | null | undefined,
  fallback: F,
): number | F {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= SALE_PRICE_MIN &&
    value <= SALE_PRICE_MAX
  ) {
    return value;
  }
  return fallback;
}

/**
 * Return `value` when it is a finite number inside the commission_pct CHECK
 * range (0–0.25, i.e. 0%–25% expressed as a decimal), otherwise `fallback`.
 * Never returns a value that would violate chk_tx_commission_pct_range.
 */
export function clampCommissionPct<F>(
  value: number | null | undefined,
  fallback: F,
): number | F {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= COMMISSION_PCT_MIN &&
    value <= COMMISSION_PCT_MAX
  ) {
    return value;
  }
  return fallback;
}
