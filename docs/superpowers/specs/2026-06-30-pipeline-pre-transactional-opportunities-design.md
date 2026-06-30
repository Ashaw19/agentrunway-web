# Design: Pre-Transactional Pipeline Opportunities

**Date:** 2026-06-30
**Surface:** Pipeline tab (`/pipeline`), Dispatcher persona, Pipeline Weighted dashboard card
**Status:** Approved by Andrew Shaw 2026-06-30 (Q1=A unified-via-view, Q2=A one-weighted-card; remaining design decisions delegated to Claude with instruction "finish the job without my input — think like a realtor, optimize for conversion-ratio insight")
**Memory refs:** `project_pipeline_overhaul.md`, `project_flight_status_redesign.md`, `feedback_repeat_clients_metric.md`, `feedback_data_consistency_protocol.md`, `product_ai_first_principle.md`, `project_mobile_vs_web_scope_policy.md`

---

## Purpose

Give realtors a structured way to log pre-transactional activity — listing appointments, buyer-prospect calls, and referral leads — with explicit close odds, a one-click path to a real pipeline deal, and a structured "lost" workflow. The two ratios this surface exists to expose are:

1. **Appointment → Contract conversion %** (trailing 90d, YTD) — the leading indicator of how good a realtor is at converting opportunities into business.
2. **Loss rate + top loss reasons** — the diagnostic that explains *why* opportunities don't convert.

Both ratios are invisible today because pre-transactional rows either don't exist (referrals), live as orphan rows under generic statuses (buyer prospects masked as `pipeline_deals.stage='lead'`), or have a status flow without structured "lost reasons" (`listing_appointments`).

---

## What Is NOT in Scope

- **Mobile parity for v1.** Per `project_mobile_vs_web_scope_policy.md`, capture-and-respond fits mobile beautifully (log a listing appt voice-first while driving home). v1 ships web-only; mobile follows in a dedicated session. The web schema, RLS, MCP tools, and engine are mobile-equal — only the UI surface waits.
- **A new "Opportunities" tab.** Pre-transactional activity surfaces as a section on the existing Pipeline tab — not a new top-level tab. This protects the daily-touchpoint flow (`feedback_crm_daily_touchpoint.md`).
- **Renaming or migrating `listing_appointments` / `pipeline_deals`.** Both tables stay as canonical sources of their respective shapes. Unification happens at the read layer (a SQL view) and the engine layer.
- **Auto-promotion.** No cron, no "if odds > 75% promote automatically." Every promote is user-initiated.
- **Forecast accuracy tracking on opportunities.** That metric already exists on `pipeline_deals` via `original_estimated_price` (migration 00084). Opportunities promote *into* pipeline_deals — once promoted, accuracy tracking is the downstream concern.
- **Referrer payment / commission split tracking.** A referral-source `referrer_name` + optional `referrer_client_id` are captured for context only. Referral payouts are a future T2125 / corporate-finance concern.
- **Re-opening a lost opportunity.** Lost is terminal in v1. Reopening would be a new opportunity (with notes referencing the prior).

---

## Architecture

### 1. Data model

**Decision rule:** extend existing tables in place where the shape fits; add one new table where the shape doesn't fit; unify all three at a SQL view layer (`opportunities_v`).

#### 1.1 `listing_appointments` extensions

Add three columns (migration `00153_listing_appointments_opportunity_fields.sql`):

| Column | Type | Default | Purpose |
|---|---|---|---|
| `close_odds_pct` | `numeric(5,4)` | `NULL` | User-set probability 0.0000–1.0000. NULL = engine falls back to current stage-default behavior. |
| `lost_reason` | `text` | `NULL` | Constrained by CHECK to the loss-reasons enum (see §1.4). NOT NULL when `status='lost'`. |
| `converted_to_pipeline_deal_id` | `uuid` | `NULL` | FK → `pipeline_deals(id) ON DELETE SET NULL`. Set on promote. |

No RLS change needed (existing `Users manage own listing appointments` policy from migration 00048 already covers these columns).

CHECK constraint: `(status <> 'lost' OR lost_reason IS NOT NULL)`.

#### 1.2 `pipeline_deals` extensions

Add `lost` to the `pipeline_stage` enum and add a `lost_reason` column (migration `00154_pipeline_deals_lost_stage_and_reason.sql`):

```sql
ALTER TYPE pipeline_stage ADD VALUE IF NOT EXISTS 'lost';
ALTER TABLE pipeline_deals
  ADD COLUMN IF NOT EXISTS lost_reason text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lost_at timestamptz DEFAULT NULL;
```

CHECK constraint added in same migration: `(stage <> 'lost' OR (lost_reason IS NOT NULL AND lost_at IS NOT NULL))`.

`pipeline_stage` probability defaults (`packages/core/types/database.ts:18-25`) are extended with `lost: 0.0`. Engines already short-circuit non-active rows; this is for explicitness.

#### 1.3 New table — `referral_opportunities`

Referrals don't fit either existing table shape. New table (migration `00155_referral_opportunities.sql`):

```sql
CREATE TABLE referral_opportunities (
  id                              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                         uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- The referred-to person (the lead).
  referred_person_name            text          NOT NULL,
  client_id                       uuid          REFERENCES clients(id) ON DELETE SET NULL,

  -- The referrer (free text + optional FK if they're an existing client).
  referrer_name                   text,
  referrer_client_id              uuid          REFERENCES clients(id) ON DELETE SET NULL,

  referral_date                   date          NOT NULL DEFAULT CURRENT_DATE,
  referral_type                   text          NOT NULL CHECK (referral_type IN ('seller','buyer','unknown')) DEFAULT 'unknown',

  estimated_price                 numeric(14,2),
  estimated_commission_pct        numeric(7,6)  DEFAULT 0.025000,
  close_odds_pct                  numeric(5,4)  DEFAULT 0.20,  -- referrals start low
  expected_close_date             date,

  notes                           text,

  status                          text          NOT NULL CHECK (status IN ('open','converted','lost')) DEFAULT 'open',
  lost_reason                     text,
  lost_at                         timestamptz,
  converted_at                    timestamptz,
  converted_to_pipeline_deal_id   uuid          REFERENCES pipeline_deals(id) ON DELETE SET NULL,
  converted_to_listing_appointment_id uuid      REFERENCES listing_appointments(id) ON DELETE SET NULL,

  created_at                      timestamptz   NOT NULL DEFAULT now(),
  updated_at                      timestamptz   NOT NULL DEFAULT now(),

  CHECK (status <> 'lost'      OR (lost_reason IS NOT NULL AND lost_at IS NOT NULL)),
  CHECK (status <> 'converted' OR converted_at IS NOT NULL)
);

ALTER TABLE referral_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own referral opportunities"
  ON referral_opportunities FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_referral_opps_user_id ON referral_opportunities(user_id);
CREATE INDEX idx_referral_opps_status  ON referral_opportunities(user_id, status);
CREATE INDEX idx_referral_opps_referrer_client ON referral_opportunities(referrer_client_id) WHERE referrer_client_id IS NOT NULL;
CREATE INDEX idx_referral_opps_client  ON referral_opportunities(client_id)          WHERE client_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
```

RLS in same migration. CLAUDE.md never-do honored.

#### 1.4 Loss reasons — single shared enum (text-CHECK, not Postgres enum)

To stay flexible and avoid `ALTER TYPE` ceremony when adding values, loss reasons are a shared text vocabulary enforced by CHECK constraints in each table's migration:

| Value | Display |
|---|---|
| `chose_other_agent` | Went with another agent |
| `decided_not_to_transact` | Decided not to sell/buy |
| `price_disagreement` | Couldn't agree on price |
| `timing_deferred` | Timing pushed to later |
| `out_of_area` | Outside my service area |
| `financing_fell_through` | Financing fell through |
| `lost_contact` | Lost contact |
| `other` | Other (notes required) |

The display strings and value→label mapping live in `packages/core/lib/opportunity-loss-reasons.ts` (NEW). All three tables CHECK against the same value list. UI dropdowns import from that file.

When `lost_reason='other'`, the `notes` field is required at the application layer (UI + MCP tool guard); DB CHECK enforces only that `lost_reason IS NOT NULL`.

#### 1.5 SQL view — `opportunities_v`

Single canonical read surface for pre-transactional opportunities. UNIONs the three tables with normalized columns (migration `00156_opportunities_view.sql`):

```sql
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
    ELSE                   'open'
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
```

Notes:
- `security_invoker = true` matches the convention from migration `00128_security_invoker_chat_analytics_view.sql` — view enforces calling user's RLS, not view-owner's.
- Buyer-side `pipeline_deals` rows are included at ALL stages, with stage mapped to status: `lead/showing → open`, `offer/conditional/firm/closed → converted`, `lost → lost`. This is critical so the conversion-rate denominator (open + converted + lost over the window) sees buyer-side conversions properly — if we excluded converted rows from the view, conversion rate would silently understate. The UI only shows `status='open'` cards in the Opportunities section, so the user never sees "ghost" converted deals in the Opportunities list.
- **Seller-side `pipeline_deals` are excluded from the view** because they're created by promoting from `listing_appointments` — the listing-appt row remains the canonical opportunity record for that lifecycle (its status maps `sold → converted` so the conversion appears once, not twice).
- `expired` and `withdrawn` listing statuses map to `lost` in the unified view. They're treated as "didn't convert" for KPI purposes; the underlying granularity stays on the row for anyone who needs it.

### 2. Engine layer

#### 2.1 New engine — `opportunity-conversion-engine.ts`

Path: `packages/core/engines/opportunity-conversion-engine.ts` (NEW).

Pure functions (no Supabase imports — takes opportunity rows as input, like the other engines):

```ts
export interface Opportunity {
  id: string
  opportunity_type: 'listing_appointment' | 'buyer_prospect' | 'referral'
  status: 'open' | 'converted' | 'lost'
  estimated_price: number | null
  estimated_commission_pct: number | null
  close_odds_pct: number | null
  expected_close_date: string | null
  lost_reason: string | null
  opportunity_date: string
  updated_at: string
}

export interface OpportunityKpis {
  openCount: number
  weightedGci: number               // sum(est_gci * odds) for status='open'
  conversionRatePct: number | null  // converted / (converted + lost) within window; null if no closed events
  lossRatePct: number | null        // lost / (converted + lost) within window
  topLossReasons: Array<{ reason: string; count: number; pct: number }>
}

export function computeOpportunityWeightedGci(opps: Opportunity[]): number
export function computeOpportunityKpis(opps: Opportunity[], windowDays: number): OpportunityKpis
export function effectiveOdds(opp: Opportunity): number   // close_odds_pct, else type/stage default
```

Defaults when `close_odds_pct` is NULL:

| Opportunity type | Default odds |
|---|---|
| `listing_appointment` (status=open) | 0.40 |
| `buyer_prospect` (status=open) | 0.25 |
| `referral` (status=open) | 0.20 |

These match the "leading indicator with discount" framing. They override the existing `PIPELINE_STAGE_DEFAULTS` only for opportunity-classified rows; existing post-contract pipeline rows continue to use stage defaults (lead 0.1, showing 0.25, etc.) — those defaults were calibrated for under-contract progression and remain canonical for that flow.

**Conversion window** is rolling N days based on `updated_at` (where status flipped to converted/lost). Defaults: 90d and YTD (computed twice, surfaced as two values).

#### 2.2 `pipeline-forecast-engine.ts` wiring (Q2=A: unified card)

Current behavior: `pipeline-forecast-engine` sums listing_appts + pipeline_deals + buyer-pre-approval clients into one weighted GCI number for the Pipeline Weighted dashboard card.

Change: when summing listing_appointments, use `COALESCE(la.close_odds_pct, <current_listing_appt_default>)`. Pipeline_deals continue to use `probability_override → stage default` (unchanged). Referrals are added as a new input source weighted by `COALESCE(ro.close_odds_pct, 0.20)`.

**Guardrail (binding for the implementer):** Before changing `pipeline-forecast-engine`, the implementer MUST:
1. Read the current listing-appointments weighting logic in the engine and document the existing default. Preserve it as `<current_listing_appt_default>` above (do NOT replace with the §2.1 0.40 default for engine fallback — the §2.1 defaults are for the opportunity-conversion-engine only, which is a new and separate engine).
2. Run a before/after snapshot on a seeded fixture and quantify the weighted-GCI delta. The delta from this PR comes from TWO sources only: (a) user-set `close_odds_pct` overrides, which are intentional, and (b) the new `referral_opportunities` input source.
3. If the delta on the fixture exceeds 5% from referrals + intentional close-odds usage combined, stop and route to `dashboard-integrity-champion` before merging — that signals an unexpected interaction.

Net effect: the existing Pipeline Weighted card stays as one number; its inputs become more honest (user-set odds where present) and more complete (referrals now counted); the listing-appointment fallback behavior is preserved bit-for-bit. Engine swap is internal; no display-layer change.

### 3. Pipeline tab UI

Route: `apps/web/app/(app)/pipeline/page.tsx` + `pipeline-content.tsx`.

#### 3.1 New top-of-page cockpit strip

Above all existing sections (and above the existing dollar-value strip), add a 4-stat strip using the existing `CockpitStat` primitive from `cockpit-ui.tsx` (per `findings/crm_cockpit_elevation_shipped_2026-06-28.md` — "extend cockpit-ui, don't re-roll"):

| Stat | Value | Secondary |
|---|---|---|
| Open Opportunities | count | "+N this week" delta |
| Weighted Pre-Contract GCI | $X | breakdown chip: "$L listing · $B buyer · $R referral" |
| Appointment → Contract | XX% | "(trailing 90d · YTD XX%)" |
| Loss Rate | XX% | inline sparkbar of top-3 reasons by count |

All four stats compute from the `opportunity-conversion-engine` reading from `opportunities_v`. The Loss Rate sparkbar uses the same `Sparkline` primitive landed in `findings/crm_cockpit_sparkline_polish_2026-06-30.md`.

#### 3.2 New "Opportunities" section

Inserted above "In Motion". Header row: section title + count badge + "Add Opportunity" button (primary). Cards in a list, sorted by `expected_close_date ASC NULLS LAST`, then `opportunity_date DESC`.

Each card shows:
- Type icon (Lucide: `Home` for listing_appt, `Users` for buyer_prospect, `Share2` for referral) with the existing violet/sky/slate accent treatment
- Title (property address, client name, or referred person name)
- Estimated price + Estimated GCI (calculated: `price * commission_pct`)
- Close odds % (editable inline — click to open a 0–100 slider/input, persists on blur)
- Expected close date (editable inline)
- Notes preview (truncated)
- Action buttons depend on type:
  - Listing appointment & Referral: **[Promote]** (primary) + **[Lost]** (secondary, destructive accent)
  - Buyer prospect: **[Advance Stage]** (primary — opens stage selector showing → offer/conditional/firm) + **[Lost]** (destructive). Buyer prospects don't "promote" because they are already pipeline_deals; advancing the stage past `showing` reclassifies the row as converted in the view and removes it from the Opportunities section.

If the section has zero open opportunities, show empty-state copy: "No open opportunities. Log a listing appointment, buyer prospect call, or referral to start tracking your pre-pipeline activity."

#### 3.3 "Add Opportunity" dialog

Modal with three-tab segmented control (Listing Appointment / Buyer Prospect / Referral). Fields per tab:

**Listing Appointment**
- Client (combobox: existing clients with type=ahead create-new fallback) [optional]
- Property address [required]
- Appointment date/time [required]
- Estimated list price
- Estimated commission % (default 2.5%)
- Close odds % (default 40)
- Expected close date
- Notes

**Buyer Prospect**
- Client (combobox) [required for buyer prospect — buyers must be a client record]
- Address (optional — they don't always have a target)
- Estimated price (budget)
- Estimated commission % (default 2.5%)
- Close odds % (default 25)
- Expected close date
- Notes

**Referral**
- Referred person name [required]
- Referrer name [optional]
- Referrer client (combobox) [optional]
- Referral type (seller / buyer / unknown) [required, default unknown]
- Referral date (default today)
- Estimated price [optional]
- Estimated commission % (default 2.5%)
- Close odds % (default 20)
- Expected close date [optional]
- Notes

Submit writes to the appropriate table.

#### 3.4 Promote dialog

Confirmation modal showing pre-filled data, two outcomes:

- **Listing Appointment promote** → creates `pipeline_deals` row with `side='seller'`, `stage='showing'`, `address=property_address`, `estimated_price=estimated_list_price`, `estimated_commission_pct`, `expected_close_date`, `client_id`, `client_name`, `original_estimated_price=estimated_list_price`, `notes`. Then UPDATEs the listing_appt with `status='active'` AND `converted_to_pipeline_deal_id=<new>`.

- **Buyer Prospect advance** → "Advance Stage" button (not "Promote") opens a small dropdown with Offer / Conditional / Firm. UPDATEs the existing `pipeline_deals` row's `stage` to the chosen value. The view's status mapping automatically reclassifies the row as `converted` and the Opportunities section drops it. The row remains as a regular `pipeline_deals` entry visible in the existing In Motion / On Deck sections.

- **Referral promote** → modal asks "Convert to which?" with choices Listing Appointment / Buyer Prospect.
  - Listing Appt: INSERTs new `listing_appointments` row, sets referral's `converted_to_listing_appointment_id` + `status='converted'` + `converted_at=now()`.
  - Buyer Prospect: INSERTs new `pipeline_deals` row (side=buyer, stage=lead), sets referral's `converted_to_pipeline_deal_id` + `status='converted'` + `converted_at=now()`.

All three promote paths happen as a single Postgres transaction via an edge function (`apps/web/supabase/functions/opportunity-promote/`) so partial failures don't orphan rows.

#### 3.5 Lost dialog

Modal: dropdown of the 8 loss reasons (display labels from `opportunity-loss-reasons.ts`), notes textarea (required when reason='other'), Confirm button. UPDATEs the appropriate row's status='lost', lost_reason=<value>, lost_at=now(), notes appended.

### 4. Dispatcher persona integration

Per `product_ai_first_principle.md`, every feature ships with full Flight Crew integration. Dispatcher gains four MCP tools (new file `apps/web/supabase/functions/mcp-server/tools/opportunities.ts`):

| Tool | Purpose | Required args |
|---|---|---|
| `list_opportunities` | Return open opportunities + KPI summary | filter (optional): type, status |
| `create_opportunity` | Log a new opportunity | type, name, estimated_price?, close_odds_pct?, expected_close_date?, notes? |
| `promote_opportunity` | Convert to pipeline_deal / listing_appt | opportunity_id, target? (referral only) |
| `mark_opportunity_lost` | Mark lost with reason | opportunity_id, lost_reason, notes? |

All four call the same edge function transactions used by the UI. No reimplementation of write logic.

Dispatcher system prompt (`apps/web/lib/flight-crew/system-prompts.ts`) gains a paragraph instructing the persona to use these tools for chat-driven opportunity capture and lifecycle. Example utterances the prompt should handle cleanly:

- "Log a listing appointment for Jane Doe Saturday at 2pm, 47 Main Street, estimated $450K, 60% odds."
- "Mark the McCluskey opportunity as lost — went with another agent."
- "Promote the Andrews referral to a buyer prospect."
- "What's my appointment-to-contract conversion this quarter?"

### 5. Migration order + execution

Migrations land in this order via Supabase MCP `apply_migration` (per `feedback_run_migrations.md`):

1. `00153_listing_appointments_opportunity_fields.sql` — extend listing_appts
2. `00154_pipeline_deals_lost_stage_and_reason.sql` — extend pipeline_deals
3. `00155_referral_opportunities.sql` — new table + RLS + indexes
4. `00156_opportunities_view.sql` — UNION view

Each migration includes its RLS / CHECK constraints inline (no follow-up policy migrations).

After migrations, regenerate types via `mcp__e1609470-2dc8-4b83-acae-47fc64c0113b__generate_typescript_types` so `packages/core/types/database.ts` stays canonical.

### 6. Tests

Per `feedback_engineering_discipline.md` "test-plan-first":

**Engine tests** (`packages/core/engines/__tests__/opportunity-conversion-engine.test.ts`):
- Weighted GCI sum with mixed types, mixed odds (null and explicit)
- Conversion rate with 0 converted/0 lost → null
- Conversion rate with only-lost rows → 0%
- Conversion rate with only-converted rows → 100%
- Top loss reasons sorting (count desc, tie-break alpha)
- Effective odds: explicit override wins over type default
- Window filtering: row 91d ago excluded from 90d window

**View test** (`packages/core/engines/__tests__/opportunities-view.test.ts` — integration test against real Supabase, per CLAUDE.md never-do "never mock the DB in integration tests"):
- Listing appt with status='sold' surfaces as `status='converted'` in view
- Pipeline deal with stage='lost' surfaces as `status='lost'`
- Pipeline deal with stage='offer' EXCLUDED from view (no longer an opportunity)
- Referral row passes through unchanged
- RLS: user A cannot see user B's rows via the view

**Edge function tests** (`apps/web/supabase/functions/opportunity-promote/__tests__/`):
- Listing appt promote → pipeline_deal row created, listing_appt UPDATED atomically
- Referral promote → only one of pipeline_deal / listing_appt created, never both
- Lost mark → status, reason, lost_at all set; notes appended

**UI smoke** (manual via Claude-in-Chrome MCP per `feedback_use_chrome_extension.md`):
- Add Opportunity dialog → submits → row appears in section
- Inline close-odds edit persists
- Promote → row leaves Opportunities section, appears in pipeline downstream
- Lost → row leaves section
- Cockpit strip stats update after each operation

**Dispatcher conversational tests** (manual):
- All four example utterances from §4 produce correct tool calls and write the right row

### 7. Working-tree + branch

Per CLAUDE.md §6 working-tree isolation, the feature lands in a fresh worktree:

```bash
cd "/Users/b/Desktop/Agent Runway Website/Project Home/02 - Web App Code"
git worktree add worktrees/pipeline-pre-tx -b feat/pipeline-pre-transactional origin/main
```

Implementation commits land on `feat/pipeline-pre-transactional`. On merge, the branch closes and the worktree is reset to track HEAD per CLAUDE.md convention.

---

## Champion routing

Per Andrew's instruction in the original prompt, implementation is parceled across three champions (sequenced, not parallel):

1. **crm-champion** — schema migrations, view, edge function, Pipeline tab UI, Add/Promote/Lost dialogs.
2. **metrics-design-champion** — design the `opportunity-conversion-engine` API + window semantics + default odds calibration; review the unified-card decision against `metrics-design-champion` charter; produce the `spec_opportunity_conversion_metrics.md` memory file.
3. **ai-flight-crew-champion** — Dispatcher MCP tools, system prompt updates, conversational testing.

`crm-champion` owns the worktree; the other two land their changes on the same branch via PRs into it OR sequenced commits, depending on overlap.

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Existing `pipeline-forecast-engine` callers see number drift after engine swap | Document in commit body; run before/after seed-data snapshot in the migration PR to quantify shift. |
| Buyer-prospect promote (just advancing stage on existing row) is invisible — user expects a "promote" event | Promote dialog explicitly says "this advances the existing pipeline deal" so the user knows the model. Tests assert UI shows the moved row in its new section. |
| `pipeline_stage` enum ALTER TYPE inside a transaction with constraint addition can fail on Postgres < 12 | Supabase is on PG15+; safe. Migration uses `IF NOT EXISTS`. |
| View performance at scale | All three source tables have user_id indexes; view filters by user_id via RLS (security_invoker). Add `EXPLAIN ANALYZE` smoke against 500-row seed. |
| Referrer free-text collides with future referrer-payment tracking | Out of scope flagged in §"NOT in Scope". The `referrer_client_id` FK is the future hook. |
| Mobile parity gap (mobile users can't log opportunities driving home from one) | Documented as v1 deferral; mobile session follows. Web schema, RLS, MCP tools are already mobile-equal. |

---

## Out-of-band follow-ups (write to `memory/findings/` after ship)

- `findings/pipeline_pre_tx_v1_shipped_YYYY-MM-DD.md` — what landed, PR numbers, before/after weighted-GCI delta.
- `findings/pipeline_pre_tx_mobile_parity_open.md` — mobile session backlog with screen sketches.
- Update `memory/project_pipeline_overhaul.md` to status: **v1 shipped; mobile + accuracy-on-opportunities still open**.
