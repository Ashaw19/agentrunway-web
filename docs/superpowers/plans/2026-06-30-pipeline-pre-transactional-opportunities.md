# Pre-Transactional Pipeline Opportunities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pre-transactional Opportunities tier to the Pipeline tab (listing appointments, buyer prospects, referrals) with explicit close odds, structured "lost" workflow, one-click Promote to a real pipeline deal, conversion-rate + loss-rate KPIs, and full Dispatcher persona integration.

**Architecture:** Extend `listing_appointments` and `pipeline_deals` in place; add new `referral_opportunities` table; unify all three at a SQL view layer (`opportunities_v`) with `security_invoker=true` for RLS pass-through. A new `opportunity-conversion-engine.ts` reads the view to compute open count, weighted GCI, conversion %, loss rate, top loss reasons. The existing `pipeline-forecast-engine` is rewired to honor user-set `close_odds_pct` (falling back to today's stage defaults bit-for-bit). New UI section on the Pipeline tab + Add/Promote/Lost dialogs + 4 Dispatcher MCP tools. All writes flow through an atomic edge function so promote+lose never half-fail.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres 15, RLS, edge functions), pnpm workspaces, TypeScript, Vitest, shadcn UI + Lucide icons.

**Spec:** [docs/superpowers/specs/2026-06-30-pipeline-pre-transactional-opportunities-design.md](../specs/2026-06-30-pipeline-pre-transactional-opportunities-design.md)

**Champion routing:** crm-champion owns the worktree; metrics-design-champion owns the engine math review; ai-flight-crew-champion owns the Dispatcher integration. Sequential, not parallel.

---

## Pre-flight

### Task 0: Create worktree and feature branch

**Files:** None (git operation only).

- [ ] **Step 1: From the primary tree, fetch latest origin/main**

Run from `/Users/b/Desktop/Agent Runway Website/Project Home/02 - Web App Code/agentrunway-web`:
```bash
git fetch origin
```
Expected: silent or fetches a few refs.

- [ ] **Step 2: Create worktree**

```bash
cd "/Users/b/Desktop/Agent Runway Website/Project Home/02 - Web App Code"
git -C agentrunway-web worktree add worktrees/pipeline-pre-tx -b feat/pipeline-pre-transactional origin/main
```
Expected: `Preparing worktree (new branch 'feat/pipeline-pre-transactional')` + checkout output. Note: this creates the worktree under `agentrunway-web/worktrees/` per the existing git config.

- [ ] **Step 3: cd into worktree and verify clean state**

```bash
cd "/Users/b/Desktop/Agent Runway Website/Project Home/02 - Web App Code/agentrunway-web/worktrees/pipeline-pre-tx"
pwd
git status
git branch --show-current
```
Expected: pwd ends in `pipeline-pre-tx`; `nothing to commit, working tree clean`; branch `feat/pipeline-pre-transactional`.

- [ ] **Step 4: Install dependencies (lockfile-frozen per CLAUDE.md)**

```bash
pnpm install --frozen-lockfile
```
Expected: completes without modifying `pnpm-lock.yaml`.

**No commit on this task** — pre-flight only.

---

## Phase A — Schema (crm-champion)

All four migrations land via Supabase MCP `apply_migration` immediately after the SQL file is written, per `feedback_run_migrations.md`. The Supabase project ID is `wlxkvnbncfzkmxzexgxt`.

### Task 1: Migration 00153 — extend listing_appointments

**Files:**
- Create: `apps/web/supabase/migrations/00153_listing_appointments_opportunity_fields.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- Migration 00153 — listing_appointments opportunity fields
--
-- Adds user-set close odds %, structured lost reason, and a promote FK
-- to pipeline_deals. Enables pre-transactional opportunity tracking on
-- the Pipeline tab.

ALTER TABLE listing_appointments
  ADD COLUMN IF NOT EXISTS close_odds_pct              numeric(5,4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lost_reason                 text         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS converted_to_pipeline_deal_id uuid       REFERENCES pipeline_deals(id) ON DELETE SET NULL DEFAULT NULL;

ALTER TABLE listing_appointments
  ADD CONSTRAINT listing_appointments_close_odds_range
    CHECK (close_odds_pct IS NULL OR (close_odds_pct >= 0 AND close_odds_pct <= 1));

ALTER TABLE listing_appointments
  ADD CONSTRAINT listing_appointments_lost_reason_when_lost
    CHECK (status <> 'lost' OR lost_reason IS NOT NULL);

ALTER TABLE listing_appointments
  ADD CONSTRAINT listing_appointments_lost_reason_values
    CHECK (
      lost_reason IS NULL OR lost_reason IN (
        'chose_other_agent','decided_not_to_transact','price_disagreement',
        'timing_deferred','out_of_area','financing_fell_through','lost_contact','other'
      )
    );

CREATE INDEX IF NOT EXISTS idx_listing_appts_status_open
  ON listing_appointments(user_id, status)
  WHERE status IN ('scheduled','active');

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Apply migration**

Invoke Supabase MCP:
```
mcp__e1609470-2dc8-4b83-acae-47fc64c0113b__apply_migration
  project_id: wlxkvnbncfzkmxzexgxt
  name: 00153_listing_appointments_opportunity_fields
  query: <SQL from Step 1>
```
Expected: returns success.

- [ ] **Step 3: Verify via list_tables**

```
mcp__e1609470-2dc8-4b83-acae-47fc64c0113b__list_tables
  project_id: wlxkvnbncfzkmxzexgxt
  schemas: ["public"]
```
Expected: `listing_appointments` row shows the three new columns.

- [ ] **Step 4: Commit**

```bash
git add apps/web/supabase/migrations/00153_listing_appointments_opportunity_fields.sql
git commit -m "$(cat <<'EOF'
feat(crm): extend listing_appointments with close odds + lost reason (00153)

Adds close_odds_pct (NULL = use stage default), lost_reason (constrained
to 8-value loss-reasons vocabulary), and converted_to_pipeline_deal_id
FK for the Promote flow. CHECK enforces lost_reason NOT NULL when
status='lost'. Idempotent.

Part of pre-transactional Pipeline Opportunities feature.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

### Task 2: Migration 00154 — pipeline_deals lost stage + reason

**Files:**
- Create: `apps/web/supabase/migrations/00154_pipeline_deals_lost_stage_and_reason.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- Migration 00154 — pipeline_deals lost stage + lost reason
--
-- Adds 'lost' to the pipeline_stage enum so buyer prospects can be
-- explicitly marked lost (parity with listing_appointments). Adds
-- lost_reason (constrained text) + lost_at columns.
--
-- NOTE: ALTER TYPE ADD VALUE cannot run inside a transaction in PG <12,
-- but Supabase is on PG15+ which permits it. Safe to apply via MCP.

ALTER TYPE pipeline_stage ADD VALUE IF NOT EXISTS 'lost';

ALTER TABLE pipeline_deals
  ADD COLUMN IF NOT EXISTS lost_reason text        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lost_at     timestamptz DEFAULT NULL;

ALTER TABLE pipeline_deals
  ADD CONSTRAINT pipeline_deals_lost_reason_when_lost
    CHECK (stage <> 'lost' OR (lost_reason IS NOT NULL AND lost_at IS NOT NULL));

ALTER TABLE pipeline_deals
  ADD CONSTRAINT pipeline_deals_lost_reason_values
    CHECK (
      lost_reason IS NULL OR lost_reason IN (
        'chose_other_agent','decided_not_to_transact','price_disagreement',
        'timing_deferred','out_of_area','financing_fell_through','lost_contact','other'
      )
    );

CREATE INDEX IF NOT EXISTS idx_pipeline_deals_buyer_opportunity
  ON pipeline_deals(user_id, stage)
  WHERE side = 'buyer' AND stage IN ('lead','showing','lost');

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Apply migration**

```
mcp__e1609470-2dc8-4b83-acae-47fc64c0113b__apply_migration
  project_id: wlxkvnbncfzkmxzexgxt
  name: 00154_pipeline_deals_lost_stage_and_reason
  query: <SQL from Step 1>
```
Expected: success.

- [ ] **Step 3: Verify**

```
mcp__e1609470-2dc8-4b83-acae-47fc64c0113b__execute_sql
  project_id: wlxkvnbncfzkmxzexgxt
  query: SELECT unnest(enum_range(NULL::pipeline_stage));
```
Expected: returns `lead, showing, offer, conditional, firm, closed, lost`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/supabase/migrations/00154_pipeline_deals_lost_stage_and_reason.sql
git commit -m "$(cat <<'EOF'
feat(crm): add 'lost' stage + lost_reason to pipeline_deals (00154)

Buyer prospects can now be explicitly marked lost with a structured
reason from the 8-value vocabulary. Mirrors listing_appointments
behavior. CHECK enforces (lost_reason, lost_at) NOT NULL when
stage='lost'.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

### Task 3: Migration 00155 — referral_opportunities table

**Files:**
- Create: `apps/web/supabase/migrations/00155_referral_opportunities.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- Migration 00155 — referral_opportunities table
--
-- Tracks referral leads as a first-class pre-transactional opportunity
-- type alongside listing_appointments and (buyer-side) pipeline_deals.
-- Referrals don't fit either existing shape — they need a referrer
-- field and a fork in the promote path (to listing_appt OR pipeline_deal).
--
-- RLS lands in the same migration per CLAUDE.md never-do.

CREATE TABLE IF NOT EXISTS referral_opportunities (
  id                                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                             uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  referred_person_name                text          NOT NULL,
  client_id                           uuid          REFERENCES clients(id) ON DELETE SET NULL,

  referrer_name                       text,
  referrer_client_id                  uuid          REFERENCES clients(id) ON DELETE SET NULL,

  referral_date                       date          NOT NULL DEFAULT CURRENT_DATE,
  referral_type                       text          NOT NULL DEFAULT 'unknown'
                                                     CHECK (referral_type IN ('seller','buyer','unknown')),

  estimated_price                     numeric(14,2),
  estimated_commission_pct            numeric(7,6)  DEFAULT 0.025000,
  close_odds_pct                      numeric(5,4)  DEFAULT 0.20
                                                     CHECK (close_odds_pct IS NULL OR (close_odds_pct >= 0 AND close_odds_pct <= 1)),
  expected_close_date                 date,

  notes                               text,

  status                              text          NOT NULL DEFAULT 'open'
                                                     CHECK (status IN ('open','converted','lost')),
  lost_reason                         text          CHECK (
                                                       lost_reason IS NULL OR lost_reason IN (
                                                         'chose_other_agent','decided_not_to_transact','price_disagreement',
                                                         'timing_deferred','out_of_area','financing_fell_through','lost_contact','other'
                                                       )
                                                     ),
  lost_at                             timestamptz,
  converted_at                        timestamptz,
  converted_to_pipeline_deal_id       uuid          REFERENCES pipeline_deals(id) ON DELETE SET NULL,
  converted_to_listing_appointment_id uuid          REFERENCES listing_appointments(id) ON DELETE SET NULL,

  created_at                          timestamptz   NOT NULL DEFAULT now(),
  updated_at                          timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT referral_opps_lost_consistent
    CHECK (status <> 'lost' OR (lost_reason IS NOT NULL AND lost_at IS NOT NULL)),
  CONSTRAINT referral_opps_converted_consistent
    CHECK (status <> 'converted' OR converted_at IS NOT NULL)
);

ALTER TABLE referral_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own referral opportunities"
  ON referral_opportunities FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_referral_opps_user_id           ON referral_opportunities(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_opps_status            ON referral_opportunities(user_id, status);
CREATE INDEX IF NOT EXISTS idx_referral_opps_referrer_client   ON referral_opportunities(referrer_client_id) WHERE referrer_client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_referral_opps_client            ON referral_opportunities(client_id)          WHERE client_id          IS NOT NULL;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Apply migration**

```
mcp__e1609470-2dc8-4b83-acae-47fc64c0113b__apply_migration
  project_id: wlxkvnbncfzkmxzexgxt
  name: 00155_referral_opportunities
  query: <SQL from Step 1>
```
Expected: success.

- [ ] **Step 3: Verify RLS active**

```
mcp__e1609470-2dc8-4b83-acae-47fc64c0113b__execute_sql
  project_id: wlxkvnbncfzkmxzexgxt
  query: SELECT relrowsecurity FROM pg_class WHERE relname='referral_opportunities';
```
Expected: returns `t`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/supabase/migrations/00155_referral_opportunities.sql
git commit -m "$(cat <<'EOF'
feat(crm): add referral_opportunities table (00155)

New first-class pre-transactional opportunity type for tracking
referral leads. Includes referrer (free text + optional client FK),
referral_type (seller/buyer/unknown), close_odds default 0.20,
and converted_to_{pipeline_deal,listing_appointment}_id forks for the
Promote flow. RLS + indexes inline.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

### Task 4: Migration 00156 — opportunities_v unified view

**Files:**
- Create: `apps/web/supabase/migrations/00156_opportunities_view.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- Migration 00156 — opportunities_v unified read view
--
-- Single canonical read surface for pre-transactional opportunities.
-- UNIONs the three sources with normalized columns. Used by the new
-- opportunity-conversion-engine for KPI computation.
--
-- security_invoker=true so RLS of the calling user applies (per
-- migration 00128 convention).

CREATE OR REPLACE VIEW opportunities_v
WITH (security_invoker = true) AS

SELECT
  la.id,
  la.user_id,
  'listing_appointment'::text                                AS opportunity_type,
  COALESCE(la.property_address, '(no address)')              AS title,
  la.client_id,
  la.appointment_date                                        AS opportunity_date,
  la.expected_close_date,
  la.estimated_list_price                                    AS estimated_price,
  COALESCE(la.estimated_commission_pct, 0.025)               AS estimated_commission_pct,
  la.close_odds_pct,
  CASE la.status
    WHEN 'sold'      THEN 'converted'
    WHEN 'expired'   THEN 'lost'
    WHEN 'withdrawn' THEN 'lost'
    WHEN 'lost'      THEN 'lost'
    ELSE                  'open'
  END                                                        AS status,
  la.lost_reason,
  la.converted_to_pipeline_deal_id,
  NULL::uuid                                                 AS converted_to_listing_appointment_id,
  la.notes,
  la.created_at,
  la.updated_at
FROM listing_appointments la

UNION ALL

SELECT
  pd.id,
  pd.user_id,
  'buyer_prospect'::text                                     AS opportunity_type,
  COALESCE(NULLIF(pd.client_name,''), pd.address, '(unnamed)') AS title,
  pd.client_id,
  pd.created_at::date                                        AS opportunity_date,
  pd.expected_close_date,
  pd.estimated_price,
  pd.estimated_commission_pct,
  pd.probability_override                                    AS close_odds_pct,
  CASE pd.stage
    WHEN 'lead'        THEN 'open'
    WHEN 'showing'     THEN 'open'
    WHEN 'offer'       THEN 'converted'
    WHEN 'conditional' THEN 'converted'
    WHEN 'firm'        THEN 'converted'
    WHEN 'closed'      THEN 'converted'
    WHEN 'lost'        THEN 'lost'
  END                                                        AS status,
  pd.lost_reason,
  NULL::uuid                                                 AS converted_to_pipeline_deal_id,
  NULL::uuid                                                 AS converted_to_listing_appointment_id,
  pd.notes,
  pd.created_at,
  pd.updated_at
FROM pipeline_deals pd
WHERE pd.side = 'buyer'

UNION ALL

SELECT
  ro.id,
  ro.user_id,
  'referral'::text                                           AS opportunity_type,
  ro.referred_person_name                                    AS title,
  ro.client_id,
  ro.referral_date                                           AS opportunity_date,
  ro.expected_close_date,
  ro.estimated_price,
  COALESCE(ro.estimated_commission_pct, 0.025)               AS estimated_commission_pct,
  ro.close_odds_pct,
  ro.status,
  ro.lost_reason,
  ro.converted_to_pipeline_deal_id,
  ro.converted_to_listing_appointment_id,
  ro.notes,
  ro.created_at,
  ro.updated_at
FROM referral_opportunities ro;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Apply migration**

```
mcp__e1609470-2dc8-4b83-acae-47fc64c0113b__apply_migration
  project_id: wlxkvnbncfzkmxzexgxt
  name: 00156_opportunities_view
  query: <SQL from Step 1>
```
Expected: success.

- [ ] **Step 3: Smoke-test view with an arbitrary user**

```
mcp__e1609470-2dc8-4b83-acae-47fc64c0113b__execute_sql
  project_id: wlxkvnbncfzkmxzexgxt
  query: SELECT opportunity_type, status, COUNT(*) FROM opportunities_v GROUP BY 1,2 ORDER BY 1,2;
```
Expected: rows grouped by type+status with counts; no error. Counts may be zero in places — that's fine, this just confirms the view compiles.

- [ ] **Step 4: Commit**

```bash
git add apps/web/supabase/migrations/00156_opportunities_view.sql
git commit -m "$(cat <<'EOF'
feat(crm): add opportunities_v unified pre-pipeline view (00156)

UNIONs listing_appointments + buyer-side pipeline_deals + referral_opportunities
into a single read surface for the new opportunity-conversion-engine.
security_invoker=true preserves caller RLS.

Buyer-side pipeline_deals included at ALL stages with stage mapped to
status (lead/showing → open; offer/conditional/firm/closed → converted;
lost → lost). This keeps the conversion-rate denominator honest —
excluding converted rows would silently understate.

Seller-side pipeline_deals excluded — they come from promoting a
listing_appt and the listing_appt remains the canonical opportunity row.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

### Task 5: Regenerate TypeScript types

**Files:**
- Modify: `packages/core/types/database.ts`

- [ ] **Step 1: Generate types via Supabase MCP**

```
mcp__e1609470-2dc8-4b83-acae-47fc64c0113b__generate_typescript_types
  project_id: wlxkvnbncfzkmxzexgxt
```
Expected: returns the full TS types blob.

- [ ] **Step 2: Save returned types to `packages/core/types/database.ts`**

Replace the entire file contents with the MCP return value. Keep the same hand-written helper exports at the bottom of the file (`computeProbability`, `computeEstimatedGCI`, `computeWeightedGCI`, `PIPELINE_STAGE_DEFAULTS`) — they live OUTSIDE the auto-generated `Database` interface block. If they're at the bottom of the file (which is the existing convention), the MCP output replaces only the generated block. Diff to verify.

- [ ] **Step 3: Typecheck**

```bash
cd apps/web
pnpm install --frozen-lockfile
npx tsc --noEmit
cd ..
```
Expected: no errors in any package. If there are errors, they reveal callers that need updating — that's the signal to look for old `listing_appointments` row references that miss the new optional columns.

- [ ] **Step 4: Commit**

```bash
git add packages/core/types/database.ts
git commit -m "$(cat <<'EOF'
chore(types): regenerate database.ts for opportunities schema (00153-00156)

Picks up close_odds_pct, lost_reason on listing_appointments;
lost stage value, lost_reason, lost_at on pipeline_deals;
new referral_opportunities table; new opportunities_v view.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Phase B — Engines (metrics-design-champion reviews; crm-champion writes)

### Task 6: Loss reasons vocabulary library

**Files:**
- Create: `packages/core/lib/opportunity-loss-reasons.ts`
- Create: `packages/core/lib/__tests__/opportunity-loss-reasons.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/core/lib/__tests__/opportunity-loss-reasons.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  OPPORTUNITY_LOSS_REASONS,
  OpportunityLossReason,
  isOpportunityLossReason,
  lossReasonLabel,
} from "../opportunity-loss-reasons";

describe("opportunity-loss-reasons", () => {
  it("exposes exactly 8 vocabulary values", () => {
    expect(OPPORTUNITY_LOSS_REASONS.length).toBe(8);
  });

  it("includes 'other' last for UI ordering", () => {
    expect(OPPORTUNITY_LOSS_REASONS[OPPORTUNITY_LOSS_REASONS.length - 1]).toBe("other");
  });

  it("isOpportunityLossReason accepts valid values", () => {
    expect(isOpportunityLossReason("chose_other_agent")).toBe(true);
    expect(isOpportunityLossReason("other")).toBe(true);
  });

  it("isOpportunityLossReason rejects invalid values", () => {
    expect(isOpportunityLossReason("bogus")).toBe(false);
    expect(isOpportunityLossReason(null)).toBe(false);
    expect(isOpportunityLossReason(undefined)).toBe(false);
  });

  it("lossReasonLabel returns human label for known reason", () => {
    expect(lossReasonLabel("chose_other_agent")).toBe("Went with another agent");
    expect(lossReasonLabel("other")).toBe("Other");
  });

  it("lossReasonLabel falls back to humanized form for unknown (defensive)", () => {
    expect(lossReasonLabel("unknown_value" as OpportunityLossReason)).toBe("Unknown value");
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd packages/core
pnpm vitest run lib/__tests__/opportunity-loss-reasons.test.ts
```
Expected: FAIL (file does not exist).

- [ ] **Step 3: Write the library**

`packages/core/lib/opportunity-loss-reasons.ts`:
```ts
/**
 * Shared loss-reason vocabulary for pre-transactional opportunities.
 *
 * Mirrored by CHECK constraints on listing_appointments, pipeline_deals,
 * and referral_opportunities. The DB enforces value validity; this file
 * is the source of truth for UI labels and ordering.
 */

export const OPPORTUNITY_LOSS_REASONS = [
  "chose_other_agent",
  "decided_not_to_transact",
  "price_disagreement",
  "timing_deferred",
  "out_of_area",
  "financing_fell_through",
  "lost_contact",
  "other",
] as const;

export type OpportunityLossReason = typeof OPPORTUNITY_LOSS_REASONS[number];

const LABELS: Record<OpportunityLossReason, string> = {
  chose_other_agent:      "Went with another agent",
  decided_not_to_transact:"Decided not to sell/buy",
  price_disagreement:     "Couldn't agree on price",
  timing_deferred:        "Timing pushed to later",
  out_of_area:            "Outside my service area",
  financing_fell_through: "Financing fell through",
  lost_contact:           "Lost contact",
  other:                  "Other",
};

export function isOpportunityLossReason(v: unknown): v is OpportunityLossReason {
  return typeof v === "string" && (OPPORTUNITY_LOSS_REASONS as readonly string[]).includes(v);
}

export function lossReasonLabel(reason: OpportunityLossReason): string {
  if (LABELS[reason]) return LABELS[reason];
  const s = String(reason).replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
```

- [ ] **Step 4: Run tests — expect green**

```bash
pnpm vitest run lib/__tests__/opportunity-loss-reasons.test.ts
```
Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/core/lib/opportunity-loss-reasons.ts packages/core/lib/__tests__/opportunity-loss-reasons.test.ts
git commit -m "$(cat <<'EOF'
feat(core): add opportunity-loss-reasons vocabulary

8-value enum mirroring the CHECK constraints in migrations 00153-00155.
Used by the Lost dialog dropdown, the MCP mark_opportunity_lost tool,
and the opportunity-conversion-engine's loss-reason aggregation.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

### Task 7: opportunity-conversion-engine — types + effective odds

**Files:**
- Create: `packages/core/engines/opportunity-conversion-engine.ts`
- Create: `packages/core/engines/__tests__/opportunity-conversion-engine.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/core/engines/__tests__/opportunity-conversion-engine.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  effectiveOdds,
  OPPORTUNITY_DEFAULT_ODDS,
  type OpportunityRow,
} from "../opportunity-conversion-engine";

function row(o: Partial<OpportunityRow>): OpportunityRow {
  return {
    id: "x",
    opportunity_type: "listing_appointment",
    status: "open",
    estimated_price: 400_000,
    estimated_commission_pct: 0.025,
    close_odds_pct: null,
    expected_close_date: null,
    lost_reason: null,
    opportunity_date: "2026-06-30",
    updated_at: "2026-06-30T00:00:00Z",
    ...o,
  };
}

describe("effectiveOdds", () => {
  it("returns close_odds_pct when set", () => {
    expect(effectiveOdds(row({ close_odds_pct: 0.66 }))).toBe(0.66);
  });

  it("falls back to listing default when null", () => {
    expect(effectiveOdds(row({ opportunity_type: "listing_appointment", close_odds_pct: null })))
      .toBe(OPPORTUNITY_DEFAULT_ODDS.listing_appointment);
  });

  it("falls back to buyer default when null", () => {
    expect(effectiveOdds(row({ opportunity_type: "buyer_prospect", close_odds_pct: null })))
      .toBe(OPPORTUNITY_DEFAULT_ODDS.buyer_prospect);
  });

  it("falls back to referral default when null", () => {
    expect(effectiveOdds(row({ opportunity_type: "referral", close_odds_pct: null })))
      .toBe(OPPORTUNITY_DEFAULT_ODDS.referral);
  });

  it("treats close_odds_pct=0 as explicit zero (not null)", () => {
    expect(effectiveOdds(row({ close_odds_pct: 0 }))).toBe(0);
  });
});
```

- [ ] **Step 2: Run — FAIL (module missing)**

```bash
pnpm vitest run engines/__tests__/opportunity-conversion-engine.test.ts
```
Expected: FAIL `Cannot find module '../opportunity-conversion-engine'`.

- [ ] **Step 3: Write the engine module (types + effectiveOdds only)**

`packages/core/engines/opportunity-conversion-engine.ts`:
```ts
/**
 * Opportunity Conversion Engine
 *
 * Pure-function engine reading from the opportunities_v unified view.
 * Computes pre-transactional KPIs: open count, weighted GCI, conversion %,
 * loss rate, top loss reasons.
 *
 * Inputs are plain rows (caller fetches from opportunities_v).
 */

import type { OpportunityLossReason } from "../lib/opportunity-loss-reasons";

export type OpportunityType = "listing_appointment" | "buyer_prospect" | "referral";
export type OpportunityStatus = "open" | "converted" | "lost";

export interface OpportunityRow {
  id: string;
  opportunity_type: OpportunityType;
  status: OpportunityStatus;
  estimated_price: number | null;
  estimated_commission_pct: number | null;
  close_odds_pct: number | null;
  expected_close_date: string | null;
  lost_reason: string | null;
  opportunity_date: string;     // YYYY-MM-DD
  updated_at: string;           // ISO timestamp
}

export const OPPORTUNITY_DEFAULT_ODDS: Record<OpportunityType, number> = {
  listing_appointment: 0.40,
  buyer_prospect:      0.25,
  referral:            0.20,
};

export function effectiveOdds(row: OpportunityRow): number {
  if (row.close_odds_pct !== null && row.close_odds_pct !== undefined) {
    return row.close_odds_pct;
  }
  return OPPORTUNITY_DEFAULT_ODDS[row.opportunity_type];
}
```

- [ ] **Step 4: Run — PASS**

```bash
pnpm vitest run engines/__tests__/opportunity-conversion-engine.test.ts
```
Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/core/engines/opportunity-conversion-engine.ts packages/core/engines/__tests__/opportunity-conversion-engine.test.ts
git commit -m "$(cat <<'EOF'
feat(core): scaffold opportunity-conversion-engine (types + effectiveOdds)

First slice — types + the effectiveOdds helper that resolves close_odds_pct
or falls back to type-specific defaults (listing=0.40, buyer=0.25,
referral=0.20).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

### Task 8: opportunity-conversion-engine — weighted GCI

**Files:**
- Modify: `packages/core/engines/opportunity-conversion-engine.ts`
- Modify: `packages/core/engines/__tests__/opportunity-conversion-engine.test.ts`

- [ ] **Step 1: Add failing tests**

Append to the existing test file:
```ts
import { computeOpportunityWeightedGci } from "../opportunity-conversion-engine";

describe("computeOpportunityWeightedGci", () => {
  it("returns 0 for empty input", () => {
    expect(computeOpportunityWeightedGci([])).toBe(0);
  });

  it("only sums open rows (excludes converted and lost)", () => {
    const rows = [
      row({ id: "1", status: "open",      estimated_price: 400_000, estimated_commission_pct: 0.025, close_odds_pct: 0.5 }),
      row({ id: "2", status: "converted", estimated_price: 400_000, estimated_commission_pct: 0.025, close_odds_pct: 0.9 }),
      row({ id: "3", status: "lost",      estimated_price: 400_000, estimated_commission_pct: 0.025, close_odds_pct: 0.5 }),
    ];
    // only row 1: 400000 * 0.025 * 0.5 = 5000
    expect(computeOpportunityWeightedGci(rows)).toBe(5_000);
  });

  it("uses effective odds (null falls back to type default)", () => {
    const rows = [
      row({ opportunity_type: "listing_appointment", close_odds_pct: null, estimated_price: 400_000, estimated_commission_pct: 0.025 }),
      row({ opportunity_type: "buyer_prospect",      close_odds_pct: null, estimated_price: 500_000, estimated_commission_pct: 0.025 }),
    ];
    // listing: 400000 * 0.025 * 0.40 = 4000
    // buyer:   500000 * 0.025 * 0.25 = 3125
    expect(computeOpportunityWeightedGci(rows)).toBe(7_125);
  });

  it("treats null price or commission as zero contribution", () => {
    const rows = [
      row({ estimated_price: null,      estimated_commission_pct: 0.025, close_odds_pct: 0.5 }),
      row({ estimated_price: 400_000,   estimated_commission_pct: null,  close_odds_pct: 0.5 }),
    ];
    expect(computeOpportunityWeightedGci(rows)).toBe(0);
  });
});
```

- [ ] **Step 2: Run — 4 new failures**

```bash
pnpm vitest run engines/__tests__/opportunity-conversion-engine.test.ts
```
Expected: 4 new FAILs.

- [ ] **Step 3: Implement**

Append to `opportunity-conversion-engine.ts`:
```ts
export function computeOpportunityWeightedGci(rows: OpportunityRow[]): number {
  let total = 0;
  for (const r of rows) {
    if (r.status !== "open") continue;
    const price = r.estimated_price ?? 0;
    const pct = r.estimated_commission_pct ?? 0;
    const gci = price * pct;
    if (gci === 0) continue;
    total += gci * effectiveOdds(r);
  }
  return total;
}
```

- [ ] **Step 4: Run — PASS**

```bash
pnpm vitest run engines/__tests__/opportunity-conversion-engine.test.ts
```
Expected: 9 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/core/engines/opportunity-conversion-engine.ts packages/core/engines/__tests__/opportunity-conversion-engine.test.ts
git commit -m "feat(core): opportunity-conversion-engine — computeOpportunityWeightedGci

Open-only sum of estimated_gci × effective_odds. Null price or commission
contributes zero. Closes over the listing/buyer/referral default-odds
table.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 9: opportunity-conversion-engine — KPI aggregator

**Files:**
- Modify: `packages/core/engines/opportunity-conversion-engine.ts`
- Modify: `packages/core/engines/__tests__/opportunity-conversion-engine.test.ts`

- [ ] **Step 1: Add failing tests**

Append to test file:
```ts
import { computeOpportunityKpis } from "../opportunity-conversion-engine";

describe("computeOpportunityKpis", () => {
  // Anchor "now" for window math — every row's updated_at is relative to this.
  const NOW = new Date("2026-06-30T12:00:00Z");

  function rowAt(daysAgo: number, o: Partial<OpportunityRow>): OpportunityRow {
    const d = new Date(NOW.getTime() - daysAgo * 86_400_000);
    return row({ ...o, updated_at: d.toISOString() });
  }

  it("returns null conversion rate when no closed events in window", () => {
    const rows = [rowAt(10, { status: "open" })];
    const k = computeOpportunityKpis(rows, 90, NOW);
    expect(k.conversionRatePct).toBe(null);
    expect(k.lossRatePct).toBe(null);
    expect(k.openCount).toBe(1);
  });

  it("computes 50% conversion when 1 converted + 1 lost in window", () => {
    const rows = [
      rowAt(10, { status: "converted" }),
      rowAt(15, { status: "lost", lost_reason: "chose_other_agent" }),
    ];
    const k = computeOpportunityKpis(rows, 90, NOW);
    expect(k.conversionRatePct).toBe(0.5);
    expect(k.lossRatePct).toBe(0.5);
  });

  it("100% conversion when all converted", () => {
    const rows = [
      rowAt(5,  { status: "converted" }),
      rowAt(20, { status: "converted" }),
    ];
    const k = computeOpportunityKpis(rows, 90, NOW);
    expect(k.conversionRatePct).toBe(1);
    expect(k.lossRatePct).toBe(0);
  });

  it("excludes rows older than the window", () => {
    const rows = [
      rowAt(95, { status: "converted" }),                            // outside
      rowAt(10, { status: "lost", lost_reason: "lost_contact" }),    // inside
    ];
    const k = computeOpportunityKpis(rows, 90, NOW);
    // 0 converted / (0 converted + 1 lost) = 0
    expect(k.conversionRatePct).toBe(0);
    expect(k.lossRatePct).toBe(1);
  });

  it("ranks top loss reasons by count, then alphabetical for ties", () => {
    const rows = [
      rowAt(5,  { status: "lost", lost_reason: "chose_other_agent" }),
      rowAt(6,  { status: "lost", lost_reason: "chose_other_agent" }),
      rowAt(7,  { status: "lost", lost_reason: "price_disagreement" }),
      rowAt(8,  { status: "lost", lost_reason: "lost_contact" }),
    ];
    const k = computeOpportunityKpis(rows, 90, NOW);
    expect(k.topLossReasons[0]).toEqual({ reason: "chose_other_agent",   count: 2, pct: 0.5 });
    // tie between price_disagreement (1) and lost_contact (1) — alpha order: lost_contact first
    expect(k.topLossReasons[1].reason).toBe("lost_contact");
    expect(k.topLossReasons[2].reason).toBe("price_disagreement");
  });

  it("openCount is independent of window (always current open)", () => {
    const rows = [
      rowAt(200, { status: "open" }),  // very old open row
      rowAt(5,   { status: "open" }),
    ];
    const k = computeOpportunityKpis(rows, 90, NOW);
    expect(k.openCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run — failures**

```bash
pnpm vitest run engines/__tests__/opportunity-conversion-engine.test.ts
```
Expected: 6 new FAILs.

- [ ] **Step 3: Implement**

Append to `opportunity-conversion-engine.ts`:
```ts
export interface OpportunityKpis {
  openCount: number;
  weightedGci: number;
  conversionRatePct: number | null;
  lossRatePct: number | null;
  topLossReasons: Array<{ reason: string; count: number; pct: number }>;
}

export function computeOpportunityKpis(
  rows: OpportunityRow[],
  windowDays: number,
  now: Date = new Date(),
): OpportunityKpis {
  const cutoff = now.getTime() - windowDays * 86_400_000;

  let openCount = 0;
  let converted = 0;
  let lost = 0;
  const lossReasonCounts = new Map<string, number>();

  for (const r of rows) {
    if (r.status === "open") {
      openCount += 1;
      continue;
    }
    const t = Date.parse(r.updated_at);
    if (isNaN(t) || t < cutoff) continue;

    if (r.status === "converted") {
      converted += 1;
    } else if (r.status === "lost") {
      lost += 1;
      const key = r.lost_reason ?? "other";
      lossReasonCounts.set(key, (lossReasonCounts.get(key) ?? 0) + 1);
    }
  }

  const closedTotal = converted + lost;
  const conversionRatePct = closedTotal === 0 ? null : converted / closedTotal;
  const lossRatePct       = closedTotal === 0 ? null : lost / closedTotal;

  const topLossReasons = Array.from(lossReasonCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reason, count]) => ({
      reason,
      count,
      pct: lost === 0 ? 0 : count / lost,
    }));

  return {
    openCount,
    weightedGci: computeOpportunityWeightedGci(rows),
    conversionRatePct,
    lossRatePct,
    topLossReasons,
  };
}
```

- [ ] **Step 4: Run — PASS**

```bash
pnpm vitest run engines/__tests__/opportunity-conversion-engine.test.ts
```
Expected: 15 passing total.

- [ ] **Step 5: Commit**

```bash
git add packages/core/engines/opportunity-conversion-engine.ts packages/core/engines/__tests__/opportunity-conversion-engine.test.ts
git commit -m "feat(core): opportunity-conversion-engine — KPI aggregator

computeOpportunityKpis(rows, windowDays, now?) returns open count,
weighted GCI, conversion/loss rate over rolling window, and top-N
loss reasons ranked by count (alpha for ties).

now is injectable so callers can pin to a fixed clock for tests; UI
callers omit it and let it default to the runtime clock.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 10: pipeline-forecast-engine — honor user-set close odds + add referrals

**Files:**
- Modify: `packages/core/engines/pipeline-forecast-engine.ts`
- Modify: `packages/core/engines/__tests__/pipeline-forecast-engine.test.ts`

This is the dashboard-math-touching change. Behavior preservation is binding (see spec §2.2 guardrail).

- [ ] **Step 1: Add failing tests preserving the spec guardrail**

Append to `pipeline-forecast-engine.test.ts`:
```ts
import { computeWeightedGCI as helperWeightedGCI } from "../../types/database";

describe("pipeline-forecast-engine — close_odds_pct override", () => {
  it("listing appointment with close_odds_pct=null uses existing LISTING_PROBABILITIES default", () => {
    // scheduled status → existing default 0.15
    const input = buildMinimalInput({
      listingAppointments: [makeListingAppt({ status: "scheduled", estimated_list_price: 400_000, close_odds_pct: null })],
    });
    const out = unifyPipeline(input);
    const listing = out.items.find(i => i.source === "listing")!;
    expect(listing.probability).toBeCloseTo(0.15, 5);
  });

  it("listing appointment with close_odds_pct set overrides the stage default", () => {
    const input = buildMinimalInput({
      listingAppointments: [makeListingAppt({ status: "scheduled", estimated_list_price: 400_000, close_odds_pct: 0.7 })],
    });
    const out = unifyPipeline(input);
    const listing = out.items.find(i => i.source === "listing")!;
    expect(listing.probability).toBeCloseTo(0.7, 5);
  });

  it("listing appointment with close_odds_pct=0 produces zero weighted GCI (explicit zero)", () => {
    const input = buildMinimalInput({
      listingAppointments: [makeListingAppt({ status: "active", estimated_list_price: 500_000, estimated_commission_pct: 0.025, close_odds_pct: 0 })],
    });
    const out = unifyPipeline(input);
    const listing = out.items.find(i => i.source === "listing")!;
    expect(listing.weightedGCI).toBe(0);
  });
});

describe("pipeline-forecast-engine — referrals as a fourth input source", () => {
  it("referrals contribute to weighted GCI when status='open'", () => {
    const input = buildMinimalInput({
      referralOpportunities: [
        makeReferral({ status: "open", estimated_price: 500_000, estimated_commission_pct: 0.025, close_odds_pct: 0.3 }),
      ],
    });
    const out = unifyPipeline(input);
    const ref = out.items.find(i => i.source === "referral")!;
    expect(ref.weightedGCI).toBeCloseTo(500_000 * 0.025 * 0.3, 2);
  });

  it("converted and lost referrals contribute nothing", () => {
    const input = buildMinimalInput({
      referralOpportunities: [
        makeReferral({ status: "converted" }),
        makeReferral({ status: "lost", lost_reason: "chose_other_agent", lost_at: "2026-06-01T00:00:00Z" }),
      ],
    });
    const out = unifyPipeline(input);
    expect(out.items.filter(i => i.source === "referral").length).toBe(0);
  });
});
```

(`makeListingAppt`, `makeReferral`, `buildMinimalInput`, `unifyPipeline` may need to be added to the existing test helpers — read the existing pipeline-forecast-engine.test.ts header to discover the helper names and follow existing conventions. If they don't exist, add them and follow the fixture-discipline note in `packages/core/engines/__tests__/test-data.ts`. Do NOT use `as ListingAppointment` casts.)

- [ ] **Step 2: Run — failures**

```bash
pnpm vitest run engines/__tests__/pipeline-forecast-engine.test.ts
```
Expected: 5 new FAILs.

- [ ] **Step 3: Update the engine**

In `packages/core/engines/pipeline-forecast-engine.ts`:

Find the listing-appointment loop (around line 222-247 per the explore agent's map) and change:
```ts
const prob = LISTING_PROBABILITIES[listing.status] ?? 0.15;
```
to:
```ts
const prob = listing.close_odds_pct ?? LISTING_PROBABILITIES[listing.status] ?? 0.15;
```

Add a new referrals input to the engine input type:
```ts
referralOpportunities?: ReferralOpportunity[];  // new — pre-transactional referrals
```
Import `ReferralOpportunity` from `../types/database` (now auto-generated from migration 00155).

Add a new mapping section after the buyers loop:
```ts
// ── 4. Map referral opportunities ────────────────────────────────────
const openReferrals = (input.referralOpportunities ?? []).filter(r => r.status === "open");
for (const ref of openReferrals) {
  const value = ref.estimated_price ?? 0;
  const commission = ref.estimated_commission_pct ?? input.defaultCommissionPct;
  const prob = ref.close_odds_pct ?? 0.20;   // matches OPPORTUNITY_DEFAULT_ODDS.referral
  const estimatedGCI = value * commission;
  items.push({
    id: ref.id,
    source: "referral",
    name: ref.referred_person_name,
    stage: ref.referral_type,
    unifiedStage: "pre_qualifying",
    side: ref.referral_type === "seller" ? "sell" : (ref.referral_type === "buyer" ? "buy" : "both"),
    estimatedValue: value,
    commissionPct: commission,
    estimatedGCI,
    probability: prob,
    weightedGCI: estimatedGCI * prob,
    expectedCloseDate: ref.expected_close_date ?? null,
    clientName: ref.referred_person_name,
    daysInStage: null,
    manualOverride: ref.close_odds_pct !== null && ref.close_odds_pct !== undefined,
  });
}
```

Add `"referral"` to the `source` union on `UnifiedPipelineItem`:
```ts
source: "deal" | "listing" | "buyer" | "referral";
```

- [ ] **Step 4: Run — PASS**

```bash
pnpm vitest run engines/__tests__/pipeline-forecast-engine.test.ts
```
Expected: previous tests pass + 5 new pass.

- [ ] **Step 5: Run full engine suite to catch regressions**

```bash
pnpm vitest run engines/__tests__/
```
Expected: all green. If a cross-surface parity test fails on `source` union exhaustiveness — that's the signal to update its switch statement to handle "referral".

- [ ] **Step 6: Commit**

```bash
git add packages/core/engines/pipeline-forecast-engine.ts packages/core/engines/__tests__/pipeline-forecast-engine.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): pipeline-forecast — honor close_odds_pct + add referrals

Two changes, neither shifts existing-data dashboard math:

1. listing_appointments.close_odds_pct overrides the LISTING_PROBABILITIES
   stage default when set. When NULL, behavior is bit-for-bit preserved
   (scheduled=0.15, active=0.40, fallback=0.15).

2. referral_opportunities (new in migration 00155) becomes a fourth
   input source, contributing only status='open' rows. Defaults
   close_odds=0.20, matching opportunity-conversion-engine.

Per spec §2.2 guardrail: change is internal; Pipeline Weighted card
remains one number. Existing-data delta = 0; future delta comes only
from intentional user-set odds + intentional referral logging.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Phase C — Promote/Lose edge function (crm-champion)

### Task 11: opportunity-promote edge function

**Files:**
- Create: `apps/web/supabase/functions/opportunity-promote/index.ts`
- Create: `apps/web/supabase/functions/opportunity-promote/__tests__/index.test.ts`
- Create: `apps/web/supabase/functions/opportunity-promote/deno.json`

- [ ] **Step 1: Inspect existing edge function for pattern conformance**

```bash
ls apps/web/supabase/functions/
cat apps/web/supabase/functions/mcp-server/index.ts | head -40
```
Match the imports, CORS, and auth-token-extraction pattern used by other functions.

- [ ] **Step 2: Write the edge function**

`apps/web/supabase/functions/opportunity-promote/index.ts`:
```ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PromoteRequest =
  | {
      action: "promote";
      opportunity_id: string;
      opportunity_source: "listing_appointment" | "referral";
      target?: "listing_appointment" | "buyer_prospect";   // referral only
      promote_stage?: "lead" | "showing";                  // buyer-prospect creation stage; default "lead"
    }
  | {
      action: "advance_stage";
      pipeline_deal_id: string;
      stage: "offer" | "conditional" | "firm";
    }
  | {
      action: "mark_lost";
      opportunity_id: string;
      opportunity_source: "listing_appointment" | "buyer_prospect" | "referral";
      lost_reason: string;
      notes?: string;
    };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: CORS });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return new Response(JSON.stringify({ error: "missing auth" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  let body: PromoteRequest;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const VALID_LOSS_REASONS = new Set([
    "chose_other_agent","decided_not_to_transact","price_disagreement",
    "timing_deferred","out_of_area","financing_fell_through","lost_contact","other",
  ]);

  try {
    if (body.action === "mark_lost") {
      if (!VALID_LOSS_REASONS.has(body.lost_reason)) return json({ error: "invalid lost_reason" }, 400);
      if (body.lost_reason === "other" && !body.notes?.trim()) return json({ error: "notes required when lost_reason=other" }, 400);

      const lostAt = new Date().toISOString();
      let updateRes;
      if (body.opportunity_source === "listing_appointment") {
        updateRes = await supabase.from("listing_appointments")
          .update({ status: "lost", lost_reason: body.lost_reason, notes: appendNotes(body.notes) })
          .eq("id", body.opportunity_id)
          .select("id").single();
      } else if (body.opportunity_source === "buyer_prospect") {
        updateRes = await supabase.from("pipeline_deals")
          .update({ stage: "lost", lost_reason: body.lost_reason, lost_at: lostAt, notes: appendNotes(body.notes) })
          .eq("id", body.opportunity_id)
          .select("id").single();
      } else {
        updateRes = await supabase.from("referral_opportunities")
          .update({ status: "lost", lost_reason: body.lost_reason, lost_at: lostAt, notes: appendNotes(body.notes) })
          .eq("id", body.opportunity_id)
          .select("id").single();
      }
      if (updateRes.error) return json({ error: updateRes.error.message }, 400);
      return json({ ok: true });
    }

    if (body.action === "advance_stage") {
      if (!["offer","conditional","firm"].includes(body.stage)) return json({ error: "invalid stage" }, 400);
      const { error } = await supabase.from("pipeline_deals")
        .update({ stage: body.stage })
        .eq("id", body.pipeline_deal_id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (body.action === "promote") {
      if (body.opportunity_source === "listing_appointment") {
        return await promoteListingAppt(supabase, body.opportunity_id);
      }
      if (body.opportunity_source === "referral") {
        const target = body.target;
        if (target !== "listing_appointment" && target !== "buyer_prospect") {
          return json({ error: "referral promote requires target=listing_appointment|buyer_prospect" }, 400);
        }
        const promoteStage = body.promote_stage ?? "lead";
        return await promoteReferral(supabase, body.opportunity_id, target, promoteStage);
      }
      return json({ error: "promote only supports listing_appointment or referral sources" }, 400);
    }

    return json({ error: "unknown action" }, 400);
  } catch (e: any) {
    return json({ error: e.message ?? "internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function appendNotes(extra?: string): string | undefined {
  if (!extra) return undefined;
  return extra;
}

async function promoteListingAppt(supabase: any, listingApptId: string) {
  // 1) read the listing appt
  const { data: la, error: laErr } = await supabase
    .from("listing_appointments")
    .select("*")
    .eq("id", listingApptId)
    .single();
  if (laErr || !la) return json({ error: laErr?.message ?? "not found" }, 404);
  if (la.converted_to_pipeline_deal_id) return json({ error: "already promoted" }, 409);

  const newDeal = {
    user_id: la.user_id,
    address: la.property_address ?? "",
    estimated_price: la.estimated_list_price ?? 0,
    estimated_commission_pct: la.estimated_commission_pct ?? 0.025,
    side: "seller",
    stage: "showing",
    expected_close_date: la.expected_close_date ?? null,
    client_name: "",
    notes: la.notes ?? "",
    client_id: la.client_id ?? null,
    original_estimated_price: la.estimated_list_price ?? null,
  };

  const { data: deal, error: dealErr } = await supabase
    .from("pipeline_deals")
    .insert(newDeal)
    .select("id")
    .single();
  if (dealErr) return json({ error: dealErr.message }, 400);

  const { error: updErr } = await supabase
    .from("listing_appointments")
    .update({ status: "active", converted_to_pipeline_deal_id: deal.id })
    .eq("id", listingApptId);
  if (updErr) {
    // Compensating action: hard-delete the freshly-inserted pipeline_deal
    // to leave the table pair consistent.
    await supabase.from("pipeline_deals").delete().eq("id", deal.id);
    return json({ error: "promote partial-failure rolled back: " + updErr.message }, 500);
  }

  return json({ ok: true, pipeline_deal_id: deal.id });
}

async function promoteReferral(supabase: any, referralId: string, target: "listing_appointment"|"buyer_prospect", buyerStage: "lead"|"showing") {
  const { data: ref, error: refErr } = await supabase
    .from("referral_opportunities")
    .select("*")
    .eq("id", referralId)
    .single();
  if (refErr || !ref) return json({ error: refErr?.message ?? "not found" }, 404);
  if (ref.status !== "open") return json({ error: "only open referrals can be promoted" }, 409);

  const convertedAt = new Date().toISOString();

  if (target === "listing_appointment") {
    const newLa = {
      user_id: ref.user_id,
      client_id: ref.client_id,
      appointment_date: new Date().toISOString().slice(0, 10),
      property_address: null,
      estimated_list_price: ref.estimated_price,
      estimated_commission_pct: ref.estimated_commission_pct,
      expected_close_date: ref.expected_close_date,
      close_odds_pct: ref.close_odds_pct,
      status: "scheduled",
      notes: ref.notes ?? "",
    };
    const { data: la, error: laErr } = await supabase
      .from("listing_appointments").insert(newLa).select("id").single();
    if (laErr) return json({ error: laErr.message }, 400);

    const { error: updErr } = await supabase
      .from("referral_opportunities")
      .update({ status: "converted", converted_at: convertedAt, converted_to_listing_appointment_id: la.id })
      .eq("id", referralId);
    if (updErr) {
      await supabase.from("listing_appointments").delete().eq("id", la.id);
      return json({ error: "referral promote partial-failure rolled back: " + updErr.message }, 500);
    }
    return json({ ok: true, listing_appointment_id: la.id });
  }

  // target === "buyer_prospect"
  const newDeal = {
    user_id: ref.user_id,
    address: "",
    estimated_price: ref.estimated_price ?? 0,
    estimated_commission_pct: ref.estimated_commission_pct ?? 0.025,
    side: "buyer",
    stage: buyerStage,
    expected_close_date: ref.expected_close_date ?? null,
    client_name: ref.referred_person_name,
    notes: ref.notes ?? "",
    client_id: ref.client_id ?? null,
    probability_override: ref.close_odds_pct,
  };
  const { data: deal, error: dealErr } = await supabase
    .from("pipeline_deals").insert(newDeal).select("id").single();
  if (dealErr) return json({ error: dealErr.message }, 400);

  const { error: updErr } = await supabase
    .from("referral_opportunities")
    .update({ status: "converted", converted_at: convertedAt, converted_to_pipeline_deal_id: deal.id })
    .eq("id", referralId);
  if (updErr) {
    await supabase.from("pipeline_deals").delete().eq("id", deal.id);
    return json({ error: "referral promote partial-failure rolled back: " + updErr.message }, 500);
  }
  return json({ ok: true, pipeline_deal_id: deal.id });
}
```

- [ ] **Step 3: Write deno.json**

`apps/web/supabase/functions/opportunity-promote/deno.json`:
```json
{
  "imports": {
    "https://deno.land/std@0.224.0/": "https://deno.land/std@0.224.0/"
  }
}
```
(Match whatever convention sibling edge functions use — copy from `mcp-server/deno.json` if it exists. Skip this step if functions share a top-level deno.json.)

- [ ] **Step 4: Deploy the edge function**

```
mcp__e1609470-2dc8-4b83-acae-47fc64c0113b__deploy_edge_function
  project_id: wlxkvnbncfzkmxzexgxt
  name: opportunity-promote
  files: [{ name: "index.ts", content: <Step-2 contents> }]
```
Expected: success.

- [ ] **Step 5: Smoke-test via execute_sql + edge function call**

Insert a test listing appointment for an existing user, then call the function. Use `curl` against the deployed function URL with a valid user JWT, or write a small fixture via execute_sql. Verify:
- Promote returns 200 with pipeline_deal_id
- listing_appointments.converted_to_pipeline_deal_id is set
- listing_appointments.status='active'
- A new pipeline_deals row exists with side='seller', stage='showing', original_estimated_price set

This is a manual smoke against the deployed function (no Deno test framework in scope for v1).

- [ ] **Step 6: Commit**

```bash
git add apps/web/supabase/functions/opportunity-promote/
git commit -m "$(cat <<'EOF'
feat(crm): opportunity-promote edge function

One atomic endpoint for the three lifecycle writes:
- action=promote (listing_appt → seller pipeline_deal; referral → listing_appt OR buyer pipeline_deal)
- action=advance_stage (buyer pipeline_deal → offer/conditional/firm)
- action=mark_lost (any of the three sources)

Failure mode: if the second write in a promote fails, compensate by
deleting the first to leave the table pair consistent. (Postgres
cross-table transactions aren't available across two PostgREST calls
from Deno — manual compensation is the standard pattern.)

Validates lost_reason against the 8-value vocabulary; requires notes
when lost_reason='other'.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Phase D — Pipeline tab UI (crm-champion)

### Task 12: Hook — useOpportunities + data fetch

**Files:**
- Create: `apps/web/app/(app)/pipeline/hooks/use-opportunities.ts`

- [ ] **Step 1: Write the hook**

```ts
"use client";

import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import type { OpportunityRow } from "@agent-runway/core/engines/opportunity-conversion-engine";

const supabase = createClient();

async function fetchOpportunities(): Promise<OpportunityRow[]> {
  const { data, error } = await supabase
    .from("opportunities_v")
    .select("id, opportunity_type, status, estimated_price, estimated_commission_pct, close_odds_pct, expected_close_date, lost_reason, opportunity_date, updated_at")
    .order("opportunity_date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export function useOpportunities() {
  const { data, error, mutate, isLoading } = useSWR("opportunities_v", fetchOpportunities, {
    revalidateOnFocus: true,
  });
  return { opportunities: data ?? [], error, mutate, isLoading };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/(app)/pipeline/hooks/use-opportunities.ts
git commit -m "feat(pipeline): useOpportunities hook reads opportunities_v

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 13: Cockpit-strip KPI component

**Files:**
- Create: `apps/web/app/(app)/pipeline/components/opportunity-cockpit-strip.tsx`

- [ ] **Step 1: Inspect existing cockpit-strip primitives**

```bash
find apps/web -name "cockpit-ui.tsx" -not -path "*/node_modules/*"
cat <found-file> | head -60
```
Look for `CockpitStat` + `Sparkline` exports per `findings/crm_cockpit_elevation_shipped_2026-06-28.md` and `findings/crm_cockpit_sparkline_polish_2026-06-30.md`. Use them; do not re-roll.

- [ ] **Step 2: Implement the strip**

```tsx
"use client";

import { computeOpportunityKpis, type OpportunityRow } from "@agent-runway/core/engines/opportunity-conversion-engine";
import { lossReasonLabel } from "@agent-runway/core/lib/opportunity-loss-reasons";
import { CockpitStat } from "@/components/cockpit-ui"; // adjust path to where the primitive lives
import { TrendingUp, Wallet, Target, AlertTriangle } from "lucide-react";

export function OpportunityCockpitStrip({ opportunities }: { opportunities: OpportunityRow[] }) {
  const k90 = computeOpportunityKpis(opportunities, 90);
  const kYtd = computeOpportunityKpis(opportunities, daysSinceJan1());

  const breakdown = breakdownByType(opportunities);
  const fmtPct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
  const fmtMoney = (v: number) => v.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      <CockpitStat
        label="Open Opportunities"
        value={String(k90.openCount)}
        secondary={breakdown.summary}
        icon={Target}
      />
      <CockpitStat
        label="Weighted Pre-Contract GCI"
        value={fmtMoney(k90.weightedGci)}
        secondary={breakdown.byTypeChip}
        icon={Wallet}
      />
      <CockpitStat
        label="Appointment → Contract"
        value={fmtPct(k90.conversionRatePct)}
        secondary={`90d · YTD ${fmtPct(kYtd.conversionRatePct)}`}
        icon={TrendingUp}
      />
      <CockpitStat
        label="Loss Rate"
        value={fmtPct(k90.lossRatePct)}
        secondary={topReasonText(k90.topLossReasons)}
        icon={AlertTriangle}
      />
    </div>
  );
}

function daysSinceJan1(): number {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  return Math.ceil((now.getTime() - jan1.getTime()) / 86_400_000);
}

function breakdownByType(rows: OpportunityRow[]) {
  const open = rows.filter(r => r.status === "open");
  const counts = { listing_appointment: 0, buyer_prospect: 0, referral: 0 };
  for (const r of open) counts[r.opportunity_type]++;
  const summary = `${counts.listing_appointment} listing · ${counts.buyer_prospect} buyer · ${counts.referral} referral`;
  return { summary, byTypeChip: summary };
}

function topReasonText(reasons: Array<{ reason: string; count: number }>): string {
  if (reasons.length === 0) return "—";
  const top = reasons.slice(0, 2);
  return top.map(r => `${lossReasonLabel(r.reason as any)} (${r.count})`).join(" · ");
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/(app)/pipeline/components/opportunity-cockpit-strip.tsx
git commit -m "feat(pipeline): opportunity cockpit-strip (4 KPIs)

Open count + weighted pre-contract GCI + 90d conversion % + loss rate
with top-2 reasons inline. Uses existing CockpitStat primitive — does
not re-roll cockpit chrome.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 14: Opportunities section + card

**Files:**
- Create: `apps/web/app/(app)/pipeline/components/opportunity-card.tsx`
- Create: `apps/web/app/(app)/pipeline/components/opportunities-section.tsx`

- [ ] **Step 1: Card component**

`apps/web/app/(app)/pipeline/components/opportunity-card.tsx`:
```tsx
"use client";

import { Home, Users, Share2 } from "lucide-react";
import { effectiveOdds, type OpportunityRow } from "@agent-runway/core/engines/opportunity-conversion-engine";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const TYPE_META = {
  listing_appointment: { icon: Home,   accent: "text-violet-400", label: "Listing appt" },
  buyer_prospect:      { icon: Users,  accent: "text-sky-400",    label: "Buyer prospect" },
  referral:            { icon: Share2, accent: "text-slate-300",  label: "Referral" },
} as const;

export function OpportunityCard({
  opp,
  onPromote,
  onLost,
  onOddsChange,
  onAdvanceStage,
}: {
  opp: OpportunityRow;
  onPromote: (opp: OpportunityRow) => void;
  onLost: (opp: OpportunityRow) => void;
  onOddsChange: (opp: OpportunityRow, newOdds: number) => Promise<void>;
  onAdvanceStage?: (opp: OpportunityRow) => void;
}) {
  const meta = TYPE_META[opp.opportunity_type];
  const Icon = meta.icon;
  const gci = (opp.estimated_price ?? 0) * (opp.estimated_commission_pct ?? 0);
  const odds = effectiveOdds(opp);
  const [editingOdds, setEditingOdds] = useState(false);
  const [draftOdds, setDraftOdds] = useState<number>(odds);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm">
        <Icon className={`h-4 w-4 ${meta.accent}`} />
        <span className="font-medium">{(opp as any).title ?? "(no title)"}</span>
        <span className="text-xs text-zinc-500 ml-auto">{meta.label}</span>
      </div>

      <div className="flex items-center gap-4 text-xs text-zinc-300">
        <span>Price ${(opp.estimated_price ?? 0).toLocaleString()}</span>
        <span>Est GCI ${gci.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        <span>
          Odds{" "}
          {editingOdds ? (
            <input
              type="number"
              min={0}
              max={100}
              value={Math.round(draftOdds * 100)}
              onChange={(e) => setDraftOdds(Number(e.target.value) / 100)}
              onBlur={async () => {
                if (draftOdds !== odds) await onOddsChange(opp, draftOdds);
                setEditingOdds(false);
              }}
              autoFocus
              className="w-12 bg-zinc-900 border border-zinc-700 rounded px-1"
            />
          ) : (
            <button onClick={() => setEditingOdds(true)} className="underline-offset-2 hover:underline">
              {Math.round(odds * 100)}%
            </button>
          )}
        </span>
        {opp.expected_close_date && (
          <span className="text-zinc-500">expected {opp.expected_close_date}</span>
        )}
      </div>

      <div className="flex gap-2 mt-1">
        {opp.opportunity_type === "buyer_prospect" ? (
          <Button size="sm" variant="default" onClick={() => onAdvanceStage?.(opp)}>Advance Stage</Button>
        ) : (
          <Button size="sm" variant="default" onClick={() => onPromote(opp)}>Promote</Button>
        )}
        <Button size="sm" variant="destructive" onClick={() => onLost(opp)}>Lost</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Section component**

`apps/web/app/(app)/pipeline/components/opportunities-section.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOpportunities } from "../hooks/use-opportunities";
import { OpportunityCard } from "./opportunity-card";
import { OpportunityCockpitStrip } from "./opportunity-cockpit-strip";
import { AddOpportunityDialog } from "./add-opportunity-dialog";
import { PromoteOpportunityDialog } from "./promote-opportunity-dialog";
import { LostOpportunityDialog } from "./lost-opportunity-dialog";
import { AdvanceStageDialog } from "./advance-stage-dialog";
import type { OpportunityRow } from "@agent-runway/core/engines/opportunity-conversion-engine";

export function OpportunitiesSection() {
  const { opportunities, mutate, isLoading } = useOpportunities();
  const [addOpen, setAddOpen] = useState(false);
  const [promoteOpp, setPromoteOpp] = useState<OpportunityRow | null>(null);
  const [lostOpp, setLostOpp] = useState<OpportunityRow | null>(null);
  const [advanceOpp, setAdvanceOpp] = useState<OpportunityRow | null>(null);

  const openOpps = opportunities.filter(o => o.status === "open");
  openOpps.sort((a, b) => {
    const ad = a.expected_close_date ?? "9999-12-31";
    const bd = b.expected_close_date ?? "9999-12-31";
    if (ad !== bd) return ad < bd ? -1 : 1;
    return b.opportunity_date.localeCompare(a.opportunity_date);
  });

  return (
    <>
      <OpportunityCockpitStrip opportunities={opportunities} />

      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            Opportunities
            <span className="text-xs rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-400">{openOpps.length}</span>
          </h2>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Opportunity
          </Button>
        </div>

        {isLoading ? (
          <div className="text-sm text-zinc-500">Loading…</div>
        ) : openOpps.length === 0 ? (
          <div className="text-sm text-zinc-500 italic">
            No open opportunities. Log a listing appointment, buyer prospect call, or referral to start tracking your pre-pipeline activity.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {openOpps.map(o => (
              <OpportunityCard
                key={`${o.opportunity_type}:${o.id}`}
                opp={o}
                onPromote={setPromoteOpp}
                onLost={setLostOpp}
                onAdvanceStage={setAdvanceOpp}
                onOddsChange={async (opp, newOdds) => {
                  await persistOdds(opp, newOdds);
                  await mutate();
                }}
              />
            ))}
          </div>
        )}
      </section>

      <AddOpportunityDialog open={addOpen} onClose={() => setAddOpen(false)} onAdded={() => mutate()} />
      <PromoteOpportunityDialog opp={promoteOpp} onClose={() => setPromoteOpp(null)} onPromoted={() => mutate()} />
      <LostOpportunityDialog opp={lostOpp} onClose={() => setLostOpp(null)} onMarked={() => mutate()} />
      <AdvanceStageDialog opp={advanceOpp} onClose={() => setAdvanceOpp(null)} onAdvanced={() => mutate()} />
    </>
  );
}

async function persistOdds(opp: OpportunityRow, odds: number): Promise<void> {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  if (opp.opportunity_type === "listing_appointment") {
    await supabase.from("listing_appointments").update({ close_odds_pct: odds }).eq("id", opp.id);
  } else if (opp.opportunity_type === "buyer_prospect") {
    await supabase.from("pipeline_deals").update({ probability_override: odds }).eq("id", opp.id);
  } else {
    await supabase.from("referral_opportunities").update({ close_odds_pct: odds }).eq("id", opp.id);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/(app)/pipeline/components/opportunity-card.tsx apps/web/app/(app)/pipeline/components/opportunities-section.tsx
git commit -m "feat(pipeline): Opportunities section + card

New top-of-page section above In Motion/On Deck/Check In. Cards show
type icon, title, price, est GCI, inline-editable close odds %, and
type-specific action buttons. Inline odds edit persists on blur to the
appropriate source table (no edge function needed for the edit — it's
a single-table UPDATE).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 15: Add Opportunity dialog (3-tab segmented)

**Files:**
- Create: `apps/web/app/(app)/pipeline/components/add-opportunity-dialog.tsx`

- [ ] **Step 1: Implement the dialog**

Implement a controlled `Dialog` (use the existing shadcn `Dialog` primitive — find it via `grep -r "DialogContent" apps/web/components/ui/`). Three tabs using the existing `Tabs` primitive: Listing Appointment / Buyer Prospect / Referral. Fields per the spec §3.3. Submit writes directly via supabase client to the respective table; on success, calls `onAdded()` and closes the dialog. Form validation in pure component state (no extra library).

A complete reference implementation:

```tsx
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type Mode = "listing_appointment" | "buyer_prospect" | "referral";

export function AddOpportunityDialog({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const [mode, setMode] = useState<Mode>("listing_appointment");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // shared
  const [estPrice, setEstPrice] = useState<string>("");
  const [estCommission, setEstCommission] = useState<string>("2.5");
  const [oddsPct, setOddsPct] = useState<string>("40");
  const [expectedCloseDate, setExpectedCloseDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // listing
  const [propertyAddress, setPropertyAddress] = useState<string>("");
  const [appointmentDate, setAppointmentDate] = useState<string>(new Date().toISOString().slice(0,10));

  // buyer (uses estPrice etc.)
  const [buyerClientId, setBuyerClientId] = useState<string>("");

  // referral
  const [referredPersonName, setReferredPersonName] = useState<string>("");
  const [referrerName, setReferrerName] = useState<string>("");
  const [referralType, setReferralType] = useState<"seller"|"buyer"|"unknown">("unknown");

  const supabase = createClient();

  function setModeAndDefaults(m: Mode) {
    setMode(m);
    if (m === "listing_appointment") setOddsPct("40");
    else if (m === "buyer_prospect") setOddsPct("25");
    else setOddsPct("20");
  }

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const commonNums = {
        estimated_price: estPrice ? Number(estPrice) : null,
        estimated_commission_pct: Number(estCommission) / 100,
        close_odds_pct: Number(oddsPct) / 100,
        expected_close_date: expectedCloseDate || null,
        notes: notes || null,
      };

      if (mode === "listing_appointment") {
        const { error } = await supabase.from("listing_appointments").insert({
          user_id: user.id,
          appointment_date: appointmentDate,
          property_address: propertyAddress || null,
          estimated_list_price: commonNums.estimated_price,
          estimated_commission_pct: commonNums.estimated_commission_pct,
          close_odds_pct: commonNums.close_odds_pct,
          expected_close_date: commonNums.expected_close_date,
          status: "scheduled",
          notes: commonNums.notes,
        });
        if (error) throw error;
      } else if (mode === "buyer_prospect") {
        if (!buyerClientId) throw new Error("Buyer prospect requires a client");
        const { error } = await supabase.from("pipeline_deals").insert({
          user_id: user.id,
          address: "",
          estimated_price: commonNums.estimated_price ?? 0,
          estimated_commission_pct: commonNums.estimated_commission_pct,
          side: "buyer",
          stage: "lead",
          expected_close_date: commonNums.expected_close_date,
          client_id: buyerClientId,
          probability_override: commonNums.close_odds_pct,
          notes: commonNums.notes ?? "",
        });
        if (error) throw error;
      } else {
        if (!referredPersonName.trim()) throw new Error("Referred person name required");
        const { error } = await supabase.from("referral_opportunities").insert({
          user_id: user.id,
          referred_person_name: referredPersonName.trim(),
          referrer_name: referrerName || null,
          referral_type: referralType,
          estimated_price: commonNums.estimated_price,
          estimated_commission_pct: commonNums.estimated_commission_pct,
          close_odds_pct: commonNums.close_odds_pct,
          expected_close_date: commonNums.expected_close_date,
          status: "open",
          notes: commonNums.notes,
        });
        if (error) throw error;
      }
      onAdded();
      onClose();
    } catch (e: any) {
      setErr(e.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Opportunity</DialogTitle></DialogHeader>
        <Tabs value={mode} onValueChange={(v) => setModeAndDefaults(v as Mode)}>
          <TabsList>
            <TabsTrigger value="listing_appointment">Listing Appointment</TabsTrigger>
            <TabsTrigger value="buyer_prospect">Buyer Prospect</TabsTrigger>
            <TabsTrigger value="referral">Referral</TabsTrigger>
          </TabsList>

          <TabsContent value="listing_appointment" className="space-y-3 mt-3">
            <Field label="Appointment date"><Input type="date" value={appointmentDate} onChange={e => setAppointmentDate(e.target.value)} /></Field>
            <Field label="Property address"><Input value={propertyAddress} onChange={e => setPropertyAddress(e.target.value)} /></Field>
            {sharedFields()}
          </TabsContent>

          <TabsContent value="buyer_prospect" className="space-y-3 mt-3">
            <Field label="Client ID"><Input value={buyerClientId} onChange={e => setBuyerClientId(e.target.value)} placeholder="UUID — replace with combobox in follow-up" /></Field>
            {sharedFields()}
          </TabsContent>

          <TabsContent value="referral" className="space-y-3 mt-3">
            <Field label="Referred person name *"><Input value={referredPersonName} onChange={e => setReferredPersonName(e.target.value)} /></Field>
            <Field label="Referrer name"><Input value={referrerName} onChange={e => setReferrerName(e.target.value)} /></Field>
            <Field label="Referral type">
              <select value={referralType} onChange={e => setReferralType(e.target.value as any)} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1">
                <option value="unknown">Unknown</option>
                <option value="seller">Seller</option>
                <option value="buyer">Buyer</option>
              </select>
            </Field>
            {sharedFields()}
          </TabsContent>
        </Tabs>

        {err && <div className="text-red-400 text-sm">{err}</div>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  function sharedFields() {
    return (
      <>
        <Field label="Estimated price"><Input type="number" value={estPrice} onChange={e => setEstPrice(e.target.value)} /></Field>
        <Field label="Estimated commission %"><Input type="number" step="0.1" value={estCommission} onChange={e => setEstCommission(e.target.value)} /></Field>
        <Field label="Close odds %"><Input type="number" min="0" max="100" value={oddsPct} onChange={e => setOddsPct(e.target.value)} /></Field>
        <Field label="Expected close date"><Input type="date" value={expectedCloseDate} onChange={e => setExpectedCloseDate(e.target.value)} /></Field>
        <Field label="Notes"><Textarea value={notes} onChange={e => setNotes(e.target.value)} /></Field>
      </>
    );
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 items-center">
      <Label className="col-span-1 text-sm text-zinc-400">{label}</Label>
      <div className="col-span-2">{children}</div>
    </div>
  );
}
```

NOTE: the buyer-prospect client picker uses raw UUID input as a v1 placeholder. A combobox is a follow-up (low risk — find existing combobox component in the codebase via `grep -r "Combobox" apps/web/components/`). Spec calls it out; UX is unblocked because the realtor can also create a pipeline_deal directly from the existing client detail page if needed.

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/(app)/pipeline/components/add-opportunity-dialog.tsx
git commit -m "feat(pipeline): Add Opportunity dialog (3-tab: listing/buyer/referral)

Defaults are realtor-tuned: 40% listing appt, 25% buyer prospect,
20% referral. Writes directly via supabase client to the appropriate
source table; closes + refreshes the list on success.

Buyer-prospect client picker is a v1 UUID input — combobox is a
follow-up.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 16: Promote, Lost, and Advance-Stage dialogs

**Files:**
- Create: `apps/web/app/(app)/pipeline/components/promote-opportunity-dialog.tsx`
- Create: `apps/web/app/(app)/pipeline/components/lost-opportunity-dialog.tsx`
- Create: `apps/web/app/(app)/pipeline/components/advance-stage-dialog.tsx`

Each calls the `opportunity-promote` edge function deployed in Task 11.

- [ ] **Step 1: Lost dialog**

```tsx
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { OPPORTUNITY_LOSS_REASONS, lossReasonLabel } from "@agent-runway/core/lib/opportunity-loss-reasons";
import type { OpportunityRow } from "@agent-runway/core/engines/opportunity-conversion-engine";

export function LostOpportunityDialog({ opp, onClose, onMarked }: { opp: OpportunityRow | null; onClose: () => void; onMarked: () => void }) {
  const [reason, setReason] = useState<string>("chose_other_agent");
  const [notes, setNotes] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!opp) return;
    setBusy(true); setErr(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/opportunity-promote`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session?.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "mark_lost",
          opportunity_id: opp.id,
          opportunity_source: opp.opportunity_type,
          lost_reason: reason,
          notes: notes || undefined,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? `HTTP ${res.status}`);
      }
      onMarked();
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const notesRequired = reason === "other";

  return (
    <Dialog open={!!opp} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Mark as Lost</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-sm">Reason</Label>
            <select value={reason} onChange={e => setReason(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1">
              {OPPORTUNITY_LOSS_REASONS.map(r => (
                <option key={r} value={r}>{lossReasonLabel(r)}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-sm">Notes {notesRequired && <span className="text-red-400">*</span>}</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          {err && <div className="text-red-400 text-sm">{err}</div>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={submit} disabled={busy || (notesRequired && !notes.trim())}>
            {busy ? "Marking…" : "Mark Lost"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Promote dialog (handles listing + referral)**

```tsx
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { OpportunityRow } from "@agent-runway/core/engines/opportunity-conversion-engine";

export function PromoteOpportunityDialog({ opp, onClose, onPromoted }: { opp: OpportunityRow | null; onClose: () => void; onPromoted: () => void }) {
  const [target, setTarget] = useState<"listing_appointment" | "buyer_prospect">("buyer_prospect");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!opp) return null;
  const isReferral = opp.opportunity_type === "referral";

  async function submit() {
    if (!opp) return;
    setBusy(true); setErr(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const body: any = {
        action: "promote",
        opportunity_id: opp.id,
        opportunity_source: opp.opportunity_type,
      };
      if (isReferral) body.target = target;

      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/opportunity-promote`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? `HTTP ${res.status}`);
      }
      onPromoted();
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!opp} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Promote Opportunity</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          {opp.opportunity_type === "listing_appointment" ? (
            <p>This creates a seller-side pipeline deal carrying the listing appointment data (price, commission %, expected close date). The listing appointment will be marked active.</p>
          ) : (
            <>
              <p>This converts the referral into a real pipeline entity. Choose which:</p>
              <label className="flex items-center gap-2"><input type="radio" checked={target==="buyer_prospect"} onChange={() => setTarget("buyer_prospect")} /> Buyer prospect (creates a pipeline deal, side=buyer)</label>
              <label className="flex items-center gap-2"><input type="radio" checked={target==="listing_appointment"} onChange={() => setTarget("listing_appointment")} /> Listing appointment (creates a listing appt for follow-up)</label>
            </>
          )}
          {err && <div className="text-red-400">{err}</div>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Promoting…" : "Promote"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Advance-stage dialog (buyer prospects only)**

```tsx
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { OpportunityRow } from "@agent-runway/core/engines/opportunity-conversion-engine";

export function AdvanceStageDialog({ opp, onClose, onAdvanced }: { opp: OpportunityRow | null; onClose: () => void; onAdvanced: () => void }) {
  const [stage, setStage] = useState<"offer"|"conditional"|"firm">("offer");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string|null>(null);

  if (!opp) return null;

  async function submit() {
    if (!opp) return;
    setBusy(true); setErr(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/opportunity-promote`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "advance_stage", pipeline_deal_id: opp.id, stage }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? `HTTP ${res.status}`);
      }
      onAdvanced();
      onClose();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={!!opp} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Advance Buyer Prospect</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p>This buyer has progressed. Advance to:</p>
          <label className="flex items-center gap-2"><input type="radio" checked={stage==="offer"}       onChange={() => setStage("offer")} />       Offer</label>
          <label className="flex items-center gap-2"><input type="radio" checked={stage==="conditional"} onChange={() => setStage("conditional")} /> Conditional</label>
          <label className="flex items-center gap-2"><input type="radio" checked={stage==="firm"}        onChange={() => setStage("firm")} />        Firm</label>
          {err && <div className="text-red-400">{err}</div>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Advancing…" : "Advance"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/(app)/pipeline/components/promote-opportunity-dialog.tsx apps/web/app/(app)/pipeline/components/lost-opportunity-dialog.tsx apps/web/app/(app)/pipeline/components/advance-stage-dialog.tsx
git commit -m "feat(pipeline): Promote / Lost / Advance-Stage dialogs

All three call opportunity-promote edge function. Promote handles
listing→pipeline_deal and referral→(listing|pipeline_deal). Lost
validates the 8-value loss-reasons enum and requires notes for 'other'.
Advance Stage is buyer-prospect-only (offer|conditional|firm).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 17: Mount OpportunitiesSection into the Pipeline tab

**Files:**
- Modify: `apps/web/app/(app)/pipeline/pipeline-content.tsx`

- [ ] **Step 1: Read existing component to find insertion point**

```bash
cat apps/web/app/(app)/pipeline/pipeline-content.tsx | head -40
```
Locate the JSX root and the place above the existing "In Motion" section.

- [ ] **Step 2: Add the section**

At the top of the imports:
```tsx
import { OpportunitiesSection } from "./components/opportunities-section";
```
At the top of the rendered children, before the existing dollar-value strip / In Motion section:
```tsx
<OpportunitiesSection />
```
Don't refactor anything else in this file. One feature, one session.

- [ ] **Step 3: Local smoke via dev server**

```bash
cd apps/web
pnpm dev
```
In another terminal, open `http://localhost:3000/pipeline` (via Claude-in-Chrome MCP per `feedback_use_chrome_extension.md`). Confirm:
- Cockpit strip renders with 4 stats (Open count, Weighted GCI, Conversion %, Loss Rate)
- Opportunities section appears above existing sections
- Empty state shows when no rows
- Click "Add Opportunity" → dialog opens → submit a listing appt with $400K price 60% odds → row appears in section
- Click the row's odds % → editable → change to 80% → blur → persists (refresh confirms)
- Click "Promote" → confirms → row leaves the section
- Click "Lost" on another row → reason dropdown → submit → row leaves

Use Claude-in-Chrome to take screenshots at each step and confirm visually.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/(app)/pipeline/pipeline-content.tsx
git commit -m "feat(pipeline): mount OpportunitiesSection at top of Pipeline tab

End-to-end pre-pipeline tracking is now visible. Existing In Motion/On
Deck/Check In sections untouched.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase E — Dispatcher persona integration (ai-flight-crew-champion)

### Task 18: opportunities MCP tools

**Files:**
- Create: `apps/web/supabase/functions/mcp-server/tools/opportunities.ts`
- Modify: `apps/web/supabase/functions/mcp-server/index.ts` (register tools)

- [ ] **Step 1: Inspect existing MCP tool pattern**

```bash
cat apps/web/supabase/functions/mcp-server/tools/pipeline.ts | head -80
cat apps/web/supabase/functions/mcp-server/index.ts | grep -A 5 "tools/"
```
Match the export shape (each tool exports `{ name, description, inputSchema, handler }`).

- [ ] **Step 2: Implement tools**

```ts
// apps/web/supabase/functions/mcp-server/tools/opportunities.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VALID_LOSS_REASONS = [
  "chose_other_agent","decided_not_to_transact","price_disagreement",
  "timing_deferred","out_of_area","financing_fell_through","lost_contact","other",
];

export const listOpportunities = {
  name: "list_opportunities",
  description: "List the user's pre-transactional opportunities (listing appointments, buyer prospects, referrals). Optionally filter by type or status. Returns rows + KPI summary (open count, weighted GCI, conversion %, loss rate, top loss reasons).",
  inputSchema: {
    type: "object",
    properties: {
      type:   { type: "string", enum: ["listing_appointment","buyer_prospect","referral"] },
      status: { type: "string", enum: ["open","converted","lost"] },
    },
  },
  handler: async (input: { type?: string; status?: string }, authHeader: string) => {
    const supabase = makeClient(authHeader);
    let q = supabase.from("opportunities_v").select("*");
    if (input.type)   q = q.eq("opportunity_type", input.type);
    if (input.status) q = q.eq("status", input.status);
    const { data, error } = await q.order("opportunity_date", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  },
};

export const createOpportunity = {
  name: "create_opportunity",
  description: "Log a new pre-transactional opportunity. Type determines which table receives the row.",
  inputSchema: {
    type: "object",
    required: ["type", "name"],
    properties: {
      type:                     { type: "string", enum: ["listing_appointment","buyer_prospect","referral"] },
      name:                     { type: "string", description: "Property address for listing appts; client name for buyer prospects; referred person name for referrals." },
      estimated_price:          { type: "number" },
      estimated_commission_pct: { type: "number", description: "0..1 decimal (0.025 = 2.5%)" },
      close_odds_pct:           { type: "number", description: "0..1 decimal (0.60 = 60%)" },
      expected_close_date:      { type: "string", description: "YYYY-MM-DD" },
      appointment_date:         { type: "string", description: "YYYY-MM-DD; listing_appointment only" },
      client_id:                { type: "string", description: "UUID; required for buyer_prospect" },
      referrer_name:            { type: "string", description: "Referral only" },
      referral_type:            { type: "string", enum: ["seller","buyer","unknown"], description: "Referral only" },
      notes:                    { type: "string" },
    },
  },
  handler: async (input: any, authHeader: string) => {
    const supabase = makeClient(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("not signed in");

    if (input.type === "listing_appointment") {
      const { data, error } = await supabase.from("listing_appointments").insert({
        user_id: user.id,
        appointment_date: input.appointment_date ?? new Date().toISOString().slice(0,10),
        property_address: input.name,
        estimated_list_price: input.estimated_price ?? null,
        estimated_commission_pct: input.estimated_commission_pct ?? 0.025,
        close_odds_pct: input.close_odds_pct ?? null,
        expected_close_date: input.expected_close_date ?? null,
        status: "scheduled",
        notes: input.notes ?? null,
      }).select("id").single();
      if (error) throw new Error(error.message);
      return { id: data.id, type: input.type };
    }
    if (input.type === "buyer_prospect") {
      if (!input.client_id) throw new Error("buyer_prospect requires client_id");
      const { data, error } = await supabase.from("pipeline_deals").insert({
        user_id: user.id,
        address: "",
        estimated_price: input.estimated_price ?? 0,
        estimated_commission_pct: input.estimated_commission_pct ?? 0.025,
        side: "buyer",
        stage: "lead",
        expected_close_date: input.expected_close_date ?? null,
        client_id: input.client_id,
        client_name: input.name,
        probability_override: input.close_odds_pct ?? null,
        notes: input.notes ?? "",
      }).select("id").single();
      if (error) throw new Error(error.message);
      return { id: data.id, type: input.type };
    }
    // referral
    const { data, error } = await supabase.from("referral_opportunities").insert({
      user_id: user.id,
      referred_person_name: input.name,
      referrer_name: input.referrer_name ?? null,
      referral_type: input.referral_type ?? "unknown",
      estimated_price: input.estimated_price ?? null,
      estimated_commission_pct: input.estimated_commission_pct ?? 0.025,
      close_odds_pct: input.close_odds_pct ?? 0.20,
      expected_close_date: input.expected_close_date ?? null,
      status: "open",
      notes: input.notes ?? null,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: data.id, type: "referral" };
  },
};

export const promoteOpportunity = {
  name: "promote_opportunity",
  description: "Promote a listing appointment or referral to a pipeline deal (or listing appointment, for referrals).",
  inputSchema: {
    type: "object",
    required: ["opportunity_id","opportunity_source"],
    properties: {
      opportunity_id:     { type: "string" },
      opportunity_source: { type: "string", enum: ["listing_appointment","referral"] },
      target:             { type: "string", enum: ["listing_appointment","buyer_prospect"], description: "Required for referrals" },
    },
  },
  handler: async (input: any, authHeader: string) => callPromoteFn({ action: "promote", ...input }, authHeader),
};

export const markOpportunityLost = {
  name: "mark_opportunity_lost",
  description: "Mark an opportunity as lost with a structured reason from the 8-value vocabulary.",
  inputSchema: {
    type: "object",
    required: ["opportunity_id","opportunity_source","lost_reason"],
    properties: {
      opportunity_id:     { type: "string" },
      opportunity_source: { type: "string", enum: ["listing_appointment","buyer_prospect","referral"] },
      lost_reason:        { type: "string", enum: VALID_LOSS_REASONS },
      notes:              { type: "string", description: "Required when lost_reason='other'" },
    },
  },
  handler: async (input: any, authHeader: string) => {
    if (input.lost_reason === "other" && !input.notes?.trim()) throw new Error("notes required when lost_reason='other'");
    return callPromoteFn({ action: "mark_lost", ...input }, authHeader);
  },
};

function makeClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
}

async function callPromoteFn(body: any, authHeader: string) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/opportunity-promote`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}
```

- [ ] **Step 3: Register the tools in mcp-server index**

Open `apps/web/supabase/functions/mcp-server/index.ts`, find the tool-registry block (likely an array or `Map` of all tools), and add:
```ts
import { listOpportunities, createOpportunity, promoteOpportunity, markOpportunityLost } from "./tools/opportunities.ts";

// in the tool registry
listOpportunities, createOpportunity, promoteOpportunity, markOpportunityLost,
```

- [ ] **Step 4: Deploy updated mcp-server function**

```
mcp__e1609470-2dc8-4b83-acae-47fc64c0113b__deploy_edge_function
  project_id: wlxkvnbncfzkmxzexgxt
  name: mcp-server
  files: [...all existing files + the new tools/opportunities.ts + updated index.ts]
```
(Use `get_edge_function` first to fetch the current full file set, then add and redeploy.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/supabase/functions/mcp-server/tools/opportunities.ts apps/web/supabase/functions/mcp-server/index.ts
git commit -m "$(cat <<'EOF'
feat(flight-crew): 4 MCP tools for pre-transactional opportunities

list_opportunities, create_opportunity, promote_opportunity,
mark_opportunity_lost. All write paths delegate to the existing
opportunity-promote edge function (no logic duplication).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

### Task 19: Update Dispatcher system prompt

**Files:**
- Modify: `apps/web/lib/flight-crew/system-prompts.ts`

- [ ] **Step 1: Open the file and find the Dispatcher prompt block**

```bash
grep -n "Dispatcher\|DISPATCHER" apps/web/lib/flight-crew/system-prompts.ts
```

- [ ] **Step 2: Add the opportunities paragraph**

Insert into Dispatcher's domain instructions (under whatever heading covers tools/capabilities):

```
## Pre-Transactional Opportunities

You can log, promote, and close out pre-transactional opportunities. There are
three types:

- **Listing appointment** — a scheduled meeting with a prospective seller. Captured
  with a property address, appointment date, estimated list price, commission %,
  close odds (default 40%), and expected close date.
- **Buyer prospect** — a buyer with budget intent who hasn't yet made an offer.
  Requires a `client_id` (existing client record). Default close odds 25%.
- **Referral** — someone referred to the user who hasn't yet engaged. Captured with
  the referred person's name and optional referrer. Default close odds 20%.

Use these tools:
- `create_opportunity` to log a new one. Listen for utterances like "log a listing
  appointment for [name] [date] at [address], estimated [price], [odds]% odds."
- `list_opportunities` to summarize what's open or to compute KPIs.
- `promote_opportunity` when a listing appointment turns into a real deal, or when
  a referral becomes either a listing appt or a buyer prospect. For referrals you
  must pass `target` = "listing_appointment" or "buyer_prospect".
- `mark_opportunity_lost` when the opportunity is dead. Always pass a `lost_reason`
  from the 8-value vocabulary. If the reason is "other", capture notes.

When the user asks about conversion ratios, appointment-to-contract %, loss rate, or
top loss reasons, use `list_opportunities` and surface the KPI summary block.

DO NOT promote without explicit user confirmation when the user is being ambiguous
(e.g. "the McCluskey thing" could match several rows). Echo back the row title and
ask before executing the write.
```

- [ ] **Step 3: Local smoke**

Start the web app, open a Dispatcher chat, try the four canonical utterances from spec §4. Confirm each produces the right tool call and writes the right row.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/flight-crew/system-prompts.ts
git commit -m "$(cat <<'EOF'
feat(flight-crew): Dispatcher opportunities playbook in system prompt

Teaches Dispatcher to use the 4 new MCP tools for opportunity capture,
promotion, lifecycle. Includes a disambiguation guardrail (ask before
promoting on ambiguous matches).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Phase F — Verification + ship

### Task 20: Full test + typecheck + dashboard-math sanity

**Files:** None (verification only).

- [ ] **Step 1: Full repo test suite**

```bash
cd "/Users/b/Desktop/Agent Runway Website/Project Home/02 - Web App Code/agentrunway-web/worktrees/pipeline-pre-tx"
pnpm turbo test
```
Expected: all green.

- [ ] **Step 2: Typecheck with cache bust**

```bash
cd apps/web
pnpm install --frozen-lockfile
npx tsc --noEmit
cd ../..
```
Expected: no errors.

- [ ] **Step 3: Dashboard-math sanity check**

Open the dashboard for the seeded test user and screenshot the Pipeline Weighted card BEFORE and AFTER inserting a few opportunities. Note the deltas. Confirm:
- BEFORE adding any new rows: number is identical to pre-feature state (engine swap preserves existing behavior).
- AFTER adding new opportunities: increases match `Σ(estimated_price × commission % × effective_odds)` of newly inserted rows.

If the BEFORE number drifted, STOP — route to dashboard-integrity-champion (this means the engine swap broke parity, not by design).

- [ ] **Step 4: Pre-edit grep sweep (CLAUDE.md checkpoint 1)**

```bash
grep -rn "listing_appointments\b" apps/web/app apps/web/lib apps/web/supabase | grep -v node_modules
grep -rn "LISTING_PROBABILITIES\|BUYER_PROBABILITIES" packages/core
grep -rn "PIPELINE_STAGE_DEFAULTS" apps/web packages/core
```
Read each hit. If anywhere computes "weighted opportunity GCI" outside the engine and inline-sums probability * price, that's a sibling instance — fix in this PR.

- [ ] **Step 5: Post-fix grep sweep (CLAUDE.md checkpoint 5)**

Same greps as Step 4 — confirm zero remaining sibling instances of inline opportunity weighting.

### Task 21: PR + post-ship findings

**Files:**
- Create: `/Users/b/.claude/projects/-Users-b-Desktop-Agent-Runway-Website-Project-Home-02---Web-App-Code/memory/findings/pipeline_pre_tx_v1_shipped_2026-06-30.md`
- Create: `/Users/b/.claude/projects/-Users-b-Desktop-Agent-Runway-Website-Project-Home-02---Web-App-Code/memory/findings/pipeline_pre_tx_mobile_parity_open.md`
- Modify: `/Users/b/.claude/projects/-Users-b-Desktop-Agent-Runway-Website-Project-Home-02---Web-App-Code/memory/project_pipeline_overhaul.md`

- [ ] **Step 1: Push branch and open PR**

```bash
git push -u origin feat/pipeline-pre-transactional
gh pr create --title "feat(pipeline): pre-transactional Opportunities tier" --body "$(cat <<'EOF'
## Summary

Adds a pre-transactional Opportunities tier to the Pipeline tab covering listing appointments, buyer prospects, and referrals. Each has explicit close odds, a one-click Promote-to-pipeline-deal path, and a structured Lost workflow with an 8-value reasons vocabulary. New KPIs land on the Pipeline cockpit-strip: Open count, Weighted Pre-Contract GCI, Appointment→Contract conversion %, and Loss Rate with top reasons inline. Full Dispatcher persona integration (4 new MCP tools).

## What changed

- 4 migrations (00153–00156): extend listing_appointments, add 'lost' to pipeline_stage + lost_reason, new referral_opportunities table, opportunities_v unified view
- New `opportunity-conversion-engine.ts` (pure functions; 15 unit tests)
- `pipeline-forecast-engine.ts` rewired to honor user-set close_odds_pct (existing-data behavior preserved bit-for-bit) and accept referral opportunities as a fourth input source
- New `opportunity-promote` edge function — atomic listing→deal, referral→(listing|deal), advance-stage, mark-lost
- New Opportunities section + cockpit strip + 4 dialogs (Add / Promote / Lost / Advance Stage) on the Pipeline tab
- 4 new MCP tools wired into Dispatcher
- Dispatcher system prompt updated with the opportunities playbook

## Out of scope (v1)

- Mobile parity (web schema, RLS, MCP tools are mobile-equal — only UI deferred)
- Buyer-prospect client picker is a UUID input v1; combobox is a follow-up
- Forecast accuracy on opportunities (`original_estimated_price` already exists on pipeline_deals — promote carries it forward)

## Test plan

- [ ] Unit tests: `pnpm vitest run` (all green)
- [ ] Typecheck: `pnpm install --frozen-lockfile && npx tsc --noEmit` (clean)
- [ ] Manual smoke via Claude-in-Chrome: Add → Promote → Lost flows; cockpit-strip KPIs update
- [ ] Dispatcher: 4 example utterances each produce the right tool call
- [ ] Dashboard-math: Pipeline Weighted card unchanged for pre-existing rows; delta on new rows matches engine math

Spec: [docs/superpowers/specs/2026-06-30-pipeline-pre-transactional-opportunities-design.md]
Plan: [docs/superpowers/plans/2026-06-30-pipeline-pre-transactional-opportunities.md]

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Write findings**

`memory/findings/pipeline_pre_tx_v1_shipped_2026-06-30.md`:
```markdown
---
type: finding
date: 2026-06-30
status: open
source: crm-champion
---

# Pre-transactional Pipeline Opportunities v1 shipped

PR: #<fill in after open>

## What landed
- 4 migrations (00153–00156)
- `opportunity-conversion-engine.ts` + 15 tests
- `pipeline-forecast-engine.ts` rewired (existing behavior preserved when close_odds_pct IS NULL)
- `opportunity-promote` edge function (3 actions: promote, advance_stage, mark_lost)
- Opportunities section + 4 dialogs on Pipeline tab
- 4 Dispatcher MCP tools + system prompt update

## Dashboard math delta on shipped data
- BEFORE: Pipeline Weighted = $<fill>
- AFTER (post-deploy, before any new opps logged): $<fill> — identical confirms bit-for-bit preservation

## Open follow-ups
- Mobile parity (see pipeline_pre_tx_mobile_parity_open)
- Buyer-prospect combobox (UUID input is v1 placeholder)
- Forecast accuracy reporting on promoted opportunities

## Files
- apps/web/supabase/migrations/00153-00156
- packages/core/engines/opportunity-conversion-engine.ts
- packages/core/lib/opportunity-loss-reasons.ts
- apps/web/supabase/functions/opportunity-promote/
- apps/web/supabase/functions/mcp-server/tools/opportunities.ts
- apps/web/app/(app)/pipeline/components/{opportunity-card,opportunities-section,opportunity-cockpit-strip,add-opportunity-dialog,promote-opportunity-dialog,lost-opportunity-dialog,advance-stage-dialog}.tsx
- apps/web/app/(app)/pipeline/hooks/use-opportunities.ts
- apps/web/lib/flight-crew/system-prompts.ts
```

`memory/findings/pipeline_pre_tx_mobile_parity_open.md`:
```markdown
---
type: finding
date: 2026-06-30
status: open
source: mobile-app-champion
---

# Pre-transactional Opportunities — mobile parity open

Web v1 shipped 2026-06-30 (PR #<fill>). Mobile is a natural capture surface:
- "Log a listing appointment" while driving home from one
- Voice-first capture works well for the 4 main fields (address, price, odds, notes)
- View open opportunities in a swipe list; swipe-right to Promote, swipe-left to Lost

## Backlog
1. Read-only opportunities list on Pipeline screen
2. Quick-add modal (matches web AddOpportunityDialog 3-tab structure)
3. Swipe actions for Promote / Lost
4. Voice capture intent ("log listing appt for…")

Web schema + RLS + MCP tools are mobile-equal. No backend work needed — only React Native UI.
```

- [ ] **Step 3: Update memory/project_pipeline_overhaul.md**

Open the existing file. Append:

```markdown

---

## Status update 2026-06-30: v1 SHIPPED

PR: #<fill>. See findings/pipeline_pre_tx_v1_shipped_2026-06-30.md.

Still open:
- Mobile parity (see findings/pipeline_pre_tx_mobile_parity_open.md)
- Forecast accuracy on promoted opportunities (downstream of v1)
```

- [ ] **Step 4: Commit findings + memory update**

These files live in the user-scoped memory directory, NOT in the repo. They're written directly via the Write tool, not committed to git.

---

## Self-Review

**Spec coverage (against `docs/superpowers/specs/2026-06-30-pipeline-pre-transactional-opportunities-design.md`):**

| Spec section | Task(s) |
|---|---|
| §1.1 listing_appointments extensions | Task 1 |
| §1.2 pipeline_deals extensions | Task 2 |
| §1.3 referral_opportunities | Task 3 |
| §1.4 loss reasons vocabulary | Task 6 |
| §1.5 opportunities_v view | Task 4 |
| §2.1 opportunity-conversion-engine | Tasks 7, 8, 9 |
| §2.2 pipeline-forecast-engine wiring + guardrail | Task 10 |
| §3.1 cockpit-strip | Task 13 |
| §3.2 Opportunities section | Task 14 |
| §3.3 Add Opportunity dialog | Task 15 |
| §3.4 Promote dialog | Task 16 |
| §3.5 Lost dialog | Task 16 |
| §4 Dispatcher MCP tools | Task 18 |
| §4 Dispatcher prompt | Task 19 |
| §5 Migration order | Tasks 1–5 |
| §6 Tests (engine + view + edge fn + UI smoke + dispatcher) | Tasks 6–10, 17, 19, 20 |
| §7 Worktree + branch | Task 0 |
| Risks: dashboard-math delta sanity | Task 20 Step 3 |

**Placeholder scan:** Searched for "TBD", "TODO", "fill in later", "implement appropriate". None remain. Two `<fill>` markers exist in PR/findings templates — those are correct (the engineer fills the PR number after `gh pr create` returns it).

**Type consistency:**
- `OpportunityRow` used identically in engine, hook, components, cockpit strip
- `OpportunityType` enum used consistently ("listing_appointment" / "buyer_prospect" / "referral")
- Loss-reasons vocabulary identical across migrations 00153/00154/00155, library, edge function, MCP tool
- Edge function action enum ("promote" / "advance_stage" / "mark_lost") matches all four UI dialogs and MCP tool callers
