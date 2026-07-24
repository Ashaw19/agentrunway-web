/**
 * Money-string parsers for imported data. Single source of truth for both the
 * lenient tracker/CSV path (`parseMoneyLoose`) and the stricter AI-extraction
 * path (`parseMoneyStrict`).
 *
 * `parseMoneyLoose` handles the messy variants real estate / brokerage exports
 * actually produce in the wild:
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
 *   "1,234 approx"       -> 1234     (trailing annotation stripped)
 *   "approx 1,234"       -> 1234     (leading annotation stripped)
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

  // Reject cells holding TWO OR MORE distinct numeric groups separated by a
  // "hard" character — a letter, currency symbol, dash, "@", "#" — anything
  // that is NOT a digit, grouping separator (comma/dot), or whitespace. These
  // are ambiguous annotated cells like "Unit 5 - $325,000", "Lot 12 $500,000",
  // "MLS 40312345 $325,000", "2 @ $450,000", or a "$300,000-$350,000" range:
  // the intended amount cannot be recovered, so fail safe to NaN (surfaces as
  // "missing" in the review UI) rather than silently lifting a digit out of the
  // annotation. This MUST run BEFORE the currency strip below, because the "$"
  // between "Lot 12" and "500,000" is exactly the boundary proving two numbers.
  //
  // Without this guard, the F1 core-token extraction (#265) grabs the FIRST
  // digit run and greedily spans whitespace-grouped digits, so "Unit 5 -
  // $325,000" -> 5 and "Lot 12 $500,000" -> 12500 — a silent wrong value where
  // the pre-#265 parser returned NaN. Legitimate leading/trailing text
  // annotations ("approx 1,234", "1,234 approx", "1,234CAD") have no SECOND
  // digit group, and pure space-grouped thousands ("325 000", "9 750,50 $")
  // are separated only by whitespace, so neither trips this.
  if (/\d[^\d]*[^\d.,\s][^\d]*\d/.test(s)) return NaN;

  // Drop currency prefixes (CA$, US$, USD, CAD, and the $/euro/pound symbols)
  // plus any trailing currency suffix (fr-CA writes "9 750,50 $").
  s = s
    .replace(/(?:^|\s)(ca\$|us\$|cad|usd)\s*/gi, "")
    .replace(/[$£€]/g, "");

  // Extract the first numeric CORE token: an optional leading minus, a digit,
  // then any run of digits / separators / whitespace. This peels off leading
  // or trailing annotation text ("1,234 approx", "approx 1,234", "1,234CAD",
  // "1,500 est") BEFORE separator disambiguation, so annotation glue can no
  // longer masquerade as decimal digits (the F1 regression: "1,234 approx"
  // had its space stripped to "1,234approx", whose ",234approx" tail read as
  // a 9-char decimal group -> 1.234, a 1000x understatement).
  const coreMatch = s.match(/-?\d[\d.,\s]*/);
  if (!coreMatch) return NaN;
  const core = coreMatch[0].trim();

  // Residual-space evidence: internal whitespace between digits ("1 234,567")
  // proves the space is the thousands grouping separator, which in turn proves
  // any lone comma must be the decimal (you don't group with BOTH spaces and
  // commas). Capture before we strip whitespace below.
  const hadSpaceGroup = /\d\s+\d/.test(core);

  // Whitespace -- ASCII space, U+00A0 NBSP, U+202F narrow NBSP -- is ALWAYS a
  // grouping separator in these formats, never a decimal, so strip it.
  s = core.replace(/\s+/g, "");

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
    // 1234, preserving en-CA/US) UNLESS space grouping already proved the comma
    // is the decimal ("1 234,567" -> 1234.567); 1, 2, or 4+ trailing digits is
    // always a decimal ("9,50" -> 9.50). Dots keep parseFloat's decimal semantics.
    const commaIsThousands =
      parts.length > 2 ||
      (parts.length === 2 && parts[1].length === 3 && !hadSpaceGroup);
    if (commaIsThousands) {
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

// Currency markers allowed in the STRICT path. Anything alphabetic beyond
// these (unit suffixes like "M"/"k", words like "approx"/"est"/"net") means
// the value is not a clean number and must be rejected.
const STRICT_CURRENCY_MARKERS = /ca\$|us\$|c\$|cad|usd/gi;

/**
 * Strict money parser for AI/LLM-extraction output (vision + text models),
 * where "$1.2M", "300k", "1,500 est" appear routinely. It restores the
 * whole-string validation the old `Number()`-based `toNum` had: any alphabetic
 * residue that is NOT a recognized currency marker makes it return NaN, so the
 * value surfaces as low/"missing" confidence in the review UI instead of
 * silently becoming 1.2 / 300 in sale_price / gci.
 *
 * Distinct from `parseMoneyLoose` on purpose: trackers legitimately carry
 * free-text annotations we want to salvage the number out of; AI numeric
 * fields must be clean or rejected. Both share the same numeric interpretation
 * once the string passes validation.
 *
 *   "9 750,50 $"   -> 9750.50   (currency marker OK)
 *   "1 234,56 CAD" -> 1234.56   (currency marker OK)
 *   "$450,000"     -> 450000
 *   "1.5M"         -> NaN       (unit suffix rejected)
 *   "300k"         -> NaN
 *   "1,500 est"    -> NaN       (annotation rejected)
 */
export function parseMoneyStrict(raw: string | null | undefined): number {
  if (!raw) return NaN;
  const s = String(raw).trim();
  if (!s) return NaN;

  // Remove allowed currency markers, then every legitimate numeric character
  // (digits, separators, whitespace incl NBSP/narrow-NBSP via \s, parens,
  // minus, currency symbols). If anything survives -- necessarily a letter or
  // stray unit character -- the input is not a clean money value.
  const residue = s
    .replace(STRICT_CURRENCY_MARKERS, "")
    .replace(/[$£€]/g, "")
    .replace(/[\d.,()\-\s]/g, "");
  if (residue.length > 0) return NaN;

  return parseMoneyLoose(raw);
}
