// Re-export shim — keeps app imports on the `@/lib/engines/*` convention
// (mirrors lib/engines/pipeline-forecast.ts). Canonical engine lives in
// packages/core/engines/opportunity-conversion-engine.ts.
export * from "@agent-runway/core/engines/opportunity-conversion-engine";
