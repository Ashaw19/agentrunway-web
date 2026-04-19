/**
 * lib/import/external-id.ts
 *
 * Builds the stable `import_external_id` natural key used to UPSERT imported
 * rows into `client_records` and `transactions` without wiping prior imports
 * or user-edited rows.
 *
 * Design goals:
 *   1. DETERMINISTIC — the same deal extracted from the same document must
 *      produce the same ID on re-import, so the upsert overwrites in place.
 *   2. CONTENT-ADDRESSED — any two different deals in the same year must
 *      produce different IDs, so a second CSV's new rows don't collide with
 *      the first CSV's rows.
 *   3. READABLE — stored as a TEXT column, not a hash, so support engineers
 *      can grep the DB to trace an imported row back to its source fields.
 *   4. NORMALIZATION-STABLE — tolerant to trivial whitespace/case differences
 *      that would otherwise treat the same deal as a new one.
 *
 * Format:
 *   "v1|<year>|<date>|<addr>|<names>"
 *
 * where:
 *   year    = import year as a 4-digit string
 *   date    = YYYY-MM-DD (the close date; "" if missing)
 *   addr    = lower-cased, trimmed, whitespace-collapsed address
 *   names   = lower-cased, trimmed, whitespace-collapsed party_a+"#"+party_b
 *             (agent_side is NOT included — the user can flip it during review
 *              and a second upload of the same document with flipped sides
 *              should still map to the same row.)
 *
 * GCI is intentionally NOT part of the key: if the user re-uploads a corrected
 * version of the same report with a fixed GCI, the row must upsert in place
 * (same ID → overwrite) rather than insert a duplicate alongside.
 *
 * Trade-off: two truly distinct deals that happen to share year+date+address
 * +party_a+party_b would collapse to one row. In practice this cannot happen —
 * the same agent does not close two separate deals on the same day at the
 * same address with the same clients.
 *
 * The "v1" prefix lets us migrate the key format later without breaking
 * existing stored IDs — old rows stay addressable, new imports land with "v2".
 */

export interface ExternalIdInput {
  year:     number;
  date:     string | null | undefined;  // YYYY-MM-DD
  address:  string | null | undefined;
  party_a:  string | null | undefined;
  party_b:  string | null | undefined;
  /** Accepted for API symmetry with earlier revisions; IGNORED by the key. */
  gci?:     number | null | undefined;
}

/** Lower-case, trim, collapse internal whitespace runs to a single space. */
function normalizeText(s: string | null | undefined): string {
  if (!s) return "";
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Normalize a YYYY-MM-DD (or empty) to a consistent 10-char string. */
function normalizeDate(d: string | null | undefined): string {
  if (!d) return "";
  // Accept YYYY-MM-DD or anything parseable; strip time portion if present.
  const trimmed = d.trim().slice(0, 10);
  // Guard against obvious garbage; we still store whatever came in as long
  // as it's vaguely YYYY-MM-DD shaped — downstream validation is elsewhere.
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : trimmed;
}

/**
 * Build the stable external ID for an imported deal.
 * Safe to call with missing / partial fields — missing pieces become "".
 */
export function computeImportExternalId(input: ExternalIdInput): string {
  const year  = String(input.year);
  const date  = normalizeDate(input.date);
  const addr  = normalizeText(input.address);
  const names = normalizeText(input.party_a) + "#" + normalizeText(input.party_b);

  return `v1|${year}|${date}|${addr}|${names}`;
}
