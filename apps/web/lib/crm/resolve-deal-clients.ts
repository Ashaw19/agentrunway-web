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
// A deal produces exactly ONE client_records row, attributed to whichever named
// party's toNameSearch key sorts alphabetically first. Alphabetical rather than
// first-named because the primary must be a function of WHO the parties are,
// not of the word order a report happened to use: "John & Jane Smith" on one
// report and "Jane & John Smith" on the next are the same household, and
// first-named would attribute them to different people — fragmenting one
// household into two contacts that each hold a single deal, neither crossing
// the 2-deal repeat-client threshold. Sorting ignores word order, so the same
// set of people always yields the same primary, in this import or one years
// later. Co-parties are still created/matched as real contacts and linked to
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
import type { ClientRecordCoParty } from "@/lib/types/database";

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
  const partiesByKey = new Map<string, string>();
  const entries: { rawName: string; parties: string[] }[] = [];
  const seenRawNames = new Set<string>();

  // Pass 1: split each raw name into parties, record each person's
  // canonical (first-seen) display spelling. Must complete before pass 2 so
  // every entry can resolve every party's spelling, even one first seen in
  // a later entry.
  for (const raw of rawDealNames) {
    const trimmed = (raw ?? "").trim();
    if (!trimmed || seenRawNames.has(trimmed)) continue;
    seenRawNames.add(trimmed);

    const parties = splitJointName(trimmed).map((p) => p.slice(0, nameLimit));
    if (parties.length === 0) continue;

    entries.push({ rawName: trimmed, parties });

    // Dedupe people across deals by their match key, not their raw spelling, so
    // a repeat client named slightly differently on two deals is one contact.
    for (const p of parties) {
      const key = toNameSearch(p);
      if (key && !partiesByKey.has(key)) partiesByKey.set(key, p);
    }
  }

  // Pass 2: primary = whichever named party's toNameSearch sorts first,
  // computed per entry from the sorted key set. This is deterministic and
  // order-independent — sorting already ignores word order, so the same set
  // of people always yields the same primary whether they're named
  // "John & Jane Smith" or "Jane & John Smith", in this batch or any other.
  const primaryByRawName = new Map<string, string>();
  const coPartiesByRawName = new Map<string, string[]>();

  for (const entry of entries) {
    const sortedKeys = entry.parties.map((p) => toNameSearch(p)).sort();
    const primaryName = partiesByKey.get(sortedKeys[0])!;
    const coPartyNames = sortedKeys.slice(1).map((k) => partiesByKey.get(k)!);

    primaryByRawName.set(entry.rawName, primaryName);
    if (coPartyNames.length > 0) coPartiesByRawName.set(entry.rawName, coPartyNames);
  }

  return {
    allParties: [...partiesByKey.values()],
    primaryByRawName,
    coPartiesByRawName,
  };
}

/**
 * Layers a persisted household-primary override on top of a freshly-computed
 * plan. Pure — the DB lookup that produces `primaryKeyOverride` happens in
 * the caller (resolveDealClientIds); this only merges the result.
 *
 * `primaryKeyOverride` maps a party's toNameSearch key to the household's
 * designated primary's toNameSearch key (both directions populated by the
 * caller, so looking up either person in a pair finds the same target).
 *
 * Only applies to deals naming 2+ people. A solo deal must never be
 * redirected onto someone's linked spouse just because a household link
 * exists — the override exists to pick consistently among parties actually
 * named together on THIS deal, not to merge independent activity.
 */
export function applyPrimaryOverrides(
  plan: DealClientPlan,
  primaryKeyOverride: Map<string, string>,
): DealClientPlan {
  const primaryByRawName = new Map<string, string>();
  const coPartiesByRawName = new Map<string, string[]>();

  for (const [rawName, defaultPrimary] of plan.primaryByRawName) {
    const coParties = plan.coPartiesByRawName.get(rawName) ?? [];
    const allNamesForDeal = [defaultPrimary, ...coParties];

    let finalPrimary = defaultPrimary;
    if (allNamesForDeal.length > 1) {
      const nameByKey = new Map(allNamesForDeal.map((n) => [toNameSearch(n), n]));
      for (const name of allNamesForDeal) {
        const targetKey = primaryKeyOverride.get(toNameSearch(name));
        const targetName = targetKey ? nameByKey.get(targetKey) : undefined;
        if (targetName) {
          finalPrimary = targetName;
          break;
        }
      }
    }

    const finalCoParties = allNamesForDeal.filter((n) => n !== finalPrimary);
    primaryByRawName.set(rawName, finalPrimary);
    if (finalCoParties.length > 0) coPartiesByRawName.set(rawName, finalCoParties);
  }

  return { allParties: plan.allParties, primaryByRawName, coPartiesByRawName };
}

/**
 * Derives the client_record_co_parties rows to insert. Split out as a pure
 * function (rather than living inside a DB call) because the caller can only
 * know each deal's real client_records.id AFTER its own upsert — this
 * function's only job is the row-shape derivation, fully testable without a
 * database. `recordIdByExtId`/`coPartyIdsByExtId` are both keyed by the same
 * import_external_id each caller already computes per deal.
 */
export function buildCoPartyRows(
  userId: string,
  recordIdByExtId: Map<string, string>,
  coPartyIdsByExtId: Map<string, string[]>,
): { user_id: string; client_record_id: string; co_client_id: string }[] {
  const rows: { user_id: string; client_record_id: string; co_client_id: string }[] = [];
  for (const [extId, recordId] of recordIdByExtId) {
    const coIds = coPartyIdsByExtId.get(extId);
    if (!coIds) continue;
    for (const coId of coIds) {
      rows.push({ user_id: userId, client_record_id: recordId, co_client_id: coId });
    }
  }
  return rows;
}

/** The browser Supabase client, exactly as both importers construct it. Derived
 *  from the factory rather than hand-written structurally, so it can't drift
 *  out of sync with the real client's signature. */
type SupabaseLike = ReturnType<typeof createClient>;

export interface ResolvedDealClients {
  primaryIdByRawName: Map<string, string>;
  /** For each raw deal name with 2+ parties, the co-parties' resolved client ids. */
  coPartyIdsByRawName: Map<string, string[]>;
}

export async function resolveDealClientIds(
  supabase: SupabaseLike,
  userId: string,
  rawDealNames: string[],
  nameLimit: number,
): Promise<ResolvedDealClients> {
  const plan = planDealClients(rawDealNames, nameLimit);
  const empty: ResolvedDealClients = { primaryIdByRawName: new Map(), coPartyIdsByRawName: new Map() };
  if (plan.allParties.length === 0) return empty;

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

  // Look up any existing spouse/partner household that already has a
  // persisted primary among this batch's people, so the same couple keeps
  // attributing to the same person even if a report names them differently
  // than last time. Two queries (not one .or()) to keep the filter simple.
  const resolvedIds = [...idByKey.values()];
  const existingRels: { client_id_a: string; client_id_b: string; primary_client_id: string | null }[] = [];
  if (resolvedIds.length > 0) {
    const [byA, byB] = await Promise.all([
      supabase.from("client_relationships")
        .select("client_id_a, client_id_b, primary_client_id")
        .eq("user_id", userId)
        .in("relationship_type", ["spouse", "partner"])
        .not("primary_client_id", "is", null)
        .in("client_id_a", resolvedIds),
      supabase.from("client_relationships")
        .select("client_id_a, client_id_b, primary_client_id")
        .eq("user_id", userId)
        .in("relationship_type", ["spouse", "partner"])
        .not("primary_client_id", "is", null)
        .in("client_id_b", resolvedIds),
    ]);
    const seenRelPairs = new Set<string>();
    for (const row of [...(byA.data ?? []), ...(byB.data ?? [])] as typeof existingRels) {
      const pairKey = `${row.client_id_a}|${row.client_id_b}`;
      if (seenRelPairs.has(pairKey)) continue;
      seenRelPairs.add(pairKey);
      existingRels.push(row);
    }
  }

  const keyById = new Map([...idByKey.entries()].map(([key, id]) => [id, key]));
  const primaryKeyOverride = new Map<string, string>();
  for (const rel of existingRels) {
    if (!rel.primary_client_id) continue;
    const primaryKey = keyById.get(rel.primary_client_id);
    if (!primaryKey) continue;
    const otherId = rel.client_id_a === rel.primary_client_id ? rel.client_id_b : rel.client_id_a;
    const otherKey = keyById.get(otherId);
    primaryKeyOverride.set(primaryKey, primaryKey);
    if (otherKey) primaryKeyOverride.set(otherKey, primaryKey);
  }

  const overriddenPlan = applyPrimaryOverrides(plan, primaryKeyOverride);

  const primaryIdByRawName = new Map<string, string>();
  for (const [rawName, primary] of overriddenPlan.primaryByRawName) {
    const id = idByKey.get(toNameSearch(primary));
    if (id) primaryIdByRawName.set(rawName, id);
  }

  const coPartyIdsByRawName = new Map<string, string[]>();

  // Link co-parties to the primary (existing behavior). Two people named
  // together on one transaction are co-parties to that deal — a fact off the
  // report, not an inferred biography — so this uses the mildest label
  // available ("partner") and is editable/removable by the user like any
  // manual link. When a NEW relationship is created here, it also seeds
  // primary_client_id so this household's choice is persisted from first sight.
  const links: { user_id: string; client_id_a: string; client_id_b: string; relationship_type: string; primary_client_id: string }[] = [];
  const seenPairs = new Set<string>();

  for (const [rawName, coParties] of overriddenPlan.coPartiesByRawName) {
    const primaryId = primaryIdByRawName.get(rawName);
    if (!primaryId) continue;
    const coIds: string[] = [];
    for (const co of coParties) {
      const coId = idByKey.get(toNameSearch(co));
      if (!coId || coId === primaryId) continue;
      coIds.push(coId);
      // client_relationships enforces CHECK (client_id_a < client_id_b) to keep
      // A-B and B-A from both existing — order before inserting.
      const [a, b] = primaryId < coId ? [primaryId, coId] : [coId, primaryId];
      const pair = `${a}|${b}`;
      if (seenPairs.has(pair)) continue;
      seenPairs.add(pair);
      links.push({ user_id: userId, client_id_a: a, client_id_b: b, relationship_type: "partner", primary_client_id: primaryId });
    }
    if (coIds.length > 0) coPartyIdsByRawName.set(rawName, coIds);
  }

  if (links.length > 0) {
    // Best-effort: a failed link must never abort the import — the deal rows
    // and their attribution are the load-bearing part of this operation.
    // ignoreDuplicates means an already-linked pair is never overwritten here:
    // whatever primary_client_id it has, including NULL, is preserved. Only a
    // genuinely new pair gets its primary seeded, on first sighting. A pair
    // left at NULL keeps falling back to the alphabetical default, which is
    // stable — so attribution stays consistent; a persisted primary only ever
    // arrives from the migration backfill or an explicit user "Make primary".
    const { error } = await supabase
      .from("client_relationships")
      .upsert(links, { onConflict: "user_id,client_id_a,client_id_b", ignoreDuplicates: true });
    if (error) console.error("[import] co-party relationship link failed:", error);
  }

  return { primaryIdByRawName, coPartyIdsByRawName };
}

/**
 * Writes client_record_co_parties rows once each deal's real client_records
 * id is known (this must run AFTER the caller's own client_records upsert —
 * resolveDealClientIds resolves client ids BEFORE those rows exist, so it
 * has no way to know them). All logic lives in buildCoPartyRows; this is
 * the thin I/O wrapper.
 */
export async function writeCoPartyRecords(
  supabase: SupabaseLike,
  userId: string,
  recordIdByExtId: Map<string, string>,
  coPartyIdsByExtId: Map<string, string[]>,
): Promise<void> {
  const rows = buildCoPartyRows(userId, recordIdByExtId, coPartyIdsByExtId);
  if (rows.length === 0) return;
  const { error } = await supabase
    .from("client_record_co_parties")
    .upsert(rows, { onConflict: "client_record_id,co_client_id", ignoreDuplicates: true });
  if (error) console.error("[import] co-party record link failed:", error);
}

/** Client ids that appear as a co-party on at least one deal — used to badge
 *  a $0-GCI contact in the CRM list as "linked to real activity" rather than
 *  a cold lead. */
export function computeHouseholdActivityIds(coParties: ClientRecordCoParty[]): Set<string> {
  return new Set(coParties.map((cp) => cp.co_client_id));
}
