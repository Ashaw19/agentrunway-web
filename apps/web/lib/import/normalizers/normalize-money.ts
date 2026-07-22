/**
 * Loose money-string parser for imported data.
 *
 * Handles the messy variants real estate / brokerage exports actually
 * produce in the wild:
 *   "$1,234.56"          -> 1234.56
 *   "1234.56"            -> 1234.56
 *   "CAD 1,234"          -> 1234
 *   "ca$1,234"           -> 1234
 *   "USD 1,234.56"       -> 1234.56
 *   "(1,234)"            -> -1234    (accounting negative)
 *   "325 000"            -> 325000   (space thousands, common in fr-CA)
 *   "9 750,50 $"         -> 9750.50  (fr-CA: space thousands + COMMA decimal)
 *   "9,50"               -> 9.50     (fr-CA comma decimal)
 *   "1.234,56"           -> 1234.56  (European: dot thousands + comma decimal)
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

  // Drop currency prefixes (CA$, US$, USD, CAD, and the $/euro/pound symbols)
  // plus any trailing currency suffix (fr-CA writes "9 750,50 $"). Whitespace
  // -- ASCII space, U+00A0 NBSP, U+202F narrow NBSP -- is ALWAYS a grouping
  // separator in these formats, never a decimal, so strip it unconditionally.
  s = s
    .replace(/(?:^|\s)(ca\$|us\$|cad|usd)\s*/gi, "")
    .replace(/[$£€]/g, "")
    .replace(/\s+/g, "");

  // Disambiguate comma vs dot as the decimal separator. Stripping commas
  // unconditionally (the old behaviour) turned the fr-CA decimal "9 750,50"
  // into 975050 -- a 100x overstatement on the core NB francophone market.
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // Both present: the LAST-occurring separator is the decimal; the other
    // groups thousands. "1,234.56" -> dot decimal; "1.234,56" -> comma decimal.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = s.split(",");
    // Multiple commas can only be thousands grouping ("1,234,567"). A single
    // comma followed by exactly 3 digits is thousands grouping ("1,234" ->
    // 1234, preserving en-CA/US); 1, 2, or 4+ trailing digits is a decimal
    // ("9,50" -> 9.50). Dots keep parseFloat's decimal semantics.
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      s = s.replace(/,/g, "");
    } else {
      s = s.replace(",", ".");
    }
  }

  if (!s || s === "-" || s === ".") return NaN;
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return NaN;
  return sign * n;
}
