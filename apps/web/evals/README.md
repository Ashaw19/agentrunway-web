# Agent Runway eval harness

Binary pass/fail checks on the AI parts of Agent Runway, with synthetic,
PII-free fixtures. They gate prompt changes and model upgrades: a cheaper
model is only worth switching to once these pass on it.

## How to run

```bash
# every suite (live ones skip without a key)
pnpm --filter agentrunway-web eval

# one suite
cd apps/web && npx vitest run --config vitest.eval.config.ts evals/deterministic/casl-drafters.eval.ts

# the live-model suites too
cd apps/web && ANTHROPIC_API_KEY=sk-ant-... pnpm eval
```

- **Deterministic suites** (`evals/deterministic/`) need no key and no
  network. They finish in under a second, so they also run in the normal
  test run (`npx vitest run`, CI's `pnpm turbo test`).
- **Live suites** (`evals/live/`) call Anthropic with the pinned models in
  `lib/ai/provider.ts`. Without `ANTHROPIC_API_KEY` they are reported as
  skipped, never failed. With a key, a run costs roughly a dollar (mostly the
  tool-selection suite, which sends the knowledge base with each request).
  They never write to the AI run ledger or any database.
- The provider pins `https://api.anthropic.com/v1`, so an `ANTHROPIC_BASE_URL`
  in your shell (a Claude Code terminal sets one) doesn't reroute eval calls.

## What each suite checks

| Suite | Kind | Checks |
|---|---|---|
| `deterministic/casl-drafters.eval.ts` | deterministic | Every one-client drafter (Flight Crew / CRM email drafts, Flight Plan templates, the iPhone text queue) x 8 clients: an opted-out client or a past client 24+ months after their last closed deal (own or co-bought; collapsed deals don't count) gets `call_only`, no AI call, nothing written. Inside the window, or no closed deal: a draft. Plus the `outreachChannel` truth table that Flight Control Scan and the nightly drafter use. |
| `deterministic/tax-copy.eval.ts` | deterministic | `validateTaxCopy()` finds no advice verbs in the tax copy the app generates: every tax-copy generator over a grid of provinces, incomes and settings; every exported tax-copy string; the tax diagnostic Flight Crew is handed for four synthetic agents; and the Navigator safety net flags seeded advice and adds the disclaimer. |
| `deterministic/receipt-amounts.eval.ts` | deterministic | `checkReceiptAmounts()`: the GST/HST is what's printed, never computed from a rate; a reading that can't be right is dropped for the agent to type; PST/QST lines don't count; Atlantic split HST must fit a rate; swapped subtotal/total; foreign receipts. |
| `deterministic/gst-hst-rates.eval.ts` | deterministic | One GST/HST rate per province everywhere: the core engine, the connector's copy, CRA rule copy, printed percent, the knowledge base, and the receipt check's ceiling, held to CRA's published rates. |
| `live/tool-selection.eval.ts` | live | 33 requests in Andrew's style (`fixtures/tool-requests.ts`), each to its persona with the real tools and system prompt: the first tool call is an accepted one. Tools are offered without `execute`, so nothing runs. |
| `live/receipt-ocr.eval.ts` | live | Synthetic receipts drawn with sharp (`fixtures/receipt-images.ts`) through the real extractor: vendor, date, total, GST/HST as printed, currency. |
| `live/drafting.eval.ts` | live | Real drafters with the live model: the client's first name, no placeholder or hard-sell, a subject and under 200 words (email), the length limit and opt-out line (text). CASL refusals hold with a live model too. |

## How to add a case

- **A tool-selection request:** add a row to `fixtures/tool-requests.ts`
  (`persona`, `request`, the accepted `first` tools, `none: true` if a plain
  answer is fine).
- **A receipt:** add an entry to `RECEIPTS` in `fixtures/receipt-images.ts`
  with the printed lines and what a correct reading returns.
- **A CASL client:** add a row to `SCENARIOS` in
  `deterministic/casl-drafters.eval.ts`; it runs against every drafter. A new
  drafter goes in `DRAFTERS`.
- **A receipt reading:** add a row to `CASES` in
  `deterministic/receipt-amounts.eval.ts`.
- **A new suite:** `evals/deterministic/<name>.eval.ts` (runs everywhere) or
  `evals/live/<name>.eval.ts` wrapped in
  `describe.skipIf(!LIVE)(... + LIVE_SKIP_NOTE, ...)` from `fixtures/live.ts`,
  calling `setAIRunRecorderForTests(() => {})` in `beforeAll` so it never
  writes to the ledger.

Fixtures stay synthetic: made-up names (Sam Example, Pat Example), addresses
(12 Example St) and phone numbers (555). Never paste a real client, receipt
or conversation into a fixture.
