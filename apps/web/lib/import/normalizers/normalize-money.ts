/**
 * Loose money-string parser for imported data.
 *
 * Handles the messy variants real estate / brokerage exports actually
 * produce in the wild:
 *   "$1,234.56"          → 1234.56
 *   "1234.56"            → 1234.56
 *   "CAD 1,234"          → 1234
 *   "ca$1,234"           → 1234
 *   "USD 1,234.56"       → 1234.56
 *   "(1,234)"            → -1234   (accounting negative)
 *   "1 1234.56"     → 1234.56 (non-breaking space, common in fr-CA)
 *
 * Returns NaN for anything that doesn't yield a finite number; callers
 * decide whether to coerce to null/0.
 */
export function parseMoneyLoose(raw: string | null | undefined): number {
  if (!raw) return NaN;
  let s = String(raw).trim();
  if (!s) return NaN;

  // Accounting negative: "(1,234)" or "(1234.56)"
  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1).trim();
  }

  // Drop currency prefixes (CA$, US$, USD, CAD, $, €, £) and thousands
  // separators (commas, ASCII space, U+00A0 non-breaking space).
  s = s
    .replace(/(?:^|\s)(ca\$|us\$|cad|usd)\s*/gi, "")
    .replace(/[$£€]/g, "")
    .replace(/[,\s ]/g, "");

  if (!s || s === "-" || s === ".") return NaN;
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return NaN;
  return sign * n;
}
