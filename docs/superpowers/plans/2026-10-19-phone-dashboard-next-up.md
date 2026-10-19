# Phone Dashboard "Next up" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the phone dashboard's score-first layout with a welcome, a small score badge, a time-aware "Next up" card stack and an "Also waiting" list, driven by Flight Control's own pick of 5 clients a day, with Skip / Later / Stop suggesting stored once and honoured by the phone, the web Scan, the nightly drafts, Flight Crew and the MCP server.

**Architecture:** Flight Control's ranking stays on the server (`getTopOpportunities`). A new `next_up_handful` table pins the day's picks so an untouched client stays until handled, and `flight_control_dismissals` gains `later` and `stop` holds next to today's per-occurrence `skip`. One server function (`loadNextUpHandful`) serves the web Scan, a new `GET /api/next-up` route (phone, MCP) and a Flight Crew tool. The phone caches that payload and builds the stack locally with a pure core builder (`packages/core/lib/next-up/build.ts`), so it opens from cache and refreshes in the background.

**Tech Stack:** Next.js 15 route handlers (`after()` from `next/server`), Supabase Postgres + RLS, Expo / React Native (zustand, MMKV, expo-sms, expo-audio), vitest in `packages/core`, `apps/web` and `apps/mobile`, Deno MCP edge function.

**Spec:** `docs/superpowers/specs/2026-10-19-phone-dashboard-next-up-design.md` (mockup: `docs/superpowers/specs/assets/2026-10-19-phone-dashboard-mockup.html`). Read both before any task. Where the mockup and the spec disagree (the "Follow-ups 176" row, "before your 6:00 showing"), the spec wins.

## Global Constraints

- Andrew's 13 decisions in the spec are fixed. Don't change them; the corrections below are the only departures, each recorded.
- Handful size: 5 (`HANDFUL_TARGET`). Ranked by Flight Control's own pick (`selectTopCandidates`: reason score, lifetime GCI breaks ties, existing `TYPE_CAPS`).
- "Always on top": a new lead under 48 hours old and not yet contacted, an overdue task, or a deal deadline within 7 days.
- Later = "in an hour, tonight or tomorrow". Stop suggesting = "3 months, 6 months, or 'move to the Hangar'" (Hangar = `clients.archived_at` + `archive_reason`).
- Score trend compares the last saved score with the latest `runway_score_history` row at least 7 days older; no such row hides the tag. Last save more than 3 days old: the sheet says "as of <date>". No server-side recompute.
- CASL: a send or draft only per `consentStatus()` (via `consentBlockReason`). A past client 24+ months after their last deal, an SMS opt-out or a call-only client gets Call only, never a Text button. Nothing is sent automatically; Andrew presses Send in Messages.
- Archived (Hangar) and do-not-contact clients are never suggested.
- Writes go through `packages/core/lib/record-writers.ts`. Phone rows go through `packages/core/lib/write-rows.ts`. Flight Crew writes land on `ai_run_writes` through the existing `withWriteLedger` wrapper.
- Every new table, RPC or sequence carries explicit Data API grants and RLS in the same migration (`new-table-grants.test.ts`). Apply each migration with the Supabase MCP `apply_migration` tool (project `wlxkvnbncfzkmxzexgxt`) right after writing it, then verify with `information_schema` / `pg_policies` queries only. Never read user rows.
- Time: time-of-day bands, "tonight", "tomorrow" and the handful's day use Atlantic time (`atlanticHour`, `atlanticISODate`, `atlanticDayStart`). Never add a `timeZone` to a calendar-day Date. Showings and listing appointments are dates only; no times anywhere.
- `apps/web` never imports `apps/mobile`. Shared pure code and writers live in `packages/core`, with relative imports only (the MCP build copies core into Deno), and each new core file gets an entry in `packages/core/package.json` `exports`.
- A phone module or store that reads MMKV at creation registers a `hydrate` step in `apps/mobile/lib/storage-bootstrap.ts`.
- Lists of `clients`, `client_records`, `contact_activities`, `contact_tasks` on the server are read with `fetchAllRows` / `fetchAllIn` (1,000-row cap).
- Copy: plain words, no em dashes, no guilt copy, no big counts. Red is for overdue items only. The score sheet's own sentences never say "good", "strong" or "should" (the canonical state label is the one exception, see correction 9). Every new phone string goes in all 10 mobile locales.
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work in `worktrees/phone-dashboard` on branch `feat/phone-dashboard-next-up` (cut from `design/phone-dashboard-next-up` after merging `origin/main`). Never touch the primary tree `agentrunway-web/`.
- Migration number: `00188` as of writing. Run `git fetch origin && git ls-tree --name-only origin/main apps/web/supabase/migrations/ | tail -3` first and take the next free number if a sibling used it.

## Review Focus

1. **Clock edges.** "Tonight" asked for at 19:30, a band read at exactly 12:00 or 17:00, and "tomorrow" chosen on 2026-10-31 (Atlantic DST ends 2026-11-01). Expected: no "tonight" option after 19:00; 12:00 is midday, 17:00 is evening; tomorrow means 08:00 Atlantic on the next calendar day. Pinned in Task 2.
2. **Opening the app the next morning from cache, offline.** Expected: the cached handful still shows (it is sticky), progress reads 0 of 5 for the new day, and a client put on Later until 08:00 comes back on its own at 08:00 with no network. Pinned in Task 7.
3. **A suggested client the app can't text.** No mobile number, an SMS opt-out, or a lapsed past client. Expected: no Text button, Call when a number exists, "Open client" otherwise. Pinned in Tasks 5 and 7.
4. **One client from several sources.** The same person as a new lead, a handful pick and the owner of an overdue task. Expected: one card and no duplicate row. Pinned in Task 7.
5. **Phone and web acting at the same moment.** The handful is synced by two requests at once, or the same occurrence is skipped twice. Expected: one open handful row per client, and the second skip counts as saved. Pinned in Tasks 3 and 4.

## Where the design met the code (corrections and decisions)

1. **"Untouched clients stay on the list until handled" needs state.** `getTopOpportunities` is stateless: a birthday entering its 14-day window would push an untouched client out tomorrow. *Decision:* a `next_up_handful` table pins picks per client. Pinned clients that are still candidates rank first. A pin closes when the client is contacted, skipped, stopped or archived, and those count as done. It also closes as `expired` when the reason lapses (for example a birthday passed); that one doesn't count. The web Scan reads the same pins, so all four surfaces show the same people.
2. **"Snoozing is handling, replaced by the next" conflicts with "the item comes back at that time".** Refilling the slot and then returning the client would make six. *Decision:* Later holds the client's slot (it isn't refilled), hides the card until the chosen time, and doesn't count as done. Contact, Skip, Stop and the Hangar free the slot.
3. **"5 a day" with endless replacements would never clear.** *Decision:* the handful refills while fewer than 5 are done today. At 5 done, handful cards leave the stack ("5 of 5 done today"); remaining pins stay in the "Today's handful" row, which is optional.
4. **Stop suggesting keeps consent-lapsing notices (spec call).** On a consent-lapsing card, Stop would visibly do nothing. *Decision:* that card's menu offers Already talked, Later and Skip only (`dismissChoicesFor`).
5. **The activity streak is mostly 0 today.** `contactStreak()` reads only `clientActivities`, which fill one client at a time when a profile is opened, and aren't cached. *Decision:* the store loads the last 60 days of activity dates on refresh and caches them; the streak and the done-today count read those.
6. **"The voice capture button stays where it is."** The dashboard has no voice capture button. Its floating button is "+" Quick Capture (a typed note); voice capture lives on Clients and Deals, and the mockup's mic doesn't exist. *Decision:* the "+" button stays unchanged, and voice capture reaches the dashboard through the after-call sheet. Andrew can ask to swap "+" for the mic.
7. **Rows with no phone section.** Statement-line review is web-only (mobile scope policy: bulk work), so it gets no row. No phone screen lists consent-lapsing clients either; they reach the phone through the handful (a Flight Control type, capped at 3), so they get no separate row.
8. **Today's Focus isn't named in decision 12.** *Decision:* it leaves the dashboard as a section and becomes the morning Briefing card. That card opens `/profile/briefing`, which already lists every briefing item.
9. **State label "Strong".** Decision 2 puts the state label in the sheet, and the canonical labels include "Strong". *Decision:* the label is shown as the engine names it; the no-"strong" rule applies to the sentences this build writes.
10. **MCP writes aren't on the AI ledger.** No MCP write tool records `ai_run_writes` today. *Decision:* the new MCP write tools follow existing MCP practice. Flight Crew's writes are ledgered and undoable. Flagged as a gap, not fixed here.
11. **The phone can't approve Flight Crew writes.** The phone chat only shows a notice for approval cards; approval happens on the web. Unchanged.
12. **Handful text drafts after a call.** A drafted text left in the queue after a call would show up as "Messages ready". *Decision:* drafts made for the handful carry `context.source = "next_up"`. When the client's pin closes as handled, today's unsent copy of that draft is marked `skipped`.
13. **Drafting volume.** Replacements can mean more than 5 drafts in a day. The bound is one text per client per day (existing `outreach_queue` key).
14. **Days on the phone.** Bands, Later times and the handful's day are Atlantic, per the spec. The existing device-day helpers (overdue tasks in the Checklist, the streak's `activityDay`) are unchanged; for Andrew both clocks agree.
15. **Later on non-client cards** (overdue tasks, briefing, receipts, a new lead) is a phone-only snooze in MMKV. These cards exist only on the phone. A Later on a handful client is the shared server hold.
16. **Dismissals aren't queued offline.** A skip the web never sees would break decision 13. Offline, the card stays and a toast says to try again.

---

### Task 1: Migration 00188, suggestion holds and the day's handful

**Files:**
- Create: `apps/web/supabase/migrations/00188_next_up_handful.sql`
- Modify: `scripts/db/behavior-checks.sql` (append one block)
- Test: `apps/web/lib/supabase/__tests__/new-table-grants.test.ts` (existing guard)

**Interfaces:**
- Produces: `flight_control_dismissals.kind text NOT NULL DEFAULT 'skip'` (`skip | later | stop`) and `until timestamptz NULL`. Hold rows use `opportunity_type = 'any'` and `trigger_date` = the Atlantic day they were made. Table `next_up_handful(id, user_id, client_id, opportunity_type, trigger_date, rank, added_at, handled_at, handled_how)`.

- [ ] **Step 1: Write the migration**
  - `ALTER TABLE flight_control_dismissals` adds `kind` and `until`, with three checks:
    - `kind IN ('skip','later','stop')`
    - `(kind = 'skip') = (until IS NULL)`
    - `kind = 'skip' OR opportunity_type = 'any'`
  - Adds the missing UPDATE policy `flight_control_dismissals_update_own` (`USING` and `WITH CHECK` `user_id = (select auth.uid())`). Upserting a hold needs it.
  - `GRANT SELECT, INSERT, UPDATE, DELETE ON public.flight_control_dismissals TO authenticated, service_role`.
  - `CREATE TABLE public.next_up_handful`:
    - `client_id` references `clients(id) ON DELETE CASCADE`.
    - `rank smallint CHECK (rank BETWEEN 0 AND 9)`.
    - `added_at timestamptz NOT NULL DEFAULT now()`.
    - `handled_how CHECK IN ('contacted','skipped','stopped','archived','expired')`.
    - `CHECK ((handled_at IS NULL) = (handled_how IS NULL))`.
  - `CREATE UNIQUE INDEX next_up_handful_open_client ON public.next_up_handful (user_id, client_id) WHERE handled_at IS NULL`.
  - An index on `(user_id, handled_at)`.
  - RLS with select, update and delete own, and insert own + own client (the 00168 pattern). `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated, service_role`; `REVOKE ALL ... FROM anon`.
  - Header comment: why the table exists (correction 1), and that `fn_merge_clients`' generic FK loop handles it (one client FK; an open-row clash raises `unique_violation`, and the loop deletes the loser's row).

- [ ] **Step 2: Add a behaviour check** to `scripts/db/behavior-checks.sql`, in the style of the existing `fn_merge_clients` blocks:
  1. Two clients of one user each have an open `next_up_handful` row.
  2. Merging them succeeds.
  3. Exactly one open row remains, on the surviving client.

- [ ] **Step 3: Run the guards**
  - Run: `pnpm --filter agentrunway-web exec vitest run lib/supabase/__tests__/new-table-grants.test.ts`. Expected: PASS.
  - If Docker is available, also run `bash scripts/db/check-functions.sh`. Expected: the replay and the behaviour checks pass. Without Docker, CI's `db-functions` job is the gate.

- [ ] **Step 4: Apply and verify in production** with MCP `apply_migration` (name `next_up_handful`). Then, with `execute_sql` and schema only:
  - `information_schema.columns` lists `kind` and `until`, plus all `next_up_handful` columns.
  - `pg_policies` lists the 4 policies on `next_up_handful` and the new update policy.
  - `select has_table_privilege('authenticated','public.next_up_handful','insert')` returns true.
  - `select pg_get_indexdef(...)` shows the partial unique index.

- [ ] **Step 5: Commit** `feat(db): suggestion holds and the day's handful (00188)`.

### Task 2: Core suggestion rules (pure)

**Files:**
- Create: `packages/core/lib/suggestion-dismissals.ts`
- Modify: `packages/core/lib/local-date.ts` (add `atlanticHour`), `packages/core/package.json` (exports)
- Modify: `apps/web/lib/crm/consent-lapsing.ts` (re-export `CONSENT_LAPSING_TYPE` from core instead of defining it)
- Test: `packages/core/lib/__tests__/suggestion-dismissals.test.ts`, `packages/core/lib/__tests__/local-date.test.ts`

**Interfaces:**
- Produces:
  - `atlanticHour(d?: Date): number` (0–23).
  - `type DismissalKind = "skip" | "later" | "stop"`.
  - `HOLD_OPPORTUNITY_TYPE = "any"`, `CONSENT_LAPSING_TYPE = "consent_lapsing"`.
  - `interface OpportunityKeyParts { client_id; opportunity_type; trigger_date }`.
  - `interface DismissalRow extends OpportunityKeyParts { id?; kind?: DismissalKind | null; until?: string | null; dismissed_at?: string | null }` (a missing `kind` reads as `skip`, for old rows and fakes).
  - `opportunityKey(o)` and `withoutDismissed(candidates, rows)`, moved unchanged from `apps/web/lib/crm/dismissed-opportunities.ts`. Skip rows only.
  - `isHeld(clientId: string, opportunityType: string, rows: readonly DismissalRow[], now: Date): boolean`:
    - a `later` row with `until > now` holds every type;
    - a `stop` row with `until > now` holds every type except `CONSENT_LAPSING_TYPE`.
  - `withoutDismissedOrHeld<T extends OpportunityKeyParts>(candidates, rows, now): T[]`.
  - `activeLaterUntil(clientId, rows, now): string | null`.
  - `type LaterChoice = "in_an_hour" | "tonight" | "tomorrow"`; `LATER_TONIGHT_HOUR = 19`; `LATER_TOMORROW_HOUR = 8`.
  - `laterChoices(now: Date): LaterChoice[]` and `laterUntil(choice: LaterChoice, now: Date): Date`.
  - `type StopChoice = "3_months" | "6_months" | "hangar"`; `stopUntil(choice: "3_months" | "6_months", now: Date): Date` (Atlantic midnight starting the same calendar day N months on, clamped to month end).
  - `type DismissChoice = "already_talked" | "later" | "skip" | "stop"`; `dismissChoicesFor(opportunityType: string): DismissChoice[]`.

- [ ] **Step 1: Write the failing tests**

```ts
// local-date.test.ts
it("atlanticHour reads the Halifax wall clock", () => {
  expect(atlanticHour(new Date("2026-10-19T15:30:00Z"))).toBe(12); // ADT, UTC-3
  expect(atlanticHour(new Date("2026-11-02T15:30:00Z"))).toBe(11); // AST, UTC-4
});
// suggestion-dismissals.test.ts
const rows = (r: Partial<DismissalRow>[]) => r.map((x) => ({ client_id: "c1", opportunity_type: "any", trigger_date: "2026-10-19", ...x }));
it("a skip covers one occurrence only", () => {
  const c = [{ client_id: "c1", opportunity_type: "idle_client", trigger_date: "2026-10-01" }, { client_id: "c1", opportunity_type: "birthday", trigger_date: "2026-10-23" }];
  expect(withoutDismissed(c, [{ ...c[0] }])).toEqual([c[1]]);              // old row, no kind
});
it("later hides every type until its time", () => {
  const r = rows([{ kind: "later", until: "2026-10-19T22:00:00Z" }]);
  expect(isHeld("c1", "consent_lapsing", r, new Date("2026-10-19T21:59:00Z"))).toBe(true);
  expect(isHeld("c1", "birthday", r, new Date("2026-10-19T22:00:00Z"))).toBe(false);
});
it("stop hides everything but a consent-lapsing notice", () => {
  const r = rows([{ kind: "stop", until: "2027-01-19T04:00:00Z" }]);
  expect(isHeld("c1", "idle_client", r, new Date("2026-10-19T12:00:00Z"))).toBe(true);
  expect(isHeld("c1", "consent_lapsing", r, new Date("2026-10-19T12:00:00Z"))).toBe(false);
});
it("no 'tonight' at or after 19:00 Atlantic", () => {
  expect(laterChoices(new Date("2026-10-19T21:59:00Z"))).toEqual(["in_an_hour", "tonight", "tomorrow"]); // 18:59 ADT
  expect(laterChoices(new Date("2026-10-19T22:00:00Z"))).toEqual(["in_an_hour", "tomorrow"]);
});
it("later times", () => {
  const now = new Date("2026-10-19T15:10:00Z");
  expect(laterUntil("in_an_hour", now).toISOString()).toBe("2026-10-19T16:10:00.000Z");
  expect(laterUntil("tonight", now).toISOString()).toBe("2026-10-19T22:00:00.000Z");
  expect(laterUntil("tomorrow", now).toISOString()).toBe("2026-10-20T11:00:00.000Z");
});
it("tomorrow across the DST change is 08:00 AST", () => {
  expect(laterUntil("tomorrow", new Date("2026-10-31T23:00:00Z")).toISOString()).toBe("2026-11-01T12:00:00.000Z");
});
it("stop durations are calendar months, Atlantic midnight", () => {
  expect(stopUntil("3_months", new Date("2026-11-30T15:00:00Z")).toISOString()).toBe("2027-02-28T04:00:00.000Z");
  expect(stopUntil("6_months", new Date("2026-10-19T15:00:00Z")).toISOString()).toBe("2027-04-19T03:00:00.000Z");
});
it("consent-lapsing cards can't be stopped", () => {
  expect(dismissChoicesFor("idle_client")).toEqual(["already_talked", "later", "skip", "stop"]);
  expect(dismissChoicesFor("consent_lapsing")).toEqual(["already_talked", "later", "skip"]);
});
```

- [ ] **Step 2: Run them and confirm they fail.** Run: `pnpm --filter @agent-runway/core exec vitest run lib/__tests__/suggestion-dismissals.test.ts lib/__tests__/local-date.test.ts`. Expected: FAIL (module not found / `atlanticHour` not exported).

- [ ] **Step 3: Implement**
  - `atlanticHour` wraps the private `atlanticFields(d).hour`.
  - "Tonight" and "tomorrow" are built from `atlanticDayStart(day)` plus a wall-clock hour, re-derived through `atlanticWallClock` so DST days land on the stated hour; don't add 19 × 3600 s to midnight.
  - `opportunityKey` and `withoutDismissed` move verbatim.
  - Add the `exports` entry `"./lib/suggestion-dismissals"`.

- [ ] **Step 4: Run the core suite.** Run: `pnpm --filter @agent-runway/core test`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(core): suggestion rules for skip, later and stop`.

### Task 3: Shared writers for skip, later, stop and the Hangar

**Files:**
- Modify: `packages/core/lib/record-writers.ts`
- Modify: `apps/web/lib/crm/dismissed-opportunities.ts` (becomes a re-export shim plus browser helpers)
- Modify: `packages/core/lib/ai-activity.ts` (add `flight_control_dismissals` to `UNDO_TABLES` with a `TABLE_LABELS` entry; add `next_up_handful` to `UNDO_EXCLUDED` with the reason "bookkeeping written by the handful sync, never by a tool")
- Test: `packages/core/lib/__tests__/record-writers.test.ts`, `apps/web/lib/crm/__tests__/dismissed-opportunities.test.ts`, `apps/web/lib/__tests__/ai-ledger-guards.test.ts` (existing)

**Interfaces:**
- Consumes: Task 2's `OpportunityKeyParts`, `HOLD_OPPORTUNITY_TYPE`.
- Produces (all `(db: DbClient, userId: string, …) => Promise<WriteOutcome>`; they never throw):
  - `writeSuggestionSkip(db, userId, o: OpportunityKeyParts, options?: InsertOptions)` inserts a `kind:'skip'` row with a device-made id. A 23505 on the occurrence key counts as saved (`alreadySaved: true`).
  - `writeSuggestionHold(db, userId, args: { clientId: string; clientName: string; kind: "later" | "stop"; until: Date }, today: string)` upserts on `user_id,client_id,opportunity_type,trigger_date` with `opportunity_type: "any"` and `trigger_date: today`, setting `kind`, `until` and `dismissed_at`.
  - `removeSuggestionDismissal(db, userId, id: string)` is the undo for a skip.
  - `resumeSuggestions(db, userId, clientId: string)` deletes the client's `later`/`stop` rows; it is the undo for a hold.
  - `writeClientToHangar(db, userId, args: { clientId: string; clientName: string })` sets `archived_at = now` and `archive_reason = 'other'`. It refuses an already-archived client, with the message "<name> is already in the Hangar."
  - `restoreClientFromHangar(db, userId, args)` clears both fields.
  - Web shim keeps `opportunityKey`, `withoutDismissed`, `dismissOpportunity(supabase, o)` and `undismissOpportunity(supabase, o)` with their signatures. Internally they now call `getUser()` and then the core writer. The shim adds `holdSuggestion(supabase, args)` and `resumeSuggestion(supabase, clientId)`.

- [ ] **Step 1: Write the failing tests** with the core `fakeDb` helper (`lib/__tests__/helpers/capture-fake-db.ts`):
  - `writeSuggestionSkip` inserts `{kind:"skip", trigger_date:"2026-10-01"}` when given `trigger_date: "2026-10-01T00:00:00Z"` (it slices to the day).
  - A second skip of the same occurrence returns `ok: true, alreadySaved: true` (fake raises 23505).
  - `writeSuggestionHold` with `kind:"later"` writes `opportunity_type:"any"` and the ISO `until`. A second hold the same day updates the same row; the fake records one upsert per call, both on the occurrence key.
  - `writeClientToHangar` writes `archive_reason:"other"` and a non-null `archived_at`, and refuses when `archived_at` is set.
  - Every writer filters on `user_id`.
  - `ai-ledger-guards.test.ts` passes with the new `UNDO_TABLES` entry.

- [ ] **Step 2: Run and confirm failure.** Run: `pnpm --filter @agent-runway/core exec vitest run lib/__tests__/record-writers.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** the writers next to the existing ones.
  - Reuse the private `refused` / `fail` helpers.
  - `writeSuggestionSkip` handles its own 23505. `insertOnce` re-reads by id, which misses a clash on the occurrence key under a different id, so the skip writer re-reads by `(user_id, client_id, opportunity_type, trigger_date)` instead; a row there means saved.
  - Extend the fake's `FakeDbOptions` if it can't yet raise 23505 on a chosen table.

- [ ] **Step 4: Run the suites.** Run: `pnpm --filter @agent-runway/core test && pnpm --filter agentrunway-web exec vitest run lib/crm/__tests__/dismissed-opportunities.test.ts lib/__tests__/ai-ledger-guards.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(core): one set of writers for skip, later, stop and the Hangar`.

### Task 4: Flight Control honours holds and pins; the handful sync

**Files:**
- Modify: `apps/web/lib/crm/top-opportunity-selection.ts` (`selectTopCandidates` pins)
- Modify: `apps/web/app/api/ai/detect-opportunities/route.ts`. In both `getTopOpportunities` (L2356+) and `detectAndDraftForUser` (L961+), add `kind, until` to the dismissal selects and replace `withoutDismissed` with `withoutDismissedOrHeld(…, now)`.
- Create: `apps/web/lib/crm/next-up-handful.ts`
- Modify: `apps/web/app/api/ai/top-opportunities/route.ts` (return `loadNextUpHandful(...).opportunities`)
- Test: `apps/web/lib/crm/__tests__/top-opportunity-selection.test.ts`, `apps/web/lib/crm/__tests__/next-up-handful.test.ts`, `apps/web/lib/ai/__tests__/suggestion-holds-detector.test.ts`

**Interfaces:**
- Consumes: Task 2's `withoutDismissedOrHeld`, `activeLaterUntil`; Task 1's tables.
- Produces:
  - `selectTopCandidates<T>(candidates, lifetimeGci, limit = MAX_TOP_OPPORTUNITIES, pinnedClientIds: readonly string[] = []): T[]`. Pinned clients that are still candidates come first, in pin order, each with its best candidate. `TYPE_CAPS` and the seasonal rule still apply to everyone.
  - `getTopOpportunities(userId, supabase, opts: { pinnedClientIds?: readonly string[]; reservedSlots?: number; now?: Date } = {})`. The limit is `MAX_TOP_OPPORTUNITIES - reservedSlots`, floored at 0. It still writes nothing.
  - `interface HandfulRow { id: string; client_id: string; opportunity_type: string; trigger_date: string; rank: number; added_at: string; handled_at: string | null; handled_how: HandledHow | null }`.
  - `type HandledHow = "contacted" | "skipped" | "stopped" | "archived" | "expired"`.
  - `planHandfulSync(open: HandfulRow[], picked: { client_id; opportunity_type; trigger_date }[], snoozedClientIds: ReadonlySet<string>, facts: HandfulFacts, now: Date): { close: { id: string; client_id: string; handled_at: string; handled_how: HandledHow }[]; insert: { client_id; opportunity_type; trigger_date; rank }[] }`.
  - `interface HandfulFacts { lastContactAt: ReadonlyMap<string, string | null>; lastSentAt: ReadonlyMap<string, string>; archivedAt: ReadonlyMap<string, string | null>; dismissals: readonly DismissalRow[] }`.
  - `countDoneToday(rows: Pick<HandfulRow, "handled_at" | "handled_how">[], dayStart: Date): number`. It counts every `handled_how` except `expired`.
  - `loadNextUpHandful(userId: string, supabase: SupabaseClient, opts: { persist?: boolean; now?: Date } = {}): Promise<NextUpHandfulResult>`. `persist` defaults to true.
  - `interface NextUpHandfulResult { day: string; doneToday: number; opportunities: TopOpportunity[]; snoozed: { client_id: string; client_name: string; until: string }[] }`.

How a pin closes, first match wins. `handled_at` is that event's own time, so done-today counts when Andrew acted:

| Order | Condition | `handled_how` | `handled_at` |
|---|---|---|---|
| 1 | Client has `archived_at` | `archived` | `archived_at` |
| 2 | A `stop` row was made after `added_at` | `stopped` | that row's `dismissed_at` |
| 3 | A `skip` row for that client was made after `added_at` | `skipped` | that row's `dismissed_at` |
| 4 | `last_contact_at` or an outreach `sent_at` is after `added_at` | `contacted` | the later of the two |
| 5 | The client isn't picked and isn't on Later | `expired` | now |

Snoozed pins are never closed.

- [ ] **Step 1: Write the failing tests**

```ts
// top-opportunity-selection.test.ts
it("a pinned client keeps its place over a higher-scoring newcomer", () => {
  const c = [cand("new", "birthday", 80), cand("old", "idle_client", 38), ...three(50)];
  expect(selectTopCandidates(c, new Map(), 5, ["old"]).map((x) => x.client_id)).toContain("old");
  expect(selectTopCandidates(c, new Map(), 5, ["old"])[0].client_id).toBe("old");
});
it("pins still respect TYPE_CAPS", () => { /* 3 pinned sphere_check_in → only SPHERE_MAX_PER_SCAN (2) kept */ });
// next-up-handful.test.ts
it("a contacted pin closes as contacted at the contact time and its slot refills", () => {
  const plan = planHandfulSync([pin("a", "2026-10-19T12:00:00Z")], [pick("b")], new Set(),
    facts({ lastContactAt: new Map([["a", "2026-10-19T15:00:00Z"]]) }), NOW);
  expect(plan.close).toEqual([{ id: "pin-a", client_id: "a", handled_at: "2026-10-19T15:00:00Z", handled_how: "contacted" }]);
  expect(plan.insert.map((r) => r.client_id)).toEqual(["b"]);
});
it("a pin on Later stays open", () => { /* snoozed "a" → close = [] */ });
it("a pin whose reason lapsed closes as expired and isn't counted", () => {
  expect(countDoneToday([{ handled_at: TODAY_NOON, handled_how: "expired" }, { handled_at: TODAY_NOON, handled_how: "skipped" }, { handled_at: YESTERDAY, handled_how: "contacted" }], DAY_START)).toBe(1);
});
it("persist:false writes nothing", async () => { /* fake supabase: no inserts/updates recorded */ });
it("a 23505 on inserting an open pin is ignored (another surface pinned it first)", async () => { /* … */ });
it("closing a handled pin skips today's unsent next_up text draft for that client", async () => {
  /* outreach_queue update to status 'skipped' filtered on channel 'sms', status 'ready', trigger_date today, context->>source 'next_up' */
});
// suggestion-holds-detector.test.ts (fake supabase, as yearly-triggers-year-end.test.ts)
it("Scan hides a stopped client but still shows their consent-lapsing card", async () => { /* … */ });
it("the nightly drafter queues nothing for a client on Later or Stop, and drafts again once Later has passed", async () => { /* … */ });
it("a later pin reserves its slot: 4 cards when 1 pinned client is on Later", async () => { /* … */ });
```

- [ ] **Step 2: Run them and confirm failure.** Run: `pnpm --filter agentrunway-web exec vitest run lib/crm/__tests__/top-opportunity-selection.test.ts lib/crm/__tests__/next-up-handful.test.ts lib/ai/__tests__/suggestion-holds-detector.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**
  - `loadNextUpHandful` reads:
    - open pins;
    - pins handled since `atlanticDayStart(day)`;
    - the open pins' client ids, then by id: `clients` (`id, name, last_contact_at, archived_at`, archived included), `flight_control_dismissals`, and sent `outreach_queue` since the oldest `added_at`.
  - It calls `getTopOpportunities` with the open pins in rank order and `reservedSlots` = open pins with an active Later.
  - When persisting:
    - close pins by id with `.is("handled_at", null)`;
    - insert each new pin on its own, ignoring 23505;
    - mark the `next_up` drafts of closed (not expired) clients `skipped`.
  - `snoozed` comes from open pins with `activeLaterUntil`.
  - The top-opportunities route keeps its rate limit and `{ opportunities }` shape.

- [ ] **Step 4: Run the web suite.** Run: `pnpm --filter agentrunway-web test`. Expected: PASS. The existing detector tests (`consent-lapsing-detector`, `yearly-triggers-year-end`, `first-contact-trigger-day`, `outreach-collapsed-deals`) stay green.

- [ ] **Step 5: Commit** `feat(flight-control): holds and the day's pinned handful, shared by Scan and the nightly drafts`.

### Task 5: `GET /api/next-up` and the handful's texts

**Files:**
- Create: `packages/core/lib/next-up/types.ts`, `packages/core/lib/next-up/rules.ts` (and the `exports` entry `"./lib/next-up/*": "./lib/next-up/*.ts"`)
- Create: `apps/web/lib/crm/next-up-payload.ts` (builds the payload; the route stays thin), `apps/web/app/api/next-up/route.ts`
- Modify: `apps/web/lib/ai/draft-text.ts` (`draftTextForClient` input gains `source?: "next_up"`, stored as `context.source`)
- Test: `packages/core/lib/__tests__/next-up-rules.test.ts`, `apps/web/lib/__tests__/next-up-route.test.ts`

**Interfaces:**
- Consumes: Task 4's `loadNextUpHandful`; `readClientConsent`, `consentBlockReason`, `consentRequestWindow` (`lib/crm/consent-gate.ts`); `pickTextPhone`, `draftTextForClient` (`lib/ai/draft-text.ts`); `getRequestUser`, `requirePro`, `checkRateLimit`.
- Produces in `packages/core/lib/next-up/types.ts`:

```ts
export type HandfulTextStatus =
  | { status: "ready"; queue_id: string; body: string }
  | { status: "draftable" }
  | { status: "call_only"; reason: string }
  | { status: "no_phone" };
export interface HandfulItem {
  client_id: string; client_name: string; opportunity_type: string; trigger_date: string;
  label: string; why_now: string; contact_channel: "email" | "call"; phone: string | null; text: HandfulTextStatus;
}
export interface NextUpPayload {
  day: string; target: number; done_today: number; generated_at: string;
  handful: HandfulItem[];                                                    // Flight Control order, ≤ 5
  snoozed: { client_id: string; client_name: string; until: string; phone: string | null }[];
  urgent: { new_leads: number; overdue_tasks: number; deal_deadlines: number };
}
```

- Produces in `packages/core/lib/next-up/rules.ts`:
  - Constants: `HANDFUL_TARGET = 5`, `NEW_LEAD_HOURS = 48`, `DEAL_DEADLINE_DAYS = 7`, `MORNING_END_HOUR = 12`, `EVENING_START_HOUR = 17`.
  - `type TimeBand = "morning" | "midday" | "evening"`; `timeBand(hour: number): TimeBand`.
  - `isNewLead(c: { status: string; last_contact_at: string | null; created_at: string; archived_at?: string | null }, now: Date): boolean`. True for `boarding`, no contact, not archived, and `now - created_at < 48 h` (an elapsed rule).
  - `isUncontactedLead(c): boolean`. The same without the age limit.
  - `isOverdueTask(t: { due_date: string; completed_at: string | null }, today: string): boolean` and `isDueToday(t, today): boolean`.
  - `dealDeadlineDays(d: { expected_close_date: string | null }, today: string): number | null` returns 0..7 or null. Callers pass active deals only (`activePipelineDeals`).
  - `conditionDeadlineDays(r: { condition_date: string | null; condition_status: string | null }, today: string): number | null`. Null when firmed, waived or collapsed.
  - `isPastCloseDate(d, today): boolean`.
  - `textPurposeFor(opportunityType: string): "check_in" | "consent_request"`.
- `buildNextUpPayload(userId: string, supabase: SupabaseClient, opts: { persist: boolean; now: Date }): Promise<NextUpPayload>` in `apps/web/lib/crm/next-up-payload.ts`. It never drafts; drafting belongs to the route. Flight Crew (Task 12) calls it too.
- Route: `GET /api/next-up[?persist=0][&draft=0]`.
  - 401 without a user. 403 `SUBSCRIPTION_REQUIRED` when not Pro. 429 past `checkRateLimit(user.id, "next_up", 60, 60)`.
  - Otherwise 200 with `NextUpPayload`.

- [ ] **Step 1: Write the failing tests**

```ts
// next-up-rules.test.ts
it("bands", () => { expect([11, 12, 16, 17].map(timeBand)).toEqual(["morning", "midday", "midday", "evening"]); });
it("a new lead is under 48 hours", () => {
  const now = new Date("2026-10-19T12:00:00Z");
  expect(isNewLead(lead({ created_at: "2026-10-17T12:00:01Z" }), now)).toBe(true);
  expect(isNewLead(lead({ created_at: "2026-10-17T11:59:59Z" }), now)).toBe(false);
  expect(isNewLead(lead({ last_contact_at: "2026-10-19T10:00:00Z" }), now)).toBe(false);
});
it("deal deadline window is today..+7", () => {
  expect(dealDeadlineDays({ expected_close_date: "2026-10-26" }, "2026-10-19")).toBe(7);
  expect(dealDeadlineDays({ expected_close_date: "2026-10-27" }, "2026-10-19")).toBeNull();
  expect(dealDeadlineDays({ expected_close_date: "2026-10-18" }, "2026-10-19")).toBeNull(); // past: isPastCloseDate
});
// next-up-route.test.ts (vi.mock("next/server") so after(cb) runs cb at once; fake supabase as in lib/ai/__tests__/helpers)
it("401 with no user", …); it("403 when not Pro", …);
it("a lapsed past client is call_only, with no Text", async () => { expect(item.text).toEqual({ status: "call_only", reason: expect.any(String) }); });
it("an SMS opt-out is call_only", …);
it("no mobile or other phone is no_phone", …);
it("today's ready sms row is ready with its id and body", …);
it("draft=0 never calls the drafter; otherwise only draftable items are drafted, with source next_up and the card's label as the note", …);
it("persist=0 writes nothing", …);
it("urgent counts use the core predicates", …);
```

- [ ] **Step 2: Run them and confirm failure.** Run: `pnpm --filter @agent-runway/core exec vitest run lib/__tests__/next-up-rules.test.ts && pnpm --filter agentrunway-web exec vitest run lib/__tests__/next-up-route.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**
  - `buildNextUpPayload` in `next-up-payload.ts`.
    - Phones: one `clients` read by id for the handful and snoozed clients.
    - `phone = pickTextPhone(row) ?? row.phone ?? row.secondary_phone ?? null`.
    - Text status: today's sms rows by `trigger_date = atlanticISODate()`. Consent is read per client (5 at most, in parallel). A `consent_lapsing` item also goes through `consentRequestWindow`.
    - Urgent counts:
      - `clients` via `fetchAllRows`, then `isNewLead`;
      - a `contact_tasks` head count with `completed_at is null` and `due_date < today`;
      - `pipeline_deals` through `activePipelineDeals` plus `client_records` condition dates.
  - The route calls `after(() => draftHandfulTexts(...))` unless `draft=0`. Drafting runs one item at a time, each `draftTextForClient({ supabase, userId, clientId, purpose: textPurposeFor(type), note: label, source: "next_up" })`.

- [ ] **Step 4: Run the suites.** Run: `pnpm --filter @agent-runway/core test && pnpm --filter agentrunway-web test && pnpm --filter agentrunway-web exec tsc --noEmit`. Expected: PASS. Also expect `server-calendar.test.ts` to pass: timestamp bounds go through `atlanticDayStart(...).toISOString()`.

- [ ] **Step 5: Commit** `feat(api): /api/next-up serves the day's handful with CASL-checked text status`.

### Task 6: Web Flight Control: Skip, Later and Stop suggesting

**Files:**
- Create: `apps/web/lib/crm/dismiss-menu.ts`
- Modify: `apps/web/app/(app)/flight-control/flight-control-content.tsx` (`handleDismiss` L881–915 and the card's Dismiss button L329)
- Test: `apps/web/lib/crm/__tests__/dismiss-menu.test.ts`

**Interfaces:**
- Consumes: `dismissChoicesFor`, `laterChoices`, `laterUntil`, `stopUntil` (Task 2); shim helpers `dismissOpportunity`, `undismissOpportunity`, `holdSuggestion`, `resumeSuggestion` (Task 3); core `writeClientToHangar` / `restoreClientFromHangar`.
- Produces:
  - `dismissMenuFor(opportunityType: string, now: Date): DismissMenuEntry[]`, where `DismissMenuEntry = { choice: "skip" } | { choice: "later"; options: LaterChoice[] } | { choice: "stop"; options: StopChoice[] }`. "Already talked" is the existing Log contact button on web, so the menu leaves it out.
  - `dismissToast(choice, clientName, detail): { title: string; description: string }` holds the copy:

| Choice | Title | Description |
|---|---|---|
| Skip | "Skipped <name> this time." | "They come back at their next reason to reach out." |
| Later | "<name> is back <in an hour / tonight / tomorrow>." | |
| Stop | "No suggestions for <name> for 3 months." / "…6 months." | |
| Hangar | "<name> moved to the Hangar." | |

  Every toast carries Undo.

- [ ] **Step 1: Write the failing tests:**
  - the menu for `idle_client` at 18:59 Atlantic has skip, later (3 options) and stop (3 options);
  - at 19:00, later has 2 options;
  - `consent_lapsing` has no stop;
  - toast strings contain no em dash and no "should".
- [ ] **Step 2: Run and confirm failure.** Run: `pnpm --filter agentrunway-web exec vitest run lib/crm/__tests__/dismiss-menu.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the menu as a dropdown on the existing Dismiss button. Each choice:
  - writes through the shim;
  - hides the card at once;
  - calls `loadOpportunities({ refill: true })`;
  - shows the toast. Undo calls `undismissOpportunity` for a skip, `resumeSuggestion` for later/stop, and `restoreClientFromHangar` for the Hangar.

  The Hangar asks a confirm first.
- [ ] **Step 4: Run the suite and typecheck.** Run: `pnpm --filter agentrunway-web test && pnpm --filter agentrunway-web exec tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(flight-control): Dismiss offers Skip, Later and Stop suggesting`.
- [ ] **Step 6: Ship the server half.**
  1. `git fetch origin && git merge origin/main` and re-run `pnpm turbo test` (siblings move main quickly).
  2. Open PR A (Tasks 1–6), push every fix, then `gh pr merge --auto --squash`.
  3. After the merge, check the Vercel status of the merge commit is success (`gh api repos/Ashaw19/agentrunway-web/commits/<sha>/statuses`).
  4. In Chrome, signed in, check by shape only (`javascript_tool` returning booleans and counts): `fetch('/api/next-up?persist=0&draft=0')` is 200 with `handful.length <= 5`, and the Flight Control Dismiss menu renders.

### Task 7: Core Next up builder (pure)

**Files:**
- Create: `packages/core/lib/next-up/build.ts`
- Test: `packages/core/lib/__tests__/next-up-build.test.ts`, `apps/web/lib/__tests__/next-up-parity.test.ts`

**Interfaces:**
- Consumes: Task 5's types and rules; `isArchivedClient`.
- Produces:

```ts
export type NextUpKind = "new_lead" | "deal_deadline" | "overdue_tasks" | "briefing" | "schedule" | "tasks_today"
  | "handful_client" | "messages_ready" | "voice_note" | "undated_receipts" | "trips";
export type SectionKey = "checklist" | "new_leads" | "deals" | "handful" | "messages" | "receipts";
export type NextUpAction = "call" | "text" | "later" | "dismiss" | "open_client" | "open_checklist" | "mark_one_done"
  | "open_briefing" | "open_deals" | "open_messages" | "open_receipts" | "open_mileage" | "record_voice_note";
export interface NextUpCard {
  key: string;                       // `${kind}:${id or day}`; local snoozes key on it
  kind: NextUpKind; clientId: string | null; clientName: string | null; phone: string | null;
  count: number; itemIds: string[];  // ids this card covers, so the list never repeats them
  detail: { title?: string; due?: string; days?: number; address?: string; label?: string; whyNow?: string;
            showings?: number; appointments?: number; returning?: boolean };
  text?: HandfulTextStatus; occurrence?: { opportunity_type: string; trigger_date: string };
}
export interface AlsoWaitingRow { section: SectionKey; count: number; swipeTaskId: string | null; firstName?: string; days?: number }
export interface NextUpView {
  stack: NextUpCard[]; alsoWaiting: AlsoWaitingRow[];
  context: { kind: "schedule"; showings: number; appointments: number } | { kind: "waiting"; count: number } | { kind: "all_clear" };
  progress: { done: number; target: number } | null;
  allClear: { kind: "showing" | "appointment"; date: string; clientName: string | null } | { kind: "task"; date: string; title: string } | null;
}
export interface NextUpInput {
  now: Date; today: string; band: TimeBand;
  clients: readonly { id: string; name: string; status: string; last_contact_at: string | null; created_at: string; archived_at: string | null; phone: string | null }[];
  tasks: readonly { id: string; title: string; due_date: string; completed_at: string | null; client_id: string | null }[];
  pipeline: readonly { id: string; address: string | null; client_name: string | null; expected_close_date: string | null }[]; // active only
  clientRecords: readonly { id: string; client_id: string | null; address: string | null; condition_date: string | null; condition_status: string | null }[];
  undatedReceipts: number;
  outreachReady: readonly { client_id: string; channel: "email" | "sms" }[];
  payload: NextUpPayload | null;
  schedule: readonly { kind: "showing" | "appointment"; client_id: string | null; date: string }[]; // today..+14
  tripsLoggedToday: number; activitiesToday: number; briefingCount: number;
  localSnoozes: Readonly<Record<string, string>>; voiceNoteDoneOn: string | null;
}
export const STACK_LIMIT = 7;
export const ALWAYS_ON_TOP: readonly NextUpKind[] = ["new_lead", "deal_deadline", "overdue_tasks"];
export const BAND_KINDS: Readonly<Record<TimeBand, readonly NextUpKind[]>> = {
  morning: ["briefing", "schedule", "tasks_today"],
  midday:  ["handful_client", "messages_ready"],
  evening: ["voice_note", "undated_receipts", "trips"],
};
export const SECTION_ORDER: readonly SectionKey[] = ["checklist", "new_leads", "deals", "handful", "messages", "receipts"];
export function buildNextUp(input: NextUpInput): NextUpView;
export function cardActions(card: NextUpCard): NextUpAction[];
export function messagesReadyCount(ready: NextUpInput["outreachReady"], handfulClientIds: ReadonlySet<string>): number;
```

Rules the tests pin:

- **Stack order.**
  1. `ALWAYS_ON_TOP`, in this order: new leads newest first, then deal deadlines soonest first, then one overdue card.
  2. The current band's kinds.
  3. Nothing from other bands.
- **Leaving the stack.** A card leaves when:
  - its `localSnoozes[key]` is later than `now`;
  - it is a handful card and `progress.done >= target`;
  - its client already has an earlier card (first card wins, per client).
- **Stack size.** At most `STACK_LIMIT` cards.
- **When a card is made.**

| Card | Made when |
|---|---|
| briefing | `briefingCount > 0` |
| schedule | there are showings or appointments today |
| tasks_today | there are tasks due today |
| messages_ready | `messagesReadyCount > 0` |
| voice_note | it's evening, there were showings or appointments today, and `voiceNoteDoneOn !== today` |
| trips | it's evening, there were showings or appointments today, and `tripsLoggedToday === 0` |
| handful (snoozed) | the client's `until` is at or before `now`; the card is marked `detail.returning` |

- **Rows.**
  - Each row counts its section's items that no stack card covers, in `SECTION_ORDER`, and is left out at 0.
  - The checklist row covers overdue plus due-today tasks.
  - new_leads covers every uncontacted lead.
  - deals covers past close dates.
  - handful covers handful items not on the stack.
  - messages covers the messages-ready count.
  - receipts covers the undated count.
  - `swipeTaskId` is set only when the checklist row holds exactly 1 task.
- **Progress.**
  - `payload.day === today` gives `{ done: min(done_today, target), target }`.
  - An older `payload.day` gives `{ done: 0, target }`.
  - No payload gives null.
- **`cardActions` by card.**

| Card | Actions |
|---|---|
| new_lead | `call`, `text`, `later` with a phone; else `open_client`, `later` |
| handful_client, text `ready` or `draftable` | `call`, `text`, `later`, `dismiss` |
| handful_client, call-only or no phone | `call`, `later`, `dismiss` with a phone; else `open_client`, `later`, `dismiss` |
| overdue_tasks, tasks_today | `open_checklist`, `mark_one_done` |
| deal_deadline | `open_deals`, `later` |
| briefing | `open_briefing`, `later` |
| schedule | `open_client`, `later` |
| messages_ready | `open_messages`, `later` |
| voice_note | `record_voice_note`, `later` |
| undated_receipts | `open_receipts`, `later` |
| trips | `open_mileage`, `later` |

- [ ] **Step 1: Write the failing tests:**
  - `"morning shows briefing, schedule, tasks due today; midday shows the handful and messages; evening shows the wrap-up"`
  - `"always-on-top items lead in every band"`
  - `"a 47-hour lead is a card, a 49-hour lead is only in the New leads row"`
  - `"one client, one card: lead + handful + client task"`
  - `"nothing on the stack is counted in a row"`: for every section, the row count plus the stack's covered items equals the section total.
  - `"handful cards leave the stack at 5 done; the row keeps the rest"`
  - `"yesterday's payload shows 0 of 5"`
  - `"a client on Later until 08:00 returns at 08:00 from the cached payload"`
  - `"a local snooze hides the card until its time"`
  - `"swipe only when the checklist row holds one task"`
  - `"handful drafts don't count in Messages ready"`
  - `"call-only and no-phone handful cards have no text action"`
  - `"STACK_LIMIT caps the stack and overflow stays in rows"`
  - `"context: schedule, then waiting, then all clear"`
  - `"all clear names the next showing, else the next due task"`
  - Parity, in `next-up-parity.test.ts`: on one fixture, `/api/next-up`'s `urgent` counts equal the number of `new_lead`, `deal_deadline` and overdue tasks `buildNextUp` finds on the same rows.
- [ ] **Step 2: Run and confirm failure.** Run: `pnpm --filter @agent-runway/core exec vitest run lib/__tests__/next-up-build.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `buildNextUp`, `cardActions` and `messagesReadyCount`.
- [ ] **Step 4: Run the suites.** Run: `pnpm --filter @agent-runway/core test && pnpm --filter agentrunway-web exec vitest run lib/__tests__/next-up-parity.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(core): Next up builder: time bands, stack and Also waiting`.

### Task 8: Phone data: cached payload, schedule, streak, score comparison

**Files:**
- Create: `apps/mobile/stores/next-up-store.ts`, `apps/mobile/lib/activity-streak.ts`
- Modify: `apps/mobile/lib/storage-bootstrap.ts` (register `useNextUpStore.getState().hydrate()`), `apps/mobile/stores/data-store.ts`
- Test: `apps/mobile/lib/__tests__/activity-streak.test.ts`, `apps/mobile/lib/__tests__/next-up-store.test.ts`

**Interfaces:**
- Consumes: `NextUpPayload` (Task 5); `localISODate`, `addDaysISO`, `atlanticISODate`.
- Produces:
  - `useNextUpStore` state: `payload: NextUpPayload | null`, `fetchedAt: number | null`, `localSnoozes: Record<string, string>`, `voiceNoteDoneOn: string | null`, `pendingCall: { clientId: string; clientName: string; at: number } | null`.
  - `useNextUpStore` methods:
    - `hydrate(): void`;
    - `fetchNextUp(opts?: { force?: boolean }): Promise<void>`: GET `${API_URL}/api/next-up` with the Bearer token and the 15 s timeout, at most once a minute unless forced; it keeps the cached payload on any error;
    - `snoozeCard(key: string, until: string): void`, `markVoiceNoteDone(day: string): void`;
    - `setPendingCall(c): void`, `clearPendingCall(): void`;
    - `dropHandfulClient(clientId: string): void` (optimistic).
  - MMKV keys: `next_up_payload`, `next_up_local_snoozes`, `next_up_voice_note_done_on`, `next_up_pending_call`.
  - `activityStreak(days: readonly string[], today: string): number` holds the existing `contactStreak` algorithm, moved. `activitiesOnDay(dates: readonly string[], day: string): number`.
  - data-store additions:
    - `schedule: { kind: "showing" | "appointment"; client_id: string | null; date: string }[]` from `property_showings` and `listing_appointments`, today..+14, appointments with status `scheduled` or `active`;
    - `tripsLoggedToday: number` (a head count on `mileage_logs` with `trip_date = today`);
    - `recentActivityDates: string[]` (`contact_activities.activity_date` from the last 60 days, paged with the store's existing list paging);
    - `scoreCompare: { captured_on: string; score: number } | null` (the latest `runway_score_history` row with `captured_on <= addDaysISO(savedOn, -7)`).
  - `fetchDashboardExtras(): Promise<void>` loads those four. It runs after a successful `fetchAll`, in the background, next to `fetchBriefing`, and then `useNextUpStore.getState().fetchNextUp()`.
  - `contactStreak()` and `todayActivityCount()` now read `recentActivityDates`. Writes that log an activity append to it optimistically.
  - `saveCache` adds `outreachQueue`, `schedule`, `tripsLoggedToday`, `recentActivityDates` and `scoreCompare`; `CACHE_VERSION = 10`.
  - The `runway_score_snapshot` type gains `updated_at?: string`.

- [ ] **Step 1: Write the failing tests:**
  - `activityStreak(["2026-10-19","2026-10-18","2026-10-16"], "2026-10-19") === 2`.
  - A streak whose newest day is the day before yesterday is 0.
  - `next-up-store`: `hydrate` restores payload, snoozes and the pending call from the mocked MMKV (as `voice-capture.test.ts` mocks modules). A failed fetch keeps the old payload. A second `fetchNextUp()` within 60 s makes no request.
- [ ] **Step 2: Run and confirm failure.** Run: `pnpm --filter @agent-runway/mobile test`. Expected: FAIL.
- [ ] **Step 3: Implement.** The phone's `followUpsDue` is not touched here; Task 9 deletes it.
- [ ] **Step 4: Run the tests and typecheck.** Run: `pnpm --filter @agent-runway/mobile test && pnpm --filter @agent-runway/mobile typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): cache the day's Next up and load the dashboard's extras`.

### Task 9: Phone dashboard layout

**Files:**
- Modify: `apps/mobile/app/(app)/index.tsx`
- Create in `apps/mobile/components/next-up/`: `WelcomeHeader.tsx`, `NextUpStack.tsx`, `NextUpCard.tsx`, `AlsoWaitingList.tsx`, `AllClearCard.tsx`
- Modify: `packages/i18n/mobile/en/home.json` (new namespaces only, see copy below)

**Interfaces:**
- Consumes: `buildNextUp`, `cardActions` (Task 7); stores (Task 8); `atlanticHour`, `timeBand`, `atlanticISODate`.
- Produces: `NextUpCard` props `{ card: NextUpCard; index: number; total: number; onAction: (action: NextUpAction, card: NextUpCard) => void; busy?: boolean }`. `AlsoWaitingList` props `{ rows: AlsoWaitingRow[]; onOpen: (s: SectionKey) => void; onSwipeDone: (taskId: string) => void }`. Task 10 supplies the handlers for `call`, `text`, `later`, `dismiss`, `mark_one_done` and `record_voice_note`, plus swipe. This task wires the `open_*` actions:

| Action or section | Route |
|---|---|
| `open_checklist`, row `checklist` | `/profile/checklist` |
| `open_briefing` | `/profile/briefing` |
| `open_deals`, row `deals` | `/deals` |
| `open_messages`, row `messages` | `/profile/outreach?tab=texts` |
| `open_receipts`, row `receipts` | `/profile/expenses` |
| `open_mileage` | `/profile/mileage` |
| row `new_leads` | `/clients` |
| row `handful` | `/profile/outreach` |

- **Layout, top to bottom.**
  1. The AGENT RUNWAY mark.
  2. "Good morning/afternoon/evening, <first name>". The greeting key comes from `atlanticHour()` with the band hours.
  3. One context line.
  4. The progress line, "2 of 5 done today · 6-day streak". The streak part shows only at 2 or more and never comments on a break.
  5. The sync status line (unchanged).
  6. The stack: "NEXT UP", "1 OF N", page dots, a horizontal paging list, and two ghost cards behind. The tone is by kind; only `overdue_tasks` uses the red family.
  7. "Also waiting", one row per section with its count pill and a chevron.
  8. `AllClearCard` when the stack is empty.
  9. The "+" FAB and `QuickCaptureSheet`, unchanged.
- **Removed:** `QuickAccessTile`, `ActionPill`, `AllCaughtUpPill`, the hero gauge card and `RunwayGauge`, Today's Focus, the Key Metrics grid (Task 11 re-adds it in the sheet), Goal Progress (also Task 11), the Next Task card, Pipeline Preview, `followUpsDue`, `actionItems` and the sparkline memos.
- **Layout slots:** a top-right slot reserved for the badge (Task 11). `DashboardSkeleton` shows only when there's no cache at all.
- **en copy** (new keys; plurals use `_plural` as the file does):
  - `welcome.showings` "{{count}} showing today" / "{{count}} showings today"
  - `welcome.appointments` "{{count}} listing appointment today"
  - `welcome.showingsAndAppointments` "{{showings}} showings and {{appointments}} listing appointments today"
  - `welcome.waiting` "{{count}} thing waiting" / "{{count}} things waiting"
  - `welcome.allClear` "Nothing waiting right now"
  - `welcome.progress` "{{done}} of {{target}} done today"
  - `welcome.streak` "{{count}}-day streak"
  - `stack.title` "NEXT UP"; `stack.position` "{{index}} OF {{total}}"
  - `stack.newLead` "Call {{name}}" / "New lead · {{hours}} hours, no contact yet"
  - `stack.overdue` "{{count}} task is overdue" / "{{count}} tasks are overdue", with `stack.overdueOldest` "Oldest: {{title}}, due {{day}}"
  - `stack.tasksToday` "{{count}} tasks due today"
  - `stack.dealDeadline` "{{address}} closes in {{days}} days" / "Conditions due in {{days}} days"
  - `stack.briefing` "Your morning briefing" / "{{count}} items to look at"
  - `stack.handful` uses the server's `label` and `why_now`; `stack.returning` "Back from Later"
  - `stack.messages` "{{count}} messages ready to send"
  - `stack.voiceNote` "Anything to note from today?"
  - `stack.receipts` "{{count}} receipt has no date"
  - `stack.trips` "Log today's driving"
  - `alsoWaiting.title` "Also waiting"
  - `alsoWaiting.checklist` "Checklist"; `alsoWaiting.newLeads` "New leads"; `alsoWaiting.deals` "{{count}} close dates have passed"; `alsoWaiting.handful` "Today's handful"; `alsoWaiting.messages` "Messages ready"; `alsoWaiting.receipts` "Receipts"
  - `allClear.title` "You're all caught up"; `allClear.nextShowing` "Next showing: {{day}}"; `allClear.nextTask` "Next task: {{title}}, {{day}}"; `allClear.nothing` "Nothing else is scheduled"
  - buttons, in a new `cardActions` namespace (`actions` already holds the old pills): `cardActions.call` "Call", `cardActions.text` "Text", `cardActions.later` "Later", `cardActions.openChecklist` "Open checklist", `cardActions.markOneDone` "Mark one done", `cardActions.open` "Open"
  - Days are printed with `toLocaleDateString` on local-noon calendar dates, never with a `timeZone`.

- [ ] **Step 1: Build the components and wire `buildNextUp`** in a `useMemo` over the store slices plus a 30 s tick. The existing tick drives band changes and snooze returns. When a snoozed handful client's `until` passes while the screen is open, call `fetchNextUp({ force: true })`. Input mapping:
  - `today = atlanticISODate()`, `band = timeBand(atlanticHour())`;
  - `briefingCount = todayBriefing().length`;
  - `undatedReceipts` = receipts with a null `expense_date`;
  - `outreachReady` = `outreachQueue` rows with status `ready`;
  - `activitiesToday = todayActivityCount()`.
- [ ] **Step 2: Verify:**
  - `pnpm --filter @agent-runway/mobile typecheck && pnpm --filter @agent-runway/mobile test`. Expected: PASS.
  - `cd apps/mobile && npx expo export --platform ios --output-dir "$SCRATCH/expo-export"`. Expected: the bundle builds with no unresolved import.
  - `grep -n "followUpsDue\|QuickAccessTile\|RunwayGauge" "apps/mobile/app/(app)/index.tsx"`. Expected: no output.
- [ ] **Step 3: Commit** `feat(mobile): dashboard leads with a welcome, Next up and Also waiting`.

### Task 10: Phone card actions

**Files:**
- Create: `apps/mobile/lib/send-queued-text.ts`, `apps/mobile/lib/post-call.ts`
- Create in `apps/mobile/components/next-up/`: `LaterSheet.tsx`, `DismissSheet.tsx`, `PostCallSheet.tsx`
- Modify: `apps/mobile/app/(app)/profile/outreach.tsx` (use `sendQueuedText`), `apps/mobile/app/(app)/index.tsx`, `apps/mobile/app/(app)/clients.tsx` (accept `clientId` param), `apps/mobile/stores/next-up-store.ts` (write actions)
- Test: `apps/mobile/lib/__tests__/send-queued-text.test.ts`, `apps/mobile/lib/__tests__/post-call.test.ts`

**Interfaces:**
- Consumes: Task 3 writers; Task 2 `laterChoices`, `laterUntil`, `stopUntil`, `dismissChoicesFor`; data-store `draftTexts`, `markTexted`, `markTaskDone`, `fetchOutreach`; `VoiceCaptureButton` (`variant="inline"`, `context={{ clientId, clientName }}`), `VoiceCaptureSheet`, `CompleteTaskSheet`; `textCheckOutcome`.
- Produces:
  - `sendQueuedText(item: Pick<OutreachItem, "id" | "final_body" | "ai_body" | "context" | "clients">, deps: { getToken: () => Promise<string | null>; fetchFn: typeof fetch; sms: { isAvailableAsync(): Promise<boolean>; sendSMSAsync(to: string[], body: string): Promise<{ result: string }> }; markTexted(id: string, body: string): Promise<boolean>; alert(title: string, message: string): void }): Promise<"sent" | "cancelled" | "refused" | "failed">`. It is the outreach screen's `handleSendText` logic, moved, and that screen calls it.
  - `shouldAskAfterCall(pending: { at: number } | null, now: number): boolean` (true within 2 hours of dialling).
  - `useNextUpStore` write actions, each using the core writer with `supabase` and the user id; each returns `Promise<boolean>`:
    - `skipSuggestion(item: HandfulItem)`;
    - `holdSuggestion(item: { client_id; client_name }, kind: "later" | "stop", until: Date)`;
    - `resumeSuggestion(clientId)`;
    - `moveToHangar(clientId, name)`;
    - `logTalkedTo(clientId, name, type: "call" | "text" | "meeting")` (via `writeContactActivity`, description "").
  - On success each one drops the client optimistically, calls `fetchNextUp({ force: true })`, and shows a toast with Undo.
  - On an offline error the card stays and the toast says "No connection. Try again." (correction 16).

Action behaviour:

- **Call.** `Linking.openURL("tel:"+phone)` and `setPendingCall`. The dashboard's `AppState` listener checks `shouldAskAfterCall` when the app is back `active` and opens `PostCallSheet`:
  - title "How did the call with {{name}} go?";
  - the inline voice button, whose proposal opens `VoiceCaptureSheet` (nothing saves until Confirm);
  - "Just log the call", which is `logTalkedTo(…, "call")`;
  - "Not now".

  Any choice clears the pending call.
- **Text.**
  - `ready`: find the queue row in `outreachQueue`, or `fetchOutreach()` and retry once, then `sendQueuedText`.
  - `draftable` and new leads: show a short spinner on the button, then `draftTexts([id], purpose, note)`. Handful items use `textPurposeFor` + `label`; new leads use `"check_in"` + `"New lead, first contact"`. A `created`/`existing` result goes to `fetchOutreach`, then `sendQueuedText`. `call_only`/`skipped` shows an alert "Call instead" with the server's reason.
- **Later.** `LaterSheet` lists `laterChoices(now)` as "In an hour", "Tonight", "Tomorrow morning". A handful client gets `holdSuggestion(…, "later", laterUntil(choice, now))`; any other card gets `snoozeCard(card.key, until)`.
- **Dismiss.** `DismissSheet` shows `dismissChoicesFor(type)`:
  - "Already talked to them": chips Call / Text / In person, which call `logTalkedTo` with `call` / `text` / `meeting`;
  - "Later": the same sheet as above;
  - "Skip this time": `skipSuggestion`;
  - "Stop suggesting": 3 months / 6 months / "Move to the Hangar", the last with a confirm.
- **Mark one done.** The oldest overdue (or due-today) task. A task with a client opens `CompleteTaskSheet`; otherwise `markTaskDone` and the existing `nextUp.ticked` toast.
- **Swipe** on a checklist row whose `swipeTaskId` is set: `Swipeable` from `react-native-gesture-handler`, same behaviour as Mark one done.
- **Voice note card.** It opens the same inline voice button in a sheet; a confirm or "Not now" calls `markVoiceNoteDone(today)`.
- **Open client.** `router.push({ pathname: "/clients", params: { clientId } })`. `clients.tsx` reads `useLocalSearchParams<{ clientId?: string }>()` and opens that client once.

- [ ] **Step 1: Write the failing tests:**
  - `sendQueuedText`: a refused text-check never opens Messages and returns `"refused"`. `sent` calls `markTexted` once. `cancelled` writes nothing. With no token it returns `"refused"` (fails closed).
  - `shouldAskAfterCall` is true at 1 h 59 m and false at 2 h 1 m.
- [ ] **Step 2: Run and confirm failure.** Run: `pnpm --filter @agent-runway/mobile test`. Expected: FAIL.
- [ ] **Step 3: Implement** the sheets, store actions and handlers.
  - en copy: `later.title` "Bring it back", `later.inAnHour` "In an hour", `later.tonight` "Tonight", `later.tomorrow` "Tomorrow morning".
  - `dismiss.title` "Not now for {{name}}?", `dismiss.alreadyTalked` "Already talked to them", `dismiss.later` "Later", `dismiss.skip` "Skip this time", `dismiss.stop` "Stop suggesting".
  - `dismiss.threeMonths` "For 3 months", `dismiss.sixMonths` "For 6 months", `dismiss.hangar` "Move to the Hangar", `dismiss.inPerson` "In person".
  - `postCall.title`, `postCall.logOnly` "Just log the call", `postCall.notNow` "Not now".
  - Toasts mirror Task 6's copy.
- [ ] **Step 4: Verify:**
  - `pnpm --filter @agent-runway/mobile test && pnpm --filter @agent-runway/mobile typecheck`. Expected: PASS.
  - The `expo export` smoke check from Task 9 builds.
- [ ] **Step 5: Commit** `feat(mobile): Next up buttons call, text, snooze and dismiss through the shared writers`.

### Task 11: Score badge and score sheet

**Files:**
- Create: `packages/core/lib/next-up/score-badge.ts`
- Modify: `packages/core/engines/runway-score-engine.ts` (export the private `grade` as `gradeForScore(score: number): string`)
- Create in `apps/mobile/components/next-up/`: `ScoreBadge.tsx`, `ScoreSheet.tsx`, `YourNumbers.tsx` (the `MetricCard` tiles and Goal Progress, moved from `index.tsx`)
- Modify: `apps/mobile/app/(app)/index.tsx` (badge in the top-right slot; `gradeGlyph` deleted in favour of `gradeForScore`)
- Test: `packages/core/lib/__tests__/next-up-score-badge.test.ts`, `apps/mobile/lib/__tests__/score-sheet-copy.test.ts`

**Interfaces:**
- Consumes: data-store `settings.runway_score_snapshot` (`score`, `grade`, `stateLabel`, `components`, `updated_at`), `scoreCompare` (Task 8), `ytdGci`, `ytdDealCount`, `pipelineValue`, `settings.goal_gci`; `bandColorHexForScore`, `stateLabel`.
- Produces:
  - `SCORE_TREND_DAYS = 7`, `SCORE_STALE_DAYS = 3`.
  - `scoreTrend(current: { score: number; savedOn: string | null }, compare: { captured_on: string; score: number } | null): { delta: number; direction: "up" | "down" } | null`. It returns null when there's no compare row, when `savedOn` is null, when `captured_on > savedOn - 7 days`, or when the delta is 0.
  - `scoreAsOf(savedOn: string | null, today: string): string | null`. It returns `savedOn` when `daysBetweenISO(savedOn, today) > 3`.
  - `PART_LABELS: Record<string, "pace" | "pipeline" | "expenses" | "bench" | "survival">`, mapping `"Goal Pace"`, `"Pipeline"`, `"Expenses"`, `"Benchmark"` and `"Survival"`.
  - `lowestPart(components: { label: string; score: number }[]): { part: string; score: number } | null` (ties go to engine order).

Badge and sheet:

- **Badge.** A mini SVG ring in the band colour with the number. The trend tag reads "▼ 3" or "▲ 2". The glow is red when the direction is down, green when up, and absent otherwise. With no snapshot it shows "–".
- **Sheet, top to bottom.**
  1. Big ring and grade chip (`gradeForScore`).
  2. "<state label> · down 3 since last week". The trend part is left out when null; " · as of <day>" is added when `scoreAsOf` is set.
  3. Five bars in engine order, each with its value.
  4. "Lowest part: <Part>, at <n> of 100."
  5. "Full breakdown ›": close this sheet, then open the existing `ScoreBreakdownSheet`.
  6. "Your numbers": YTD GCI, Deals closed, Pipeline value, and the goal bar, which taps through to `/profile/forecast`.
- **No snapshot.** The sheet keeps the existing "Open the web dashboard…" line.
- **en copy:**
  - `scoreSheet.down` "down {{count}} since last week" / `scoreSheet.up` "up {{count}} since last week"
  - `scoreSheet.asOf` "as of {{day}}"
  - `scoreSheet.lowest` "Lowest part: {{part}}, at {{score}} of 100."
  - `scoreSheet.fullBreakdown` "Full breakdown"
  - `yourNumbers.title` "Your numbers"; tiles reuse `metrics.*` and the goal reuses `goal.*`

- [ ] **Step 1: Write the failing tests:**
  - A compare row 7 days older gives the delta. A row 6 days older gives null. A delta of 0 gives null.
  - Saved 4 days ago gives "as of"; saved 3 days ago gives null.
  - `lowestPart` names Benchmark at 6.
  - Copy guard: every value under `scoreSheet` and `yourNumbers` in `packages/i18n/mobile/*/home.json` has no word "good", "strong" or "should" (case-insensitive, whole word) and no "—".
- [ ] **Step 2: Run and confirm failure.** Run: `pnpm --filter @agent-runway/core exec vitest run lib/__tests__/next-up-score-badge.test.ts && pnpm --filter @agent-runway/mobile test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify:** `pnpm --filter @agent-runway/core test && pnpm --filter @agent-runway/mobile test && pnpm --filter @agent-runway/mobile typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): score badge with trend, and a score sheet with your numbers`.

### Task 12: Flight Crew, MCP and the knowledge base

**Files:**
- Modify: `apps/web/lib/ai/tools.ts`:
  - tools next to `listConsentLapsing` (~L4248);
  - `NEEDS_APPROVAL_TOOLS` (L199–255) and `APPROVAL_DESCRIPTIONS` (L258–420);
  - persona sets in `createPersonaAgentTools` (Captain L4641+, Dispatcher L4707+).
- Modify: `apps/web/components/ai-chat.tsx` (`TOOL_STATUS_LABELS`, `TOOL_LABELS`), `packages/core/lib/ai-activity.ts` (`TOOL_LABELS`)
- Modify: `apps/web/lib/flight-crew/system-prompts.ts` (Dispatcher outreach section ~L490–519)
- Modify: `apps/web/lib/knowledge-base.ts` (FLIGHT CONTROL entry L116; new NEXT UP entry in PAGES)
- Create: `apps/web/supabase/functions/mcp-server/tools/next-up.ts`, `apps/web/supabase/functions/mcp-server/lib/app-url.ts` (move `appUrl()` out of `tools/capture.ts`)
- Modify: `apps/web/supabase/functions/mcp-server/tools/index.ts` (register; `available_tools`; "41 tools live")
- Modify: the files `public-claims.test.ts` checks: `public/mcp-server.json`, `lib/mcp-server/tool-catalog.ts`, `app/mcp/page.tsx`, `app/oauth/consent/page.tsx`, `public/.well-known/mcp.json`, `docs/mcp-registry-submissions.md`, the MCP lines in `public/llms.txt` and `lib/schema.ts`
- Test: `apps/web/lib/ai/__tests__/next-up-tools.test.ts`, `apps/web/lib/mcp-server/__tests__/next-up-tools.test.ts`, `apps/web/lib/__tests__/next-up-knowledge.test.ts`; existing `public-claims.test.ts`, `ai-activity-tools.test.ts`, `deno-imports.test.ts`

**Interfaces:**
- Consumes: `buildNextUpPayload` and the `/api/next-up` route (Task 5), the Task 3 writers, and Task 2's `laterUntil` / `stopUntil`.
- Produces:

| Surface | Tool | Arguments | Approval |
|---|---|---|---|
| Flight Crew | `getNextUp` | none | read; Captain + Dispatcher |
| Flight Crew | `skipSuggestedClient` | `{ clientId }` | yes; Dispatcher |
| Flight Crew | `snoozeSuggestedClient` | `{ clientId, until: "in_an_hour" \| "tonight" \| "tomorrow" }` | yes; Dispatcher |
| Flight Crew | `stopSuggestingClient` | `{ clientId, duration: "3_months" \| "6_months" \| "hangar" }` | yes; Dispatcher |
| MCP | `get_next_up` | none | `readOnlyHint: true` |
| MCP | `skip_suggested_client` | `{ client_id }` | `readOnlyHint: false` |
| MCP | `snooze_suggested_client` | `{ client_id, until }` | `readOnlyHint: false` |
| MCP | `stop_suggesting_client` | `{ client_id, duration }` | `readOnlyHint: false`, `destructiveHint: true` for `hangar` |

- `getNextUp` returns JSON: `{ day, done_today, target, handful: [{ client, reason, why_now, channel }], on_later: [...], urgent }`. It comes from `buildNextUpPayload(userId, supabase, { persist: false, now: new Date() })`, the same payload the phone and MCP get. No AI call and no write, so nothing lands on the ledger.
- Skip acts only on a client in the current handful: it uses that occurrence and refuses with "<name> isn't in today's suggestions." otherwise. Snooze and stop accept any of the agent's non-archived clients. Stop's `hangar` uses `writeClientToHangar`.
- `get_next_up` fetches `${appUrl()}/api/next-up?persist=0&draft=0` with the caller's `accessToken`, as `capture_note` does. The MCP skip tool resolves the occurrence from that payload. MCP writes use `_shared/core/lib/record-writers.ts` and aren't ledgered (correction 10).
- Approval card text:
  - "Skip <name> this time. They come back at their next reason to reach out."
  - "Hide <name> from suggestions until <time>."
  - "No suggestions for <name> for <3 months | 6 months>."
  - "Move <name> to the Hangar."

  None of them says "cannot be undone" (`ai-activity-tools.test.ts`).
- **Dispatcher prompt.** "For 'who should I call today' use getNextUp; relay the reason as given. Skip, Later and Stop are the agent's choice: propose one, never apply it unasked."
- **KB `NEXT UP (phone dashboard; since 2026-10-19)`** covers:
  - welcome, badge and sheet;
  - the stack and its time bands;
  - "Today's handful" is Flight Control's 5;
  - Skip, Later and Stop, stored once and honoured on the phone, the web Scan, the nightly drafts and Flight Crew;
  - progress "N of 5 done today";
  - a consent-lapsing notice isn't hidden by Stop.
- **The FLIGHT CONTROL entry** gains the Dismiss menu and the sticky picks.

- [ ] **Step 1: Write the failing tests:**
  - **Flight Crew tools** (fake supabase and stubbed `buildNextUpPayload`):
    - `skipSuggestedClient` writes one `kind:"skip"` row with the handful's occurrence and refuses a client outside the handful;
    - `snoozeSuggestedClient("tonight")` writes `until` = `laterUntil("tonight", now)`;
    - every new write tool is in `NEEDS_APPROVAL_TOOLS` and has an `APPROVAL_DESCRIPTIONS` entry;
    - `getNextUp` makes no writes.
  - **MCP**, with `tool-harness.ts` and a stubbed `fetch`:
    - `get_next_up` calls `/api/next-up?persist=0&draft=0` with `Authorization: Bearer <token>`;
    - `skip_suggested_client` writes the occurrence from the payload;
    - `public-claims.test.ts` passes at 41 tools.
  - **KB:** the `**NEXT UP**` entry exists, names Skip, Later and Stop, and contains no em dash and no advice word (the pattern of `recurring-list-footer-ai.test.ts`).
- [ ] **Step 2: Run and confirm failure.** Run: `pnpm --filter agentrunway-web exec vitest run lib/ai/__tests__/next-up-tools.test.ts lib/mcp-server/__tests__/next-up-tools.test.ts lib/__tests__/next-up-knowledge.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify:**
  - `pnpm --filter agentrunway-web test && pnpm --filter agentrunway-web exec tsc --noEmit`. Expected: PASS, including `deno-imports.test.ts` and `public-claims.test.ts`.
  - Smoke check: `pnpm build:mcp-shared`, then load each `apps/web/supabase/functions/mcp-server/tools/*.ts` with plain `node` (v24 strips types), then delete `apps/web/supabase/functions/_shared`. Expected: every file loads.
- [ ] **Step 5: Commit** `feat(ai): Flight Crew and MCP read today's Next up and can skip, snooze or stop a suggestion`.

### Task 13: Translations for the 9 other locales

**Files:**
- Modify: `packages/i18n/mobile/{fr-CA,zh,pa,yue,es,tl,ar,hi,ur}/home.json`
- Test: `apps/mobile/lib/__tests__/next-up-locales.test.ts`

**Interfaces:**
- Consumes: the en keys added in Tasks 9–11 under `welcome`, `stack`, `alsoWaiting`, `allClear`, `cardActions`, `later`, `dismiss`, `postCall`, `scoreSheet` and `yourNumbers`.
- Produces: `NEXT_UP_NAMESPACES` (exported from the test file).

- [ ] **Step 1: Write the failing guard.** For every key path under those namespaces in `en/home.json`, each of the 10 locales has a non-empty string. A `_plural` key exists wherever en has one. No value contains "—". `{{placeholders}}` match en's exactly.
- [ ] **Step 2: Run and confirm failure.** Run: `pnpm --filter @agent-runway/mobile exec vitest run lib/__tests__/next-up-locales.test.ts`. Expected: FAIL with missing keys listed.
- [ ] **Step 3: Translate.**
  - Write real translations in plain words, in the register each file already uses.
  - Keep `{{placeholders}}`, "Next up", "Flight Control" and "Hangar" as the files already treat product names.
  - Leave existing missing keys outside these namespaces alone.
- [ ] **Step 4: Verify:** `pnpm --filter @agent-runway/mobile test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(i18n): Next up strings in all 10 phone languages`.

### Task 14: Ship, redeploy, rebuild and verify

**Files:** none new. Optional: a memory finding `findings/phone_dashboard_next_up_2026-10-19.md` and the SR&ED daily log entry.

- [ ] **Step 1: Merge main and run the full suite.**
  - `git fetch origin && git merge origin/main`
  - `pnpm install --frozen-lockfile && pnpm turbo test && pnpm --filter agentrunway-web exec tsc --noEmit && pnpm --filter @agent-runway/mobile typecheck`

  Expected: all green. Timeouts while sibling sessions run suites: re-run with `--concurrency=1 --continue` first.
- [ ] **Step 2: Open PR B (Tasks 7–13).**
  1. Push every fix.
  2. Check the squash will contain them (`git show <merge>:<path>` after the merge).
  3. Enable auto-merge with `gh pr merge --auto --squash`.
  4. After the merge, confirm the Vercel production status of the merge commit is success (`gh api repos/Ashaw19/agentrunway-web/commits/<sha>/statuses`). "Merged" isn't "deployed".
- [ ] **Step 3: Check production by shape** (Chrome, signed in, `javascript_tool` returning booleans and counts only, no figures or names):
  - `/api/next-up?persist=0&draft=0` is 200, with `handful.length <= 5` and `Number.isInteger(done_today)`.
  - The `/flight-control` Dismiss menu shows 3 entries.
  - A read-only Flight Crew question ("who should I call today?") calls `getNextUp` and logs an `ai_runs` row with no `ai_run_writes`.
- [ ] **Step 4: Redeploy the MCP server** from a clean checkout of `origin/main`:
  1. `pnpm build:mcp-shared` FIRST.
  2. Run the node smoke check from Task 12.
  3. `cd apps/web && npx --yes supabase@2.109.0 functions deploy mcp-server --project-ref wlxkvnbncfzkmxzexgxt --no-verify-jwt --use-api`. Don't use the connector's `deploy_edge_function`.
  4. `rm -rf apps/web/supabase/functions/_shared`.
  5. Boot check: POST to the function URL with no credentials. Expected: the function's own 401 JSON, "Missing or invalid Authorization header."
- [ ] **Step 5: Rebuild the phone, only after the merge.** Run `/Users/b/Developer/reinstall-agentrunway-iphone.sh update`. Expected: the build installs on the device; it won't auto-launch while the phone is locked.
- [ ] **Step 6: Device checklist for Andrew.** The phone can't be driven from here; report each line as checked or not checked.
  1. The app opens on cached figures with no spinner (airplane mode too).
  2. The welcome line and "N of 5 done today · N-day streak" appear.
  3. The badge shows the trend, and the sheet shows parts, the lowest part, Full breakdown and Your numbers.
  4. Swiping the stack moves "1 OF N".
  5. Call dials, and coming back asks for the voice note.
  6. Text opens Messages prefilled; cancelling logs nothing.
  7. Later "in an hour" hides the card, and it comes back.
  8. Skip on the phone is gone from web Flight Control after a refresh, and the reverse.
  9. Stop for 3 months hides the client on both surfaces.
  10. A single overdue general task swipes done.
  11. The language switch shows the new strings in fr-CA.
- [ ] **Step 7: Record.**
  - Write the finding note with the binding rules this build adds:
    - handful = `loadNextUpHandful`, never a copy of the ranking;
    - holds via `withoutDismissedOrHeld`;
    - dismissal writes via the record-writers;
    - the MCP mirrors need a redeploy after any change.
  - Add the MEMORY.md index line and the SR&ED log entry.
