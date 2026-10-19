/**
 * The website hand-off's "unsubscribe from everything" (CASL consent
 * ledger, 00183): the client is opted out of email AND texts, every active
 * consent record is ended (withdrawn_method web_form, which agent records
 * require), and drafts waiting for them on either channel are skipped, the
 * same as a withdrawal the agent records.
 */
import { describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/lib/ai/__tests__/helpers/fake-supabase";
import { generateInboundKey } from "@/lib/inbound/keys";

const { state } = vi.hoisted(() => ({ state: { client: null as unknown } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => state.client }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: true, remaining: 10, resetAt: 0, limit: 10 }),
}));

import { POST } from "@/app/api/inbound/website/route";

const USER = "user-1";
const CLIENT = "client-1";

describe("POST /api/inbound/website: unsubscribe from all", () => {
  it("opts out of both channels, ends the consents and skips queued drafts", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { key, hash } = generateInboundKey();
    const { client, writes } = fakeSupabase({
      inbound_keys: [{ id: "k1", user_id: USER, key_hash: hash, revoked_at: null }],
      inbound_events: [],
      clients: [{
        id: CLIENT, user_id: USER, name: "Sam Porter", email: "sam.porter@example.com", secondary_email: null,
        phone: null, secondary_phone: null, tags: [], archived_at: null,
        email_opt_out_at: null, email_opt_out_source: null, sms_opt_out_at: null, updated_at: "2026-10-01T12:00:00Z",
      }],
      contact_tasks: [],
      contact_activities: [],
      client_email_consents: [],
      outreach_queue: [],
    });
    state.client = client;

    const res = await POST(new Request("http://localhost/api/inbound/website", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "unsubscribe", event_id: "evt-unsub-0001", occurred_at: "2026-10-09T14:30:00Z",
        scope: "all", contact: { email: "sam.porter@example.com" },
      }),
    }));
    expect(res.status).toBe(200);

    expect(writes).toContainEqual(expect.objectContaining({
      table: "clients", op: "update",
      payload: expect.objectContaining({ email_opt_out_at: "2026-10-09T14:30:00Z", sms_opt_out_at: "2026-10-09T14:30:00Z" }),
    }));
    expect(writes).toContainEqual(expect.objectContaining({
      table: "client_email_consents", op: "update",
      payload: { withdrawn_at: "2026-10-09T14:30:00Z", withdrawn_method: "web_form" },
    }));
    expect(writes).toContainEqual(expect.objectContaining({
      table: "outreach_queue", op: "update", payload: { status: "skipped" },
    }));
  });
});
