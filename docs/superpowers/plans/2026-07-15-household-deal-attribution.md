# Household Deal Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a co-party's CRM card show a joint deal (read-only, not counting toward their own GCI) and make primary attribution deterministic across reports instead of depending on word order, with a user-editable override.

**Architecture:** One migration adds a `client_record_co_parties` join table and a `client_relationships.primary_client_id` column. `planDealClients` (pure) switches its tie-break from "first-named party in the string" to "alphabetically-first `name_search` across the whole set of named people" — deterministic, no DB needed. Two new pure functions (`applyPrimaryOverrides`, `buildCoPartyRows`) layer a persisted override and the co-party-row derivation on top, fully unit-testable with plain objects. The DB-touching wrapper and all four import call sites get correspondingly small, mechanical extensions. UI changes in `clients-content.tsx` are additive: a list badge, a read-only drawer section, one new button.

**Tech Stack:** Next.js 15 App Router, Supabase/Postgres, TypeScript, Vitest.

**Depends on:** PR #254 (merged to `main`) — `apps/web/lib/crm/joint-names.ts`, `apps/web/lib/crm/resolve-deal-clients.ts`. Spec: `docs/superpowers/specs/2026-07-15-household-deal-attribution-design.md`.

**Branch:** `feat/household-deal-attribution` (already created, in the `crm-intel` worktree).

---

### Task 1: Migration — schema + backfill

**Files:**
- Create: `apps/web/supabase/migrations/00164_household_deal_attribution.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 00164 — Household deal attribution
--
-- WHY: PR #254 fixed the dominant bug (a joint-name deal creating a phantom
-- third contact) but left two gaps: a co-party's own card shows nothing for
-- a deal they were part of, and primary attribution is decided by word
-- order in the report string, so the same couple could fragment into two
-- people if a later report names them in reversed order. Design:
-- docs/superpowers/specs/2026-07-15-household-deal-attribution-design.md
--
-- client_record_co_parties: per-deal fact — "this specific deal also named
-- this person" — independent of who currently holds primary attribution.
-- co_client_id is a FK to clients(id), so fn_merge_clients's existing
-- dynamic FK discovery (information_schema, from #252) picks it up
-- automatically on a client merge; no changes needed there.
--
-- client_relationships.primary_client_id: nullable override, meaningful
-- only for spouse/partner rows. NULL = no override, use the deterministic
-- alphabetical default computed at import time.

CREATE TABLE IF NOT EXISTS client_record_co_parties (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_record_id  uuid        NOT NULL REFERENCES client_records(id) ON DELETE CASCADE,
  co_client_id      uuid        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_record_id, co_client_id)
);

ALTER TABLE client_record_co_parties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own client record co-parties"
  ON client_record_co_parties FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_client_record_co_parties_co_client
  ON client_record_co_parties (co_client_id);
CREATE INDEX IF NOT EXISTS idx_client_record_co_parties_record
  ON client_record_co_parties (client_record_id);

ALTER TABLE client_relationships
  ADD COLUMN IF NOT EXISTS primary_client_id uuid
    REFERENCES clients(id) ON DELETE SET NULL
    CONSTRAINT client_relationships_primary_is_a_or_b
    CHECK (primary_client_id IS NULL OR primary_client_id IN (client_id_a, client_id_b));

-- Backfill: an existing spouse/partner link gets a primary only when
-- EXACTLY ONE side already holds deal history. Neither/both sides holding
-- records is ambiguous — leave NULL (falls back to the deterministic
-- per-deal alphabetical logic, no guessing).
UPDATE client_relationships cr
SET primary_client_id = sub.holder_id
FROM (
  SELECT
    r.id AS rel_id,
    CASE
      WHEN EXISTS (SELECT 1 FROM client_records WHERE client_id = r.client_id_a)
       AND NOT EXISTS (SELECT 1 FROM client_records WHERE client_id = r.client_id_b)
        THEN r.client_id_a
      WHEN EXISTS (SELECT 1 FROM client_records WHERE client_id = r.client_id_b)
       AND NOT EXISTS (SELECT 1 FROM client_records WHERE client_id = r.client_id_a)
        THEN r.client_id_b
      ELSE NULL
    END AS holder_id
  FROM client_relationships r
  WHERE r.relationship_type IN ('spouse', 'partner')
) sub
WHERE cr.id = sub.rel_id AND sub.holder_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Apply immediately to prod**

Use the Supabase MCP `apply_migration` tool (project_id `wlxkvnbncfzkmxzexgxt`, name `household_deal_attribution`, query = the SQL above). Per repo convention, migrations apply the moment they're created — do not batch this with later code changes.

- [ ] **Step 3: Verify live**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'client_relationships' AND column_name = 'primary_client_id';

SELECT COUNT(*) FILTER (WHERE primary_client_id IS NOT NULL) AS backfilled,
       COUNT(*) AS total_spouse_partner_rels
FROM client_relationships WHERE relationship_type IN ('spouse', 'partner');
```
Expected: the column exists; `backfilled` is some number ≤ `total_spouse_partner_rels` (0 backfilled is valid if every existing link has 0 or 2+ sides holding records — not an error).

- [ ] **Step 4: Commit**

```bash
git add apps/web/supabase/migrations/00164_household_deal_attribution.sql
git commit -m "Add household_deal_attribution migration: co-parties table + primary_client_id"
```

---

### Task 2: Type additions

**Files:**
- Modify: `packages/core/types/database.ts`

- [ ] **Step 1: Add `primary_client_id` to `ClientRelationship` and add `ClientRecordCoParty`**

Find:
```ts
export interface ClientRelationship {
  id: string;
  user_id: string;
  client_id_a: string;
  client_id_b: string;
  relationship_type: RelationshipType;
  created_at: string;
}
```

Replace with:
```ts
export interface ClientRelationship {
  id: string;
  user_id: string;
  client_id_a: string;
  client_id_b: string;
  relationship_type: RelationshipType;
  primary_client_id: string | null;
  created_at: string;
}

// Per-deal fact: this client_records row also named co_client_id, who does
// not hold the deal's GCI attribution. Migration 00164.
export interface ClientRecordCoParty {
  id: string;
  user_id: string;
  client_record_id: string;
  co_client_id: string;
  created_at: string;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: no new errors (existing callers of `ClientRelationship` don't destructure every field, so adding one is non-breaking).

- [ ] **Step 3: Commit**

```bash
git add packages/core/types/database.ts
git commit -m "Add ClientRecordCoParty type + primary_client_id on ClientRelationship"
```

---

### Task 3: `planDealClients` — deterministic alphabetical tie-break

**Files:**
- Modify: `apps/web/lib/crm/resolve-deal-clients.ts`
- Modify: `apps/web/lib/crm/__tests__/resolve-deal-clients.test.ts`

Today, primary = the first party as split from that one deal's raw string —
arbitrary with respect to the couple's identity. Fix: primary = whichever
named party's `toNameSearch` sorts first alphabetically, computed the same
way regardless of word order or which deal in a batch you look at. This
needs no DB access and stays inside the pure function.

- [ ] **Step 1: Update the two existing tests whose expected primary changes**

In `apps/web/lib/crm/__tests__/resolve-deal-clients.test.ts`, find:
```ts
describe("planDealClients — attribution", () => {
  it("attributes a couple's deal to the first-named party only", () => {
    const plan = planDealClients(["John & Jane Smith"], LIMIT);
    expect(plan.primaryByRawName.get("John & Jane Smith")).toBe("John Smith");
    expect(plan.coPartiesByRawName.get("John & Jane Smith")).toEqual(["Jane Smith"]);
  });
```

Replace with:
```ts
describe("planDealClients — attribution", () => {
  it("attributes a couple's deal to whichever party sorts first alphabetically", () => {
    // Deterministic tie-break, not word order: "jane smith" < "john smith".
    const plan = planDealClients(["John & Jane Smith"], LIMIT);
    expect(plan.primaryByRawName.get("John & Jane Smith")).toBe("Jane Smith");
    expect(plan.coPartiesByRawName.get("John & Jane Smith")).toEqual(["John Smith"]);
  });
```

Find:
```ts
  it("handles a three-party deal: one primary, two co-parties", () => {
    const plan = planDealClients(["John & Jane & Bob Smith"], LIMIT);
    expect(plan.primaryByRawName.get("John & Jane & Bob Smith")).toBe("John Smith");
    expect(plan.coPartiesByRawName.get("John & Jane & Bob Smith")).toEqual([
      "Jane Smith",
      "Bob Smith",
    ]);
  });
```

Replace with:
```ts
  it("handles a three-party deal: one primary, two co-parties, alphabetical", () => {
    // "bob smith" < "jane smith" < "john smith".
    const plan = planDealClients(["John & Jane & Bob Smith"], LIMIT);
    expect(plan.primaryByRawName.get("John & Jane & Bob Smith")).toBe("Bob Smith");
    expect(plan.coPartiesByRawName.get("John & Jane & Bob Smith")).toEqual([
      "Jane Smith",
      "John Smith",
    ]);
  });
```

- [ ] **Step 2: Add the two new consistency tests**

In the same `describe("planDealClients — attribution", ...)` block, add:
```ts
  it("attributes the same couple to the same primary regardless of word order, within one batch", () => {
    const plan = planDealClients(["John & Jane Smith", "Jane & John Smith"], LIMIT);
    expect(plan.primaryByRawName.get("John & Jane Smith")).toBe("Jane Smith");
    expect(plan.primaryByRawName.get("Jane & John Smith")).toBe("Jane Smith");
  });

  it("attributes the same couple to the same primary across two separate calls (no shared state)", () => {
    const planA = planDealClients(["John & Jane Smith"], LIMIT);
    const planB = planDealClients(["Jane & John Smith"], LIMIT);
    expect(planA.primaryByRawName.get("John & Jane Smith")).toBe(
      planB.primaryByRawName.get("Jane & John Smith"),
    );
  });
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd apps/web && npx vitest run lib/crm/__tests__/resolve-deal-clients.test.ts
```
Expected: FAIL — the two updated tests fail against the current first-named-party implementation; the two new tests fail because nothing yet guarantees cross-entry consistency.

- [ ] **Step 4: Implement the tie-break change**

In `apps/web/lib/crm/resolve-deal-clients.ts`, find:
```ts
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
```

Replace with:
```ts
export function planDealClients(rawDealNames: string[], nameLimit: number): DealClientPlan {
  const partiesByKey = new Map<string, string>();
  const entries: { rawName: string; parties: string[] }[] = [];

  // Pass 1: split each raw name into parties, record each person's
  // canonical (first-seen) display spelling. Must complete before pass 2 so
  // every entry can resolve every party's spelling, even one first seen in
  // a later entry.
  for (const raw of rawDealNames) {
    const trimmed = (raw ?? "").trim();
    if (!trimmed || entries.some((e) => e.rawName === trimmed)) continue;

    const parties = splitJointName(trimmed).map((p) => p.slice(0, nameLimit));
    if (parties.length === 0) continue;

    entries.push({ rawName: trimmed, parties });

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
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd apps/web && npx vitest run lib/crm/__tests__/resolve-deal-clients.test.ts
```
Expected: PASS — all tests in the file, including the 2 updated and 2 new ones.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/crm/resolve-deal-clients.ts apps/web/lib/crm/__tests__/resolve-deal-clients.test.ts
git commit -m "Make planDealClients primary attribution deterministic (alphabetical, not word order)"
```

---

### Task 4: New pure functions — `applyPrimaryOverrides` + `buildCoPartyRows`

**Files:**
- Modify: `apps/web/lib/crm/resolve-deal-clients.ts`
- Modify: `apps/web/lib/crm/__tests__/resolve-deal-clients.test.ts`

`applyPrimaryOverrides` layers a persisted household override on top of the
deterministic default — but ONLY for genuinely joint deals. A solo deal for
one person must never be redirected to their spouse just because they're
linked; the override exists to pick consistently among parties *actually
named together on one deal*, not to merge someone's independent activity
into a household. `buildCoPartyRows` derives the exact
`client_record_co_parties` rows to insert, once each deal's real
`client_records.id` is known (this happens in the caller, after its own
upsert — see Task 6).

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/lib/crm/__tests__/resolve-deal-clients.test.ts`:
```ts
import { planDealClients, applyPrimaryOverrides, buildCoPartyRows } from "../resolve-deal-clients";

describe("applyPrimaryOverrides", () => {
  it("redirects a joint deal's primary to the persisted override", () => {
    const plan = planDealClients(["John & Jane Smith"], LIMIT);
    // Default (alphabetical) would be Jane; override says John.
    const johnKey = "john smith";
    const override = new Map([["jane smith", johnKey], [johnKey, johnKey]]);
    const overridden = applyPrimaryOverrides(plan, override);
    expect(overridden.primaryByRawName.get("John & Jane Smith")).toBe("John Smith");
    expect(overridden.coPartiesByRawName.get("John & Jane Smith")).toEqual(["Jane Smith"]);
  });

  it("never redirects a solo deal, even if that person has a household override", () => {
    // Jane is linked to John with John as household primary, but THIS deal
    // only names Jane alone — it must stay attributed to Jane.
    const plan = planDealClients(["Jane Smith"], LIMIT);
    const override = new Map([["jane smith", "john smith"], ["john smith", "john smith"]]);
    const overridden = applyPrimaryOverrides(plan, override);
    expect(overridden.primaryByRawName.get("Jane Smith")).toBe("Jane Smith");
    expect(overridden.coPartiesByRawName.has("Jane Smith")).toBe(false);
  });

  it("leaves the deterministic default in place when no override exists", () => {
    const plan = planDealClients(["John & Jane Smith"], LIMIT);
    const overridden = applyPrimaryOverrides(plan, new Map());
    expect(overridden.primaryByRawName.get("John & Jane Smith")).toBe("Jane Smith");
  });

  it("only redirects when the override target is actually named on this deal", () => {
    // An override exists for a totally unrelated pair — must not affect this deal.
    const plan = planDealClients(["John & Jane Smith"], LIMIT);
    const override = new Map([["bob wilson", "mary wilson"], ["mary wilson", "mary wilson"]]);
    const overridden = applyPrimaryOverrides(plan, override);
    expect(overridden.primaryByRawName.get("John & Jane Smith")).toBe("Jane Smith");
  });
});

describe("buildCoPartyRows", () => {
  it("builds one row per co-party, keyed to the deal's real client_records id", () => {
    const recordIdByExtId = new Map([["deal-1|c:john", "record-uuid-1"]]);
    const coPartyIdsByExtId = new Map([["deal-1|c:john", ["jane-uuid"]]]);
    const rows = buildCoPartyRows("user-1", recordIdByExtId, coPartyIdsByExtId);
    expect(rows).toEqual([
      { user_id: "user-1", client_record_id: "record-uuid-1", co_client_id: "jane-uuid" },
    ]);
  });

  it("builds multiple rows for a multi-party deal", () => {
    const recordIdByExtId = new Map([["deal-1", "record-1"]]);
    const coPartyIdsByExtId = new Map([["deal-1", ["co-a", "co-b"]]]);
    const rows = buildCoPartyRows("user-1", recordIdByExtId, coPartyIdsByExtId);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.co_client_id).sort()).toEqual(["co-a", "co-b"]);
  });

  it("produces nothing for a deal with no co-parties", () => {
    const recordIdByExtId = new Map([["deal-1", "record-1"]]);
    const rows = buildCoPartyRows("user-1", recordIdByExtId, new Map());
    expect(rows).toEqual([]);
  });

  it("skips a deal whose client_records id isn't known (e.g. an edited row that was skipped on re-import)", () => {
    const recordIdByExtId = new Map<string, string>(); // deal-1 not in this map
    const coPartyIdsByExtId = new Map([["deal-1", ["co-a"]]]);
    const rows = buildCoPartyRows("user-1", recordIdByExtId, coPartyIdsByExtId);
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/web && npx vitest run lib/crm/__tests__/resolve-deal-clients.test.ts
```
Expected: FAIL with "applyPrimaryOverrides is not a function" / "buildCoPartyRows is not a function".

- [ ] **Step 3: Implement both functions**

In `apps/web/lib/crm/resolve-deal-clients.ts`, add after `planDealClients` and before the `SupabaseLike` type:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/web && npx vitest run lib/crm/__tests__/resolve-deal-clients.test.ts
```
Expected: PASS, all tests (existing + new).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/crm/resolve-deal-clients.ts apps/web/lib/crm/__tests__/resolve-deal-clients.test.ts
git commit -m "Add applyPrimaryOverrides + buildCoPartyRows pure functions"
```

---

### Task 5: Wire the override lookup into `resolveDealClientIds`; add `writeCoPartyRecords`

**Files:**
- Modify: `apps/web/lib/crm/resolve-deal-clients.ts`

This changes `resolveDealClientIds`'s return shape (it now returns
`ResolvedDealClients`, not a bare `Map`), which Task 6 updates every call
site for. `writeCoPartyRecords` is a thin wrapper — all its logic lives in
the already-tested `buildCoPartyRows`, so it needs no test of its own (same
pattern as `resolveDealClientIds` never having its own mock-based test; the
logic is proven in the pure layer beneath it).

- [ ] **Step 1: Replace `resolveDealClientIds`**

Find (the whole current function):
```ts
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
```

Replace with:
```ts
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
  let existingRels: { client_id_a: string; client_id_b: string; primary_client_id: string | null }[] = [];
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

  // Link co-parties to the primary (existing #254 behavior). Two people named
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
    // ignoreDuplicates means an ALREADY-linked pair keeps its existing
    // primary_client_id untouched (this insert is only reached for a pair
    // with no existing row, since existing ones already fed the override
    // above) — a first sighting sets the household's primary once.
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
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: errors at the 4 call sites (Task 6 hasn't updated them yet) — they still call `.get(clientName)` on what's now a `ResolvedDealClients` object, not a `Map`. This is expected; Task 6 fixes it.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/crm/resolve-deal-clients.ts
git commit -m "Wire household-primary override lookup into resolveDealClientIds; add writeCoPartyRecords"
```

---

### Task 6: Wire the new return shape + co-party writes into all 4 import call sites

**Files:**
- Modify: `apps/web/app/(app)/transactions/transactions-history-tab.tsx:794-855` and `:1011-1069`
- Modify: `apps/web/app/(app)/history/history-content.tsx:879-946` and `:1154-1210`

Each site needs: (1) destructure the new return shape instead of treating it
as a bare Map, (2) add `.select("id, import_external_id")` to its existing
`client_records` upsert so each row's real id is known, (3) build the
`recordIdByExtId`/`coPartyIdsByExtId` maps and call `writeCoPartyRecords`.

- [ ] **Step 1: Update import in both files**

In both `transactions-history-tab.tsx` and `history-content.tsx`, find:
```ts
import { resolveDealClientIds } from "@/lib/crm/resolve-deal-clients";
```
Replace with:
```ts
import { resolveDealClientIds, writeCoPartyRecords } from "@/lib/crm/resolve-deal-clients";
```

- [ ] **Step 2: `transactions-history-tab.tsx` — single-year path**

Find:
```ts
      const primaryIdByDealName = await resolveDealClientIds(
        supabase,
        user.id,
        dealNames,
        FIELD_LIMITS.clientName,
      );
```
Replace with:
```ts
      const { primaryIdByRawName, coPartyIdsByRawName } = await resolveDealClientIds(
        supabase,
        user.id,
        dealNames,
        FIELD_LIMITS.clientName,
      );
```

Find:
```ts
            client_id: primaryIdByDealName.get(clientName) ?? null,
```
Replace with:
```ts
            client_id: primaryIdByRawName.get(clientName) ?? null,
```

Find:
```ts
        if (crToUpsert.length > 0) {
          const { error: crErr } = await supabase.from("client_records").upsert(
            dedupeByImportExternalId(crToUpsert),
            { onConflict: "user_id,import_external_id" },
          );
          if (crErr) {
            console.error("[import] client_records upsert failed:", crErr);
            toast.error("Failed to save client records. Please try again.");
            setImportStatus("preview");
            return;
          }
        }
      }
```
Replace with:
```ts
        if (crToUpsert.length > 0) {
          const { data: upsertedRecords, error: crErr } = await supabase.from("client_records")
            .upsert(dedupeByImportExternalId(crToUpsert), { onConflict: "user_id,import_external_id" })
            .select("id, import_external_id");
          if (crErr) {
            console.error("[import] client_records upsert failed:", crErr);
            toast.error("Failed to save client records. Please try again.");
            setImportStatus("preview");
            return;
          }
          const recordIdByExtId = new Map(
            (upsertedRecords ?? []).map((r) => [r.import_external_id as string, r.id as string]),
          );
          const coPartyIdsByExtId = new Map<string, string[]>();
          for (const insert of crToUpsert) {
            const coIds = coPartyIdsByRawName.get(insert.name);
            if (coIds && coIds.length > 0) coPartyIdsByExtId.set(insert.import_external_id, coIds);
          }
          await writeCoPartyRecords(supabase, user.id, recordIdByExtId, coPartyIdsByExtId);
        }
      }
```

- [ ] **Step 3: `transactions-history-tab.tsx` — multi-year path**

Find:
```ts
      const yearPrimaryIdByDealName = await resolveDealClientIds(
        supabase,
        user.id,
        agentClientNames.filter(Boolean),
        FIELD_LIMITS.clientName,
      );
```
Replace with:
```ts
      const { primaryIdByRawName: yearPrimaryIdByRawName, coPartyIdsByRawName: yearCoPartyIdsByRawName } =
        await resolveDealClientIds(
          supabase,
          user.id,
          agentClientNames.filter(Boolean),
          FIELD_LIMITS.clientName,
        );
```

Find:
```ts
            client_id: yearPrimaryIdByDealName.get(clientName) ?? null,
```
Replace with:
```ts
            client_id: yearPrimaryIdByRawName.get(clientName) ?? null,
```

Find:
```ts
        if (crToUpsert.length > 0) {
          const { error: crErr } = await supabase.from("client_records").upsert(
            dedupeByImportExternalId(crToUpsert),
            { onConflict: "user_id,import_external_id" },
          );
          if (crErr) throw crErr;
        }
        totalClients += clientInserts.length;
      }
```
Replace with:
```ts
        if (crToUpsert.length > 0) {
          const { data: upsertedRecords, error: crErr } = await supabase.from("client_records")
            .upsert(dedupeByImportExternalId(crToUpsert), { onConflict: "user_id,import_external_id" })
            .select("id, import_external_id");
          if (crErr) throw crErr;
          const recordIdByExtId = new Map(
            (upsertedRecords ?? []).map((r) => [r.import_external_id as string, r.id as string]),
          );
          const coPartyIdsByExtId = new Map<string, string[]>();
          for (const insert of crToUpsert) {
            const coIds = yearCoPartyIdsByRawName.get(insert.name);
            if (coIds && coIds.length > 0) coPartyIdsByExtId.set(insert.import_external_id, coIds);
          }
          await writeCoPartyRecords(supabase, user.id, recordIdByExtId, coPartyIdsByExtId);
        }
        totalClients += clientInserts.length;
      }
```

- [ ] **Step 4: `history-content.tsx` — single-batch path**

Find:
```ts
      const primaryIdByDealName = await resolveDealClientIds(
        supabase,
        user.id,
        dealNames.filter(Boolean),
        FIELD_LIMITS.clientName,
      );
```
Replace with:
```ts
      const { primaryIdByRawName, coPartyIdsByRawName } = await resolveDealClientIds(
        supabase,
        user.id,
        dealNames.filter(Boolean),
        FIELD_LIMITS.clientName,
      );
```

Find:
```ts
            client_id: primaryIdByDealName.get(raw) ?? null,
```
Replace with:
```ts
            client_id: primaryIdByRawName.get(raw) ?? null,
```

Find:
```ts
      if (crToUpsert.length > 0) {
        const { error: crErr } = await supabase.from("client_records").upsert(
          dedupeByImportExternalId(crToUpsert),
          { onConflict: "user_id,import_external_id" },
        );
        if (crErr) {
          console.error("[import] client_records upsert failed:", crErr);
          toast.error("Failed to save client records. Please try again.");
          setImportStatus("preview");
          return;
        }
```
Replace with:
```ts
      if (crToUpsert.length > 0) {
        const { data: upsertedRecords, error: crErr } = await supabase.from("client_records")
          .upsert(dedupeByImportExternalId(crToUpsert), { onConflict: "user_id,import_external_id" })
          .select("id, import_external_id");
        if (crErr) {
          console.error("[import] client_records upsert failed:", crErr);
          toast.error("Failed to save client records. Please try again.");
          setImportStatus("preview");
          return;
        }
        const recordIdByExtId = new Map(
          (upsertedRecords ?? []).map((r) => [r.import_external_id as string, r.id as string]),
        );
        const coPartyIdsByExtId = new Map<string, string[]>();
        for (const insert of crToUpsert) {
          const coIds = coPartyIdsByRawName.get(insert.name);
          if (coIds && coIds.length > 0) coPartyIdsByExtId.set(insert.import_external_id, coIds);
        }
        await writeCoPartyRecords(supabase, user.id, recordIdByExtId, coPartyIdsByExtId);
```

- [ ] **Step 5: `history-content.tsx` — multi-year path**

Find:
```ts
      const yearPrimaryIdByDealName = await resolveDealClientIds(
        supabase,
        user.id,
        agentClientNames.filter(Boolean),
        FIELD_LIMITS.clientName,
      );
```
Replace with:
```ts
      const { primaryIdByRawName: yearPrimaryIdByRawName, coPartyIdsByRawName: yearCoPartyIdsByRawName } =
        await resolveDealClientIds(
          supabase,
          user.id,
          agentClientNames.filter(Boolean),
          FIELD_LIMITS.clientName,
        );
```

Find:
```ts
            client_id: yearPrimaryIdByDealName.get(clientName) ?? null,
```
Replace with:
```ts
            client_id: yearPrimaryIdByRawName.get(clientName) ?? null,
```

Find:
```ts
        if (crToUpsert.length > 0) {
          const { error: crErr } = await supabase.from("client_records").upsert(
            dedupeByImportExternalId(crToUpsert),
            { onConflict: "user_id,import_external_id" },
          );
          if (crErr) throw crErr;
        }
```
(this is the second occurrence of this exact snippet in the file — the first was handled in Step 4; verify by line number ~1202-1207 before editing)
Replace with:
```ts
        if (crToUpsert.length > 0) {
          const { data: upsertedRecords, error: crErr } = await supabase.from("client_records")
            .upsert(dedupeByImportExternalId(crToUpsert), { onConflict: "user_id,import_external_id" })
            .select("id, import_external_id");
          if (crErr) throw crErr;
          const recordIdByExtId = new Map(
            (upsertedRecords ?? []).map((r) => [r.import_external_id as string, r.id as string]),
          );
          const coPartyIdsByExtId = new Map<string, string[]>();
          for (const insert of crToUpsert) {
            const coIds = yearCoPartyIdsByRawName.get(insert.name);
            if (coIds && coIds.length > 0) coPartyIdsByExtId.set(insert.import_external_id, coIds);
          }
          await writeCoPartyRecords(supabase, user.id, recordIdByExtId, coPartyIdsByExtId);
        }
```

- [ ] **Step 6: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 7: Lint**

```bash
cd apps/web && npx eslint "app/(app)/transactions/transactions-history-tab.tsx" "app/(app)/history/history-content.tsx"
```
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add "apps/web/app/(app)/transactions/transactions-history-tab.tsx" "apps/web/app/(app)/history/history-content.tsx"
git commit -m "Wire co-party record writes into all 4 import call sites"
```

---

### Task 7: `page.tsx` — fetch `client_record_co_parties`

**Files:**
- Modify: `apps/web/app/(app)/crm/page.tsx`

- [ ] **Step 1: Add the query and prop**

Find:
```ts
import type { Client, ClientRecord, ContactActivity, ContactTask, UserSettings, ExpenseItem, ClientRelationship, FlightPlan, FlightPlanStep, PropertyShowing, ListingAppointment } from "@/lib/types/database";
```
Replace with:
```ts
import type { Client, ClientRecord, ContactActivity, ContactTask, UserSettings, ExpenseItem, ClientRelationship, ClientRecordCoParty, FlightPlan, FlightPlanStep, PropertyShowing, ListingAppointment } from "@/lib/types/database";
```

Find:
```ts
    supabase
      .from("client_relationships")
      .select("*")
      .eq("user_id", user.id)
      .limit(10000),
```
Replace with:
```ts
    supabase
      .from("client_relationships")
      .select("*")
      .eq("user_id", user.id)
      .limit(10000),
    supabase
      .from("client_record_co_parties")
      .select("*")
      .eq("user_id", user.id)
      .limit(10000),
```

Find:
```ts
  const [clientsResult, recordsResult, activitiesResult, tasksResult, expensesResult, relationshipsResult, flightPlansResult, flightPlanStepsResult, showingsResult, listingApptsResult] = await Promise.all(queries);
```
Replace with:
```ts
  const [clientsResult, recordsResult, activitiesResult, tasksResult, expensesResult, relationshipsResult, coPartiesResult, flightPlansResult, flightPlanStepsResult, showingsResult, listingApptsResult] = await Promise.all(queries);
```

Find:
```ts
      relationships={(relationshipsResult.data ?? []) as ClientRelationship[]}
```
Replace with:
```ts
      relationships={(relationshipsResult.data ?? []) as ClientRelationship[]}
      coParties={(coPartiesResult.data ?? []) as ClientRecordCoParty[]}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: an error at `ClientsContent`'s prop type — expected, Task 8 adds the prop there.

- [ ] **Step 3: Commit**

Hold this commit — combine with Task 8 (the prop type needs to exist on both sides to compile). Proceed to Task 8 Step 1 before committing.

---

### Task 8: `clients-content.tsx` — props, state, `ClientGroup.hasHouseholdActivity`, list badge

**Files:**
- Modify: `apps/web/lib/crm/resolve-deal-clients.ts`
- Modify: `apps/web/lib/crm/__tests__/resolve-deal-clients.test.ts`
- Modify: `apps/web/app/(app)/crm/clients-content.tsx`

The set-membership computation behind `hasHouseholdActivity` is extracted as
its own pure, tested function rather than inlined in the component — this
codebase's convention is that CRM domain logic lives in `lib/crm/` and is
unit tested there; `clients-content.tsx` itself has no test file of its own.

- [ ] **Step 0a: Write the failing test**

Add to `apps/web/lib/crm/__tests__/resolve-deal-clients.test.ts`:
```ts
import { computeHouseholdActivityIds } from "../resolve-deal-clients";

describe("computeHouseholdActivityIds", () => {
  it("returns the set of client ids that appear as a co-party on any deal", () => {
    const coParties = [
      { id: "1", user_id: "u", client_record_id: "r1", co_client_id: "jane", created_at: "" },
      { id: "2", user_id: "u", client_record_id: "r2", co_client_id: "bob", created_at: "" },
    ];
    expect(computeHouseholdActivityIds(coParties)).toEqual(new Set(["jane", "bob"]));
  });

  it("returns an empty set for no co-parties", () => {
    expect(computeHouseholdActivityIds([])).toEqual(new Set());
  });
});
```

- [ ] **Step 0b: Run to verify it fails**

```bash
cd apps/web && npx vitest run lib/crm/__tests__/resolve-deal-clients.test.ts
```
Expected: FAIL — "computeHouseholdActivityIds is not a function".

- [ ] **Step 0c: Implement it**

In `apps/web/lib/crm/resolve-deal-clients.ts`, add near the bottom of the file:
```ts
import type { ClientRecordCoParty } from "@agent-runway/core/types/database";

/** Client ids that appear as a co-party on at least one deal — used to badge
 *  a $0-GCI contact in the CRM list as "linked to real activity" rather than
 *  a cold lead. */
export function computeHouseholdActivityIds(coParties: ClientRecordCoParty[]): Set<string> {
  return new Set(coParties.map((cp) => cp.co_client_id));
}
```
Adjust the import path (`@agent-runway/core/types/database`) to match whatever import alias the rest of this file already uses for `packages/core/types` — check the file's existing imports (e.g. `toNameSearch` is imported from `./client-identity`, but the `ClientRecordCoParty` type itself lives in the shared core package) before finalizing this line.

- [ ] **Step 0d: Run to verify it passes**

```bash
cd apps/web && npx vitest run lib/crm/__tests__/resolve-deal-clients.test.ts
```
Expected: PASS.

- [ ] **Step 0e: Commit**

```bash
git add apps/web/lib/crm/resolve-deal-clients.ts apps/web/lib/crm/__tests__/resolve-deal-clients.test.ts
git commit -m "Add computeHouseholdActivityIds pure function"
```

- [ ] **Step 1: Add the props and imports**

Find the import line containing `RelationshipType` (grep `RelationshipType,` near the top imports) and add `ClientRecordCoParty` to the same import statement from `@/lib/types/database` (or the equivalent alias used in this file).

Find the existing import of `resolveDealClientIds`-adjacent helpers from `@/lib/crm/` (this file already imports `toNameSearch`, `clusterDuplicateClients`, `DuplicateReviewDialog`-related helpers per PR #252/#254) and add `computeHouseholdActivityIds` to the import from `@/lib/crm/resolve-deal-clients`.

Find:
```ts
  relationships: ClientRelationship[];
```
Replace with:
```ts
  relationships: ClientRelationship[];
  coParties: ClientRecordCoParty[];
```

Find (the destructured props near the component body, alongside `relationships: initialRelationships,`):
```ts
  relationships: initialRelationships,
```
Replace with:
```ts
  relationships: initialRelationships,
  coParties: initialCoParties,
```

- [ ] **Step 2: Add local state**

Find (line ~1165):
```ts
  const [localRelationships, setLocalRelationships] =
```
Read the rest of that statement (it continues on the next line) and add, immediately after that full statement:
```ts
  const [localCoParties] = useState<ClientRecordCoParty[]>(initialCoParties);
```

- [ ] **Step 3: Add `hasHouseholdActivity` to `ClientGroup` and thread it through**

Find:
```ts
type ClientGroup = {
  clientId: string | null;
  name: string;
  deals: ClientRecord[];
  totalGCI: number;
  dealCount: number;
  avgDeal: number;
  lastDeal: string | null;
  years: number[];
};
```
Replace with:
```ts
type ClientGroup = {
  clientId: string | null;
  name: string;
  deals: ClientRecord[];
  totalGCI: number;
  dealCount: number;
  avgDeal: number;
  lastDeal: string | null;
  years: number[];
  hasHouseholdActivity: boolean;
};
```

Find:
```ts
function buildAllGroups(clients: Client[], records: ClientRecord[]): ClientGroup[] {
  const nameToId = new Map(clients.map((c) => [c.name_search, c.id]));

  const buckets = new Map<string, ClientRecord[]>();

  for (const r of records) {
    const key =
      r.client_id ??
      nameToId.get(toNameSearch(r.name)) ??
      `__v__${toNameSearch(r.name)}`;
    const b = buckets.get(key) ?? [];
    b.push(r);
    buckets.set(key, b);
  }

  const groups: ClientGroup[] = [];

  for (const client of clients) {
    const deals = buckets.get(client.id) ?? [];
    // Always include — clients with no records (e.g. FUB imports) must still appear
    groups.push(makeGroup(client.id, client.name, deals));
  }

  for (const [key, deals] of buckets) {
    if (key.startsWith("__v__")) {
      groups.push(makeGroup(null, deals[0].name, deals));
    }
  }

  // Sort by GCI desc; break ties alphabetically so contacts-only clients are ordered
  return groups.sort((a, b) => {
    if (b.totalGCI !== a.totalGCI) return b.totalGCI - a.totalGCI;
    return a.name.localeCompare(b.name);
  });
}

function makeGroup(
  clientId: string | null,
  name: string,
  deals: ClientRecord[],
): ClientGroup {
  const totalGCI =
    Math.round(deals.reduce((s, d) => s + (d.gci ?? 0), 0) * 100) / 100;
  const dealCount = deals.length;
  const avgDeal = dealCount > 0 ? Math.round(totalGCI / dealCount) : 0;
  const sortedDates = deals
    .map((d) => d.close_date)
    .filter(Boolean)
    .sort()
    .reverse();
  const lastDeal = (sortedDates[0] as string | undefined) ?? null;
  const years = [
    ...new Set(
      deals.map((d) => d.year).filter((y): y is number => y !== null),
    ),
  ].sort((a, b) => b - a);
  return { clientId, name, deals, totalGCI, dealCount, avgDeal, lastDeal, years };
}
```
Replace with:
```ts
function buildAllGroups(
  clients: Client[],
  records: ClientRecord[],
  coParties: ClientRecordCoParty[],
): ClientGroup[] {
  const nameToId = new Map(clients.map((c) => [c.name_search, c.id]));
  const householdActivityIds = computeHouseholdActivityIds(coParties);

  const buckets = new Map<string, ClientRecord[]>();

  for (const r of records) {
    const key =
      r.client_id ??
      nameToId.get(toNameSearch(r.name)) ??
      `__v__${toNameSearch(r.name)}`;
    const b = buckets.get(key) ?? [];
    b.push(r);
    buckets.set(key, b);
  }

  const groups: ClientGroup[] = [];

  for (const client of clients) {
    const deals = buckets.get(client.id) ?? [];
    // Always include — clients with no records (e.g. FUB imports) must still appear
    groups.push(makeGroup(client.id, client.name, deals, householdActivityIds.has(client.id)));
  }

  for (const [key, deals] of buckets) {
    if (key.startsWith("__v__")) {
      groups.push(makeGroup(null, deals[0].name, deals, false));
    }
  }

  // Sort by GCI desc; break ties alphabetically so contacts-only clients are ordered
  return groups.sort((a, b) => {
    if (b.totalGCI !== a.totalGCI) return b.totalGCI - a.totalGCI;
    return a.name.localeCompare(b.name);
  });
}

function makeGroup(
  clientId: string | null,
  name: string,
  deals: ClientRecord[],
  hasHouseholdActivity: boolean,
): ClientGroup {
  const totalGCI =
    Math.round(deals.reduce((s, d) => s + (d.gci ?? 0), 0) * 100) / 100;
  const dealCount = deals.length;
  const avgDeal = dealCount > 0 ? Math.round(totalGCI / dealCount) : 0;
  const sortedDates = deals
    .map((d) => d.close_date)
    .filter(Boolean)
    .sort()
    .reverse();
  const lastDeal = (sortedDates[0] as string | undefined) ?? null;
  const years = [
    ...new Set(
      deals.map((d) => d.year).filter((y): y is number => y !== null),
    ),
  ].sort((a, b) => b - a);
  return { clientId, name, deals, totalGCI, dealCount, avgDeal, lastDeal, years, hasHouseholdActivity };
}
```

- [ ] **Step 4: Update the call site**

Find:
```ts
    () => buildAllGroups(localClients, localRecords),
    [localClients, localRecords],
```
Replace with:
```ts
    () => buildAllGroups(localClients, localRecords, localCoParties),
    [localClients, localRecords, localCoParties],
```

- [ ] **Step 5: Add the list-view badge**

Find (the name-cell avatar, inside `paginatedFiltered.map((group) => { ... return (`):
```tsx
                                  <div
                                    className={cn(
                                      "h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                                      !isFirstClass && "bg-primary/10 text-primary",
                                    )}
                                    style={isFirstClass ? { background: "rgba(240,168,0,0.12)", color: GOLD, boxShadow: "inset 0 0 0 1.5px rgba(240,168,0,0.45)" } : undefined}
                                  >
                                    {group.name.charAt(0).toUpperCase()}
                                  </div>
```
Replace with:
```tsx
                                  <div
                                    className={cn(
                                      "h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                                      !isFirstClass && "bg-primary/10 text-primary",
                                    )}
                                    style={isFirstClass ? { background: "rgba(240,168,0,0.12)", color: GOLD, boxShadow: "inset 0 0 0 1.5px rgba(240,168,0,0.45)" } : undefined}
                                  >
                                    {group.name.charAt(0).toUpperCase()}
                                  </div>
                                  {group.dealCount === 0 && group.hasHouseholdActivity && (
                                    <span
                                      className="h-4 w-4 rounded-full bg-violet-500/15 text-violet-500 flex items-center justify-center shrink-0"
                                      title="Linked to an active client's deal(s)"
                                    >
                                      <Users className="h-2.5 w-2.5" />
                                    </span>
                                  )}
```

If `Users` is not already imported from `lucide-react` in this file, add it to the existing `lucide-react` import statement.

- [ ] **Step 6: Typecheck + lint**

```bash
cd apps/web && npx tsc --noEmit && npx eslint "app/(app)/crm/clients-content.tsx" "app/(app)/crm/page.tsx"
```
Expected: clean (this also resolves Task 7's pending prop-type error).

- [ ] **Step 7: Commit (covers Task 7 + this task)**

```bash
git add "apps/web/app/(app)/crm/page.tsx" "apps/web/app/(app)/crm/clients-content.tsx"
git commit -m "Fetch co-parties; add ClientGroup.hasHouseholdActivity + list badge"
```

---

### Task 9: `clients-content.tsx` — Household Activity drawer section

**Files:**
- Modify: `apps/web/app/(app)/crm/clients-content.tsx`

- [ ] **Step 1: Compute the selected client's household deals**

Find (line ~1672-1673):
```ts
    return localRecords.filter((r) => r.client_id === selectedClientId);
```
Read the 2-3 lines above it to find the full `useMemo` this belongs to (this is `clientDeals`) and add, immediately after that `useMemo` closes, a new one:
```ts
  const householdDeals = useMemo(() => {
    if (!selectedClientId) return [];
    const recordIds = new Set(
      localCoParties.filter((cp) => cp.co_client_id === selectedClientId).map((cp) => cp.client_record_id),
    );
    return localRecords.filter((r) => recordIds.has(r.id));
  }, [localCoParties, localRecords, selectedClientId]);
```

- [ ] **Step 2: Render the section**

Find (exact closing sequence after the Deal History block):
```tsx
                          </div>
                        ))}
                      </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
```
Replace with:
```tsx
                          </div>
                        ))}
                      </div>
                  </div>
                )}

                {/* Household Activity — read-only. Deals this client was named
                    on but doesn't hold GCI credit for; their own totalGCI
                    stat above is unaffected. */}
                {householdDeals.length > 0 && (
                  <div className={CRM_SECTION_CARD}>
                    <h3 className={CRM_SECTION_HEADER}>
                      <div className={CRM_SECTION_ICON_CHIP}>
                        <Users className="h-3 w-3" />
                      </div>
                      Household Activity
                    </h3>
                    <div className="space-y-1.5">
                      {householdDeals.map((deal) => {
                        const primary = deal.client_id ? clientById.get(deal.client_id) : null;
                        return (
                          <div
                            key={deal.id}
                            className="py-1.5 px-2 rounded-lg bg-white/50 dark:bg-slate-900/30 border border-slate-200/60 dark:border-slate-800/40 cursor-pointer hover:border-violet-300/60"
                            onClick={() => { if (deal.client_id) openDetailPanel(deal.client_id); }}
                          >
                            <div className="flex items-center justify-between">
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-foreground truncate">
                                  {deal.address || "No address"}
                                </p>
                                <p className="text-[10px] text-muted-foreground/70">
                                  {primary ? `Counts toward ${primary.name}'s total` : "Primary contact not found"}
                                </p>
                              </div>
                              <span className="text-sm font-bold tabular-nums text-muted-foreground/60 shrink-0 ml-3">
                                {fmtCurrency(deal.gci ?? 0)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
```

- [ ] **Step 3: Typecheck + lint**

```bash
cd apps/web && npx tsc --noEmit && npx eslint "app/(app)/crm/clients-content.tsx"
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(app)/crm/clients-content.tsx"
git commit -m "Add read-only Household Activity section to client detail drawer"
```

---

### Task 10: `clients-content.tsx` — "Make primary" action

**Files:**
- Modify: `apps/web/app/(app)/crm/clients-content.tsx`

Per the design's self-review fix: the UI never re-derives the alphabetical
tie-break. "Currently primary" is `rel.primary_client_id` if set, else
whichever side already holds 1+ `client_records` — the same rule the
migration's backfill uses.

- [ ] **Step 1: Add the handler**

Find (right after `removeRelationship`'s closing, line ~2489):
```ts
  const removeRelationship = useCallback(
    async (relId: string) => {
      if (!userId) return;
      const { error } = await supabase
        .from("client_relationships")
        .delete()
        .eq("id", relId)
        .eq("user_id", userId);

      if (!error) {
        setLocalRelationships((prev) => prev.filter((r) => r.id !== relId));
      } else {
        toast.error("Failed to remove relationship");
      }
    },
    [userId],
  );
```
Add immediately after it:
```ts
  // Sets which side of a spouse/partner link receives future deal
  // attribution. Never rewrites past client_records — only new imports
  // consult this going forward (see design doc's non-goals).
  const handleSetPrimary = useCallback(
    async (relationshipId: string, newPrimaryClientId: string) => {
      const { error } = await supabase
        .from("client_relationships")
        .update({ primary_client_id: newPrimaryClientId })
        .eq("id", relationshipId);

      if (error) {
        toast.error("Failed to update primary contact");
        return;
      }
      setLocalRelationships((prev) =>
        prev.map((r) => (r.id === relationshipId ? { ...r, primary_client_id: newPrimaryClientId } : r)),
      );
      toast.success("Primary contact updated");
    },
    [],
  );
```

- [ ] **Step 2: Add the button in the Linked Clients rendering**

Find (inside `clientRelationships.map((rel) => { ... })`, the referral-label computation block):
```tsx
                        // Determine referral direction relative to the current client
                        // "referrer" type: client_id_a referred client_id_b
                        let referralLabel = "";
                        if (isReferral) {
                          const currentIsA = rel.client_id_a === selectedClient.id;
                          if (rel.relationship_type === "referrer") {
                            // A referred B
                            referralLabel = currentIsA
                              ? `Referred ${other.name.split(" ")[0]} to you`
                              : `Referred to you by ${other.name.split(" ")[0]}`;
                          } else {
                            // Legacy "referred" type — A was referred by B (old logic)
                            referralLabel = currentIsA
                              ? `Referred by ${other.name.split(" ")[0]}`
                              : `Referred ${other.name.split(" ")[0]}`;
                          }
                        }
```
Add immediately after it:
```tsx

                        // Household primary: rel.primary_client_id if set, else
                        // whichever side already holds deal history (same rule
                        // the 00164 backfill migration uses). The UI never
                        // re-derives the alphabetical tie-break itself.
                        const isHouseholdType = rel.relationship_type === "spouse" || rel.relationship_type === "partner";
                        let showMakePrimaryFor: string | null = null;
                        if (isHouseholdType) {
                          const aHoldsRecords = localRecords.some((r) => r.client_id === rel.client_id_a);
                          const bHoldsRecords = localRecords.some((r) => r.client_id === rel.client_id_b);
                          const currentPrimaryId =
                            rel.primary_client_id ??
                            (aHoldsRecords ? rel.client_id_a : bHoldsRecords ? rel.client_id_b : null);
                          if (currentPrimaryId !== null && currentPrimaryId !== other.id) {
                            showMakePrimaryFor = other.id;
                          }
                        }
```

Find:
```tsx
                              {!isReferral && (
                                <span className="text-[10px] text-muted-foreground/60 leading-none">
                                  {RELATIONSHIP_TYPE_LABELS[rel.relationship_type as RelationshipType] ?? rel.relationship_type}
                                </span>
                              )}
```
Replace with:
```tsx
                              {!isReferral && (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-muted-foreground/60 leading-none">
                                    {RELATIONSHIP_TYPE_LABELS[rel.relationship_type as RelationshipType] ?? rel.relationship_type}
                                  </span>
                                  {showMakePrimaryFor && (
                                    <button
                                      className="text-[9px] text-primary/70 hover:text-primary underline-offset-2 hover:underline leading-none"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSetPrimary(rel.id, showMakePrimaryFor!);
                                      }}
                                    >
                                      Make primary
                                    </button>
                                  )}
                                </div>
                              )}
```

- [ ] **Step 3: Typecheck + lint**

```bash
cd apps/web && npx tsc --noEmit && npx eslint "app/(app)/crm/clients-content.tsx"
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(app)/crm/clients-content.tsx"
git commit -m "Add Make Primary action to spouse/partner relationship rows"
```

---

### Task 11: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 2: Lint the full touched-file set**

```bash
cd apps/web && npx eslint lib/crm/resolve-deal-clients.ts "app/(app)/transactions/transactions-history-tab.tsx" "app/(app)/history/history-content.tsx" "app/(app)/crm/clients-content.tsx" "app/(app)/crm/page.tsx"
```
Expected: clean.

- [ ] **Step 3: Full test suite**

```bash
cd "/Users/b/Desktop/Agent Runway Website/Project Home/02 - Web App Code/worktrees/crm-intel" && pnpm turbo test
```
Expected: all pass, test count higher than the 952 baseline (24 joint-names + 14→18 resolve-deal-clients existing/updated + ~13 new applyPrimaryOverrides/buildCoPartyRows tests added this plan).

- [ ] **Step 4: Post-fix grep — check for any other reader of the old `resolveDealClientIds` Map-returning contract or `primaryIdByDealName`/`yearPrimaryIdByDealName` naming**

```bash
cd "/Users/b/Desktop/Agent Runway Website/Project Home/02 - Web App Code/worktrees/crm-intel/apps/web" && grep -rn "primaryIdByDealName\|yearPrimaryIdByDealName" --include="*.ts" --include="*.tsx" .
```
Expected: no matches (all 4 call sites renamed to `primaryIdByRawName`/`yearPrimaryIdByRawName` in Task 6). If any match remains, that call site was missed — fix it before proceeding.

- [ ] **Step 5: Verify the migration backfill against real prod data (read-only, aggregate only)**

Using the Supabase MCP `execute_sql` tool (project_id `wlxkvnbncfzkmxzexgxt`):
```sql
SELECT
  relationship_type,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE primary_client_id IS NOT NULL) AS has_primary
FROM client_relationships
WHERE relationship_type IN ('spouse', 'partner')
GROUP BY relationship_type;
```
Expected: no error; `has_primary` counts are sane (≤ `total`). Do not read or print any client names — aggregate counts only.

---

### Task 12: Ship

**Files:** none (process only)

- [ ] **Step 1: Push**

```bash
cd "/Users/b/Desktop/Agent Runway Website/Project Home/02 - Web App Code/worktrees/crm-intel" && git push -u origin feat/household-deal-attribution
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "Household deal attribution: co-party visibility + deterministic primary" --body "$(cat <<'EOF'
## Summary
- Builds on #254. Two gaps closed: a co-party's own card now shows deals they were part of (read-only, clearly not counting toward their own total), and primary attribution is now deterministic (alphabetical tie-break on the named parties' identity, not word order in the report) — with a persistent, user-editable override ("Make primary").
- New migration 00164: `client_record_co_parties` join table + `client_relationships.primary_client_id`, with a backfill for existing links.
- Design: `docs/superpowers/specs/2026-07-15-household-deal-attribution-design.md`. Plan: `docs/superpowers/plans/2026-07-15-household-deal-attribution.md`.

## Test plan
- [x] New/updated unit tests for `planDealClients` (deterministic tie-break), `applyPrimaryOverrides` (including the solo-deal guard), `buildCoPartyRows` — all pure, no mocks.
- [x] `pnpm turbo test` — full suite green.
- [x] `npx tsc --noEmit` / `npx eslint` — clean across all touched files.
- [x] Migration backfill verified against real prod data (aggregate counts only).
- [ ] Live click-through of the new drawer section / Make Primary button — not performed (auth-gated).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Watch CI**

```bash
gh pr checks <PR_NUMBER> --watch
```
Expected: all checks (`build`, `lockfile-typecheck`, `e2e`, `Vercel`) pass.

- [ ] **Step 4: Merge**

```bash
gh pr merge <PR_NUMBER> --squash --delete-branch
```
If this errors with `fatal: 'main' is already used by worktree` (expected — the primary `agentrunway-web/` tree has `main` checked out), the merge on GitHub still succeeded; verify with:
```bash
gh pr view <PR_NUMBER> --json state,mergeCommit --jq '{state:.state, sha:.mergeCommit.oid}'
```
Then delete the remote branch manually if it wasn't already:
```bash
git push origin --delete feat/household-deal-attribution
```

- [ ] **Step 5: Poll the production deploy**

```bash
gh api repos/Ashaw19/agentrunway-web/commits/<MERGE_SHA>/status --jq '{overall: .state, statuses: [.statuses[] | {context, state}]}'
```
Expected eventually: `{"overall":"success", ...}`. Poll every 60s if still pending — do not tight-loop.

- [ ] **Step 6: Reset the worktree**

```bash
cd "/Users/b/Desktop/Agent Runway Website/Project Home/02 - Web App Code/worktrees/crm-intel" && git checkout worktree/crm-intel && git fetch origin && git reset --hard origin/main
```

- [ ] **Step 7: Update memory + SR&ED log**

Extend `memory/findings/crm_deal_client_linkage_2026-07-15.md` with a note that the co-party visibility gap and non-deterministic primary are now shipped (this PR number), and append a same-day SR&ED log entry to `/Users/b/Desktop/Agent Runway - Grant Applications/SR&ED Daily Logs/Agent Runway SR&ED Daily Work Log - 2026.md` following the format of the other 2026-07-15 entries already in that file, describing the work in plain language (no code jargon) with an honest technological-uncertainty assessment (this was mostly disciplined execution of an already-resolved design, not itself R&D-qualifying — say so).

---

## Explicit non-goals (do not implement)

- No retroactive reassignment of historical `client_records.client_id` when primary is swapped.
- No changes to `referrer`/`referred`/`parent`/`child` relationship types.
- No fuzzy/nickname name matching.
- No manual UI to add/remove a co-party on a deal after the fact.
