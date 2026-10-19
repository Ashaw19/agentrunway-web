/**
 * The phone dashboard's "Next up" payload, served by GET /api/next-up
 * (apps/web/lib/crm/next-up-payload.ts) and cached on the phone. Flight Crew
 * and the MCP server read the same payload.
 *
 * Relative imports only: the MCP build copies packages/core into Deno.
 */

/**
 * Whether a handful card can offer Text, checked under CASL (core
 * consentStatus, text channel) when the payload is built:
 *   ready      today's text is drafted and waiting in outreach_queue (sms)
 *   draftable  a text is allowed and there's a number to text; not drafted yet
 *   call_only  no text: consent refuses it, the consent request can't go as
 *              a text, consent couldn't be read, or they were texted today
 *   no_phone   no number with at least 10 digits on file
 */
export type HandfulTextStatus =
  | { status: "ready"; queue_id: string; body: string }
  | { status: "draftable" }
  | { status: "call_only"; reason: string }
  | { status: "no_phone" };

/** One of today's handful: Flight Control's pick and why. */
export interface HandfulItem {
  client_id:        string;
  client_name:      string;
  opportunity_type: string;
  /** YYYY-MM-DD: with opportunity_type, the occurrence a Skip covers. */
  trigger_date:     string;
  label:            string;
  why_now:          string;
  contact_channel:  "email" | "call";
  /** The number to call: the texting number first, else any number on file. */
  phone:            string | null;
  text:             HandfulTextStatus;
}

export interface NextUpPayload {
  /** The Atlantic day the handful is for (YYYY-MM-DD). */
  day:          string;
  /** HANDFUL_TARGET. */
  target:       number;
  /** Handful clients handled today (contacted, skipped, stopped, Hangar). */
  done_today:   number;
  /** When the server built this payload (ISO instant). */
  generated_at: string;
  /** Flight Control order, at most `target`. */
  handful:      HandfulItem[];
  /** Handful clients on Later: hidden until `until` (ISO instant), holding their slot. */
  snoozed:      { client_id: string; client_name: string; until: string; phone: string | null }[];
  /** The always-on-top counts, by the rules in ./rules. */
  urgent:       { new_leads: number; overdue_tasks: number; deal_deadlines: number };
}
