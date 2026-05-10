# CLAUDE.md — Agent Runway Repo Conventions

This file is the repo-scoped contract for any agent (Claude Code, champion
subagents, future Connector) or human working in `agentrunway-web`. It defines
the mechanical checkpoints every change must clear before it ships.

It complements — does not replace — Andrew's user-scoped memory at
`/Users/b/.claude/projects/-Users-b-Desktop-Agent-Runway-Website-Project-Home-02---Web-App-Code/memory/`.
Memory is personal and persistent. This file is repo-bound: if a rule belongs
to the codebase, it lives here. If a rule belongs to Andrew's workflow, it
lives in memory. Where they overlap, memory is authoritative and this file
links back.

Andrew is not a developer. Claude is the engineering discipline. Every bug
that reaches production is a process failure. Read `memory/feedback_engineering_discipline.md`.

---

## The Six Mechanical Checkpoints

Every non-trivial change must clear all six. No exceptions.

### 1. Pre-edit grep

Before editing any symbol, type, metric name, table name, column name, or
route path: grep the repo for every usage. Read each caller. Bugs travel in
packs — the same mental model that produced the bug you're looking at
produced its siblings.

- Source: `memory/feedback_grep_pattern_on_bugfix.md`
- Schema verification: `memory/feedback_data_consistency_protocol.md`
- Grep targets: `apps/`, `packages/`, `supabase/`, `scripts/`

### 2. Metric consistency cross-check

<!-- dashboard-integrity-champion: expand with canonical-engine enumeration and Audit 1 pre-check protocol -->

Before computing any business metric on a new surface (chat route, MCP tool,
cron job, edge function, email, blog, mobile): find the canonical engine in
`packages/core/engines/` and call it. Do not reimplement. If the engine needs
an argument shape you don't have, fetch the data the same way the dashboard
fetches it, and pass it in.

Cross-reference the dashboard's inputs character-by-character. Same table,
same columns, same filters, same fallback values, same computation chain. If
any difference exists, resolve it — align to the dashboard or document why
the divergence is intentional in the commit message.

- Source: `memory/feedback_data_consistency_protocol.md`
- Dashboard: `apps/web/app/(app)/dashboard/` (primary display source of truth)
- Engines: `packages/core/engines/` (primary computation source of truth)

### 3. Test-plan-first

Before writing code for any non-trivial change, state the test plan:
- What commands will run (`pnpm turbo test`, targeted vitest file, manual
  browser walkthrough, SQL check).
- What outcomes prove the fix.
- What remains unverified and why.

No "ship and see." No "this should work now." Report what was tested and what
was not.

- Source: `memory/feedback_engineering_discipline.md`, `memory/session_startup_prompt.md`

### 4. Session scope discipline

One audit, one feature, one bug class per session. 60–90 min cap. If a
session surfaces independent issues, file them for separate sessions. Do not
marathon. Do not whack-a-mole.

If Andrew pivots mid-session, flag the pivot and ask whether to split into a
new thread.

- Source: `memory/session_startup_prompt.md`, `memory/project_flight_crew_resume_here.md`

### 5. Post-fix grep

After fixing any bug, grep the repo a second time for the same pattern. Fix
every occurrence in the same commit. If a sibling instance is out of scope,
say so explicitly in the commit body — do not leave it silently.

Walk the entire user flow end-to-end before declaring fixed. UI -> API ->
engine -> DB -> back. The reported bug is rarely the only one on that path.

- Source: `memory/feedback_grep_pattern_on_bugfix.md`

### 6. Working-tree isolation

Before any edit, verify your working directory matches your champion's assigned
worktree (see the **Working-tree isolation** section at the bottom of this file).

```bash
pwd           # must match your champion's entry in the worktree table
git status    # must be clean — no untracked files from a sibling session
```

If `pwd` is the primary tree (`agentrunway-web/`) and you are a champion
subagent doing feature work, **stop and `cd` to your assigned worktree first.**

Source: `memory/findings/infra_branch_contamination_root_cause_2026-05-10.md`

### 7. Lockfile-change typecheck

Before merging any PR that modifies `pnpm-lock.yaml` (including all
Dependabot PRs): run a cache-busting full typecheck.

```bash
cd apps/web
pnpm install --frozen-lockfile
npx tsc --noEmit
```

`pnpm turbo build` reuses per-file cache and will pass even when a
dependency bump introduces regressions in unmodified files. Vercel's
clean-room build will catch them — but only as a production failure after
merge. Run this locally (or verify the `lockfile-typecheck` CI job is
green) before clicking Merge.

Source: `memory/findings/infra_turbo_cache_masking_dependency_regressions_2026-05-06.md`

---

## Never-Do List

Explicit forbidden patterns. Violating any of these is a bug, not a judgment
call.

- **Never push to main with red tests.** If `pnpm turbo test` or typecheck is
  failing, fix the test before pushing. Red main blocks every other champion.
- **Never bypass `--frozen-lockfile`.** Install with `pnpm install
  --frozen-lockfile` in CI-adjacent work. Lockfile drift is a supply-chain
  bug.
- **Never use `--no-verify` on commits or `--no-gpg-sign`** unless Andrew
  explicitly requests it. Pre-commit hooks exist for a reason. Fix the hook
  failure.
- **Never force-push to `main`.** Warn Andrew if he asks for it.
- **Never reimplement engine logic outside `packages/core/engines/`.** Route
  handlers, MCP tools, cron jobs, and UI components import engines. They do
  not duplicate them. See `memory/feedback_data_consistency_protocol.md`.
- **Never cast-bypass TypeScript with `as` to paper over fixture drift.** On
  April 21 a `as UserSettings` cast at
  `packages/core/engines/__tests__/test-data.ts` hid 73 missing fields and
  produced a passing test for a broken engine input shape. If `as` is the
  only way a file compiles, stop — the type or the fixture is the bug, not
  the compiler.
- **Never mock the database in integration tests.** Integration tests run
  against real Supabase (local or ephemeral). Unit tests may stub inputs, but
  a test that mocks `from('transactions')` is a lie.
- **Never ship a tax surface without the info-not-advice disclaimer.**
  Forbidden verbs: should, recommend, must, need to, build up, set aside, top
  up, pad, critical zone. Safe verbs: indicates, estimates, may, could. Every
  tax chat, card, MCP tool, blog post, and email. See
  `memory/feedback_tax_information_not_advice.md`.
- **Never deploy via Vercel CLI** (`vercel --prod`, `vercel deploy`). Push to
  `main` is the deploy mechanism. See `memory/feedback_deploy_immediately.md`.
- **Never create a table without RLS policies in the same migration.**
- **Never propose Gmail / Google Workspace / Apps Script email
  integrations.** CASA-shelved. See `memory/project_google_integrations.md`.
- **Never open anything under `/Users/b/Desktop/All Agent Runway Material/`**
  — PII folder. See `memory/feedback_pii_protection.md`.
- **Never use the `.com` domain.** It is `agentrunway.ca`. See
  `memory/feedback_domain_is_ca.md`.
- **Never run `git checkout`, `git add`, or `git commit` from the primary
  `agentrunway-web/` working tree during a champion subagent session.** That
  tree is reserved for main-line maintenance and hot-fix sessions. Champion
  feature work goes in the assigned worktree (`worktrees/<slug>/`). Violating
  this is the root cause of the 2026-05-09 branch-contamination incidents.
  See `memory/findings/infra_branch_contamination_root_cause_2026-05-10.md`.

---

## Working-tree isolation

Four linked worktrees exist alongside the primary tree. Each parallel champion
session gets its own directory so staging areas never bleed across sessions.

| Champion(s) | Worktree path |
|---|---|
| `tax-expenses-champion`, `gtm-growth-champion` (SEO articles, content) | `../worktrees/seo/` |
| `corporate-finance-champion` (Director Cockpit) | `../worktrees/cockpit/` |
| `ai-flight-crew-champion` (personas, system prompts, chat UI) | `../worktrees/flight-crew/` |
| `infra-platform-champion` (migrations, RLS, CI, Vercel) | `../worktrees/infra/` |
| Primary tree (`agentrunway-web/`) | Hot-fixes, main-line merges, main session |

**First action of every champion session:**

```bash
cd "/Users/b/Desktop/Agent Runway Website/Project Home/02 - Web App Code/worktrees/<slug>"
git fetch origin
git checkout -b feat/<your-feature-name>   # branch OFF worktree/seo (or equivalent)
```

**Never create a feature branch inside `agentrunway-web/` during champion
work** — that is the contamination vector. If you find yourself in that
directory, `cd` to your worktree before touching git.

When your PR merges, reset the worktree back to tracking HEAD for the next
session:

```bash
git checkout worktree/<slug>
git reset --hard origin/main
```

Source: `memory/findings/infra_branch_contamination_root_cause_2026-05-10.md`

---

## Canonical Locations

If you are looking for the one true version of something, it lives here.

| Thing | Path |
|---|---|
| Business metric engines | `packages/core/engines/*.ts` |
| Engine tests + fixtures | `packages/core/engines/__tests__/` |
| Generated DB types | `packages/core/types/database.ts` |
| Org/team types | `packages/core/types/organizations.ts` |
| Supabase migrations | `apps/web/supabase/migrations/` |
| Flight Crew system prompts | `apps/web/lib/flight-crew/system-prompts.ts` |
| Flight Crew persona definitions | `apps/web/lib/flight-crew/personas.ts` |
| Dashboard (display source of truth) | `apps/web/app/(app)/dashboard/` |
| Web app routes | `apps/web/app/` (App Router) |
| Mobile app | `apps/mobile/` (Expo) |
| Champion subagent charters | `.claude/agents/*.md` |
| Workspace config | `pnpm-workspace.yaml`, `turbo.json` |

If a file claims to be canonical and isn't on this list, it is lying. Update
this table in the same PR as any canonical-location change.

---

## CI + Deploy Posture

As of commit `0640239`, CI runs `pnpm turbo test` and typecheck across all
workspaces on every push.

- **Green tests are a precondition for pushing to `main`.** If tests are red
  locally, fix before pushing — do not push and "trigger CI to see."
- **Vercel auto-deploys on push to `main`.** Every push to `main` is a
  production deploy. There is no staging gate.
- **Push immediately after any app code change** unless tests are failing.
  See `memory/feedback_push_immediately.md`.
- **Deploy = push.** Do not invoke `vercel deploy` / `vercel --prod`. See
  `memory/feedback_deploy_immediately.md`.
- **Execute migrations the moment you create them.** Do not batch. See
  `memory/feedback_run_migrations.md`.
- **Commit trailer on every commit:**
  `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`

If CI is red on `main` for any reason, stop other work and fix it first.

---

## When to Delegate to a Champion

Specialist charters live in `.claude/agents/`. Invoke via the Agent tool with
the matching `subagent_type`. Route questions that touch their lane before
editing.

**Auto-routing through `desmond` (chief of staff) is binding.** For
ambiguous prompts, multi-champion (3+) prompts, "what should I work on,"
weekly review, pre-touchpoint prep, memory hygiene cues, decision capture
moments, or new champion drafting — auto-route to `desmond` FIRST without
asking Andrew. He produces the routing recommendation; the calling session
executes. Andrew should never have to remember to invoke Des. Full trigger
list + exceptions in `memory/feedback_use_desmond_proactively.md`.

| Lane | Subagent | Charter |
|---|---|---|
| **Triage, weekly review, follow-ups, memory hygiene, pre-touchpoint prep, decision capture, new champion drafting** | **`desmond` (chief of staff — auto-routed)** | `.claude/agents/desmond.md` |
| Metric consistency, dashboard math, engine audits | `dashboard-integrity-champion` | `.claude/agents/dashboard-integrity-champion.md` |
| Any tax surface, CRA citation, T2125 / GST34 / corporate tax | `tax-expenses-champion` | `.claude/agents/tax-expenses-champion.md` |
| CRM schema, clients / transactions / pipeline writes, imports | `crm-champion` | `.claude/agents/crm-champion.md` |
| Flight Crew personas, system prompts, routing, handoffs | `ai-flight-crew-champion` | `.claude/agents/ai-flight-crew-champion.md` |
| Build, deploy, CI, Supabase infra, migrations execution, RLS audits, Vercel, env, Expo delivery | `infra-platform-champion` | `.claude/agents/infra-platform-champion.md` |
| Pricing, Stripe product catalog, GTM, Claude Connector unblock | `gtm-growth-champion` | `.claude/agents/gtm-growth-champion.md` |
| PIPEDA / Law 25 / CASA / Quebec / PII review | `legal-compliance-champion` | `.claude/agents/legal-compliance-champion.md` |
| New metric design, rename / deprecate | `metrics-design-champion` | `.claude/agents/metrics-design-champion.md` |

A change that spans two lanes gets both champions in sequence, not merged
into one session. Multi-lane prompts go through `desmond` first to produce
the routing plan.

---

## Operating Cadence (Des-led)

Three rhythms Andrew should be able to expect:

- **Daily brief** — auto-fires at session start when today's
  `memory/findings/business_snapshot_<YYYY-MM-DD>.md` is missing. Main session
  triggers the snapshot refresh, then invokes `desmond`. Output spec: top 3
  actions for today (named champion + scope + time), urgent items, stale-memory
  flags, "what I'd tell the President" operator POV, max 3 open questions.
  Under 600 words. Andrew read time ~5 min.
- **Weekly review** — Fridays. ~30 min cap. Reads all 8 champion Open backlog
  sections + every fresh file in `memory/findings/` + git log for the week.
  Output: prioritized ship list, what's stale, what's blocked, 3 decisions
  Andrew needs to make.
- **Monthly retrospective** — last Friday of the month. ~45 min cap. Reads
  git log + all findings + recent charter changes. Output: 3 keep / 3 change
  / 3 try-next-month.

If Andrew asks for any of these by name, execute the matching cadence. If he
asks something cadence-adjacent ("what's open this week," "what should I
focus on"), pick the closest fit and execute.

---

## When to Write a Finding

When any champion or scheduled routine discovers something material — an
incident, a change in business state, a configuration drift, a competitive
move, a stale-memory flag, an audit result — **write it to
`memory/findings/<source>_<topic>_<YYYY-MM-DD>.md`**. Aggregate-only, no PII.
Convention details in `memory/findings/README.md`.

This is how Des's read corpus stays current. Champion outputs that don't
land in findings are invisible to Des the next time he runs. If your work
surfaced something a future session should know, write it down — don't
trust that the chat transcript will carry it.

Skip findings for trivia, in-progress work that hasn't resolved, or anything
that should live in a regular memory file (decisions, rules, project state).
Findings are a curated, dated stream — not a dumping ground.

---

## Reading Order for New Agents

When a fresh Claude Code session lands in this repo:

1. This file.
2. `memory/MEMORY.md` (user-scoped index).
3. The four master references listed at the top of `MEMORY.md`.
4. The champion charter for the lane the task falls in.
5. The specific memory file(s) cited by the task.

Do not skip step 1. The mechanical checkpoints above are the gate.
