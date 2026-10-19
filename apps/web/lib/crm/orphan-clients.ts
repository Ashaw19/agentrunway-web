/**
 * After a year of deal history is deleted (History / Transactions → History),
 * remove the clients that year's import created and that nothing else uses.
 *
 * Until 2026-10-14 this read ALL of the agent's remaining deal records in one
 * request, which stops at 1,000 rows: past that, a client who still had a
 * deal in another year looked orphaned and was deleted. A failed read was
 * also treated as "no deals left", which deleted every candidate. Now each
 * check reads only the candidates (in chunks, in full), any failed check
 * stops the cleanup, and a client is deleted only when ALL of these hold:
 *   - an import created them (imported_at is set);
 *   - no deal record of theirs remains (client_records);
 *   - no pipeline deal is linked to them;
 *   - they're not a co-buyer on a remaining deal (client_record_co_parties);
 *   - they haven't unsubscribed from email or texts, and have no consent
 *     ledger record (deleting cascades those away, which loses the
 *     opt-out or the proof of consent: CASL, 00173 / 00183).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllIn } from "@/lib/supabase/fetch-all";

type Rows<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function deleteOrphanedImportedClients(
  supabase: SupabaseClient,
  userId: string,
  candidateIds: readonly string[],
): Promise<{ deleted: string[]; error: string | null }> {
  const candidates = [...new Set(candidateIds.filter(Boolean))];
  if (candidates.length === 0) return { deleted: [], error: null };

  const stillHasRecords = await fetchAllIn<string, { client_id: string | null }>(candidates, (chunk, from, to) =>
    supabase.from("client_records").select("id, client_id").eq("user_id", userId).in("client_id", chunk)
      .order("id").range(from, to) as unknown as Rows<{ client_id: string | null }>);
  if (stillHasRecords.error) return { deleted: [], error: stillHasRecords.error.message };
  const referenced = new Set(stillHasRecords.data.map((r) => r.client_id));
  const orphaned = candidates.filter((id) => !referenced.has(id));
  if (orphaned.length === 0) return { deleted: [], error: null };

  const importedNoOptOut = await fetchAllIn<string, { id: string }>(orphaned, (chunk, from, to) =>
    supabase.from("clients").select("id").eq("user_id", userId).in("id", chunk)
      .not("imported_at", "is", null).is("email_opt_out_at", null).is("sms_opt_out_at", null)
      .order("id").range(from, to) as unknown as Rows<{ id: string }>);
  if (importedNoOptOut.error) return { deleted: [], error: importedNoOptOut.error.message };
  const safe = importedNoOptOut.data.map((c) => c.id);
  if (safe.length === 0) return { deleted: [], error: null };

  const pipeline = await fetchAllIn<string, { client_id: string | null }>(safe, (chunk, from, to) =>
    supabase.from("pipeline_deals").select("id, client_id").eq("user_id", userId).in("client_id", chunk)
      .order("id").range(from, to) as unknown as Rows<{ client_id: string | null }>);
  if (pipeline.error) return { deleted: [], error: pipeline.error.message };

  const coParty = await fetchAllIn<string, { co_client_id: string | null }>(safe, (chunk, from, to) =>
    supabase.from("client_record_co_parties").select("id, co_client_id").eq("user_id", userId).in("co_client_id", chunk)
      .order("id").range(from, to) as unknown as Rows<{ co_client_id: string | null }>);
  if (coParty.error) return { deleted: [], error: coParty.error.message };

  const consents = await fetchAllIn<string, { client_id: string | null }>(safe, (chunk, from, to) =>
    supabase.from("client_email_consents").select("id, client_id").eq("user_id", userId).in("client_id", chunk)
      .order("id").range(from, to) as unknown as Rows<{ client_id: string | null }>);
  if (consents.error) return { deleted: [], error: consents.error.message };

  const linked = new Set<string | null>([
    ...pipeline.data.map((d) => d.client_id),
    ...coParty.data.map((d) => d.co_client_id),
    ...consents.data.map((d) => d.client_id),
  ]);
  const finalIds = safe.filter((id) => !linked.has(id));
  const deleted: string[] = [];
  for (let i = 0; i < finalIds.length; i += 200) {
    const chunk = finalIds.slice(i, i + 200);
    const { error } = await supabase.from("clients").delete().eq("user_id", userId).in("id", chunk);
    if (error) return { deleted, error: error.message };
    deleted.push(...chunk);
  }
  return { deleted, error: null };
}
