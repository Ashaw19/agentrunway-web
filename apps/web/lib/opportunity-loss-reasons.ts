// Re-export shim — keeps app imports on the `@/lib/*` convention.
// Canonical vocabulary lives in packages/core/lib/opportunity-loss-reasons.ts
// and is mirrored by CHECK constraints in migrations 00153/00154/00155.
export * from "@agent-runway/core/lib/opportunity-loss-reasons";
