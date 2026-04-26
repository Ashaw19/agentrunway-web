# Agent Runway — Implementation Knowledge Base

> Compiled April 2026 from 32 parallel research agents covering ~800 topics.
> This is the permanent reference plateau for all implementation decisions.

> **STATUS NOTE (April 2026):** Sections 11 (Google Integrations) and 14
> (Plaid & Fintech Integration) describe research and proposed
> architecture only. Google integrations (Gmail / Calendar / Drive) are
> currently **shelved** under the CASA review — see
> `memory/project_google_integrations.md`. Plaid bank-account
> connectivity is a **planned future capability** and is **not currently
> offered**. Do not surface this content to end users. Captain and other
> in-product surfaces must answer Google/Plaid questions per the
> playbooks in `apps/web/lib/troubleshooting-playbooks.ts`, not this
> document.

---

## Table of Contents

1. [AI Architecture & Model Strategy](#1-ai-architecture--model-strategy)
2. [Agentic Workflows & Tool Use](#2-agentic-workflows--tool-use)
3. [Prompt Engineering & Production Patterns](#3-prompt-engineering--production-patterns)
4. [Embeddings, RAG & Vector Search](#4-embeddings-rag--vector-search)
5. [AI Cost Optimization](#5-ai-cost-optimization)
6. [AI Security & Multi-Tenant Safety](#6-ai-security--multi-tenant-safety)
7. [Supabase & Database Performance](#7-supabase--database-performance)
8. [Next.js & Vercel Optimization](#8-nextjs--vercel-optimization)
9. [TypeScript & Architecture Patterns](#9-typescript--architecture-patterns)
10. [Stripe Billing & Team Architecture](#10-stripe-billing--team-architecture)
11. [Google Integrations](#11-google-integrations)
12. [Email, CRM & Outreach Automation](#12-email-crm--outreach-automation)
13. [Expo React Native Mobile](#13-expo-react-native-mobile)
14. [Plaid & Fintech Integration](#14-plaid--fintech-integration)
15. [Data Analytics & ML](#15-data-analytics--ml)
16. [Canadian Regulatory Compliance](#16-canadian-regulatory-compliance)
17. [Canadian Real Estate Market Data](#17-canadian-real-estate-market-data)
18. [SaaS Growth & Monetization](#18-saas-growth--monetization)
19. [Security, Testing & DevOps](#19-security-testing--devops)
20. [UI/UX Dashboard Patterns](#20-uiux-dashboard-patterns)
21. [Voice AI & Emerging Tech](#21-voice-ai--emerging-tech)

---

## 1. AI Architecture & Model Strategy

### Claude 4.6 Capabilities (Current)
- **Context window**: 1M tokens on Opus 4.6 and Sonnet 4.6
- **Adaptive thinking**: Replaces `budget_tokens` — effort levels: low/medium/high/max
- **Interleaved thinking**: Between tool calls for reliable multi-step workflows
- **Context compaction**: Auto-summarizes instead of truncating at limit
- **Tool use reliability**: Errors dropped 50-75% vs Claude 3.5; 0% sabotage rate
- **Prefilled responses**: Deprecated on 4.6 models — use system prompts instead
- **Prompting style**: "Dial back aggressive prompting" — natural language instead of "CRITICAL: You MUST"

### 3-Tier Model Routing Strategy
| Tier | Model | Cost/M Input | Use Cases |
|------|-------|-------------|-----------|
| Fast | Haiku 4.5 | $1 | CRM lookups, status checks, simple classification |
| Standard | Sonnet 4.6 | $3 | Conversations, document analysis, outreach drafts |
| Complex | Opus 4.6 | $5 | Pipeline forecasting, deal analysis, complex advisory |

**Router implementation**: Classify intent with regex/keyword first, fall to Haiku classifier for ambiguous. Never route to Opus unless complexity score > threshold.

### Multi-Model Fallback Chain
Sonnet 4.6 → Haiku 4.5 → Groq Llama (existing) with circuit breaker pattern. Groq remains the fastest option for latency-sensitive operations.

### MCP (Model Context Protocol)
- Now universal standard: OpenAI, Google, Anthropic all support
- Donated to Linux Foundation's Agentic AI Foundation (Dec 2025)
- 10,000+ active public MCP servers
- Supabase, Google Workspace, Stripe all have official MCP servers
- **For Agent Runway**: Consider MCP server for exposing agent data to AI (read-only) — cleaner than custom tool definitions

---

## 2. Agentic Workflows & Tool Use

### Vercel AI SDK 6 Agent Architecture
- **Agent class** (`ToolLoopAgent`): Production-ready tool execution loop
- **`stopWhen`**: Controls when agent stops — `stepCountIs(20)` default, `hasToolCall(name)`, `isLoopFinished()`
- **`prepareStep`**: Modify model/tools/messages between steps — switch models mid-conversation based on complexity
- **Migration**: `npx @ai-sdk/codemod v6` for automatic migration from v5

### LangGraph.js 1.0 (Released Oct 2025)
- State management with TypeScript type-safe annotations
- Checkpointing for long-running workflows (Supabase PostgreSQL checkpoint store)
- Human-in-the-loop via `interrupt()` function with `Command` for resumption
- **For Agent Runway**: Best for multi-step advisory workflows (goal planning, tax optimization wizards)

### Recommended Agent Patterns for Agent Runway

**1. Advisor Agent** (existing, enhance):
- Server-side context building (already gold standard — LLM never queries DB)
- Add `prepareStep` to switch Sonnet → Haiku for follow-up questions
- Structured output for actionable cards (Zod schema → guaranteed JSON)

**2. Outreach Agent** (Flight Control):
- Template selection → personalization → tone adjustment → send/queue
- Human-in-the-loop: Agent drafts, user approves before send
- Batch processing with `stopWhen: hasToolCall('send_email')`

**3. Pipeline Forecasting Agent**:
- Multi-step: gather data → seasonal adjustment → probability calculation → narrative
- Use Opus for complex analysis, Haiku for data retrieval steps
- Checkpoint after each step for auditability

**4. Document Analysis Agent** (Google Drive):
- File retrieval → content extraction → Groq/Claude analysis → write-back
- Streaming response for real-time analysis feedback

### Tool Definition Best Practices
- Use Zod schemas for tool parameters (AI SDK 6 native support)
- Include `description` on every parameter — Claude uses these for disambiguation
- Limit to 5-8 tools per agent call (beyond 8, accuracy degrades)
- Prefer specific tools over generic ones ("get_client_pipeline" not "query_database")

---

## 3. Prompt Engineering & Production Patterns

### Constrained Decoding
- **Structured outputs**: Guaranteed schema compliance via `response_format`
- Use for: score breakdowns, flight status classifications, expense categorizations
- Eliminates JSON parsing errors entirely

### Prompt Caching Strategy
| Content | TTL | Savings |
|---------|-----|---------|
| System prompt + persona | 1 hour | 90% discount |
| User profile context | 5 min (default) | 90% discount |
| Conversation history | 5 min | 90% discount |

**Implementation**: Put stable content first in message array (system prompt, agent profile, org context), then volatile content (conversation). Cache hits on prefix matches.

### XML Tags — Claude's Native Format
```xml
<agent_context>
  <ytd_gci>$245,000</ytd_gci>
  <goal_gci>$500,000</goal_gci>
  <runway_score grade="B">79</runway_score>
</agent_context>
<user_query>How am I doing this quarter?</user_query>
```
Claude parses XML structure 3x more reliably than JSON in prompts.

### Financial AI Pattern
- **Pre-compute ALL metrics server-side** — let Claude interpret/narrate, never calculate
- Include exact numbers in context, ask for narrative interpretation
- "Your pipeline coverage is 0.8x" → Claude explains what this means and what to do

### French Canadian Patterns
- "courtier immobilier" not "agent immobilier"
- Currency: "1 250 000 $" (space as thousands separator, $ after)
- Dates: "4 avril 2026" not "April 4, 2026"
- Detect language from user input, respond in same language
- Single embedding model (Voyage-3.5) handles English + French

### Sandwich Defense for System Prompts
```
[System instructions - rules and persona]
[User context - agent data, org data]
[Conversation history]
[Reminder of rules - key constraints restated]
```
Restating critical rules at end prevents "instruction forgetting" in long contexts.

---

## 4. Embeddings, RAG & Vector Search

### Voyage-3.5 (Recommended)
- Anthropic's partner embedding model
- Outperforms OpenAI by 8.26% on retrieval benchmarks
- 2.2x lower cost than OpenAI ada-002
- First 200M tokens free
- Handles English + French in single model (critical for Canadian bilingual support)
- 1024 dimensions, supports Matryoshka truncation

### pgvector 0.8.0 on Supabase
- **Iterative scan**: 100x improvement for filtered multi-tenant search
- `WHERE user_id = $1` + vector similarity now fast without pre-filtering hacks
- HNSW index: best for read-heavy workloads (Agent Runway's pattern)
- `halfvec(256)` for fast initial search + full `vector(1024)` for re-ranking

### Hybrid Search Architecture
```sql
-- Combine vector similarity + full-text search + RRF
WITH semantic AS (
  SELECT id, 1 - (embedding <=> query_vec) AS sim_score
  FROM documents WHERE user_id = $1
  ORDER BY embedding <=> query_vec LIMIT 20
),
lexical AS (
  SELECT id, ts_rank(fts, query) AS text_score
  FROM documents WHERE user_id = $1 AND fts @@ query
  LIMIT 20
)
SELECT id,
  COALESCE(1.0/(60 + rank_s), 0) + COALESCE(1.0/(60 + rank_l), 0) AS rrf_score
FROM ...
```
- Precision improvement: 62% → 84% with hybrid + RRF
- **Contextual retrieval** (Anthropic method): Prepend document context to chunks before embedding → 49% fewer retrieval failures

### What to Embed for Agent Runway
1. **CRM contact notes** — search for similar client situations
2. **Transaction descriptions** — find comparable past deals
3. **Outreach templates** — semantic template matching
4. **Google Drive documents** — listing descriptions, marketing materials
5. **Flight Crew conversation history** — recall past advice given

---

## 5. AI Cost Optimization

### Full Provider Pricing Reference (per 1M tokens)
| Model | Input | Output | Cache Read | Batch Input | Batch Output |
|-------|-------|--------|-----------|-------------|--------------|
| Claude Opus 4.6 | $5.00 | $25.00 | $0.50 | $2.50 | $12.50 |
| Claude Sonnet 4.6 | $3.00 | $15.00 | $0.30 | $1.50 | $7.50 |
| Claude Haiku 4.5 | $1.00 | $5.00 | $0.10 | $0.50 | $2.50 |
| Groq Llama 3.3 70B | $0.59 | $0.79 | — | — | — |
| Groq Llama 3.1 8B | $0.05 | $0.08 | — | — | — |
| Gemini 2.5 Flash | $0.30 | $2.50 | — | $0.15 | $1.25 |

### Prompt Caching Strategy
- 90% discount on cached input tokens (cache read = 0.1x input price)
- Cache write: 1.25x for 5-min TTL, 2x for 1-hour TTL
- Break-even: After just 1 cache read (5-min) or 2 reads (1-hour)
- **Design for hits**: Static content (system prompt, tools) at TOP of prompt, dynamic content at BOTTOM
- Latency reduction: up to 85% for long prompts (11.5s → 2.4s at 100K tokens)
- **Agent Runway sizing**: 3K cached tokens + 600 dynamic → 75% savings on input costs

### Batch API
- 50% discount for async processing (non-real-time)
- **Batch + Cache stacks**: Up to 95% savings on input tokens ($3.00 → $0.15/MTok)
- **Use for**: Nightly insight generation, bulk outreach drafting, periodic scoring, CRM enrichment on import, weekly market summaries, monthly report narratives
- 24-hour completion window, usually much faster

### Pre-Computation (Materialized AI Responses)
Generate on schedule instead of on-demand to eliminate 30-50% of real-time LLM calls:
- Weekly market summary per region (Sunday night batch → instant delivery)
- Pipeline health insights per user (nightly batch → dashboard loads instantly)
- Client follow-up suggestions (every 6 hours → no AI wait in CRM)
- Monthly business narrative (1st of month → pre-built report)
- Email draft templates (weekly → quick customization, not generation)
- Implementation: pg_cron → Supabase Edge Function → Batch API (50% off)

### Combined Savings Projection
| Optimization | Savings |
|-------------|---------|
| 3-tier routing (60% Haiku / 30% Sonnet / 10% Opus) | 50-70% |
| Prompt caching (75% hit rate) | 60-75% on input |
| Batch API (async ops) | 50% additional |
| Pre-computation | Eliminates 30-50% of real-time calls |
| **Fully optimized cost/user** | **$3-5/month** |

### Cost Per User — Detailed Model
| Activity | Frequency | Tokens/Event | Monthly Tokens |
|----------|-----------|-------------|---------------|
| Flight Crew chat | 15/day × 20 days | 4,000 avg | 1,200,000 |
| CRM lookups | 10/day | 2,000 avg | 400,000 |
| Pipeline analysis | 3/week | 5,000 avg | 60,000 |
| Email drafts | 5/week | 3,000 avg | 60,000 |
| Market insights | 2/week | 8,000 avg | 64,000 |
| Document processing | 1/week | 10,000 avg | 40,000 |
| **Total** | | | **~1.8M tokens/user/month** |

**Unoptimized** (all Sonnet): ~$16.40/user/month
**Fully optimized** (routing + cache + pre-compute): ~$3-5/user/month
**At $79-149/month subscription**: AI costs = 3-5% of revenue (industry avg: 20-60%)
**AI cost is NOT a concern at any realistic scale for Agent Runway**

### Scaling Cost Projections
| Users | Monthly AI Cost | Monthly Revenue (avg $114/mo) |
|-------|----------------|-------------------------------|
| 100 | ~$410 | $11,400 |
| 500 | ~$2,050 | $57,000 |
| 1,000 | ~$4,100 | $114,000 |
| 5,000 | ~$20,500 | $570,000 |

### Cost Guardrails
- Per-user daily token limits by subscription tier
- Graceful degradation: exceed limit → route to cheaper model, not hard block
- Real-time cost tracking via Helicone (free tier: 100K requests/month)
- Alert at >$5/user/day AI spend (anomaly detection)
- Monthly team budget controls for org billing

### Observability Recommendation
- **Helicone** (recommended, start now): Free 100K requests, one-line integration, per-user cost tracking
- **Portkey** ($49/mo): When multi-provider routing + PII guardrails needed (at scale)
- **LangSmith**: Skip — requires LangChain, per-seat pricing, overkill for current stage

### Fallback Chain Architecture
```
Claude Sonnet 4.6 → [timeout 5s / error] → Gemini 2.5 Flash → [error] → Groq Llama 3.3 70B → graceful error
```
- Circuit breaker: open at >5% error rate in rolling 5-min window
- Achieves 99.95%+ uptime even during individual provider outages
- Groq remains the fastest option (394 TPS, <300ms TTFT) for latency-sensitive fallback

---

## 6. AI Security & Multi-Tenant Safety

### Threat Landscape (2025-2026)
- **Policy Puppetry**: Bypasses instruction hierarchy across ALL frontier models
- **Claude Opus 4.6**: 0% attack success rate (ASR) in constrained environments; 57.1% in GUI with safeguards at 200 attempts
- Agent Runway's server-side context building is already the gold standard

### "LLM Proposes, Policy Engine Disposes"
Never let the LLM make authorization decisions. Deterministic policy layer validates every action:
```typescript
// LLM suggests: "send email to client@example.com"
// Policy engine checks: Does this user own this contact? Is email connected? Rate limit ok?
// Only then execute
```

### 5 Immediate Security Actions
1. **Canary tokens** in system prompts — detect if prompt is leaked
2. **PII regex on output** — scan LLM responses before sending to client
3. **XML delimiters** — clearly separate trusted (system) from untrusted (user) content
4. **RLS audit** — verify every Supabase query in AI context building respects row-level security
5. **Sandwich defense** — restate critical rules at end of system prompt

### OWASP LLM Top 10 Priority Gaps
1. **Injection pre-screening** — regex/classifier before LLM sees user input
2. **Output PII scanning** — never let LLM leak one user's data to another
3. **Prompt leakage prevention** — system prompt should never appear in responses

### Multi-Tenant Data Isolation
- Server-side context building: Query only the authenticated user's data
- Never pass raw SQL or queries to LLM
- Team context: Use `org_agent_performance` VIEW (already excludes Tier 3 data)
- Log all AI interactions for audit trail

---

## 7. Supabase & Database Performance

### Migration Strategy
- Always use `CONCURRENTLY` for index creation on tables > 100K rows
- Test migrations on branch database before production
- Keep migrations idempotent (IF NOT EXISTS)
- **Zero-downtime pattern**: Add columns nullable → backfill in batches → add NOT NULL constraint
- Never rename columns in production — add new, migrate data, update code, drop old
- CI/CD: Never run `supabase db push` from local in production — use GitHub Actions

### Materialized Views for Dashboard (1000x+ speedup)
```sql
CREATE MATERIALIZED VIEW mv_agent_dashboard AS
SELECT user_id,
  SUM(gci) as ytd_gci,
  COUNT(*) as deal_count,
  -- pre-computed metrics
FROM transactions
WHERE EXTRACT(YEAR FROM close_date) = EXTRACT(YEAR FROM NOW())
GROUP BY user_id;

-- UNIQUE index required for CONCURRENTLY refresh
CREATE UNIQUE INDEX idx_mv_dashboard_user ON mv_agent_dashboard (user_id);

-- Refresh every 15 minutes via pg_cron
SELECT cron.schedule('refresh-dashboard', '*/15 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_agent_dashboard');
```
Real-world case studies show 350x to 9,000x faster queries vs live aggregation.

### Partial & Covering Indexes
```sql
-- Only index active clients (skip archived)
CREATE INDEX idx_clients_active ON clients (user_id, last_contact_at)
  WHERE archived = false;

-- Covering index: returns data from index without table lookup
CREATE INDEX idx_pipeline_dashboard ON pipeline (user_id, stage)
  INCLUDE (client_name, deal_value, expected_close);
```

### RLS Performance
- Always index columns used in RLS policies (`user_id`, `org_id`)
- Use `security_definer` functions for complex cross-table checks
- Materialized views bypass RLS — ensure security in the view definition itself
- **Critical**: With N Realtime subscribers + RLS, every INSERT triggers N RLS checks — use Broadcast pattern instead

### Supabase Queues (pgmq)
- Built-in message queue for async processing
- Use for: email sending, receipt OCR, nightly batch jobs
- Eliminates need for external queue service (Redis, SQS)
- Supports delayed messages, dead letter queues
- **pgmq + pg_cron + Edge Functions** pattern: pg_cron polls queue → dequeues → invokes Edge Function → built-in retry

### Connection Pooling (Supavisor)
- **Transaction mode (port 6543)**: Use for ALL application queries — connection borrowed per-query, released immediately
- **Session mode (port 5432)**: Use ONLY for migrations, Prisma introspection, admin ops
- Connection limits are SHARED between modes — can't exceed pool size across both
- **Production pattern**:
  - `DATABASE_URL` → port 6543 with `?pgbouncer=true` (transaction mode)
  - `DIRECT_URL` → port 5432 (session mode for migrations only)

### Realtime at Scale
- **Broadcast** (multi-threaded, no RLS overhead) — use for dashboard updates
- **Postgres Changes** (single-threaded, RLS checked per subscriber) — bottleneck at scale
- **Recommended pattern**: Edge Function listens to DB changes → filters/authorizes → Broadcast to per-user channels
- Pro plan: 500 concurrent connections, 500 messages/sec; no-spend-cap: 10,000 connections, 2,500 msg/sec

### Edge Functions vs Vercel Serverless
| Runtime | Cold Start | Best For |
|---------|-----------|----------|
| Supabase Edge Functions | ~ms (V8 isolates) | DB-centric webhooks, triggers, queue workers |
| Vercel Edge Runtime | <50ms | Auth checks, geo-blocking, redirects |
| Vercel Serverless (Node.js) | 500ms-2s | Complex business logic, full Node.js APIs |

**Cost note**: Vercel Fluid Compute only bills active CPU — pauses during I/O waits (not billed while waiting for Supabase queries).

### Supabase Branching for CI/CD
- Creates separate DB/Auth/Storage/Edge environments per PR
- Auto-injects correct env vars into Vercel preview deployments
- Preview branches auto-pause after inactivity (cheap)
- Data NOT copied — use seed files for test data
- No per-branch fee — billed on actual resource consumption

### pg_cron Best Practices
- Built-in overlap prevention: only one instance of each job runs at a time
- Make operations idempotent for failover resilience
- Space out jobs to prevent connection pool exhaustion
- Monitor: `SELECT * FROM cron.job_run_details WHERE status = 'failed'`
- **Agent Runway jobs**: Mat view refresh, flight status auto-transitions, stale pipeline cleanup, usage aggregation

### Supabase Storage
- **Public buckets**: Agent profile photos, marketing images (no auth overhead, better CDN hits)
- **Private buckets + signed URLs**: Client documents, contracts (short TTLs)
- Image transforms on-the-fly: resize, crop, WebP conversion (Pro plan)
- Smart CDN: automatic cache invalidation on file update/delete

---

## 8. Next.js & Vercel Optimization

### Server Components + Streaming
- Fetch data in Server Components, pass to Client Components as props
- Use `Promise.all` for parallel data fetching (avoid waterfalls)
- **Granular Suspense boundaries** — each dashboard section streams independently:
```tsx
<div className="dashboard">
  <Suspense fallback={<PipelineSkeleton />}>
    <PipelineMetrics />  {/* Streams when pipeline query resolves */}
  </Suspense>
  <Suspense fallback={<RevenueSkeleton />}>
    <RevenueChart />     {/* Streams independently */}
  </Suspense>
</div>
```
- Selective hydration: Critical components (nav, buttons) hydrate first; charts load async

### TanStack Query + Server Components (Zero Loading States)
```tsx
// Server Component: prefetch + dehydrate
const queryClient = new QueryClient();
await queryClient.prefetchQuery({ queryKey: ['pipeline'], queryFn: getPipelineData });
return (
  <HydrationBoundary state={dehydrate(queryClient)}>
    <DashboardClient />  {/* Renders instantly */}
  </HydrationBoundary>
);
```
- Set `staleTime: 5 * 60 * 1000` (5 min) for dashboard data — mat views refresh every 15 min anyway
- Default staleTime is 0 → causes double-fetching (server + client). Always set higher for SSR.

### Optimistic Updates
```tsx
const [optimisticClients, addOptimistic] = useOptimistic(clients,
  (state, { id, newStatus }) => state.map(c => c.id === id ? { ...c, status: newStatus } : c)
);
// addOptimistic for instant UI → server action → auto-rollback on failure
```
- Consider `next-safe-action` for type-safe server actions with built-in optimistic support

### React Compiler (Next.js 15+)
- Automatic memoization — remove manual `useMemo`/`useCallback`
- Enable in `next.config.ts`: `experimental: { reactCompiler: true }`
- Reduces bundle size and eliminates stale closure bugs

### Partial Prerendering (PPR)
- Experimental in Next.js 15, stable in Next.js 16 as "Cache Components"
- Static shell renders instantly → dynamic content streams into "holes"
- Perfect for dashboard: sidebar/nav pre-rendered, metrics stream in
- Enable per-route: `export const experimental_ppr = true;`

### Bundle Size Optimization
- Dynamic imports for heavy components: `const Chart = dynamic(() => import('./Chart'), { ssr: false })`
- `optimizePackageImports` in next.config: `['lucide-react', 'date-fns', 'lodash-es']`
- Route groups `(dashboard)`, `(marketing)` prevent cross-bundle contamination
- `@next/bundle-analyzer` to identify oversized imports

### Edge Config for Feature Flags
- Globally distributed KV store — most lookups <5ms, p99 <15ms
- **Agent Runway uses**: Quebec geo-blocking, feature rollouts, pricing tier config, Ellis Realty beta access
- Changes propagate instantly, no redeploy needed
- Check in middleware — no function invocation cost

### Vercel Regional Pricing
| Region | Active CPU/hr | Best For |
|--------|--------------|----------|
| Washington DC (iad1) | $0.128 | Cheapest, close to Eastern Canada |
| Montreal (yul1) | $0.147 | Closest to Canadian users |
| **Recommendation**: Deploy to iad1 or yul1 for cost + latency

### Vercel KV (Upstash Redis)
- Rate limiting: `@upstash/ratelimit` with sliding window
- Session caching: Fast auth checks without hitting Supabase on every request
- Dashboard data caching: Short TTL (60-300s) to reduce Supabase load
- HTTP-based (no persistent connections), works in Edge Runtime, pay-per-request

### Performance Targets
| Metric | Target | Impact |
|--------|--------|--------|
| LCP | <2.5s | Dashboard main content visibility |
| FCP | <1.8s | Time until user sees anything |
| TTFB | <800ms | Server response speed |
| INP | <200ms | Click/type responsiveness |
| CLS | <0.1 | Visual stability |

### Image Optimization
- `next/image` with automatic WebP/AVIF (60-80% size reduction)
- Set `priority` on LCP elements (dashboard header)
- Static imports auto-generate `blurDataURL` for placeholders

### Background Job Architecture
| Job Type | Engine | Examples |
|----------|--------|----------|
| DB-native scheduled | **pg_cron** | Mat view refresh, flight status transitions |
| Event-driven workflows | **Inngest** | Email sequences, notification chains |
| Long-running | **Trigger.dev** | CSV import, document indexing |
| Simple scheduled | **Vercel Cron** | Health checks, warm-up pings |

### Sentry + Next.js 15
- `npx @sentry/wizard@latest -i nextjs` — 5-min auto-setup
- Server Component errors now properly captured (requires @sentry/nextjs >= 8.28.0)
- Distributed tracing: follows request from middleware → RSC → server actions → Supabase
- Production sampling: `tracesSampleRate: 0.1`, `replaysOnErrorSampleRate: 1.0`

---

## 9. TypeScript & Architecture Patterns

### Branded Types (Priority Action)
```typescript
// packages/core/types/branded.ts
type Brand<T, B> = T & { __brand: B };
export type UserID = Brand<string, 'UserID'>;
export type OrgID = Brand<string, 'OrgID'>;
export type ClientID = Brand<string, 'ClientID'>;
export type TransactionID = Brand<string, 'TransactionID'>;
```
Prevents accidentally passing a UserID where an OrgID is expected.

### Zod as Single Source of Truth
```typescript
import { z } from 'zod';

export const TransactionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  type: z.enum(['buyer', 'seller', 'double-end']),
  gci: z.number().positive(),
  status: z.enum(['pending', 'firm', 'closed', 'collapsed']),
  closeDate: z.date().nullable(),
});

export type Transaction = z.infer<typeof TransactionSchema>;
// Single schema → type + validation + form schema + API validation
```

### Discriminated Unions for State
```typescript
type FlightStatus =
  | { status: 'grounded'; lastContact: Date }
  | { status: 'boarding'; appointmentDate: Date }
  | { status: 'in-flight'; dealId: string; expectedClose: Date }
  | { status: 'cruising'; lastTransactionDate: Date }
  | { status: 'landed'; transactionId: string; closeDate: Date }
  | { status: 'first-class'; repeatCount: number };
```

### Error Handling with Result Types
```typescript
import { ok, err, Result } from 'neverthrow';

async function createTransaction(data: unknown): Promise<Result<Transaction, AppError>> {
  const parsed = TransactionSchema.safeParse(data);
  if (!parsed.success) return err({ code: 'VALIDATION', message: parsed.error.message });
  // ... insert logic
  return ok(transaction);
}
```

### Top 10 Priority Actions
1. Add branded types for IDs
2. Migrate to Zod schemas as single source of truth
3. Enable `isolatedDeclarations` in packages/core
4. Add `@t3-oss/env-nextjs` for env var validation
5. Adopt discriminated unions for flight statuses and subscription states
6. Set up Knip for dead code detection in CI
7. Add pre-commit hooks (Husky + lint-staged + commitlint)
8. Audit server components for waterfall fetches
9. Enable React Compiler
10. Create repository interfaces in packages/core/types/

---

## 10. Stripe Billing & Team Architecture

### Current Implementation (Validated as Solid)
- Individual: checkout → webhook → `user_settings.subscription_status`
- Price tiers: first 50 users $79/mo, next 50 $99/mo, regular $149/mo

### Team Billing Architecture
```
Team subscription = 1 × Leader seat ($149/mo) + N × Member seats ($55/mo)
Ellis Realty (6 people): $149 + (5 × $55) = $424/mo
```

**Implementation**:
- Two `line_items` per subscription: Leader price (quantity=1, fixed) + Member price (quantity=member_count)
- On member add/remove: `stripe.subscriptions.update()` with proration
- Advisory lock pattern for concurrent seat updates (prevent race conditions)

### Missing Webhook Handlers
- `invoice.payment_failed` — trigger grace period dunning
- `invoice.payment_succeeded` — clear dunning state
- Grace period dunning recovers 40% more than immediate lockout

### Stripe Tax
- Automatic Canadian GST/HST/QST calculation
- Enable per-product: `tax_behavior: 'exclusive'`
- Handles inter-provincial tax rules automatically

### Stripe Meters (New, Replaces usage_records)
- For future usage-based billing (AI tokens, API calls)
- Real-time aggregation, no manual batching
- Dashboard visibility for customers

### PCI Compliance
- SAQ A (simplest level) with Stripe Checkout/Elements
- Never handle raw card data server-side
- Annual self-assessment questionnaire

---

## 11. Google Integrations

### Unified OAuth Strategy
Single connection for all Google services:
```
Scopes: gmail.send + calendar.events + drive.file
```
- `drive.file` (not `drive`) — avoids CASA Tier 2 restricted scope entirely
- Only accesses files the app creates or user explicitly opens with app

### Verification Timeline
1. **Brand verification**: 2-3 business days
2. **Sensitive scope review**: 2-4 weeks
3. **No CASA security assessment needed** with `drive.file` scope

### 2025 Granular Consent
- Per-scope checkboxes (user can decline individual scopes)
- MUST check `tokens.scope` after callback — user may not grant all requested
- Handle partial grants gracefully (e.g., Gmail granted but Calendar denied)

### Gmail API
- Emails appear in user's Sent folder (not "sent on behalf of")
- Google handles SPF/DKIM/DMARC automatically
- Rate limit: 250 quota units/second per user
- Use raw fetch over `googleapis` package (45MB, not Edge-compatible)

### Google Calendar Sync
- **Incremental sync**: `syncToken` parameter for efficient polling
- **Webhook push**: Google notifies on changes (7-day channel renewal)
- **Fallback**: 15-minute poll if webhook misses
- **Conflict resolution**: Last-writer-wins with user notification
- **Connection state machine**: disconnected → connecting → connected → syncing → error

### Token Management
- AES-256-GCM encryption for stored tokens
- Per-user advisory lock for token refresh (prevent concurrent refresh race)
- Auto-refresh on 401 response, retry original request
- Graceful disconnection on refresh token revocation

---

## 12. Email, CRM & Outreach Automation

### Email Provider Architecture
```
┌─ Gmail (OAuth, recommended) ──────────────── gmail.send API
├─ Outlook (Microsoft Graph OAuth) ──────────── Mail.Send API
└─ Generic SMTP (nodemailer) ────────────────── SMTP relay
```
Unified `EmailSender` interface routes to correct provider based on connection type.

### CRM as Daily Touchpoint
- Flight status drives daily workflow, not just classification
- Activity logging (call/email/text/showing/meeting/note) is the core engagement loop
- 88/12 gap: 88% of clients would return, only 12% do — 91% never follow up post-close
- **Agent Runway's opportunity**: Automate the follow-up that 91% of agents forget

### Outreach Queue Patterns
- AI generates draft → user reviews → approve/edit → send
- Batch drafting: Generate 10-20 outreach messages at once (Batch API, 50% discount)
- Template library with AI personalization per client
- Track: open rates, response rates, send rates (how many approved vs. skipped)

### Contact Activity Scoring
- RFM model (Recency, Frequency, Monetary) entirely in SQL with `NTILE`
- Weight recent interactions higher (exponential decay)
- Auto-promote flight status based on activity thresholds

### CASL Compliance for Outreach
- **Express consent**: Required for commercial emails; indefinite until withdrawn
- **Implied consent tiers**:
  - Post-transaction: 2-year window from close date
  - Post-inquiry: 6-month window from inquiry date
  - Referral: single message allowed, must identify referrer
- **Record-keeping**: 3-year retention of all consent records (CRTC audit requirement)
- Every email must have: sender name, mailing address, unsubscribe mechanism
- Unsubscribe must be processed within 10 business days
- Track consent timestamps, type, source, and expiry dates in CRM
- Auto-expire implied consent and notify agent before window closes

### Email Warm-Up Strategy (New Gmail Connections)
New Google OAuth connections should ramp volume gradually:
- **Week 1-2**: 5-10 emails/day, prioritize replies and engaged contacts
- **Week 3-4**: 15-25 emails/day, mix outreach with replies
- **Week 5-6**: 40-50 emails/day, full outreach volume
- **Ongoing**: Stay under 100/day for cold outreach; 250/day quota hard limit
- Monitor bounce rate (<2%), spam complaints (<0.1%), unsubscribe rate
- If deliverability drops: pause 48hrs, reduce volume 50%, re-ramp

### Engagement Scoring Model
Weighted point system with time decay for contact prioritization:
| Activity | Points | Decay |
|----------|--------|-------|
| Reply received | +15 | 30-day half-life |
| Phone call (logged) | +20 | 30-day half-life |
| Appointment/showing | +25 | 45-day half-life |
| Email opened | +3 | 14-day half-life |
| Link clicked | +8 | 21-day half-life |
| Text message sent | +5 | 14-day half-life |
| Note added | +2 | 7-day half-life |
- Compute score daily via pg_cron job
- Flight status auto-promotion thresholds: Dormant→Cruising (score >20), Cruising→Ascending (score >50)
- Surface "at risk" contacts: previously high-scoring, now decaying below threshold

### Reply Detection & Auto-Pause
- When Gmail webhook detects inbound reply to outreach thread:
  1. Auto-pause remaining sequence messages for that contact
  2. Flag contact for agent follow-up in Flight Control
  3. Log reply as +15 engagement points
- Prevents embarrassing "automated message after they already replied" scenario
- Re-enable sequence only if agent explicitly resumes

### SMS Integration (Twilio)
- Canada pricing: $0.0083 USD per SMS segment (160 chars)
- Long code (10DLC) for business messaging, not short code
- A2P 10DLC registration required for business texting in Canada
- Opt-in/opt-out tracking parallels CASL consent model
- Use for: appointment reminders, showing confirmations, time-sensitive alerts
- NOT for: cold outreach (CASL applies to SMS equally)

### Post-Close Nurture Sequence (12-Month Template)
Automated follow-up that addresses the 91% follow-up gap:
- **Day 1**: Congratulations + settlement checklist
- **Day 30**: Home maintenance tips for season
- **Day 90**: Check-in + local market update
- **Day 180**: Anniversary approaching + home value estimate
- **Day 270**: Referral ask (warm, not pushy)
- **Day 365**: Move-iversary celebration + market review
- Each touchpoint is AI-personalized with property details and client preferences
- Agent can preview/edit any message before auto-send
- Sequence pauses if client initiates contact (reply detection)

### Send Time Optimization
Three-tier approach for maximizing open/response rates:
1. **Population-level**: RE industry best times (Tue-Thu 9-11am, 2-4pm local)
2. **Cohort-level**: Segment by client type (buyers: evenings, sellers: mornings)
3. **Individual-level**: Track per-contact open times, learn optimal windows
- Start at tier 1, graduate to tier 3 as data accumulates
- Implement via pg_cron scheduling outreach_queue items at computed optimal times

---

## 13. Expo React Native Mobile

### Recommended Production Stack
| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | Expo SDK 54+ | Managed workflow with CNG |
| Routing | Expo Router v5 | File-based, typed routes, deep linking |
| Styling | NativeWind v5 | Tailwind CSS, dark mode, shared with web |
| State | Zustand + MMKV | 30x faster than AsyncStorage |
| Auth tokens | expo-secure-store | Biometric-gated token storage |
| Local DB | expo-sqlite | Offline-first data layer |
| Sync | PowerSync | Supabase ↔ SQLite automatic sync |
| Lists | FlashList | 5x faster than FlatList |
| Animations | Reanimated 3 | Native-thread 60fps |
| Bottom sheets | @gorhom/bottom-sheet v5 | Keyboard-aware, snap points |
| Forms | react-hook-form + Zod | Minimal re-renders |
| Images | expo-image | Native caching, blurhash placeholders |
| Push | expo-notifications | Via Supabase Edge Functions |
| Background | expo-background-task | WorkManager/BGTaskScheduler |
| Biometrics | expo-local-authentication | Face ID/Touch ID |
| CI/CD | EAS Build + Update + Submit | Full pipeline with OTA rollouts |

### Feature Scope (Mobile vs Desktop)
**Include** (field-agent priorities):
- Dashboard KPIs (view-only)
- Add/view transactions + pipeline
- Client list + detail + contact logging
- Receipt scanning (camera → OCR)
- Flight Control (view queue, approve/send)
- Smart contact logging (call/text detection)

**Exclude** (desktop-only):
- Full analytics deep-dives, benchmark charts
- Tax planning, expense category management
- Organization/team management
- Plaid bank sync setup
- CSV import, social media, newsletters
- Complex settings

### Tab Bar Structure
**Dashboard** | **Deals** | **Clients** | **Scan** | **More**

### OTA Update Strategy
1. EAS Update with staged rollouts: 10% → 25% → 50% → 100%
2. Expo Updates bytecode diffing for smaller patches
3. Automatic rollback on crash rate spike
4. Critical updates: force restart; non-critical: apply on next launch

### App Store Considerations
- AI features: Must explain how AI works and label auto-generated content
- CRM data: Must be accurately reflected in privacy labels
- Stripe for SaaS billing is fine (not digital goods, so no Apple IAP required)
- Starting April 2026: Must use iOS 26 SDK

### Testing Pipeline
```
Development → Expo Dev Build → EAS Internal Distribution → TestFlight/Play Internal → Staged Production
```

---

## 14. Plaid & Fintech Integration

### Canadian Banking Landscape
- Screen scraping BANNED when open banking launches early 2026
- Most Canadian banks don't offer CSV (TD, Scotiabank, CIBC = PDF only)
- Manual fallback should be PDF upload with AI extraction, not CSV

### Plaid vs Flinks
| Feature | Plaid | Flinks (Montreal) |
|---------|-------|--------------------|
| Canadian coverage | Good | Excellent |
| Data residency | US servers | Canadian servers |
| Cost | $1K/mo Growth | Competitive |
| Open banking ready | Yes | Yes |
| Regulatory | FINTRAC compliant | FINTRAC compliant |

**Recommendation**: Evaluate Flinks for Canadian data residency compliance. Plaid $1K/mo Growth plan covers ~800 connections ($1-5/user/month).

### Real Estate Expense Categorization
AI-powered categorization layer with 11 RE-specific categories:
1. Marketing & Advertising
2. MLS & Board Fees
3. Brokerage Fees & Desk Fees
4. Insurance (E&O, liability)
5. Vehicle & Travel
6. Office & Technology
7. Professional Development
8. Client Entertainment
9. Staging & Photography
10. Legal & Accounting
11. Commission Splits

### Open Banking Timeline (Canada)
- **Phase 1** (early 2026): Read-only account data access
- **Phase 2** (mid-2027): Write/payment initiation
- Agent Runway should be ready for Phase 1 — direct bank APIs, no screen scraping

---

## 15. Data Analytics & ML

### Start Simple: PostgreSQL Analytics
```sql
-- Linear regression trend line (built into PostgreSQL)
SELECT
  regr_slope(gci, EXTRACT(EPOCH FROM close_date)) as trend_slope,
  regr_intercept(gci, EXTRACT(EPOCH FROM close_date)) as trend_intercept
FROM transactions
WHERE user_id = $1 AND status = 'closed';
```

### Rule-Based Scoring Before ML
- Churn scoring: 70-80% as effective as ML with simple rules
- Lead scoring: RFM model in SQL with `NTILE` (no Python needed)
- Pipeline probability: Transition matrix from historical stage movements

### Seasonal Indices
```sql
-- Calculate seasonal adjustment factors from historical data
SELECT EXTRACT(MONTH FROM close_date) as month,
  COUNT(*)::float / AVG(COUNT(*)) OVER () as seasonal_index
FROM transactions WHERE status = 'closed'
GROUP BY 1;
```
Canadian RE peak: March-June. Apply indices to forecasts.

### Anomaly Detection
- IQR method for expense anomalies (resistant to outliers)
- Flag expenses > Q3 + 1.5×IQR automatically
- Monthly expense report with anomaly highlights

### Benchmarking with Privacy
- **K-anonymity**: Minimum 5 agents per cohort, suppress if one agent > 30% of cohort
- **Differential privacy**: Add calibrated noise to aggregate statistics
- CREA national cohorts (4 buckets) are too coarse — use provincial + transaction-volume tiers

### PDF Report Generation
- `@react-pdf/renderer` for client-side PDF generation
- Puppeteer (server-side) for complex layouts with charts
- Include: Runway Score card, YTD summary, pipeline forecast, expense breakdown

---

## 16. Canadian Regulatory Compliance

### PIPEDA (Federal)
- Applies to all commercial activity across Canada
- 10 Fair Information Principles
- Meaningful consent required (not buried in ToS)
- Privacy Impact Assessment recommended before launch
- Breach notification: ASAP to Privacy Commissioner + affected individuals

### Law 25 (Quebec) — CRITICAL BLOCKER
- Quebec geo-blocked per lawyer advice until:
  1. Full French Canadian translation complete
  2. Law 25 compliance verified
- Requirements: Privacy officer, PIA, consent management, data portability, right to erasure
- Fines: Up to $25M or 4% of worldwide revenue

### CASL (Anti-Spam)
- Express consent for commercial electronic messages
- Implied consent expires: 2 years post-transaction, 6 months post-inquiry
- Every message: sender ID, mailing address, unsubscribe mechanism
- Penalties: Up to $10M per violation (organization)

### AIDA — Dead
- Bill C-27 (AI regulation) terminated January 2025
- No federal AI-specific legislation currently in force
- Follow PIPEDA principles for AI use

### Alberta PIPA
- Declared unconstitutional May 2025
- Currently in legal limbo — follow PIPEDA as baseline

### Data Residency
- Supabase ca-central-1 (Montreal) for Canadian data residency
- DPAs needed with all 7 vendors (Supabase, Vercel, Stripe, Plaid, Anthropic, Groq, Google)
- All AI API calls route through Canadian infrastructure where possible

### Required Insurance
- E&O (Errors & Omissions)
- General liability
- D&O (Directors & Officers)
- Cyber liability: Zensurance from $31/mo
- Data retention: Financial records 7 years (CRA), breach records 24 months

---

## 17. Canadian Real Estate Market Data

### Agent Demographics
- 160,000+ CREA members, ~100,000 in Ontario
- 51.3% of agents do 0-1 transactions/year
- Target market: The other 49% who are actually active
- National median income: $46,212 with extreme skew (top 10% earn >$200K)

### The 88/12 Gap — Agent Runway's Core Opportunity
- 88% of clients say they would use their agent again
- Only 12% actually do
- 91% of agents never follow up after closing
- **Agent Runway solves this**: Automated post-close nurture via Flight Control

### Technology Adoption
- AI adoption: 82% of agents integrate AI tools (RPR, Feb 2025)
- 59% have tried tools but are "still learning before fully committing" — adoption window closing
- Only 17% see significant positive impact from AI
- Financial tracking: Most use QuickBooks, spreadsheets, or nothing
- Massive gap in purpose-built RE financial analytics

### Market Dynamics
- Average days on market varies wildly by region
- Interest rate sensitivity: Each 25bps change shifts buyer qualification by ~$15K
- Seasonal pattern: 60% of transactions close March-August
- Canada PropTech market: $2.9B USD in 2025, projected $13.1B by 2035 (16.2% CAGR)
- At 158K agents, 1% penetration = 1,580 subs = $1.5M-$2.8M ARR

### Competitive Landscape (2025-2026)
| Platform | AI Approach | Price | Weakness vs Agent Runway |
|----------|-----------|-------|--------------------------|
| Compass | Voice-activated proactive AI | Brokerage-only | No financial analytics |
| Lofty (AOS) | Agentic AI (autonomous) | $449-1,500/mo | No P&L, no expense tracking |
| BoldTrail/kvCORE | Smart CRM + Marketing Autopilot | $299-1,800/mo | No business analytics |
| Follow Up Boss | AI via integrations (Ace/Mod) | $58-833/mo/user | No financial tools |
| Rechat (Lucy) | Form reading, content gen, CRM | Brokerage licensing | No analytics dashboards |

**Key differentiator gaps NO competitor fills:**
1. Business analytics for individual agents (GCI tracking, P&L, commission forecasting)
2. Team-level analytics (industry consensus: "Teams are very much underserved")
3. Commission-based financial planning (tools built for salaried, not variable income)
4. Canadian-specific features (MLS, bilingual, provincial tax)
5. Goal-based coaching backed by real transaction data (not just goal-setting)

### Industry AI Trends
- **Lofty's Agentic OS** (Feb 2026) sets new bar: 4 autonomous AI agents (Sales, Social, Homeowner, Assistant)
- **Compass** betting on voice-first proactive AI
- **Rechat's Lucy** drove 114% usage increase and 75%+ CRM adoption — proves well-designed AI assistant drives engagement
- **Shift**: From "AI-assisted" (reactive) → "agentic AI" (autonomous multi-step workflows)
- AI-native companies had only 40% gross retention — focus on workflow integration, not novelty

### Agent Adoption Barriers
- Fear of complexity — too many features causes retreat to old methods
- No clear ROI connection — must show direct line to more income
- Time cost — any tool that feels cumbersome is dead on arrival
- **Strategies that work**: Lead with income impact not feature tours, start with 3-5 sticky features, contextual in-app support, freemium or brokerage-subsidized entry

---

## 18. SaaS Growth & Monetization

### Pricing Strategy
| Tier | Price | Target |
|------|-------|--------|
| First 50 users | $79/mo | Early adopters, feedback loop |
| Next 50 users | $99/mo | Growth phase |
| Regular | $149/mo | Market rate |
| Team Leader | $149/mo | Same as individual |
| Team Member | $55/mo | Accessible for teams |

### Onboarding — Critical Path
- 14-day free trial (no credit card required)
- 5-step checklist: Profile → Goal → First Transaction → Connect Bank → Explore Dashboard
- Ghost sample data on signup (remove on first real data entry)
- Every extra minute to value = -3% conversion
- Empty states without guidance = 84% abandonment

### Key SaaS Metrics to Track
- Time to First Value (TTFV) — target < 5 minutes
- Activation rate (completed 3+ of 5 onboarding steps)
- 7-day retention, 30-day retention
- NPS score monthly
- Feature adoption rates per page
- Churn by cohort, reason code

### Growth Levers
1. **Team/brokerage sales** — one leader brings 5-20 members
2. **Referral program** — 1 month free for referrer + referee
3. **Content marketing** — Canadian RE financial education
4. **Integration partnerships** — MLS boards, brokerages
5. **Conference presence** — CREA, provincial association events

### Trial Optimization
- **7-day trials** convert at ~40.4%; over 61 days drops to ~30.6%
- **Credit card required**: 48.8% conversion vs 18.2% without (2.7x gap)
- **Recommendation**: 14-day trial with credit card required; offer 7-day extension if user has imported data but not hit activation milestone
- B2B SaaS benchmark: 15% conversion = good, 30% = excellent

### Annual vs Monthly
- Optimal annual discount: 15-20% (~2 months free)
- Annual billing reduces churn by 12-34%
- Monthly churns 2-3x more than annual
- Solopreneurs (agents) choose annual only ~18% of the time — but those who do retain dramatically better
- Default pricing page toggle to annual

### AI Feature Pricing
- **Bundle AI, don't add-on**: Only 20% buy AI add-ons, only 38% of buyers use it = 8% engagement
- Companies that initially sold AI add-ons have bundled and raised base prices $2.50-5/user
- 79 of PricingSaaS 500 now offer credit models (up from 35 end of 2024)
- **Recommendation**: Bundle generous AI allowance in all plans; unlimited at higher tiers

### Expansion Revenue
- Top-quartile SaaS: 35%+ of new ARR from expansion
- Upselling: 60-70% success rate vs 5-20% for new acquisition
- Per-seat models see 3-8% monthly seat growth in expanding accounts
- **Agent Runway paths**: $79→$149 tier upgrade, individual→team, seat additions, AI credit upsells

### Key SaaS Metrics Targets
| Metric | Seed Target | Series A Target |
|--------|------------|-----------------|
| ARR | Path to $1M in 12-18mo | $1-2M+ |
| MRR Growth | 15-20% MoM | 10-15% MoM |
| NDR | >100% | >110% |
| LTV:CAC | >3:1 | >3:1 |
| CAC Payback | <12 months | <12 months |
| Logo Churn | <5% monthly | <3% monthly |

### Activation Metrics
- Users who retain 90+ days → work backward to find shared first-week behaviors
- **Likely activation events**: Import 10+ CRM contacts, log 1+ transaction, view dashboard, set flight status, use Flight Crew
- Target: 40-60% of trial users activated within 7 days

### Churn Prevention
- Dunning management recovers 20-40% of failed-payment cancellations
- Systematic onboarding increases first-year retention by 25%
- Win-back campaigns at 30/60/90 days: 5-15% recovery rate
- Behavioral analytics users report 15% better retention

### SR&ED Tax Credits (Critical Revenue)
**Federal (2025 Budget enhancements):**
- 35% refundable credit for CCPCs on first $6M qualifying expenditures
- Maximum refundable credit: $2.1M/year (doubled from $1.05M)
- 15% non-refundable above $6M limit

**Provincial stacking (fully stackable with federal):**
- New Brunswick: 15% refundable → ~50% combined recovery on qualifying wages
- Ontario: 8% refundable + additional → up to ~55% combined
- Quebec: 30% on first $1M → up to ~65% combined (best in world)

**Eligible work**: AI/ML development, algorithm design, novel integration architectures, experimental data processing — basically all Agent Runway's Flight Crew, predictive analytics, and Google integration work.

**Action**: Engage SR&ED consultant (fee: 15-25% of recovered credits). Document technical challenges, experiments, outcomes NOW for current fiscal year.

### IRAP Funding
- Up to 60-80% of eligible project costs, max $500K per project
- Average grant: $94K; covers up to 80% of salaries, 50% of subcontractors
- Budget cycle: April 1 - March 31; apply early (April-July) as funds run out
- **Apply immediately** for AI development work

### Privacy as Competitive Advantage
- "Your client data stays in Canada" — genuine differentiator vs US competitors
- Position against Follow Up Boss, kvCORE (US data storage, US government access)
- New federal privacy legislation expected late 2025/early 2026 with fines up to $25M or 5% of global revenue
- Being ahead of compliance is a selling point nationwide

### RE SaaS Market Size
- Real Estate SaaS market: $8.6B in 2025, growing at 42% annually
- Competitor pricing: Follow Up Boss $69-99/mo, kvCORE $499-1,200/mo for teams
- Agent Runway at $79-149 individual sits in sweet spot; $55/member undercuts all team competitors

---

## 19. Security, Testing & DevOps

### npm Supply Chain Security
- September 2025 attack hit 18 packages, 2.6B weekly downloads
- **Actions**: `npm audit` in CI, lockfile integrity checks, Snyk/Socket.dev monitoring
- Pin exact versions for critical dependencies

### SOC 2 Type II
- Cost: $30-50K first year
- Go straight to Type II (skip Type I — same effort, more valuable)
- Timeline: 6-12 month observation period
- Canadian auditors: KPMG, Deloitte, BDO, MNP

### Penetration Testing
- Cost: $10K-30K
- Canadian firms: DeepStrike, Software Secured, Packetlabs
- Annual testing recommended
- Focus areas: API authentication, RLS bypass, AI injection

### Testing Strategy & Tool Stack
| Category | Tool | Notes |
|----------|------|-------|
| Unit tests | Vitest 3.x (projects mode) | Monorepo-native, `projects` replaces deprecated `vitest.workspace` |
| E2E | Playwright | Auth caching via setup project, visual regression built-in |
| Mobile E2E | Maestro | YAML syntax, <1% flakiness, native Expo support, no app changes |
| DB/RLS testing | pgTAP + supabase-test-helpers | Verify RLS policies in CI |
| AI testing | Promptfoo | Prompt regression testing with `llm-rubric` assertions |
| Load testing | k6 | Test upstream (Supabase) directly, not Vercel edge |
| API testing | next-test-api-route-handler | Isolated API route testing |

**Testing RSC**: Vitest doesn't support async Server Components — test sync RSC/Client Components with Vitest, test async RSC with Playwright E2E. Mock `next/headers` in setup. Use MSW for Supabase mocking (not direct client mocks).

**Stripe webhook testing**: Use Stripe Test Clocks to simulate subscription lifecycle (time advancement without waiting). `@sesamecare/stripe-mock` for unit tests without API calls.

### CI/CD Pipeline (GitHub Actions + Turborepo)
```yaml
jobs:
  detect-changes:        # dorny/paths-filter for selective execution
  lint-test:             # pnpm turbo lint test typecheck --filter='...[origin/main]'
  e2e:                   # Only if web changed; Playwright with cached auth
  db-tests:              # supabase start → supabase test db
```
**Key optimization**: `--filter='...[origin/main]'` runs only changed packages — bigger win than caching.
**Remote caching**: First builds ~30s, cached builds ~0.2s. Set `TURBO_TOKEN` + `TURBO_TEAM` in CI.

### Dependency Management
- **Renovate** for day-to-day (groups across monorepo workspaces, auto-merge patches)
- **Dependabot** for security alerts only
- Renovate saves ~15 hrs/month vs Dependabot for monorepos (grouped updates)

### Code Quality
- ESLint flat config (required since v9) + Prettier + Husky + lint-staged
- Pre-commit: `eslint --fix` + `prettier --write` on staged files
- TypeScript strict additions: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`

### Feature Flags
- **Vercel Edge Config + Flags SDK**: Zero cost, <1ms p90 reads
- Changes propagate globally in <10 seconds, no redeploy needed
- LaunchDarkly is overkill at current scale

### Deployment Strategy
- **Vercel**: Inherently blue-green; every deploy is immutable with unique URL
- **Instant rollback**: `vercel rollback` re-aliases to previous deployment in milliseconds
- **Rolling releases**: Gradually shift traffic 10% → 50% → 100%
- **Preview + Supabase branching**: Each PR gets isolated DB, auto-injected env vars

### 4-Tier Environment Structure
| Environment | Supabase | Vercel | Use |
|-------------|----------|--------|-----|
| Local | `supabase start` (Docker) | `next dev` | Daily dev |
| Preview | Branch DB (auto per PR) | PR preview | Code review |
| Staging | Dedicated project | staging branch | QA/integration |
| Production | Production project | Production | Live users |

### Monitoring & Alerting
- **Sentry**: Auto-configured via `npx @sentry/wizard@latest -i nextjs`; captures RSC errors, distributed tracing, Core Web Vitals
- **Vercel Analytics**: Speed Insights for LCP/FCP/INP/CLS
- **Health endpoint**: `/api/health` checking DB connectivity
- **BetterStack**: Unified log aggregation from Vercel + Supabase + custom
- **Alert thresholds**: Error rate >1%/5min (critical), P95 >2s (warning), DB connections >80% (warning), auth failures >50/5min (security)

### Backup Strategy
- **Supabase PITR** (recommended): WAL-based, restore to any second, 2-min backup granularity
- Weekly `supabase db dump` to off-site storage (S3/GCS)
- Quarterly DR drill: restore from PITR to test project, verify integrity
- Migration files in version control = DB can always be rebuilt from scratch

### Cost Monitoring Checklist (Monthly)
- Review Supabase usage dashboard (MAU is dominant cost driver: $3.25/1K users over 100K)
- Check Vercel function invocation counts
- Review AI API spend by user tier (log per-request token usage)
- Monitor Stripe processing fees vs revenue
- Supabase Spend Cap (default ON) prevents runaway costs

### Mobile Deployment (Expo EAS)
- **Build profiles**: development (internal), staging (internal), production (store)
- **OTA Updates**: JS-only changes push instantly without app store review
- **Rollback**: `eas update:rollback --channel production`
- **Flow**: `eas build` → `eas submit` → TestFlight/Play Store → `eas update` for hotfixes

---

## 20. UI/UX Dashboard Patterns

### Layout & Loading
- **F-pattern** layout for data-heavy dashboards
- **Skeleton screens**: 50% faster perceived load time
- **Shimmer effects** on loading states (not spinners)
- Progressive disclosure: summary → click for detail

### Charts & Data Viz
- **Recharts** (via shadcn/ui): 53 pre-built chart components, smallest bundle
- **TanStack Table v8**: Virtual scrolling for 10K+ rows at 60fps
- Area charts for trends, bar charts for comparisons, gauge for Runway Score

### Onboarding Tours
- **Onborda**: Next.js App Router native product tour library
- **Zeigarnik Effect**: Start checklist at 20% complete (feels almost done)
- Trigger tours on first visit to each page, not all at once

### AI UI Patterns
- **Streaming** responses are baseline expectation (not optional)
- **Source citations** = #1 trust mechanism for AI-generated content
- **Confidence indicators** on AI-generated forecasts
- **Edit before send** for all AI-generated outreach

### Empty States
- Never show blank pages — always show guidance
- Sample/ghost data with clear "this is sample data" indicator
- CTA in every empty state pointing to the action needed

---

## 21. Voice AI & Emerging Tech

### Voice Pipeline
```
User Speech → Deepgram Nova-3 (STT) → Claude (reasoning) → OpenAI gpt-4o-mini-tts (TTS) → Audio
```
- Deepgram Nova-3: Best price/performance for Canadian English + French
- gpt-4o-mini-tts: Natural voice, low latency, instruction-following for tone
- **For Agent Runway**: Voice notes for activity logging, hands-free dashboard queries while driving

### Emerging Capabilities (6-12 Month Horizon)
1. **Computer use agents**: Claude can operate web browsers — potential for MLS data entry automation
2. **Multi-modal understanding**: Analyze property photos, floor plans, marketing materials
3. **Real-time voice conversations**: Sub-200ms round-trip possible now
4. **Code generation agents**: Claude can write and test code — potential for custom report builders
5. **Memory across sessions**: Persistent agent memory for long-term client relationship context

### AI Stickiness Patterns (Prevent 40% AI Churn)
- **Daily workflow integration** is the only path — GitHub Copilot gets 80% utilization because it's in the daily workflow, 67% use 5+ days/week
- Flight Crew must be the thing agents check every morning: "Here are your 3 priorities today" / "2 follow-ups overdue" / "Monthly target on track"
- **Proactive alerts** beat reactive queries: "Your marketing spend jumped 40% but closings are flat" / "You haven't contacted [client] in 14 days"
- **Explain reasoning, not just answers**: "Based on your last 12 transactions..." builds trust more than raw accuracy numbers
- **Adaptive dashboards**: Learn which metrics each agent checks first, surface those prominently
- 25-35% adoption boost from AI personalization; up to 30% improvement in retention

### AI Features to Build (Based on Market Gaps)
1. **AI-generated weekly/monthly business reports** — Automated narrative from real data ("Your Q1 GCI was $X, up 12%...") — no RE tool does this
2. **Proactive anomaly alerts** — Only QuickBooks-level tools do this, not for RE
3. **Scenario modeling** — "What if I hire an assistant?" / "What if rates drop 1%?" — 5,000-10,000 Monte Carlo iterations for stable results
4. **Natural language data querying** — "What was my average commission in Q3?" via Flight Crew (Xero's JAX achieved 61% adoption)
5. **Goal-based coaching with real data** — Like SkySlope Ayce but backed by actual performance data

### What NOT to Build Yet
- Don't build custom ML models — rule-based + LLM is sufficient for current scale
- Don't build a custom embedding model — Voyage-3.5 is excellent
- Don't build a custom voice model — use APIs
- Don't build blockchain/crypto features — no market demand in Canadian RE
- Don't build AR/VR — cool but not core value prop

---

## Implementation Priority Matrix

| Priority | Action | Impact | Effort |
|----------|--------|--------|--------|
| 1 | Gmail send integration | Unblocks Flight Control end-to-end | Medium |
| 2 | Team billing architecture | Unblocks Ellis Realty beta | Medium |
| 3 | Ellis Realty beta seed | Gets first team onboarded | Low |
| 4 | Mobile app real data | Gets mobile functional | High |
| 5 | Privacy audit + team reports | Safety + team value | Medium |
| 6 | Mobile clients + contact logging | High daily-use value | Medium |
| 7 | Outlook/SMTP email support | Broadens email reach | Low |
| 8 | Team AI insights | Enhances advisor for teams | Medium |
| 9 | Mobile receipt scanning | Field-agent value | Medium |
| 10 | Google Calendar sync | Complex but high value | High |
| 11 | Mobile Flight Control | Depends on G1 | Medium |
| 12 | Team onboarding wizard | Polish | Medium |
| 13 | Google Drive integration | Lowest urgency | High |
| 14 | Mobile tab restructure | After screens built | Low |

---

## Architecture Decision Records

### ADR-001: Voyage-3.5 over OpenAI for Embeddings
**Decision**: Use Voyage-3.5 for all embedding needs.
**Rationale**: 8.26% better retrieval, 2.2x cheaper, bilingual English+French in single model, 200M free tokens, Anthropic-recommended.

### ADR-002: Server-Side AI Context Building
**Decision**: All AI context is built server-side. LLM never queries database.
**Rationale**: Security gold standard. Prevents data leakage, enables precise RLS enforcement, makes prompt injection harmless for data access.

### ADR-003: drive.file over drive Scope
**Decision**: Request `drive.file` not `drive` for Google Drive.
**Rationale**: Avoids CASA Tier 2 restricted scope review. Only accesses files user explicitly opens with our app. Reduces verification timeline from months to weeks.

### ADR-004: PowerSync for Mobile Offline
**Decision**: Use PowerSync for Supabase ↔ SQLite sync on mobile.
**Rationale**: Purpose-built for Supabase, handles conflict resolution, partial sync, and offline queue. Eliminates custom sync logic.

### ADR-005: Rule-Based Scoring Before ML
**Decision**: Use rule-based churn/lead scoring before investing in ML models.
**Rationale**: 70-80% as effective as ML at current scale. Can be implemented entirely in SQL. ML models need 500+ data points per segment to outperform rules.

### ADR-006: Supabase Queues over External Queue
**Decision**: Use pgmq (Supabase Queues) instead of Redis/SQS.
**Rationale**: Zero additional infrastructure, built into Supabase, supports all our async patterns (email send, OCR, batch AI).

### ADR-007: NativeWind for Mobile Styling
**Decision**: Use NativeWind v5 (Tailwind CSS for React Native).
**Rationale**: Shared design language with web app, dark mode support, smaller learning curve for team already using Tailwind.

---

*Last updated: April 4, 2026*
*Source: 32 research agents, ~800 topics, ~500 web sources*
