# MCP Edge Function — Shared Lib (Deliberate Duplicates)

Deno edge functions cannot import workspace packages from `packages/core/*`.
Everything in this folder is a **deliberate copy** of a canonical engine from
`packages/core/engines/*` or `packages/core/types/*`.

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
| `effective-cash.ts` | `packages/core/engines/effective-cash.ts` | Added 2026-04-22 (Audit 1 D-1 + D-2). Currently exports `computeProjectedNetForTax` + `computePipelineMonthlyIncome` + the helper types they depend on (`SplitPreset`, `EffectiveCashSettingsSlice`). Mirrors `computeAgentGross` + `computeTxFees` from `packages/core/types/database.ts`. |
| `hst-engine.ts` | `packages/core/engines/hst-engine.ts` | Added 2026-04-22 (Audit 1 D-4). Exports `computeHSTCollected`, `computeHSTNetOwing`, `HSTCollectedInputs`, `HSTNetOwingInputs`, `HSTThresholdSeverity`. Also mirrors `gstHstRate` + `gstHstLabel` from `canadian-tax-engine.ts` so the MCP tool does not need to import the full tax engine just to resolve a rate. |
| `constants.ts` | `apps/web/lib/flight-crew/constants.ts` | Added 2026-04-22 (Audit 2). Exports `CANONICAL_TAX_DISCLAIMER` + `CANONICAL_TAX_DISCLAIMER_SHORT`. Any change to the upstream file must be mirrored here in the same commit. |

## Future work (out of scope for Audit 1)

A proper sync checker (`scripts/check-mcp-sync.ts` or similar) belongs in the
`infra-platform-champion` lane. Today we rely on this README + the grep
protocol described in `CLAUDE.md` checkpoint 5 (post-fix grep).
