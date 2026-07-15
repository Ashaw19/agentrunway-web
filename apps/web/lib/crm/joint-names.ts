// Joint-name parsing — splitting a brokerage report's client name into the
// individual people it actually refers to.
//
// WHY: brokerage transaction reports name a deal's client the way the deal was
// written — "John & Jane Smith" — while a CRM contact list (e.g. a Follow Up
// Boss export) holds those same people as two separate contacts, "John Smith"
// and "Jane Smith". The transaction importer used to take the report's string
// literally and upsert a client named "John & Jane Smith", producing a third,
// phantom contact that held all the GCI while the two real contacts showed
// nothing. Measured on the first real import: 15 of 32 imported deals (47%)
// carried a joint name and matched no individual contact. Every single
// unmatched deal was a couple.
//
// SCOPE: this module is pure string parsing and returns a SUGGESTION. It never
// writes. Callers resolve the returned parties against existing contacts (via
// toNameSearch) and attribute the deal's GCI to exactly one of them — see
// the caller for the no-double-count rule.

import { toNameSearch } from "./client-identity";

/** Conjunctions that join two parties on a deal. Ordered longest-first so
 *  " and " is consumed before a bare "&" inside the same pass. */
const CONJUNCTION = /\s*(?:&|\+|\band\b)\s*/gi;

/** Tokens that mark a name as an organization rather than a person. A company
 *  legitimately contains "&" ("Smith & Sons Realty Ltd", "Cox & Palmer") and
 *  must never be split into two people. Matched case-insensitively on word
 *  boundaries so "Landry" doesn't trip the "Ltd" check, and so "Cox" doesn't
 *  trip the "co" check. A trailing period is left outside the group — "\b"
 *  after a literal "." can never match at end-of-string, which would silently
 *  let "Miller & Co." split into two people. */
const ORG_MARKER =
  /\b(?:inc|ltd|llc|llp|corp|corporation|company|co|holdings|group|realty|properties|associates|partners|enterprises|trust|estate|foundation|society|limited|sons|daughters|bros|brothers)\b/i;

/** Split a name on its conjunctions, keeping only non-empty trimmed parts. */
function rawParts(name: string): string[] {
  return name
    .split(CONJUNCTION)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Split a joint client name into the individual people it refers to.
 *
 * Surname inheritance: a party with only a given name inherits the surname of
 * the nearest following party that has one, which is how joint names are
 * conventionally written ("John & Jane Smith" means John Smith and Jane Smith,
 * not a person called "John"). A party that already carries its own surname
 * keeps it ("John Smith & Jane Doe" → two different surnames, no inheritance).
 *
 * Returns a single-element array for any name that isn't a splittable joint
 * name — a plain individual, an organization, or anything ambiguous. Callers
 * can therefore treat the result uniformly without special-casing.
 *
 * Parties are deduped by toNameSearch key, so a report that names the same
 * person on both sides of the conjunction ("John & John Smith") yields one
 * person rather than two identical strings. The first spelling encountered
 * wins, matching the left-to-right reading order of the source name.
 *
 * Examples:
 *   "John & Jane Smith"      → ["John Smith", "Jane Smith"]
 *   "Bob and Mary Wilson"    → ["Bob Wilson", "Mary Wilson"]
 *   "John Smith & Jane Doe"  → ["John Smith", "Jane Doe"]
 *   "John & John Smith"      → ["John Smith"]                (one person, named twice)
 *   "Smith & Sons Realty Ltd"→ ["Smith & Sons Realty Ltd"]   (org, untouched)
 *   "John Smith"             → ["John Smith"]                (not joint)
 */
export function splitJointName(name: string): string[] {
  const trimmed = (name ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return [];

  // An organization keeps its ampersand — never two people.
  if (ORG_MARKER.test(trimmed)) return [trimmed];

  const parts = rawParts(trimmed);
  // Not joint (no conjunction), or a conjunction with nothing usable either
  // side ("& Smith") — hand the original back untouched rather than guessing.
  if (parts.length < 2) return [trimmed];

  // Walk right-to-left so each surname-less party inherits from the nearest
  // party to its right that has a surname. The rightmost party is always
  // taken as-is; it's the one that carries the shared surname by convention.
  const out: string[] = [];
  let inheritedSurname: string | null = null;

  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    const tokens = part.split(" ");

    if (tokens.length >= 2) {
      // Carries its own surname — use as-is, and become the surname source for
      // any surname-less party to the LEFT of it.
      inheritedSurname = tokens[tokens.length - 1];
      out.unshift(part);
    } else if (inheritedSurname) {
      // Given name only — inherit.
      out.unshift(`${part} ${inheritedSurname}`);
    } else {
      // Given name only with no surname anywhere to inherit ("John & Jane") —
      // keep the bare given name rather than inventing one.
      out.unshift(part);
    }
  }

  // Collapse the same person named twice on one deal ("John & John Smith").
  // Keyed on toNameSearch — the app-wide identity key — so a case or accent
  // variant of one person ("John & JOHN Smith") collapses too, rather than
  // surviving as two strings that would resolve to the same contact anyway.
  // This runs AFTER surname inheritance because inheritance is what creates
  // the collision: "John" only becomes "John Smith" in the loop above.
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const party of out) {
    const key = toNameSearch(party);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(party);
  }

  return deduped;
}

/** True when a name refers to more than one person and can be split. Useful
 *  for callers that want to branch (e.g. create a spouse relationship) without
 *  re-deriving the parts. */
export function isJointName(name: string): boolean {
  return splitJointName(name).length > 1;
}
