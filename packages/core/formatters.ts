// ── Formatters ──────────────────────────────────────────────────────────────
// Mirrors iOS Fmt enum

const cadFormatter = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});


/** Format as CAD currency (no cents): CA$125,000 */
export function fmtCurrency(value: number): string {
  return cadFormatter.format(value);
}

/** Format as percentage: 25% or 25.5% */
export function fmtPct(value: number): string {
  const pct = value * 100;
  return pct === Math.floor(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
}

/** Format as compact currency: $125K, $1.2M */
export function fmtCompact(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}
