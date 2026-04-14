/**
 * Translate a Supabase / PostgREST error into a short, user-readable sentence.
 *
 * Every "Something failed — please try again" toast in the app should go through
 * this helper. The goal is:
 *
 *   1. The user sees a sentence that points at the actual problem
 *      (duplicate email, missing field, permission denied, network down, etc.)
 *      instead of a generic retry message that makes them feel like the product
 *      is broken.
 *
 *   2. The real error code + message is always logged to the console (and
 *      therefore to Sentry) so we can debug after the fact.
 *
 * Use it like this:
 *
 *     const { error } = await supabase.from("clients").insert(...);
 *     if (error) {
 *       console.error("[crm] add-client failed:", error);
 *       toast.error(describeSupabaseError(error, { action: "add this client" }));
 *       return;
 *     }
 */

import type { PostgrestError } from "@supabase/supabase-js";

export interface DescribeOptions {
  /** Short verb phrase, e.g. "add this client", "save your changes", "upload this report". */
  action?: string;
  /** Field-specific friendly names, e.g. `{ email: "email address" }` — used in the unique-violation message. */
  fieldLabels?: Record<string, string>;
}

/** Type guard that doesn't require the caller to know the PostgrestError shape. */
function isPostgrestError(err: unknown): err is PostgrestError {
  return (
    typeof err === "object" &&
    err !== null &&
    "message" in err &&
    ("code" in err || "details" in err || "hint" in err)
  );
}

/** Guess a friendlier column label from the raw detail string, e.g. `Key (email)=(a@b.ca)` → "email". */
function extractColumnName(detail: string | null | undefined): string | null {
  if (!detail) return null;
  const match = detail.match(/Key \(([^)]+)\)/);
  return match?.[1] ?? null;
}

export function describeSupabaseError(
  err: unknown,
  opts: DescribeOptions = {},
): string {
  const action = opts.action ?? "complete that action";
  const labels = opts.fieldLabels ?? {};

  // Network / offline — fetch throws a TypeError in the browser
  if (err instanceof TypeError && /fetch|network/i.test(err.message)) {
    return "Couldn't reach Agent Runway — check your internet connection and try again.";
  }

  if (isPostgrestError(err)) {
    const code = err.code ?? "";
    const message = err.message ?? "";

    // Postgres SQLSTATE codes
    switch (code) {
      case "23505": {
        // unique_violation
        const col = extractColumnName(err.details) ?? "that value";
        const nice = labels[col] ?? col.replace(/_/g, " ");
        return `A record with the same ${nice} already exists. Try a different ${nice}.`;
      }
      case "23503":
        // foreign_key_violation
        return "This depends on something that's been removed. Refresh the page and try again.";
      case "23502": {
        // not_null_violation
        const col = extractColumnName(err.details);
        const nice = col ? (labels[col] ?? col.replace(/_/g, " ")) : "a required field";
        return `${nice.charAt(0).toUpperCase()}${nice.slice(1)} is required — please fill it in and try again.`;
      }
      case "23514":
        // check_violation
        return "One of the values isn't in the allowed range. Double-check your entries and try again.";
      case "22001":
        // string_data_right_truncation
        return "One of the values is too long. Shorten it and try again.";
      case "22007":
      case "22008":
        // invalid_datetime_format
        return "A date looks wrong. Check your date fields and try again.";
      case "42501":
        // insufficient_privilege
        return "You don't have permission to do that. If this looks wrong, contact support.";
      case "42P01":
        // undefined_table
        return "Something's out of sync on our end. Refresh the page — if it keeps happening, contact support.";
      case "PGRST116":
        // zero rows where one was expected
        return "We couldn't find that record — it may have been removed.";
      case "PGRST301":
      case "PGRST302":
        // JWT expired
        return "Your session expired. Sign in again and try once more.";
      default:
        break;
    }

    // PostgREST sometimes returns plain english in `message` — surface it if it
    // looks safe to show (no "permission denied for relation" internals).
    if (
      message &&
      !/permission denied for (relation|schema|table|function)/i.test(message) &&
      !/violates row-level security/i.test(message) &&
      message.length < 140
    ) {
      return `${capitalize(message)} Try again, or contact support if it keeps happening.`;
    }
  }

  // Native Error objects with a message
  if (err instanceof Error && err.message) {
    if (err.message.length < 140) {
      return `${capitalize(err.message)} Try again, or contact support if it keeps happening.`;
    }
  }

  // Last resort
  return `We couldn't ${action} right now. Try again in a moment — if it keeps happening, contact support.`;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}
