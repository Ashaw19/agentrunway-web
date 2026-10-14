// Re-export shim — keeps app imports on the `@/lib/*` convention.
// Name normalization lives in packages/core/lib/client-identity.ts so the
// phone app writes the same clients.name_search.
export * from "@agent-runway/core/lib/client-identity";
