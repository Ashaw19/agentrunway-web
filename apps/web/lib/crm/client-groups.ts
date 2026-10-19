// Re-export shim — keeps app imports on the `@/lib/*` convention.
// Per-client deal totals and the Clients table sort live in
// packages/core/lib/client-groups.ts so the phone's Clients list puts top
// clients first by the same rule and in the same order as the web table.
export * from "@agent-runway/core/lib/client-groups";
