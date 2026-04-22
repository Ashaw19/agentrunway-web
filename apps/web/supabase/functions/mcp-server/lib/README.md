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

## Future work (out of scope for Audit 1)

A proper sync checker (`scripts/check-mcp-sync.ts` or similar) belongs in the
`infra-platform-champion` lane. Today we rely on this README + the grep
protocol described in `CLAUDE.md` checkpoint 5 (post-fix grep).
