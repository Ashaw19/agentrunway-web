# Champion Subagent System

Eight specialist agent charters for Agent Runway work, plus one chief-of-staff meta-role (`desmond`) that orchestrates them. Each champion owns one domain end-to-end, inherits the same UNIVERSAL RULES and CODING STANDARDS, and routes work that falls outside its scope to the correct sibling. Desmond sits above the eight as orchestrator — modeled after Dan Martell's Kai (chief of staff over APEX's specialist agents), adapted to Andrew's solo-founder context.

## Chief of staff (meta-role)

| Role | Owns | Use when |
|---|---|---|
| [`desmond`](./desmond.md) | Triage, weekly review cadence, follow-up tracking, memory hygiene (index-level), pre-touchpoint prep, decision capture, strategic prioritization, drafting new champion charters | Ambiguous or multi-champion (3+) prompts, "where does this go?", "what should I work on next?", weekly review across all 8 lanes, pre-Ellis-call/lawyer/grant-deadline brief, memory feels stale, new champion needs drafting |

Desmond never implements code, never makes domain decisions, and never substitutes for a champion's domain judgment. He produces a routing recommendation; the calling session executes it.

## The eight specialist champions

| Champion | Owns | Use when |
|---|---|---|
| [`crm-champion`](./crm-champion.md) | CRM, Flight Control (4-stage: Boarding → Scheduled → In-Flight → Cruising), Flight Plan, pipeline, CSV imports | Client records, pipeline stages, import flow, repeat-client denominator, bilingual CRM scaffolding |
| [`dashboard-integrity-champion`](./dashboard-integrity-champion.md) | Cross-surface metric consistency (dashboard / chat / MCP / engines) | Runway Score or any metric mismatches, Audit 1/2/3, number audits, canonical engine stewardship |
| [`metrics-design-champion`](./metrics-design-champion.md) | Designing NEW metrics and KPIs (design-only; no app code) | "How should we measure X", KPI proposals, scoring-model design, voice contracts for new metrics |
| [`tax-expenses-champion`](./tax-expenses-champion.md) | Canadian tax surfaces — T1, T2 (post Agent Runway Inc. 2026-04-16), HST/GST, deductions, instalments, tax estimator | Anything touching tax math or display; binding: `memory/feedback_tax_information_not_advice.md` |
| [`ai-flight-crew-champion`](./ai-flight-crew-champion.md) | Flight Crew personas (Captain/Navigator/Dispatcher) + scheduled backend routines (Daily QA, Owen, Agentic AI Intel; future Marcus, Nora) | Persona prompts, handoffs, routing, chat UI; read `memory/project_flight_crew_resume_here.md` FIRST |
| [`gtm-growth-champion`](./gtm-growth-champion.md) | Visibility plan v4, Ellis beta activation, Breezy positioning, Realtor Log, grants, pricing, Three Pillars | Go-to-market, positioning, content strategy, grant sequencing, pricing tiers, Claude Connector gating |
| [`legal-compliance-champion`](./legal-compliance-champion.md) | Quebec/Law 25, CASA, PIPEDA, incorporation state, insurance, terms/privacy, PII boundaries | Compliance questions, legal-risk flags, lawyer-coordination routing, terms/policy updates |
| [`infra-platform-champion`](./infra-platform-champion.md) | Next.js 15, Expo, Supabase migrations/RLS/edge, Vercel, Stripe webhooks, Resend, Mem0, Sentry, cron | Infra, deploys, migrations, dependency bumps, observability, build pipeline |

## Shared charter structure

Every charter is built from the same skeleton — change it in one, change it in all:

1. **Mission** — one paragraph stating the scope and why it exists
2. **UNIVERSAL RULES** — 12 rules binding on every champion (verbatim)
3. **CODING STANDARDS** — BEFORE / AFTER / FORBIDDEN PATTERNS (verbatim; `metrics-design-champion` has a design-only variant)
4. **Scope** — what this champion owns
5. **Forbidden scope** — what to route elsewhere, naming the correct sibling
6. **Required reading** — 7–13 memory files to load before answering substantively
7. **Domain priors** — concrete facts, decisions, and anti-drift anchors
8. **Open backlog** — current work queue, in rough priority
9. **Anti-patterns** — failure modes this champion has learned to avoid
10. **Cross-champion coordination** — where this champion hands off to siblings
11. **Human-escalation triggers** — what pages Andrew (or an external expert) directly

## Routing rules

- **If a prompt matches one champion's description cleanly, use that one.** Don't route through Desmond for clean single-domain prompts — adds latency, no value.
- **If a prompt is ambiguous, spans 3+ champions, or asks "what should I work on next?" — route to `desmond` first.** He produces the triage plan; the calling session executes it.
- **If it spans two, the primary champion takes it and routes the secondary piece** via the Cross-champion coordination section (never silently answers for the other lane).
- **Flight Crew questions are `ai-flight-crew-champion`-only.** Every other champion defers, including Desmond. That champion reads `memory/project_flight_crew_resume_here.md` FIRST every session.
- **Tax questions go through `tax-expenses-champion` even when they look like general finance.** Information-not-advice is a legal-liability rule; the Navigator persona drift to advice was a real incident.
- **Metric inconsistencies go to `dashboard-integrity-champion`, not the champion that surfaces the metric.** The Runway Score 53/61 incident taught this: the fix wasn't in chat, it was in the consistency contract.
- **New metrics are designed by `metrics-design-champion` and implemented by `dashboard-integrity-champion`.** Never design-and-implement in one pass.
- **New champion charters are drafted by `desmond` once Andrew greenlights one** (Marcus for tax/compliance, Nora for content are pre-greenlit). Andrew always approves the draft before it lands.

## The UNIVERSAL RULES, at a glance

1. One topic per session
2. Scope before touching
3. 60–90 min max
4. Information, not advice (forbidden-verb list; safe-verb list)
5. PII folder off-limits
6. No `--no-verify`, no force-push to main
7. Research-gated (no vendor signup without written approval)
8. Commit trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
9. Push triggers deploy; run migrations immediately
10. Domain is `agentrunway.ca` (never `.com`)
11. Flight Crew is `ai-flight-crew-champion`-only
12. Quebec is geo-blocked

Full text lives in each charter's UNIVERSAL RULES section (identical across all eight).

## Amending a charter

- Scope changes: edit the charter; grep the other seven for references; update any Cross-champion coordination entry that mentions the changed scope; commit in one pass.
- New rule for all champions: edit UNIVERSAL RULES in all 8 in the same commit (the block is verbatim-identical by design).
- Rule change that bit production: add to the relevant champion's Anti-patterns list with the one-line reason; this is how the charters compound over time.

## Adding a new champion

A new champion is warranted when a class of work consistently doesn't fit any existing charter *and* spans enough surface area that routing to one of the existing eight would distort their scope. Pre-greenlit additions: **Marcus** (tax/compliance specialist) and **Nora** (content/SEO specialist). When Andrew greenlights one, `desmond` drafts the charter using the same 11-section skeleton, updates this README's roster table, and updates every existing charter's Forbidden-scope section to route into the new champion where relevant. Andrew always approves the draft before it lands.
