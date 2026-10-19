/**
 * Who and which deal a note is about: the client name search (name_search,
 * the CRM's normalised name) plus recent-contact ranking.
 *
 * Names are where transcription fails ("Sara" for Sarah, a surname misheard),
 * so a match is only taken on its own when exactly one client fits. When
 * several do, every one is listed, best match first and then the most
 * recently contacted, and the card shows a picker. Nothing defaults to the
 * first match.
 *
 *   strong match   the full name, or every word said is a word of the name
 *   weak match     only part of a word ("Jon" in "Jonathan")
 *
 *   one strong match                        selected
 *   several strong, full name said, exactly
 *     one with that exact name              selected
 *   several strong                          picker
 *   weak only                               picker ("did you mean")
 *   none                                    nothing selected
 *   the search may not have seen everyone   picker, never a pick
 *
 * Reads are capped, so a pick is only made from a search that saw every
 * client the name could be. The whole name and each word are read as whole
 * words (name_search equal, or the word between spaces, hyphens or
 * apostrophes): a strong match has every word said as a word of its name,
 * so it is in each word's results, and one word's read coming back under
 * the cap means every strong match was seen. Only when no strong match
 * turns up is a part-of-a-word read made, and its results (weak matches) are
 * never picked on their own. Before 2026-10-19 one part-of-a-word read of 25
 * rows was all there was: with 24 "Joanne"s on file, "Ann" read 24 Joannes
 * and one Ann, and that Ann was picked although another Ann was cut off.
 */

import type { DbClient } from "../db-client";
import { toNameSearch } from "../client-identity";
import { ACTIVE_PIPELINE_STAGES } from "../../types/database";
import type { ClientCandidate, DealCandidate } from "./types";

/** Most candidates kept per name. */
export const MAX_CANDIDATES = 6;
/** Rows read per name query (a search, not a list: PostgREST's 1,000-row cap never applies). */
export const SEARCH_LIMIT = 25;
/** Active pipeline deals read at once; an agent has tens. More than this and nothing is picked. */
export const DEAL_READ_LIMIT = 500;

export interface ClientSearchRow {
  id: string;
  name: string;
  name_search?: string | null;
  status?: string | null;
  last_contact_at?: string | null;
}

export interface DealSearchRow {
  id: string;
  address: string | null;
  client_name: string | null;
  client_id: string | null;
  stage: string;
  expected_close_date: string | null;
  updated_at?: string | null;
}

/** Words of a name, normalised, dropping one-letter ones ("J."). */
function words(normalised: string): string[] {
  return normalised.split(/[\s\-']+/).filter((w) => w.length >= 2);
}

/** A search term safe inside ilike: letters, digits, spaces, apostrophes and hyphens. */
export function searchTerm(s: string): string {
  return s.replace(/[^a-zA-Z0-9\u00C0-\u024F\s'\-]/g, " ").replace(/\s+/g, " ").trim();
}

type Scored<T> = { row: T; score: number };

/** 3 exact, 2 every word said is a word of it, 1 a part matches, 0 none. */
export function nameScore(spoken: string, candidate: string): number {
  const said = toNameSearch(spoken);
  const name = toNameSearch(candidate);
  if (!said || !name) return 0;
  if (said === name) return 3;
  const nameWords = words(name);
  const saidWords = words(said);
  if (saidWords.length > 0 && saidWords.every((w) => nameWords.includes(w))) return 2;
  if (saidWords.some((w) => name.includes(w))) return 1;
  return 0;
}

const byRecency = (a: string | null | undefined, b: string | null | undefined) => {
  if (a && b) return a < b ? 1 : a > b ? -1 : 0;
  if (a) return -1;
  if (b) return 1;
  return 0;
};

/** Candidates for a spoken name, ranked: best match, then most recently contacted, then name. */
export function rankClientCandidates(spoken: string, rows: ClientSearchRow[]): ClientCandidate[] {
  const seen = new Set<string>();
  const scored: Scored<ClientSearchRow>[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const score = nameScore(spoken, row.name);
    if (score > 0) scored.push({ row, score });
  }
  const strong = scored.some((s) => s.score >= 2);
  return scored
    .filter((s) => (strong ? s.score >= 2 : true))
    .sort((a, b) => b.score - a.score || byRecency(a.row.last_contact_at, b.row.last_contact_at) || a.row.name.localeCompare(b.row.name))
    .slice(0, MAX_CANDIDATES)
    .map(({ row, score }) => ({
      id: row.id,
      name: row.name,
      status: row.status ?? null,
      lastContactAt: row.last_contact_at ?? null,
      match: score === 3 ? "exact" : score === 2 ? "word" : "partial",
    }));
}

/** The one candidate to take without asking, or null for a picker. */
export function soleMatch<T extends { id: string; match: string }>(spoken: string, ranked: T[]): string | null {
  const strong = ranked.filter((c) => c.match === "exact" || c.match === "word");
  if (strong.length === 1) return strong[0].id;
  if (strong.length > 1 && words(toNameSearch(spoken)).length >= 2) {
    const exact = strong.filter((c) => c.match === "exact");
    if (exact.length === 1) return exact[0].id;
  }
  return null;
}

export interface ClientSearch {
  rows: ClientSearchRow[];
  /**
   * The reads saw every client the name could strongly match: the exact read
   * and at least one word's read came back under the cap. When false the
   * card picks nobody.
   */
  complete: boolean;
}

/** Postgres regex for a whole word of name_search (words split on spaces, hyphens, apostrophes). */
export function wholeWordPattern(word: string): string {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return `(^|[ '-])${escaped}($|[ '-])`;
}

/**
 * Clients whose name could be the one said, from the user's active (not
 * archived) clients. See the header for why the reads are shaped this way.
 */
export async function searchClients(db: DbClient, userId: string, spoken: string): Promise<ClientSearch> {
  const said = searchTerm(toNameSearch(spoken));
  if (!said) return { rows: [], complete: true };
  const run = async (filter: (q: any) => any): Promise<ClientSearchRow[]> => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const query = db
      .from("clients")
      .select("id, name, name_search, status, last_contact_at")
      .eq("user_id", userId)
      .is("archived_at", null);
    const { data, error } = await filter(query).limit(SEARCH_LIMIT);
    if (error) throw new Error(`Client search failed: ${error.message ?? "unknown error"}`);
    return (data ?? []) as ClientSearchRow[];
  };
  const terms = [...new Set(words(said))].slice(0, 3);
  const [exact, ...byWord] = await Promise.all([
    run((q) => q.eq("name_search", said)),
    ...terms.map((w) => run((q) => q.filter("name_search", "imatch", wholeWordPattern(w)))),
  ]);
  const capped = (rows: ClientSearchRow[]) => rows.length >= SEARCH_LIMIT;
  let complete = !capped(exact) && (byWord.length === 0 || byWord.some((r) => !capped(r)));
  const rows = [...exact, ...byWord.flat()];
  const strong = rows.some((r) => nameScore(spoken, r.name) >= 2);
  if (!strong) {
    // Nobody by that name: part-of-a-word matches for "did you mean". Never picked on their own.
    const parts = terms.filter((w) => w.length >= 3);
    const partial = await Promise.all(parts.map((w) => run((q) => q.ilike("name_search", `%${w}%`))));
    if (partial.some(capped)) complete = false;
    rows.push(...partial.flat());
  }
  return { rows, complete };
}

// ── Deals ────────────────────────────────────────────────────────────────────

/** "12 Elm St" for "12 elm street": street-type words compared loosely. */
function addressKey(s: string): string {
  return toNameSearch(s)
    .replace(/[.,#]/g, " ")
    .replace(/\b(street|st)\b/g, "st")
    .replace(/\b(avenue|ave)\b/g, "ave")
    .replace(/\b(road|rd)\b/g, "rd")
    .replace(/\b(drive|dr)\b/g, "dr")
    .replace(/\b(court|crt|ct)\b/g, "ct")
    .replace(/\b(crescent|cres)\b/g, "cres")
    .replace(/\b(boulevard|blvd)\b/g, "blvd")
    .replace(/\b(lane|ln)\b/g, "ln")
    .replace(/\b(the|deal|house|listing|place|property|showing|on)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 3 the address or client said in full, 2 every word, 1 part, 0 none. */
export function dealScore(spoken: string, deal: DealSearchRow): number {
  const said = addressKey(spoken);
  if (!said) return 0;
  const address = addressKey(deal.address ?? "");
  const client = deal.client_name ? nameScore(spoken, deal.client_name) : 0;
  let addr = 0;
  if (address) {
    if (address === said || address.startsWith(said + " ")) addr = 3;
    else {
      const aw = address.split(" ");
      const sw = said.split(" ").filter(Boolean);
      if (sw.length > 0 && sw.every((w) => aw.includes(w))) addr = 2;
      else if (sw.some((w) => w.length >= 3 && address.includes(w))) addr = 1;
    }
  }
  return Math.max(addr, client);
}

export function rankDealCandidates(spoken: string, rows: DealSearchRow[]): DealCandidate[] {
  const seen = new Set<string>();
  const scored: Scored<DealSearchRow>[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const score = dealScore(spoken, row);
    if (score > 0) scored.push({ row, score });
  }
  const strong = scored.some((s) => s.score >= 2);
  return scored
    .filter((s) => (strong ? s.score >= 2 : true))
    .sort((a, b) => b.score - a.score || byRecency(a.row.updated_at, b.row.updated_at))
    .slice(0, MAX_CANDIDATES)
    .map(({ row, score }) => ({
      id: row.id,
      address: row.address ?? "",
      clientName: row.client_name ?? "",
      clientId: row.client_id,
      stage: row.stage,
      expectedCloseDate: row.expected_close_date,
      match: score === 3 ? "exact" : score === 2 ? "word" : "partial",
    }));
}

export interface DealSearch {
  rows: DealSearchRow[];
  /** Every active deal was read (fewer than DEAL_READ_LIMIT). When false nothing is picked. */
  complete: boolean;
}

/**
 * The user's active pipeline deals (not closed or lost), all of them: there
 * are tens, so they are ranked here (rankDealCandidates) rather than by a
 * capped search that could cut off the one meant.
 */
export async function searchDeals(db: DbClient, userId: string): Promise<DealSearch> {
  const { data, error } = await db
    .from("pipeline_deals")
    .select("id, address, client_name, client_id, stage, expected_close_date, updated_at")
    .eq("user_id", userId)
    .in("stage", [...ACTIVE_PIPELINE_STAGES])
    .limit(DEAL_READ_LIMIT);
  if (error) throw new Error(`Deal search failed: ${error.message ?? "unknown error"}`);
  const rows = (data ?? []) as DealSearchRow[];
  return { rows, complete: rows.length < DEAL_READ_LIMIT };
}
