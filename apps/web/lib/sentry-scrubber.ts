// ─────────────────────────────────────────────────────────────────────────────
// Sentry PII scrubber
// ─────────────────────────────────────────────────────────────────────────────
// Walks every Sentry event (errors + transactions) and redacts personal
// identifiers from every string it finds — message, tags, breadcrumbs,
// request bodies, user context, contexts, extras. Applied via `beforeSend`
// in both the Node/Edge runtime (instrumentation.ts) and the browser
// (instrumentation-client.ts).
//
// This is defense-in-depth: server code should not log PII in the first
// place (see PII-safe comments in subscribe/route.ts and stripe-webhook).
// If something slips through, this scrubber catches it before it leaves
// the process and reaches Sentry's servers.
// ─────────────────────────────────────────────────────────────────────────────

// Structural type — matches both Sentry ErrorEvent and TransactionEvent.
// We don't import named types from @sentry/nextjs because it doesn't re-export
// them; a generic constraint keeps the scrubber usable for any Sentry event shape.
type ScrubTarget = {
  user?: {
    email?: string | null;
    ip_address?: string | null;
    username?: string | null;
  };
};

// ── PII regex patterns ──────────────────────────────────────────────────────
// Kept deliberately permissive to err on the side of redaction.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
const SIN_RE = /\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/g; // Canadian SIN
const CARD_RE = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g; // 16-digit PAN (Visa, MC, etc.)
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g;
// Canadian postal code — optional, low-confidence PII, included for completeness
const POSTAL_RE = /\b[A-CEGHJ-NPR-TVXY]\d[A-CEGHJ-NPR-TV-Z][ -]?\d[A-CEGHJ-NPR-TV-Z]\d\b/g;

/** Redact PII substrings in a string. Safe for non-string input (returns as-is). */
function redact(s: string): string {
  // Order matters: card before phone (both are digit-heavy), SIN before phone.
  return s
    .replace(CARD_RE, "[redacted-card]")
    .replace(SIN_RE, "[redacted-sin]")
    .replace(IBAN_RE, "[redacted-iban]")
    .replace(EMAIL_RE, "[redacted-email]")
    .replace(PHONE_RE, "[redacted-phone]")
    .replace(POSTAL_RE, "[redacted-postal]");
}

/** Recursively walk any JSON-ish value, redacting every string we encounter. */
function walk(value: unknown, depth = 0): unknown {
  // Guard against pathological structures — Sentry events shouldn't exceed this.
  if (depth > 12) return value;
  if (typeof value === "string") return redact(value);
  if (Array.isArray(value)) return value.map((v) => walk(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = walk(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Common user-context redaction: masks identity fields, preserves internal UUID. */
function scrubUserFields(event: ScrubTarget): void {
  if (event.user) {
    if (event.user.email) event.user.email = "[redacted-email]";
    if (event.user.ip_address) event.user.ip_address = "[redacted-ip]";
    if (event.user.username) event.user.username = "[redacted-username]";
    // Preserve event.user.id (our internal UUID, not PII).
  }
}

/**
 * Sentry `beforeSend` hook (error events).
 * Redacts user identity fields, walks the event tree, scrubs PII from every
 * string. Returns the scrubbed event or null to drop it entirely.
 *
 * Uses a generic so TypeScript narrows T to Sentry's concrete ErrorEvent type
 * at the call site — satisfies the `beforeSend` signature without needing to
 * import named types that @sentry/nextjs doesn't re-export.
 */
export function scrubErrorEvent<T extends ScrubTarget>(event: T): T | null {
  scrubUserFields(event);
  return walk(event) as T;
}

/**
 * Sentry `beforeSendTransaction` hook (performance / tracing events).
 * Same scrubbing applied to transaction events.
 */
export function scrubTransactionEvent<T extends ScrubTarget>(event: T): T | null {
  scrubUserFields(event);
  return walk(event) as T;
}
