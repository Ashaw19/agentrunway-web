// Resolving a brokerage report's deal names to real CRM contacts.
//
// WHY: the two transaction importers (transactions-history-tab.tsx and
// history-content.tsx) each had their own, divergent take on this:
//   • transactions-history-tab did NOT split joint names at all — it upserted a
//     client literally named "John & Jane Smith", creating a phantom third
//     contact that held the GCI while the real "John Smith" / "Jane Smith"
//     contacts from the CRM showed nothing. Measured on the first real import:
//     15 of 32 deals (47%) hit this, every one a couple.
//   • history-content DID split, but then wrote one client_records row per
//     party EACH CARRYING THE FULL GCI — so a $10k couple's deal counted as
//     $20k. The CRM's per-client totals and the client-valuation engine both
//     sum client_records.gci, so that inflated real metrics.
// Both also keyed clients on `name.toLowerCase()` while the rest of the app
// keys on toNameSearch() (trim + collapse whitespace + strip diacritics +
// fold apostrophes) — so an accented name ("Léger") written by an import could
// never match the same person created anywhere else. This module is the single
// shared implementation both importers now call.
//
// THE ATTRIBUTION RULE (why it is this way):
// A deal produces exactly ONE client_records row, attributed to the FIRST-named
// party. Co-parties are still created/matched as real contacts and linked to
// the primary via client_relationships, but they carry no duplicate deal row.
// This is deliberate: client_records.gci is summed both per-client and in
// aggregate (clients-content.tsx, the client-valuation engine, the dashboard),
// and the repeat-client rate counts distinct clients holding a closed deal
// (memory/feedback_repeat_clients_metric.md). Writing a row per party would
// double the GCI and inflate the repeat-rate denominator. Attributing once
// keeps every downstream metric honest.

import { splitJointName } from "./joint-names";
import { toNameSearch } from "./client-identity";
import type { createClient } from "@/lib/supabase/client";

export interface DealClientPlan {
  /** Every distinct person named across all deals, deduped by name_search. */
  allParties: string[];
  /** Raw deal name → the party the deal's GCI is attributed to. */
  primaryByRawName: Map<string, string>;
  /** Raw deal name → the other people named on that same deal. */
  coPartiesByRawName: Map<string, string[]>;
}

/**
 * Pure planning step: turn the raw client names off a brokerage report into the
 * set of people to upsert, plus the attribution/link structure. Split out from
 * the DB work so the decision logic is unit-testable without a database.
 */
export function planDealClients(rawDealNames: string[], nameLimit: number): DealClientPlan {
  const primaryByRawName = new Map<string, string>();
  const coPartiesByRawName = new Map<string, string[]>();
  const partiesByKey = new Map<string, string>();

  for (const raw of rawDealNames) {
    const trimmed = (raw ?? "").trim();
    if (!trimmed || primaryByRawName.has(trimmed)) continue;

    const parties = splitJointName(trimmed).map((p) => p.slice(0, nameLimit));
    if (parties.length === 0) continue;

    primaryByRawName.set(trimmed, parties[0]);
    if (parties.length > 1) coPartiesByRawName.set(trimmed, parties.slice(1));

    // Dedupe people across deals by their match key, not their raw spelling, so
    // a repeat client named slightly differently on two deals is one contact.
    for (const p of parties) {
      const key = toNameSearch(p);
      if (key && !partiesByKey.has(key)) partiesByKey.set(key, p);
    }
  }

  return {
    allParties: [...partiesByKey.values()],
    primaryByRawName,
    coPartiesByRawName,
  };
}

/** The browser Supabase client, exactly as both importers construct it. Derived
 *  from the factory rather than hand-written structurally, so it can't drift
 *  out of sync with the real client's signature. */
type SupabaseLike = ReturnType<typeof createClient>;

/**
 * Upsert every person named across the given deals as a CRM contact (matching
 * existing contacts rather than duplicating them), link co-parties on the same
 * deal, and return the map the caller needs to attribute each deal.
 *
 * @returns raw deal name → primary client id. A name absent from the map means
 *          it could not be resolved; the caller should write client_id = null
 *          rather than guessing.
 */
export async function resolveDealClientIds(
  supabase: SupabaseLike,
  userId: string,
  rawDealNames: string[],
  nameLimit: number,
): Promise<Map<string, string>> {
  const plan = planDealClients(rawDealNames, nameLimit);
  const primaryIdByRawName = new Map<string, string>();
  if (plan.allParties.length === 0) return primaryIdByRawName;

  // ignoreDuplicates: an existing contact (e.g. from a Follow Up Boss CSV) must
  // be matched and left exactly as-is, never overwritten by a brokerage
  // report's spelling of the same person.
  await supabase.from("clients").upsert(
    plan.allParties.map((name) => ({
      user_id: userId,
      name,
      name_search: toNameSearch(name),
    })),
    { onConflict: "user_id,name_search", ignoreDuplicates: true },
  );

  const keys = plan.allParties.map((n) => toNameSearch(n));
  const { data: clientRows } = await supabase
    .from("clients")
    .select("id, name_search")
    .eq("user_id", userId)
    .in("name_search", keys);

  const idByKey = new Map(
    ((clientRows ?? []) as { id: string; name_search: string }[]).map((c) => [c.name_search, c.id]),
  );

  for (const [rawName, primary] of plan.primaryByRawName) {
    const id = idByKey.get(toNameSearch(primary));
    if (id) primaryIdByRawName.set(rawName, id);
  }

  // Link co-parties to the primary. Two people named together on one
  // transaction are co-parties to that deal — a fact off the report, not an
  // inferred biography — so this uses the mildest label available ("partner")
  // and is editable/removable by the user like any manual link.
  const links: { user_id: string; client_id_a: string; client_id_b: string; relationship_type: string }[] = [];
  const seenPairs = new Set<string>();

  for (const [rawName, coParties] of plan.coPartiesByRawName) {
    const primaryId = primaryIdByRawName.get(rawName);
    if (!primaryId) continue;
    for (const co of coParties) {
      const coId = idByKey.get(toNameSearch(co));
      if (!coId || coId === primaryId) continue;
      // client_relationships enforces CHECK (client_id_a < client_id_b) to keep
      // A-B and B-A from both existing — order before inserting.
      const [a, b] = primaryId < coId ? [primaryId, coId] : [coId, primaryId];
      const pair = `${a}|${b}`;
      if (seenPairs.has(pair)) continue;
      seenPairs.add(pair);
      links.push({ user_id: userId, client_id_a: a, client_id_b: b, relationship_type: "partner" });
    }
  }

  if (links.length > 0) {
    // Best-effort: a failed link must never abort the import — the deal rows
    // and their attribution are the load-bearing part of this operation.
    const { error } = await supabase
      .from("client_relationships")
      .upsert(links, { onConflict: "user_id,client_id_a,client_id_b", ignoreDuplicates: true });
    if (error) console.error("[import] co-party relationship link failed:", error);
  }

  return primaryIdByRawName;
}
