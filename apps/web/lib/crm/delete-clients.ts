/**
 * Deleting clients from the web CRM: one ("Delete Forever…" on a client) or
 * many (the list's bulk Delete). Both go through fn_delete_clients (00181),
 * one transaction per call, scoped to the signed-in agent's clients.
 *
 * A client with a deal, an unsubscribe or consent records is moved to the
 * Hangar (archived) instead of deleted: deleting would erase their opt-out
 * (CASL) and leave their deals with no client. `dryRun` returns that split
 * without changing anything, for the confirm dialog.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface DeleteClientsResult {
  /** Clients deleted (or that would be, on a dry run). */
  deleted: string[];
  /** Clients archived instead (or that would be). */
  archived: string[];
}

/** fn_delete_clients refuses more than 5,000 ids in one call. */
export const DELETE_CHUNK = 2000;

export async function deleteClients(
  supabase: SupabaseClient,
  clientIds: readonly string[],
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<{ data: DeleteClientsResult | null; error: string | null }> {
  const ids = [...new Set(clientIds)];
  const out: DeleteClientsResult = { deleted: [], archived: [] };
  for (let i = 0; i < ids.length; i += DELETE_CHUNK) {
    const { data, error } = await supabase.rpc("fn_delete_clients", {
      p_client_ids: ids.slice(i, i + DELETE_CHUNK),
      p_dry_run: dryRun,
    });
    if (error) {
      // Earlier chunks already committed: report them with the error.
      return { data: i > 0 ? out : null, error: error.message };
    }
    const r = (data ?? {}) as Partial<DeleteClientsResult>;
    out.deleted.push(...(r.deleted ?? []));
    out.archived.push(...(r.archived ?? []));
  }
  return { data: out, error: null };
}

/** Rows per request: the API returns at most 1,000 (supabase/config.toml max_rows). */
export const CLIENT_PAGE = 1000;

/**
 * Every client the agent has, archived included, ordered by name. A single
 * select returns at most 1,000 rows however high its .limit(), so an agent
 * with more clients saw only the first 1,000 by name.
 */
export async function fetchAllClients<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ data: T[] | null; error: string | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += CLIENT_PAGE) {
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .eq("user_id", userId)
      .order("name")
      .order("id") // stable across pages when names repeat
      .range(from, from + CLIENT_PAGE - 1);
    if (error) return { data: null, error: error.message };
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < CLIENT_PAGE) break;
  }
  return { data: rows, error: null };
}
