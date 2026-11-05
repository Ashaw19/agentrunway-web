/**
 * Pure helpers for the Add Opportunity dialog's submit path.
 */

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
