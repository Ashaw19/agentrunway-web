// Client identity normalization — the single source of truth for how two
// client records are recognized as "the same person."
//
// WHY THIS IS SHARED: the CSV importer (clients-content.tsx) and the
// duplicate-detection tool (duplicate-detection.ts) both need to decide
// whether two rows/records refer to the same client. Before this file,
// toNameSearch() was defined only inside clients-content.tsx — moved here
// so both call sites use byte-identical normalization and can never drift
// apart (see memory/feedback_data_consistency_protocol.md).

/** Normalize a name for matching: trim, lowercase, collapse whitespace,
 *  strip diacritics, normalize apostrophe variants. Mirrors the DB's
 *  clients.name_search column (migration 00010) — do not change this
 *  function without a corresponding backfill, or new rows will stop
 *  matching existing name_search values. */
export function toNameSearch(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ") // collapse internal whitespace so "John  Smith" == "John Smith"
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritical marks
    // Matches an ASCII apostrophe or U+02BC (modifier letter apostrophe) via
    // \\u escapes (not a literal character) to avoid source-encoding
    // ambiguity. Functionally identical to clients-content.tsx's original
    // character class (verified byte-for-byte against the live file).
    .replace(/[\u0027\u02bc]/g, "'");
}

/** Extra fold on top of toNameSearch, used ONLY by the duplicate-clustering
 *  tool (never for import matching, never persisted). toNameSearch is kept
 *  byte-identical to the DB's stored name_search values (see the note in
 *  clients-content.tsx); this function additionally folds the curly
 *  right-single-quote (U+2019) — common in pasted/exported names — which
 *  toNameSearch does not touch. Safe to be MORE inclusive here because
 *  clustering only ever produces a suggestion for human review; it never
 *  writes anything on its own. */
export function clusterNameKey(name: string): string {
  return toNameSearch(name).replace(/\u2019/g, "'");
}

/** Normalize an email for matching: trim + lowercase. Returns null for
 *  empty/whitespace-only input so callers can treat "no email" uniformly. */
export function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

/** Normalize a phone number for matching: strip everything but digits, drop
 *  a leading NANP country code ("1" prefix on 11 digits) so "+1 (506)
 *  645-1559", "506-645-1559", and "15066451559" all normalize identically.
 *  Returns null when there aren't enough digits to be a meaningful phone
 *  number (avoids false-positive clustering on garbage/partial input). */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  const withoutCountryCode = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return withoutCountryCode.length >= 7 ? withoutCountryCode : null;
}
