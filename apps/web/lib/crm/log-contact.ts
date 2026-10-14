// Re-export shim — keeps app imports on the `@/lib/*` convention.
// The writer lives in packages/core/lib/log-client-contact.ts so the phone
// app logs a contact through the same code.
export * from "@agent-runway/core/lib/log-client-contact";
