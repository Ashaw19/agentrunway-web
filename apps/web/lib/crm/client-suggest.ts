/**
 * Name suggestions for a client box, as the agent types. A voice note's search
 * (core/lib/capture/resolve.ts) matches whole words said aloud; this one matches
 * the start of any word, so "ka" and "stef" both find Kathy Stefanides.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { toNameSearch } from "@agent-runway/core/lib/client-identity";

export interface ClientSuggestion {
  id: string;
  name: string;
  last_contact_at: string | null;
}

export const MAX_SUGGESTIONS = 6;
/** Rows read per search, most recently contacted first. More typing narrows it. */
const SUGGESTION_READ_LIMIT = 25;

/** Anything but letters, their combining marks, digits and apostrophes separates words: Jean-Luc, J.P. */
const WORD_BREAK = /[^\p{L}\p{M}\p{N}']+/u;
const words = (text: string) => toNameSearch(text).replace(/\u2019/g, "'").split(WORD_BREAK).filter(Boolean);

/** The words typed, as name_search stores them. Only safe characters survive, for the filter below. */
export function suggestionTerms(typed: string): string[] {
  return words(typed).slice(0, 4);
}

const nameWords = words;

/** Clients with a word starting with every word typed: name start first, then most recently contacted. */
export function rankClientSuggestions(typed: string, rows: readonly ClientSuggestion[]): ClientSuggestion[] {
  const terms = suggestionTerms(typed);
  if (terms.length === 0) return [];
  const startsName = (name: string) => (nameWords(name)[0] ?? "").startsWith(terms[0]);
  return rows
    .filter((r) => {
      const words = nameWords(r.name);
      return terms.every((t) => words.some((w) => w.startsWith(t)));
    })
    .sort((a, b) =>
      Number(startsName(b.name)) - Number(startsName(a.name)) ||
      (b.last_contact_at ?? "").localeCompare(a.last_contact_at ?? "") ||
      a.name.localeCompare(b.name))
    .slice(0, MAX_SUGGESTIONS);
}

/**
 * The one client whose whole name was typed. Null when there's none, when two share
 * that name, or while the text ends in a space: "Mike " is on its way to Mike Brown.
 */
export function exactClientMatch(typed: string, rows: readonly ClientSuggestion[]): ClientSuggestion | null {
  if (typed !== typed.trimEnd()) return null;
  const said = toNameSearch(typed);
  const same = rows.filter((r) => toNameSearch(r.name) === said);
  return same.length === 1 ? same[0] : null;
}

/** This agent's active clients matching the text. Throws on a failed read, so that can't look like no match. */
export async function fetchClientSuggestions(
  db: SupabaseClient,
  userId: string,
  typed: string,
): Promise<ClientSuggestion[]> {
  const terms = suggestionTerms(typed);
  if (terms.length === 0) return [];
  let query = db
    .from("clients")
    .select("id, name, last_contact_at")
    .eq("user_id", userId)
    .is("archived_at", null);
  for (const t of terms) {
    query = query.or(`name_search.ilike."${t}%",name_search.ilike."% ${t}%",name_search.ilike."%-${t}%",name_search.ilike."%.${t}%"`);
  }
  const { data, error } = await query
    .order("last_contact_at", { ascending: false, nullsFirst: false })
    .limit(SUGGESTION_READ_LIMIT);
  if (error) throw new Error(error.message);
  return rankClientSuggestions(typed, (data ?? []) as ClientSuggestion[]);
}
