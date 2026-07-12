/**
 * lib/import/client-error.ts
 *
 * Client-safe (no server-only imports) helper for turning a failed
 * `/api/import-history` fetch Response into a user-facing message plus a
 * sanitized telemetry bucket.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The route returns JSON `{ error }` for every error it handles itself (status
 * 4xx / 422). But a PLATFORM failure — Vercel killing the function at
 * `maxDuration` (504) or a crash/OOM (502) — returns a NON-JSON body (HTML or an
 * empty body). The old client code did `res.json().catch(() => ({}))` and then
 * threw the generic "Extraction failed", which masked a real 504 timeout for a
 * week. This helper branches on `res.status` so a timeout gets an actionable
 * "split it by year" message and every 5xx is bucketed for telemetry.
 *
 * Keep this file pure and framework-free so both the history and transactions
 * importers can share it and it can be unit-tested under the node vitest env.
 */

/** Sanitized telemetry buckets. Never contains raw error text or document content. */
export type ImportErrorCategory =
  | "timeout"
  | "server_error"
  | "rate_limit"
  | "extraction_failed"
  | "network_error"
  | "context_exceeded"
  | "unknown";

export interface ImportErrorInfo {
  /** User-facing, safe to show in a toast. */
  message: string;
  /** Sanitized bucket for `import_telemetry.error_category`. */
  category: ImportErrorCategory;
  /** HTTP status of the failed response (0 if unknown). */
  status: number;
}

/**
 * Error thrown by the importers when a non-ok Response comes back. Carries the
 * HTTP status and telemetry category so the component's catch block can surface
 * the curated message and log the bucket without re-deriving anything.
 */
export class ImportRequestError extends Error {
  readonly status: number;
  readonly category: ImportErrorCategory;

  constructor(info: ImportErrorInfo) {
    super(info.message);
    this.name = "ImportRequestError";
    this.status = info.status;
    this.category = info.category;
  }
}

const SPLIT_BY_YEAR_MESSAGE =
  "This report took too long to process — try splitting it by year and importing one year at a time.";

/**
 * Parse a failed `/api/import-history` Response into a message + telemetry bucket.
 *
 * Reads the body ONCE. If it is valid JSON with an `error` field (the route's own
 * errors), that message is preferred. Otherwise — the platform-timeout / crash
 * case — we branch on status so the user gets something actionable instead of a
 * generic failure.
 */
export async function readImportError(res: Response): Promise<ImportErrorInfo> {
  const status = res.status;

  // The route sends JSON for its own errors; the platform (504/502) sends HTML or
  // an empty body, so res.json() throws → serverError stays undefined and we fall
  // through to the status-based branches.
  let serverError: string | undefined;
  try {
    const body = (await res.json()) as { error?: unknown } | null;
    if (body && typeof body.error === "string" && body.error.trim()) {
      serverError = body.error.trim();
    }
  } catch {
    /* non-JSON body — leave serverError undefined */
  }

  // Rate limited — bucket explicitly regardless of body shape.
  if (status === 429) {
    return {
      message: serverError ?? "The import service is busy right now. Please wait a moment and try again.",
      category: "rate_limit",
      status,
    };
  }

  // Function exceeded its time budget (Vercel maxDuration = 504; upstream
  // request timeout = 408). The actionable fix is to split the report by year.
  if (status === 504 || status === 408) {
    return { message: SPLIT_BY_YEAR_MESSAGE, category: "timeout", status };
  }

  // Any other 5xx: prefer a server message if present, otherwise surface the
  // status code so support can tell a crash from a timeout.
  if (status >= 500) {
    return {
      message:
        serverError ??
        `The import service hit a server error (${status}). Please try again in a moment.`,
      category: "server_error",
      status,
    };
  }

  // 4xx (413 / 422 / …): the route returns a helpful JSON message — use it.
  // A non-JSON 4xx is unexpected; fall back to a generic message.
  return {
    message:
      serverError ?? "We couldn't extract data from this file. Try a different format or a clearer scan.",
    category: serverError ? "extraction_failed" : "unknown",
    status,
  };
}

/**
 * Bucket an arbitrary thrown error for telemetry. Used in the importers' catch
 * blocks, which also catch pre-fetch failures (file reading, a network error
 * where fetch() itself throws) that never produced a Response.
 *
 * When the error is an ImportRequestError the category was already decided by
 * readImportError, so return it verbatim. Otherwise fall back to keyword
 * matching that mirrors the importers' previous inline categorization.
 */
export function categorizeClientError(err: unknown): ImportErrorCategory {
  if (err instanceof ImportRequestError) return err.category;

  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (msg.includes("rate limit") || msg.includes("429")) return "rate_limit";
  if (msg.includes("network") || msg.includes("fetch failed") || msg.includes("failed to fetch"))
    return "network_error";
  if (msg.includes("token") || msg.includes("context length")) return "context_exceeded";
  if (msg.includes("extraction failed")) return "extraction_failed";
  return "unknown";
}
