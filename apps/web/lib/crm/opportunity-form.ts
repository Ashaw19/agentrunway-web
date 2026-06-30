/**
 * Pure helpers for the Add Opportunity dialog's submit path.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Client ID fields are raw UUID text inputs — validate the shape before it reaches Postgres as a 22P02. */
export function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

/**
 * postgrest-js only wraps query errors in its `PostgrestError` class (which
 * extends `Error`) when `.throwOnError()` is used. The default destructure
 * pattern (`const { error } = await supabase.from(...).insert(...)`) gets
 * back a plain `{ message, details, hint, code }` object instead, so gating
 * on `instanceof Error` silently drops the real message.
 */
export function supabaseErrorMessage(err: unknown, fallback = "Failed to save opportunity."): string {
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return fallback;
}
