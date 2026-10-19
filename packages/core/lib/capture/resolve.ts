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
 */

import type { DbClient } from "../db-client";
import { toNameSearch } from "../client-identity";
import { ACTIVE_PIPELINE_STAGES } from "../../types/database";
import type { ClientCandidate, DealCandidate } from "./types";

/** Most candidates kept per name. */
export const MAX_CANDIDATES = 6;
/** Rows read per search term (a search, not a list: PostgREST's 1,000-row cap never applies). */
const SEARCH_LIMIT = 25;

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

/**
 * Clients whose name could be the one said, from the user's active (not
 * archived) clients. The whole name first; if that finds nobody, each word.
 */
export async function searchClients(db: DbClient, userId: string, spoken: string): Promise<ClientSearchRow[]> {
  const said = searchTerm(toNameSearch(spoken));
  if (!said) return [];
  const run = async (term: string): Promise<ClientSearchRow[]> => {
    const { data, error } = await db
      .from("clients")
      .select("id, name, name_search, status, last_contact_at")
      .eq("user_id", userId)
      .is("archived_at", null)
      .ilike("name_search", `%${term}%`)
      .limit(SEARCH_LIMIT);
    if (error) throw new Error(`Client search failed: ${error.message ?? "unknown error"}`);
    return (data ?? []) as ClientSearchRow[];
  };
  const whole = await run(said);
  if (whole.length > 0) return whole;
  const terms = words(said).filter((w) => w.length >= 3).slice(0, 3);
  const rows: ClientSearchRow[] = [];
  for (const t of terms) rows.push(...(await run(t)));
  return rows;
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

/** Active pipeline deals (not closed or lost) whose address or client could be the one said. */
export async function searchDeals(db: DbClient, userId: string, spoken: string): Promise<DealSearchRow[]> {
  const term = searchTerm(spoken);
  if (!term) return [];
  const cols = "id, address, client_name, client_id, stage, expected_close_date, updated_at";
  const run = async (column: string, value: string): Promise<DealSearchRow[]> => {
    const { data, error } = await db
      .from("pipeline_deals")
      .select(cols)
      .eq("user_id", userId)
      .in("stage", [...ACTIVE_PIPELINE_STAGES])
      .ilike(column, `%${value}%`)
      .limit(SEARCH_LIMIT);
    if (error) throw new Error(`Deal search failed: ${error.message ?? "unknown error"}`);
    return (data ?? []) as DealSearchRow[];
  };
  const rows = [...(await run("address", term)), ...(await run("client_name", term))];
  if (rows.length > 0) return rows;
  // A house number or a street name on its own: "the Elm one", "number 12".
  const parts = term.split(" ").filter((w) => w.length >= 3 && !/^(the|deal|house|street|road|drive|avenue|listing|showing)$/i.test(w)).slice(0, 3);
  for (const p of parts) rows.push(...(await run("address", p)));
  return rows;
}
