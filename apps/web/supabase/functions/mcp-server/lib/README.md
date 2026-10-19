# MCP Edge Function — Shared Lib

Deno edge functions cannot import workspace packages (`@agent-runway/core`).
There are two ways an engine gets here.

## 1. Import the canonical engine (preferred)

`pnpm build:mcp-shared` copies `packages/core` into
`supabase/functions/_shared/core/` (gitignored, rebuilt before every deploy)
with `.ts` added to each relative import. A tool imports the real engine from
there, so there is nothing to keep in sync:

```ts
import { ytdExpenseTotals } from "../../_shared/core/engines/t2125-expenses-engine.ts";
```

Use this for anything new. Two tests in `apps/web/lib/mcp-server/__tests__/`
cover it: `deno-imports.test.ts` walks the function's import graph into
`packages/core` and fails on an import Deno or the build script can't
resolve, and `expense-parity.test.ts` runs the real tool handlers.

| Local file | Canonical engines it calls | Notes |
|---|---|---|
| `expense-inputs.ts` | `t2125-expenses-engine` (`ytdExpenseTotals`: the one year-to-date total, and the lines it is the sum of), `expense-totals-engine` (`inputTaxCreditsForPeriod`, `expenseTaxContext`), `vehicle-logbook-engine`, `lib/vehicle-logbook-rows` (`loadLogbookRowsOrNull`), `local-date` | Added 2026-10-13. NOT a mirror: it fetches the dashboard's expense rows (`receipt_expenses` this Atlantic year, active `recurring_expenses`, `expense_items` key and `monthly_recurring`) and hands them to the engine. Every tool that reports an expense figure calls `loadExpenseInputs`. `expense_items.ytd_amount` is never read: the app stopped writing it. Since 2026-10-18 it also reads the vehicle logbook for the year, as the dashboard does, so the vehicle share is the logbook's when it covers the year (`vehicleUse` says which). |

`tools/analytics.ts` also takes the GST/HST filing periods straight from
`filing-period-engine` (`getFilingPeriods`). Its hand copy had kept Q4's
deadline at Mar 31 after the engine was corrected to Jan 31.

`tools/logbook.ts` (get_logbook_status, start_logbook_period, log_mileage,
record_odometer_reading) and `get_mileage_summary` take the vehicle share,
CRA's allowance-rate benchmark and CRA's logbook wording from
`vehicle-logbook-engine`, `tax-copy/cra-rules` and `lib/vehicle-logbook-rows`,
and write through `lib/vehicle-logbook-writes` (the writers the web, Flight
Crew and the phone share). Added 2026-10-18.

### Deploying

Rebuild the copy first, every time, from the repo root:

```bash
pnpm build:mcp-shared
```

Then deploy `mcp-server`. The copy is gitignored, so nothing keeps it current.
A stale one is worse than none: if a tool imports an engine function the old
copy doesn't have, the function fails to load and every tool returns an error.

## 2. Deliberate duplicates (older)

The files below are **deliberate copies** of a canonical engine from
`packages/core/engines/*` or `packages/core/types/*`, written before the
shared copy existed.

## Sync discipline

If any file in `packages/core/engines/` or `packages/core/types/` that is
mirrored here changes, **you must mirror the change in this folder in the same
commit**. A sibling that has drifted is the exact class of bug Audit 1
(2026-04-22) was created to hunt.

When in doubt: re-read `/Users/b/.claude/projects/.../memory/feedback_data_consistency_protocol.md`.

## Current files

| Local file | Upstream canonical source | Notes |
|---|---|---|
| `canadian-tax-engine.ts` | `packages/core/engines/canadian-tax-engine.ts` | Full engine (brackets, CPP, QPP, provincial). |
| `effective-cash.ts` | `packages/core/engines/effective-cash.ts` | Added 2026-04-22 (Audit 1 D-1 + D-2). Currently exports `computeProjectedNetForTax` + `computePipelineMonthlyIncome` + the helper types they depend on (`SplitPreset`, `EffectiveCashSettingsSlice`). Mirrors `computeAgentGross` + `computeTxFees` from `packages/core/types/database.ts`. It does NOT carry `computeEffectiveCashForSurvival`, so it has no HST-owing or ITC line: `expensesYTD` and `monthlyRecurring` arrive net of ITCs from `expense-inputs.ts`, and nothing here takes an ITC off again (core dropped its own ITC estimate on 2026-10-13). |
| `projection-engine.ts` | `packages/core/engines/projection-engine.ts` | Added 2026-06-26 (cross-surface divergence fix). Exports `seasonalFractionElapsed`, `normalizeSeasonalWeights`, `projectedYearEndGCI`, `projectedYearEndTransactions`, `LISTING_PROBABILITIES`, `computeListingWeightedGCI`. Replaced the open-coded `ytdGCI / yearFraction` + "60% pace / 40% pipeline" projections in `tools/analytics.ts` so the Connector's projected GCI matches the dashboard (seasonal fraction + pipeline + listing weighted GCI). |
| `hst-engine.ts` | `packages/core/engines/hst-engine.ts` | Added 2026-04-22 (Audit 1 D-4). Exports `computeHSTCollected`, `computeHSTNetOwing`, `HSTCollectedInputs`, `HSTNetOwingInputs`, `HSTThresholdSeverity`. Also mirrors `gstHstRate` + `gstHstLabel` from `canadian-tax-engine.ts` so the MCP tool does not need to import the full tax engine just to resolve a rate. |
| `constants.ts` | `apps/web/lib/flight-crew/constants.ts` | Added 2026-04-22 (Audit 2). Exports `CANONICAL_TAX_DISCLAIMER` + `CANONICAL_TAX_DISCLAIMER_SHORT`. Any change to the upstream file must be mirrored here in the same commit. |
| `opportunity-conversion-engine.ts` | `packages/core/engines/opportunity-conversion-engine.ts` | Added 2026-06-30 (pipeline pre-transactional opportunities, Phase E). Exports `computeOpportunityKpis`, `computeOpportunityWeightedGci`, `effectiveOdds`, `OPPORTUNITY_DEFAULT_ODDS`, types `OpportunityRow` / `OpportunityKpis` / `OpportunityType` / `OpportunityStatus`. The `list_opportunities` MCP tool calls this for its KPI summary — KPI math is NOT reimplemented in the tool. The upstream `OpportunityLossReason` type (from `packages/core/lib/opportunity-loss-reasons.ts`) is INLINED here as a doc-only union to avoid crossing the workspace boundary. |

## Future work (out of scope for Audit 1)

A proper sync checker (`scripts/check-mcp-sync.ts` or similar) belongs in the
`infra-platform-champion` lane. Today we rely on this README + the grep
protocol described in `CLAUDE.md` checkpoint 5 (post-fix grep).
