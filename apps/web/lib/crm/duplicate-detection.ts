// Duplicate-client clustering — pure, client-side, no DB access.
//
// WHY: the CSV importer's only duplicate check is an exact match on
// name_search (a normalized name) against existing clients — nothing on
// email or phone, and no review step. Genuinely-duplicate clients typed
// slightly differently (nickname, middle initial, a curly vs. straight
// apostrophe) both get inserted as separate rows, silently. This module is
// the detection half of the fix: it clusters the full client list (already
// loaded in clients-content.tsx local state) into likely-duplicate groups
// for a human to review and merge via fn_merge_clients (migration 00162).
//
// SCOPE (v1, deliberately cut): exact-match clustering only, on name/email/
// phone. No fuzzy/typo matching (e.g. "Bob" vs "Robert") — that needs a
// similarity threshold and false-positive tuning that's a larger, separate
// piece of work. This module only surfaces suggestions; nothing is written
// until a human picks a cluster and confirms a merge, so a missed edge case
// here is a missed suggestion, not a data-integrity risk.

import { clusterNameKey } from "./client-identity";
import { normalizeEmail, normalizePhone } from "./client-identity";

export interface ClusterableClient {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
}

export type MatchReason = "name" | "email" | "phone";

export interface DuplicateCluster {
  clientIds: string[];
  matchedOn: MatchReason[];
}

// ── Union-Find (disjoint set), path-compressed ───────────────────────────────

class UnionFind {
  private parent = new Map<string, string>();

  private ensure(x: string): void {
    if (!this.parent.has(x)) this.parent.set(x, x);
  }

  find(x: string): string {
    this.ensure(x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    // Path compression: repoint every visited node straight at the root.
    let cur = x;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

function bucketBy(
  clients: ClusterableClient[],
  keyFn: (c: ClusterableClient) => string | null,
): Map<string, string[]> {
  const buckets = new Map<string, string[]>();
  for (const c of clients) {
    const key = keyFn(c);
    if (!key) continue;
    const arr = buckets.get(key) ?? [];
    arr.push(c.id);
    buckets.set(key, arr);
  }
  return buckets;
}

/**
 * Cluster clients into likely-duplicate groups. Two clients land in the same
 * cluster if they share a normalized name, email, or phone — transitively:
 * if A matches B by phone and B matches C by email, all three cluster
 * together, even though A and C share nothing directly.
 *
 * Returns only clusters with 2+ members; singletons are never included.
 */
export function clusterDuplicateClients(clients: ClusterableClient[]): DuplicateCluster[] {
  const uf = new UnionFind();
  for (const c of clients) uf.find(c.id);

  const byName = bucketBy(clients, (c) => clusterNameKey(c.name));
  const byEmail = bucketBy(clients, (c) => normalizeEmail(c.email));
  const byPhone = bucketBy(clients, (c) => normalizePhone(c.phone));

  for (const bucket of [byName, byEmail, byPhone]) {
    for (const ids of bucket.values()) {
      for (let i = 1; i < ids.length; i++) uf.union(ids[0], ids[i]);
    }
  }

  const groups = new Map<string, string[]>();
  for (const c of clients) {
    const root = uf.find(c.id);
    const arr = groups.get(root) ?? [];
    arr.push(c.id);
    groups.set(root, arr);
  }

  const clusters: DuplicateCluster[] = [];
  for (const clientIds of groups.values()) {
    if (clientIds.length < 2) continue;
    const idSet = new Set(clientIds);
    const matchedOn = new Set<MatchReason>();
    const reasonBuckets: [MatchReason, Map<string, string[]>][] = [
      ["name", byName],
      ["email", byEmail],
      ["phone", byPhone],
    ];
    for (const [reason, bucket] of reasonBuckets) {
      for (const bucketIds of bucket.values()) {
        if (bucketIds.length < 2) continue;
        const overlapCount = bucketIds.filter((id) => idSet.has(id)).length;
        if (overlapCount >= 2) matchedOn.add(reason);
      }
    }
    clusters.push({ clientIds, matchedOn: [...matchedOn] });
  }

  // Stable, deterministic order for UI rendering (largest clusters first).
  return clusters.sort((a, b) => b.clientIds.length - a.clientIds.length);
}

/**
 * Suggest which client in a cluster should be the merge target ("primary").
 * Default heuristic: earliest created_at — usually the original entry, with
 * the most accumulated history. The review UI lets the user override this.
 */
export function pickSuggestedPrimary(
  clients: ClusterableClient[],
  clientIds: string[],
): string {
  const candidates = clients.filter((c) => clientIds.includes(c.id));
  if (candidates.length === 0) {
    throw new Error("pickSuggestedPrimary: no matching clients for the given ids");
  }
  return candidates.reduce((best, c) => (c.created_at < best.created_at ? c : best)).id;
}
