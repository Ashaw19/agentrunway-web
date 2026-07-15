# Household deal attribution — design

**Date:** 2026-07-15
**Status:** approved, pending implementation plan
**Depends on:** PR #254 (joint-name resolution, shipped 2026-07-15)

## Problem

PR #254 fixed the dominant bug — a deal naming "John & Jane Smith" now matches
existing CRM contacts and attributes its GCI to one party instead of creating
a phantom third contact. It also links the two people via `client_relationships`
(`relationship_type: "partner"`). Two gaps remain:

1. **The co-party's own card shows nothing.** Jane is a real, linked contact,
   but her deal-history list is a hard filter on `client_id === selectedClientId`,
   so the $50k deal she was part of is invisible from her own card. The CRM
   list view also can't distinguish her $0-GCI row from a true cold lead.

2. **Primary attribution isn't deterministic with respect to the couple's
   identity.** Today's resolver picks primary by word order in the report
   string ("first-named party wins"). If the same couple is ever named in
   reversed order — a different report, a different year — they fragment into
   two separate people who each show 1 deal, and neither crosses the 2-deal
   repeat-client threshold. Not yet observed in real data; a correctness gap
   found by inspection, not a live incident.

## Goals

1. Show a co-party's deals on their own card, clearly marked as not counting
   toward their own total.
2. Make primary attribution deterministic per couple, independent of report
   word order or import batch order.
3. Let the user override which party is primary, with the override
   persisting for future deals.
4. Signal in the list view that a $0-GCI row has real linked activity.
5. Apply uniformly whether the household link came from an import or the
   existing manual "Add Spouse" flow.

## Explicit non-goals

- **No retroactive reassignment.** Swapping primary changes the default for
  future deals only. Rewriting historical `client_records.client_id` is a
  materially bigger, riskier operation (moves real historical GCI off a card)
  and is not part of this change. Flagged for Andrew to override if wanted.
- **No change to referrer/referred or parent/child relationship types.** Only
  `spouse`/`partner` get primary/co-party treatment — it's the only type
  where joint financial attribution is the actual scenario in evidence.
- **No fuzzy/nickname matching** ("Bob" vs "Robert"). Separate, already-filed
  follow-up from #252/#254.
- **No change to the repeat-client-rate metric's definition.** Only the data
  feeding it becomes more accurate (a genuinely-repeat household stops being
  miscounted as two unrelated single-deal contacts).
- **No manual "add a co-party to this deal after the fact" UI.** Co-party
  facts are written at import time (or, later, whenever a deal is entered
  manually with a joint name) — this pass doesn't add retroactive editing.

## Architecture

### 1. New table: `client_record_co_parties`

Per-deal fact: "this specific deal also named this person," independent of
who currently holds primary attribution.

```
id                uuid PK
user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
client_record_id  uuid NOT NULL REFERENCES client_records(id) ON DELETE CASCADE
co_client_id      uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE
created_at        timestamptz NOT NULL DEFAULT now()

UNIQUE (client_record_id, co_client_id)
```

RLS: standard `user_id = auth.uid()` policy, matching every other per-user
table in this schema. Indexes on `co_client_id` (household-activity query)
and `client_record_id`.

`co_client_id` is a FK to `clients(id)`, so `fn_merge_clients`'s existing
dynamic FK discovery (via `information_schema`, from #252) picks it up
automatically — no changes needed to the merge tool. `client_record_id` is a
FK to `client_records(id)`, not `clients(id)`, so it's correctly out of scope
for that discovery — the co-party row's identity doesn't move when a client
merges; only `co_client_id` needs to repoint, and it already will.

### 2. New column: `client_relationships.primary_client_id`

```
primary_client_id uuid REFERENCES clients(id) ON DELETE SET NULL

CHECK (primary_client_id IS NULL
       OR primary_client_id IN (client_id_a, client_id_b))
```

Nullable; meaningful only when `relationship_type IN ('spouse', 'partner')`.
NULL means "no override — use the deterministic default" (see below).

### 3. Migration backfill

For every existing `spouse`/`partner` relationship row, set `primary_client_id`
to whichever side currently holds `client_records` (the side with 1+ rows
where `client_id` matches). If neither or both sides already hold records,
leave NULL — safe default, falls back to the deterministic per-deal logic
below rather than guessing.

Schema change + backfill ship as one migration, applied immediately per repo
convention (matches how #253's fix was shipped same-day).

### 4. Deterministic primary tie-break (`planDealClients`, pure function)

Today: primary = the first party as split from that specific deal's raw
string. This is the actual source of the non-determinism in Goal 2 — it's
arbitrary with respect to the couple's identity, not just "unlucky."

Fix: group deals by the **canonical set of resolved parties** (each party's
`toNameSearch`, order-independent), not by raw string. Within each group —
across the *entire* input batch, not per-deal — primary = alphabetically-first
`toNameSearch`. This requires no DB access and stays inside the existing pure
function: a first pass resolves parties per deal (unchanged), a second pass
groups deals by party-set key and assigns one consistent primary per group.

This one change fixes both the within-batch case (three deals for the same
couple, one report accidentally reorders them) and the cross-import case
(two different reports, two different years) for free — the tie-break no
longer depends on word order or array position at all.

### 5. Persisted override (`resolveDealClientIds`, the DB-touching wrapper)

After `planDealClients` returns its (now-deterministic) plan, one added step:
for each detected party-group, check `client_relationships` for an existing
`spouse`/`partner` row linking those people. If found and `primary_client_id`
is set, override that group's primary to the persisted value instead of the
alphabetical default.

The pure planner never touches the DB — the override lives entirely in the
wrapper that was already doing DB work. When a NEW relationship is created
for a first-seen pair (existing behavior from #254), it now also sets
`primary_client_id` to whatever primary was just used (alphabetical, unless
already overridden), so the choice is persisted from the first sighting.

The wrapper also writes one `client_record_co_parties` row per non-primary
party per deal (new) — this is what the household-activity UI queries.

### 6. UI — list view

`ClientGroup` gains a computed field, e.g. `hasHouseholdActivity: boolean`
(true if 1+ `client_record_co_parties` rows exist for this client), computed
client-side alongside the existing `buildAllGroups` aggregation from a new
`localCoParties` array loaded the same way `localRecords`/`localClients`
already are.

List row: a small badge/icon when `dealCount === 0 && hasHouseholdActivity`,
so a linked co-party doesn't read as a cold lead at a glance. Tooltip:
"Linked to an active client's deal(s)."

### 7. UI — detail drawer

**Household Activity section** (new, read-only): rendered only when the
selected client has 1+ co-party rows. Lists the deals — address, date, GCI —
each labeled "Counts toward {primary name}'s total," linking to the primary's
card. Sits near the existing deal-history list; the client's own `totalGCI`
stat is untouched (still sums only deals they directly hold — the
no-double-count guarantee from #254 doesn't change).

**"Make primary" action**: a small control on the non-primary side of a
`spouse`/`partner` row in the existing Linked Clients section (only shown for
those two relationship types, only on the side that isn't currently primary).
Updates `client_relationships.primary_client_id`. New handler, e.g.
`handleSetPrimary(relationshipId, newPrimaryClientId)`, following the existing
`addRelationship`/`removeRelationship` pattern already in this file.

**Determining "currently primary" for display — no tie-break duplication.**
The UI never re-runs the alphabetical/grouping logic from §4–5; that lives
only in the resolver. For display purposes, current primary is simply:
`primary_client_id` if set, else whichever side already holds 1+
`client_records` (the same rule the backfill migration uses in §3). If
neither side holds any records yet (a manually-added spouse with no deals
so far), there's no effective primary to distinguish — the action can show
symmetrically on both sides until a deal or an explicit click settles it.

## Testing plan

- Extend `joint-names.test.ts` / `resolve-deal-clients.test.ts`:
  - a reordered couple within one batch → same primary (alphabetical)
  - a reordered couple across two separate `planDealClients` calls → same
    primary, with no shared state (proves the tie-break needs no DB)
  - an existing relationship with `primary_client_id` set → the wrapper
    overrides the alphabetical default
  - co-party rows written once per non-primary party per deal, no duplicates
    on re-import (`ON CONFLICT` dedup)
- New tests for the `hasHouseholdActivity` computation, as a pure function
  extracted from the component (testable without a full render, matching the
  existing `buildAllGroups`/`makeGroup` pattern).
- Migration backfill verified against real prod data read-only (aggregate
  counts only, no names), same method used for #254's validation.

## Rollout

- One migration (schema + backfill together), applied immediately.
- One PR covering: migration, resolver changes, both UI additions. Branch
  `feat/household-deal-attribution` in the `crm-intel` worktree.
- No feature flag — matches this session's established shipping pattern.

## Judgment calls flagged for explicit approval

- No retroactive reassignment on primary swap (see Non-goals).
- "Make primary" is a lightweight metadata change, not a merge-style
  operation — it never moves historical deals.
- Household Activity is read-only in this pass; no manual co-party editing.
