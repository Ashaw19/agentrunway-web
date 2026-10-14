// Re-export shim — keeps app imports on the `@/lib/*` convention.
// The writer lives in packages/core/lib/record-pipeline-deal-close.ts so the
// phone app records a closed deal through the same code.
export * from "@agent-runway/core/lib/record-pipeline-deal-close";
