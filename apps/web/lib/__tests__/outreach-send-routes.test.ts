/**
 * The send gates (CASL consent ledger, 00183):
 *
 *   - /api/outreach/send refuses every send. Agent Runway doesn't send
 *     email on the agent's behalf; it never reaches the email sender.
 *   - /api/mobile/outreach/send (the phone's queued email) checks consent on
 *     the draft's send day first: an unsubscribed, lapsed or archived client
 *     is refused with the reason, the draft is skipped, nothing is sent;
 *     consent that can't be read refuses too.
 *   - /api/mobile/outreach/text-check, asked before iOS Messages opens with
 *     a queued text, does the same on the text channel.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type Row } from "@/lib/ai/__tests__/helpers/fake-supabase";

const USER = "user-1";
const CLIENT = "client-1";

const { state, sendEmail } = vi.hoisted(() => ({
  state: { client: null as unknown, signedIn: true },
  sendEmail: vi.fn(async () => ({ ok: true, provider: "smtp" })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.signedIn ? { id: USER } : null } }) },
    from: () => { throw new Error("/api/outreach/send must not read the database"); },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => Object.assign(state.client as object, {
    auth: { getUser: async () => ({ data: { user: state.signedIn ? { id: USER } : null }, error: null }) },
  }),
}));
vi.mock("@/lib/supabase/request-user", () => ({
  getRequestUser: async () => (state.signedIn ? { user: { id: USER }, supabase: state.client } : null),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: true, remaining: 10, resetAt: 0, limit: 10 }),
  rateLimitHeaders: () => ({}),
}));
vi.mock("@/lib/email-sender", () => ({ sendEmail }));
vi.mock("@/lib/ai/client-memory-engine", () => ({ markMemoryStale: async () => {} }));

import { POST as outreachSend } from "@/app/api/outreach/send/route";
import { POST as mobileSend } from "@/app/api/mobile/outreach/send/route";
import { POST as textCheck } from "@/app/api/mobile/outreach/text-check/route";

function clientRow(over: Row = {}): Row {
  return {
    id: CLIENT, user_id: USER, name: "Sam Lee", email: "sam@example.com", archived_at: null,
    email_opt_out_at: null, sms_opt_out_at: null,
    email_opt_out_source: null, email_opt_out_method: null, sms_opt_out_source: null, sms_opt_out_method: null,
    ...over,
  };
}

function queueRow(channel: "email" | "sms", over: Row = {}): Row {
  return {
    id: "q-1", user_id: USER, client_id: CLIENT, channel, status: "ready", trigger_date: "2026-10-06",
    opportunity_type: channel === "sms" ? "text_message" : "past_client_check_in",
    ai_subject: "hi", ai_body: "Hi Sam", final_subject: null, final_body: null,
    clients: { name: "Sam Lee", email: "sam@example.com" },
    ...over,
  };
}

function setup(tables: Record<string, Row[]>, options?: Parameters<typeof fakeSupabase>[1]) {
  const { client, writes } = fakeSupabase({
    clients: [clientRow()],
    client_records: [{ id: "r1", user_id: USER, client_id: CLIENT, close_date: "2025-06-01", condition_status: "firmed" }],
    client_record_co_parties: [],
    client_email_consents: [],
    ...tables,
  }, options);
  state.client = client;
  return writes;
}

const post = (body: unknown) =>
  new Request("http://localhost/api", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-06T15:00:00Z"));
});
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  state.signedIn = true;
  sendEmail.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("/api/outreach/send", () => {
  it("refuses every send and never reaches the email sender", async () => {
    const res = await outreachSend();
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "SENDING_DISABLED" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("asks for sign-in first", async () => {
    state.signedIn = false;
    expect((await outreachSend()).status).toBe(401);
  });

  it("has no path to the email sender at all", () => {
    const src = readFileSync(path.resolve(__dirname, "../../app/api/outreach/send/route.ts"), "utf8");
    expect(src).not.toMatch(/email-sender|sendEmail/);
  });
});

describe("/api/mobile/outreach/send (the phone's queued email)", () => {
  it("refuses an unsubscribed client, skips the draft and sends nothing", async () => {
    const writes = setup({
      clients: [clientRow({ email_opt_out_at: "2026-10-01T12:00:00Z" })],
      outreach_queue: [queueRow("email")],
    });
    const res = await mobileSend(post({ outreach_id: "q-1" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("NO_CONSENT");
    expect(body.error).toMatch(/unsubscribed from your emails/);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(writes).toContainEqual(expect.objectContaining({ table: "outreach_queue", op: "update", payload: { status: "skipped" } }));
  });

  it("refuses a past client whose implied consent lapsed", async () => {
    setup({
      client_records: [{ id: "r1", user_id: USER, client_id: CLIENT, close_date: "2023-05-01", condition_status: "firmed" }],
      outreach_queue: [queueRow("email")],
    });
    const res = await mobileSend(post({ outreach_id: "q-1" }));
    expect(res.status).toBe(403);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("refuses an email whose send day falls after the lapse, though consent holds today", async () => {
    setup({
      client_records: [{ id: "r1", user_id: USER, client_id: CLIENT, close_date: "2024-10-20", condition_status: "firmed" }],
      outreach_queue: [queueRow("email", { trigger_date: "2026-10-25" })],
    });
    expect((await mobileSend(post({ outreach_id: "q-1" }))).status).toBe(403);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("refuses an archived client", async () => {
    setup({ clients: [clientRow({ archived_at: "2026-09-01T12:00:00Z" })], outreach_queue: [queueRow("email")] });
    const res = await mobileSend(post({ outreach_id: "q-1" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/archived/);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("refuses when consent can't be read, without skipping the draft", async () => {
    const writes = setup({ outreach_queue: [queueRow("email")] }, { unreachable: ["client_email_consents"] });
    const res = await mobileSend(post({ outreach_id: "q-1" }));
    expect(res.status).toBe(503);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("sends when consent covers it", async () => {
    setup({ outreach_queue: [queueRow("email")] });
    const res = await mobileSend(post({ outreach_id: "q-1" }));
    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});

describe("/api/mobile/outreach/text-check (before Messages opens)", () => {
  it("refuses a client who unsubscribed from texts and skips the queued text", async () => {
    const writes = setup({
      clients: [clientRow({ sms_opt_out_at: "2026-10-01T12:00:00Z" })],
      outreach_queue: [queueRow("sms")],
    });
    const res = await textCheck(post({ outreach_id: "q-1" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, code: "NO_CONSENT" });
    expect(body.error).toMatch(/unsubscribed from your texts/);
    expect(writes).toContainEqual(expect.objectContaining({ table: "outreach_queue", op: "update", payload: { status: "skipped" } }));
  });

  it("refuses a text whose implied consent lapsed after it was drafted", async () => {
    setup({
      client_records: [{ id: "r1", user_id: USER, client_id: CLIENT, close_date: "2024-10-01", condition_status: "firmed" }],
      outreach_queue: [queueRow("sms")],
    });
    expect((await textCheck(post({ outreach_id: "q-1" }))).status).toBe(403);
  });

  it("refuses a text whose send day falls after the lapse, though consent holds today", async () => {
    setup({
      client_records: [{ id: "r1", user_id: USER, client_id: CLIENT, close_date: "2024-10-20", condition_status: "firmed" }],
      outreach_queue: [queueRow("sms", { trigger_date: "2026-10-25" })],
    });
    const res = await textCheck(post({ outreach_id: "q-1" }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("NO_CONSENT");
  });

  it("an email-only unsubscribe doesn't stop the text", async () => {
    setup({ clients: [clientRow({ email_opt_out_at: "2026-10-01T12:00:00Z" })], outreach_queue: [queueRow("sms")] });
    const res = await textCheck(post({ outreach_id: "q-1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("fails closed when consent can't be read", async () => {
    setup({ outreach_queue: [queueRow("sms")] }, { unreachable: ["client_email_consents"] });
    const res = await textCheck(post({ outreach_id: "q-1" }));
    expect(res.status).toBe(503);
    expect((await res.json()).ok).toBe(false);
  });

  it("says when the text is no longer queued, and asks for sign-in", async () => {
    setup({ outreach_queue: [queueRow("sms", { status: "sent" })] });
    expect((await textCheck(post({ outreach_id: "q-1" }))).status).toBe(409);
    state.signedIn = false;
    expect((await textCheck(post({ outreach_id: "q-1" }))).status).toBe(401);
  });
});
