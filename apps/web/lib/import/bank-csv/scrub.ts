/**
 * Account and card numbers come out of everything a statement import keeps:
 * line descriptions, the account label and the file name. Run at parse time,
 * before anything is stored or sent to a model. Pure; no I/O.
 *
 * What counts as a number to remove:
 *   - a masked number: "************1234", "4500 **** **** 1234",
 *     "XXXX XXXX XXXX 1234", "'500766**********'"
 *   - any run of 6 or more digits, spaces or dashes allowed between them:
 *     account and transit numbers, card numbers, e-Transfer and confirmation
 *     references, phone numbers. A 4- or 5-digit store number ("#1234") stays.
 */

const MASKED = /(?:\d{1,6}[\s-]?)?(?:[*•]{2,}|[Xx]{4,})(?:[\s-]?(?:[\d*•]+|[Xx]{4}))*/g;
const LONG_DIGITS = /\d(?:[\s-]?\d){5,}/g;

function tidy(text: string): string {
  return text
    .replace(/'\s*'/g, " ")
    .replace(/\(\s*\)|\[\s*\]/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s'",;:#*-]+|[\s'",;:#*-]+$/g, "")
    .trim();
}

/** A description with account, card and reference numbers removed. */
export function stripAccountNumbers(text: string | null | undefined): string {
  if (!text) return "";
  return tidy(String(text).replace(MASKED, " ").replace(LONG_DIGITS, " "));
}

/** True when the text still holds something that looks like an account or card number. */
export function hasAccountNumber(text: string | null | undefined): boolean {
  if (!text) return false;
  MASKED.lastIndex = 0;
  LONG_DIGITS.lastIndex = 0;
  const found = MASKED.test(text) || LONG_DIGITS.test(text);
  MASKED.lastIndex = 0;
  LONG_DIGITS.lastIndex = 0;
  return found;
}

/**
 * The agent's name for the account, with any number taken out: "RBC Visa
 * ****1234" → "RBC Visa". Runs of 4 or more digits go too (a label has no
 * use for them). Falls back to the institution, then to "Imported account".
 */
export function scrubAccountLabel(label: string | null | undefined, fallback?: string | null): string {
  const cleaned = tidy(String(label ?? "").replace(MASKED, " ").replace(/\d(?:[\s-]?\d){3,}/g, " ")).slice(0, 80).trim();
  if (cleaned) return cleaned;
  const alt = tidy(String(fallback ?? "")).slice(0, 80).trim();
  return alt || "Imported account";
}

/** A file name with digit runs of 4 or more removed (statements are often named after the account). */
export function scrubFileName(name: string | null | undefined): string | null {
  if (!name) return null;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, "") : "";
  const cleaned = base.replace(MASKED, " ").replace(/\d(?:[\s_-]?\d){3,}/g, " ").replace(/[\s_]{2,}/g, " ").trim();
  return `${(cleaned || "statement").slice(0, 180)}${ext.slice(0, 10)}`;
}

// ── Merchant names ─────────────────────────────────────────────────────────

/** Wording banks put in front of the merchant. */
const PREFIXES = [
  /^\[[a-z]{2}\]\s*/i, // BMO: [DN], [CW], [PR]
  /^(?:pos|point of sale|debit card|visa debit|interac)\s+(?:purchase|retail purchase|purch)\b\s*[-:]?\s*/i,
  /^(?:purchase|retail purchase|achat|paiement direct|pre-?authorized(?: debit)?|pre-?auth(?:orized)?|pad|pap|bill payment|online banking payment|misc payment|payment)\s*[-:]?\s+/i,
  /^(?:sq|tst|sp|pp|pay(?:pal)?|ppl|amzn mktp|amazon mktpl?a?c?e?)\s*\*\s*/i,
  /^(?:fpos|opos|apos|ach)\s+/i,
];

/** Province or state codes at the end ("... SAINT JOHN NB"). */
const TRAILING_REGION = /\s+(?:NB|NS|PE|PEI|NL|QC|ON|MB|SK|AB|BC|YT|NT|NU|CA|CAN|US|USA)$/i;

const SMALL_WORDS = new Set(["and", "of", "the", "de", "du", "la", "le", "des", "et", "for", "a", "an", "at", "on", "in"]);

function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(" ")
    .map((w, i) => {
      if (!w) return w;
      if (i > 0 && SMALL_WORDS.has(w)) return w;
      // Keep short all-letter tokens like "ca" lower; acronyms of 2-3 letters upper.
      if (/^[a-z]{2,3}$/.test(w) && !/[aeiouy]/.test(w)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

/**
 * A readable merchant name for the expense's vendor field: the bank's
 * prefixes, store numbers, trailing province codes and stray punctuation
 * removed, then title case ("POS PURCHASE SHELL C12345 SAINT JOHN NB" →
 * "Shell C Saint John"). Null when nothing readable is left.
 */
export function merchantFromDescription(description: string | null | undefined): string | null {
  let s = stripAccountNumbers(description);
  if (!s) return null;
  for (let pass = 0; pass < 2; pass++) for (const p of PREFIXES) s = s.replace(p, "");
  s = s
    .replace(/#\s*\d+/g, " ")
    .replace(/\b[A-Z]?\d{3,}\b/g, " ")
    .replace(/[_*]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  for (let i = 0; i < 2; i++) s = s.replace(TRAILING_REGION, "").trim();
  s = s.replace(/^[\s'",;:#*.-]+|[\s'",;:#*.-]+$/g, "");
  if (!/[a-z]/i.test(s)) return null;
  return titleCase(s).slice(0, 120);
}
