// ─────────────────────────────────────────────────────────────────────────────
// User security events — server-side write helper
// ─────────────────────────────────────────────────────────────────────────────
// Records security-relevant events (auth, billing, account, team, data,
// integration, security) to public.user_security_events.
//
// Storage: public.user_security_events (migration 00119_user_security_events.sql).
// Distinct from public.security_audit_log (migration 00033) which is the
// org-scoped team audit trail.
//
// Read path: users SELECT their own rows via RLS. Writes always go through
// the service role here — never exposed to the browser.
//
// PII policy: `metadata` must contain ONLY non-PII context (plan tier, event
// ID, numeric count, etc.). Emails, phone numbers, SINs, addresses MUST NEVER
// be written. IPs are SHA-256 hashed on write so events from the same origin
// can still be correlated without retaining identity.
//
// Never throws — audit-log failures must not block the user's action. Failures
// are logged via the structured logger for investigation.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/logger";

export type AuditEventCategory =
  | "auth"
  | "billing"
  | "account"
  | "team"
  | "data"
  | "integration"
  | "security";

export interface AuditEventInput {
  /** User the event applies to (subject). */
  userId: string;
  /** Machine-readable event name, e.g. 'subscription_activated'. */
  eventType: string;
  eventCategory: AuditEventCategory;
  /** Who performed the action. Defaults to userId for self-service actions. */
  actorUserId?: string;
  /** Event-specific context. MUST be PII-free. */
  metadata?: Record<string, unknown>;
  /** Incoming request — used only to extract IP + user agent. */
  request?: Request;
}

/** SHA-256(ip)[0..16] so two events from the same origin can be correlated. */
function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

/**
 * Record a security-audit event. Safe to await — never throws; worst case the
 * log entry is dropped and the failure is reported to the logger.
 */
export async function logAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    const admin = createAdminClient();

    let ipHash: string | null = null;
    let userAgent: string | null = null;

    if (input.request) {
      const headers = input.request.headers;
      const rawIp =
        headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        headers.get("x-real-ip") ??
        null;
      if (rawIp) ipHash = hashIp(rawIp);
      userAgent = headers.get("user-agent")?.slice(0, 500) ?? null;
    }

    const { error } = await admin.from("user_security_events").insert({
      user_id: input.userId,
      event_type: input.eventType,
      event_category: input.eventCategory,
      actor_user_id: input.actorUserId ?? input.userId,
      metadata: input.metadata ?? null,
      ip_address_hash: ipHash,
      user_agent: userAgent,
    });

    if (error) {
      log.error(
        { err: error, eventType: input.eventType },
        "[audit] failed to write event",
      );
    }
  } catch (e) {
    log.error({ err: e }, "[audit] unexpected error writing event");
  }
}
