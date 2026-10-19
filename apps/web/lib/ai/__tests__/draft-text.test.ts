/**
 * Text queue drafter (00179): one short text per client, queued for the
 * agent to send from the iPhone app.
 *
 * Pins the rules that matter before any text reaches a client:
 *   - CASL applies to texts as to email (core consentStatus, text channel):
 *     a client who unsubscribed from texts, or a past client whose last
 *     non-collapsed deal closed 2+ years ago with no express text consent on
 *     record, gets "call instead", with nothing written and no AI call.
 *   - A consent request ("consent_request") goes out only while implied
 *     consent still holds (CASL s.1(3)), and always says they can say no or
 *     change their mind (Regs s.4(e)), footer on or off.
 *   - No usable phone number → skipped, no AI call.
 *   - The queued row is channel "sms", opportunity_type "text_message", status
 *     "ready", today's Atlantic date, and the body ends with the agent's name
 *     plus brokerage and the opt-out line.
 *   - A text already waiting (or sent) today is returned, not redrafted.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({
  models: { default: "test-default", fallback: "test-fallback" },
  aiCallHeaders: () => ({}),
}));

import { generateText } from "ai";
import {
  TEXT_BODY_MAX_CHARS,
  TEXT_OPT_OUT_LINE,
  draftTextForClient,
  finalizeTextBody,
  pickTextPhone,
  withConsentLine,
} from "../draft-text";
import { CONSENT_REQUEST_TEXT_LINE } from "@/lib/crm/consent-gate";
import { fakeSupabase, type Row } from "./helpers/fake-supabase";

const USER = "user-1";
const CLIENT = "client-1";

function clientRow(overrides: Row = {}): Row {
  return {
    id: CLIENT, user_id: USER, archived_at: null,
    name: "Sam Lee", first_name: "Sam", last_name: "Lee", city: "Saint John",
    communication_tone: "friendly", notes: null, tags: [], last_contact_at: "2026-04-01T15:00:00Z",
    email_opt_out_at: null,
    phone: "(506) 555-0101", phone_type: "mobile", secondary_phone: null, secondary_phone_type: null,
    ...overrides,
  };
}

function consentRow(overrides: Row = {}): Row {
  return {
    id: "consent-1", user_id: USER, client_id: CLIENT, kind: "other", source: "agent",
    channel: "sms", basis: "express", method: "text_reply", consent_text: "Yes please",
    evidence_note: null, consented_at: "2026-10-01T15:00:00Z", recorded_via: "mobile",
    withdrawn_at: null, withdrawn_method: null, withdrawn_note: null, created_at: "2026-10-01T15:00:00Z",
    ...overrides,
  };
}

function deal(close_date: string, condition_status: string | null = "firmed"): Row {
  return { id: `rec-${close_date}`, user_id: USER, client_id: CLIENT, address: "12 Elm St", close_date, side: "buyer", condition_status };
}

function tables(extra: Record<string, Row[]> = {}): Record<string, Row[]> {
  return {
    clients: [clientRow()],
    user_settings: [{ user_id: USER, display_name: "Andrew Shaw", brokerage_name: "REAL Broker", ai_voice_guide: null }],
    client_records: [],
    outreach_queue: [],
    ...extra,
  };
}

const mockGenerate = vi.mocked(generateText);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T16:00:00Z")); // 1 pm Atlantic
  process.env.ANTHROPIC_API_KEY = "test-key";
  mockGenerate.mockReset();
  mockGenerate.mockResolvedValue({
    text: "Hi Sam, how's everything going at the new place? Would love to hear how you're settling in.",
  } as Awaited<ReturnType<typeof generateText>>);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("draftTextForClient — consent and phone gates", () => {
  it("refuses a client who unsubscribed from texts, without an AI call or a write", async () => {
    const { client, writes } = fakeSupabase(tables({ clients: [clientRow({ sms_opt_out_at: "2026-09-01T12:00:00Z" })] }));
    const r = await draftTextForClient({ supabase: client, userId: USER, clientId: CLIENT, purpose: "check_in" });
    expect(r.status).toBe("call_only");
    expect(r.reason).toMatch(/unsubscribed from your texts/);
    expect(r.reason).toMatch(/phone call/);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("an unsubscribe from texts holds even with express text consent given before it", async () => {
    const { client } = fakeSupabase(tables({
      clients: [clientRow({ sms_opt_out_at: "2026-09-01T12:00:00Z" })],
      client_email_consents: [consentRow({ consented_at: "2026-08-01T12:00:00Z" })],
    }));
    const r = await draftTextForClient({ supabase: client, userId: USER, clientId: CLIENT, purpose: "check_in" });
    expect(r.status).toBe("call_only");
  });

  it("an email-only unsubscribe doesn't stop texts (00183: one opt-out per channel)", async () => {
    const { client } = fakeSupabase(tables({ clients: [clientRow({ email_opt_out_at: "2026-09-01T12:00:00Z" })] }));
    const r = await draftTextForClient({ supabase: client, userId: USER, clientId: CLIENT, purpose: "check_in" });
    expect(r.status).toBe("created");
  });

  it("express text consent the agent recorded reopens texts for a lapsed past client", async () => {
    const { client } = fakeSupabase(tables({
      client_records: [deal("2023-05-01")],
      client_email_consents: [consentRow()],
    }));
    const r = await draftTextForClient({ supabase: client, userId: USER, clientId: CLIENT, purpose: "check_in" });
    expect(r.status).toBe("created");
  });

  it("express EMAIL consent does not open texts", async () => {
    const { client } = fakeSupabase(tables({
      client_records: [deal("2023-05-01")],
      client_email_consents: [consentRow({ channel: "email" })],
    }));
    const r = await draftTextForClient({ supabase: client, userId: USER, clientId: CLIENT, purpose: "check_in" });
    expect(r.status).toBe("call_only");
  });

  it("drafts nothing when the consent record can't be read", async () => {
    const { client, writes } = fakeSupabase(tables(), { unreachable: ["client_email_consents"] });
    const r = await draftTextForClient({ supabase: client, userId: USER, clientId: CLIENT, purpose: "check_in" });
    expect(r.status).toBe("skipped");
    expect(r.reason).toMatch(/couldn't read their consent/);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("refuses a past client whose last deal closed more than two years ago", async () => {
    const { client, writes } = fakeSupabase(tables({ client_records: [deal("2023-05-01")] }));
    const r = await draftTextForClient({ supabase: client, userId: USER, clientId: CLIENT, purpose: "check_in" });
    expect(r.status).toBe("call_only");
    expect(r.reason).toMatch(/CASL/);
    expect(r.reason).toContain("May 2023");
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("ignores a newer collapsed deal when checking consent", async () => {
    const { client } = fakeSupabase(tables({ client_records: [deal("2022-01-10"), deal("2026-03-01", "collapsed")] }));
    const r = await draftTextForClient({ supabase: client, userId: USER, clientId: CLIENT, purpose: "check_in" });
    expect(r.status).toBe("call_only");
  });

  it("drafts for a past client inside the two-year window", async () => {
    const { client } = fakeSupabase(tables({ client_records: [deal("2025-06-20")] }));
    const r = await draftTextForClient({ supabase: client, userId: USER, clientId: CLIENT, purpose: "check_in" });
    expect(r.status).toBe("created");
  });

  it("skips a client with no usable phone number", async () => {
    const { client, writes } = fakeSupabase(tables({ clients: [clientRow({ phone: null, secondary_phone: "555" })] }));
    const r = await draftTextForClient({ supabase: client, userId: USER, clientId: CLIENT, purpose: "check_in" });
    expect(r.status).toBe("skipped");
    expect(r.reason).toMatch(/No phone number/);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("needs the agent's note for a custom text", async () => {
    const { client } = fakeSupabase(tables());
    const r = await draftTextForClient({ supabase: client, userId: USER, clientId: CLIENT, purpose: "custom", note: "  " });
    expect(r.status).toBe("skipped");
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("finds nothing for another account's client", async () => {
    const { client } = fakeSupabase(tables({ clients: [clientRow({ user_id: "someone-else" })] }));
    const r = await draftTextForClient({ supabase: client, userId: USER, clientId: CLIENT, purpose: "check_in" });
    expect(r.status).toBe("skipped");
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});

describe("draftTextForClient — the queued text", () => {
  it("queues a ready sms row for today with the sign-off and opt-out line", async () => {
    const { client, writes } = fakeSupabase(tables());
    const r = await draftTextForClient({ supabase: client, userId: USER, clientId: CLIENT, purpose: "check_in" });

    expect(r.status).toBe("created");
    expect(r.phone).toBe("(506) 555-0101");
    const upsert = writes.find((w) => w.table === "outreach_queue" && w.op === "upsert");
    const row = upsert?.payload as Row;
    expect(row).toMatchObject({
      user_id: USER, client_id: CLIENT, channel: "sms", opportunity_type: "text_message",
      status: "ready", trigger_date: "2026-10-14", ai_subject: null,
    });
    expect(String(row.ai_body)).toMatch(/\nAndrew Shaw, REAL Broker\nReply STOP to opt out\.$/);
  });

  it("leaves off the name, brokerage and opt-out line when the agent turned the footer off", async () => {
    const { client, writes } = fakeSupabase(tables({
      user_settings: [{ user_id: USER, display_name: "Andrew Shaw", brokerage_name: "REAL Broker", ai_voice_guide: null, text_footer: false }],
    }));
    const r = await draftTextForClient({ supabase: client, userId: USER, clientId: CLIENT, purpose: "check_in" });
    expect(r.status).toBe("created");
    const row = writes.find((w) => w.table === "outreach_queue" && w.op === "upsert")?.payload as Row;
    expect(String(row.ai_body)).toBe("Hi Sam, how's everything going at the new place? Would love to hear how you're settling in.");
    expect(String(row.ai_body)).not.toMatch(/REAL Broker|Reply STOP/);
  });

  it("returns the text already waiting today instead of drafting another", async () => {
    const waiting = {
      id: "q-9", user_id: USER, client_id: CLIENT, opportunity_type: "text_message", trigger_date: "2026-10-14",
      status: "ready", ai_body: "Hi Sam, quick hello.\nAndrew Shaw, REAL Broker\nReply STOP to opt out.", final_body: null,
    };
    const { client, writes } = fakeSupabase(tables({ outreach_queue: [waiting] }));
    const r = await draftTextForClient({ supabase: client, userId: USER, clientId: CLIENT, purpose: "check_in" });
    expect(r.status).toBe("existing");
    expect(r.queueItemId).toBe("q-9");
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("says so when the client was already texted today", async () => {
    const sent = { id: "q-8", user_id: USER, client_id: CLIENT, opportunity_type: "text_message", trigger_date: "2026-10-14", status: "sent", ai_body: "x", final_body: "x" };
    const { client } = fakeSupabase(tables({ outreach_queue: [sent] }));
    const r = await draftTextForClient({ supabase: client, userId: USER, clientId: CLIENT, purpose: "check_in" });
    expect(r.status).toBe("existing");
    expect(r.reason).toMatch(/already texted/);
  });
});

describe("draftTextForClient — consent request", () => {
  beforeEach(() => {
    mockGenerate.mockResolvedValue({
      text: "Hi Sam, would you like the odd text from me now and then about your area? Just reply YES.",
    } as Awaited<ReturnType<typeof generateText>>);
  });

  const withAddress = [{
    user_id: USER, display_name: "Andrew Shaw", brokerage_name: "REAL Broker", ai_voice_guide: null,
    mailing_address: "123 Main St, Saint John NB E2L 1A1", phone: "506-555-0100",
  }];

  it("drafts while implied consent holds: the withdrawal line, then name, mailing address, phone and opt-out", async () => {
    const { client, writes } = fakeSupabase(tables({ client_records: [deal("2024-11-20")], user_settings: withAddress }));
    const r = await draftTextForClient({ supabase: client, userId: USER, clientId: CLIENT, purpose: "consent_request" });
    expect(r.status).toBe("created");
    const row = writes.find((w) => w.table === "outreach_queue" && w.op === "upsert")?.payload as Row;
    expect(String(row.ai_body)).toMatch(/Just reply YES\. You can say no, or change your mind any time\.\nAndrew Shaw, REAL Broker\n123 Main St, Saint John NB E2L 1A1\n506-555-0100\nReply STOP to opt out\.$/);
  });

  it("appends its own withdrawal line even when the model wrote 'change your mind' in another sense", async () => {
    mockGenerate.mockResolvedValue({
      text: "Hi Sam, if you ever change your mind about the deck, I know a builder. Want the odd text from me? Just reply YES.",
    } as Awaited<ReturnType<typeof generateText>>);
    const { client, writes } = fakeSupabase(tables({ client_records: [deal("2024-11-20")], user_settings: withAddress }));
    await draftTextForClient({ supabase: client, userId: USER, clientId: CLIENT, purpose: "consent_request" });
    const row = writes.find((w) => w.table === "outreach_queue" && w.op === "upsert")?.payload as Row;
    expect(String(row.ai_body)).toContain("Just reply YES. You can say no, or change your mind any time.");
  });

  it("isn't drafted as a text when the agent turned the footer off: the ask would carry no sender identification", async () => {
    const { client, writes } = fakeSupabase(tables({
      client_records: [deal("2024-11-20")],
      user_settings: [{ ...withAddress[0], text_footer: false }],
    }));
    const r = await draftTextForClient({ supabase: client, userId: USER, clientId: CLIENT, purpose: "consent_request" });
    expect(r.status).toBe("call_only");
    expect(r.reason).toMatch(/won't draft this ask as a text/);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("isn't drafted as a text without a mailing address", async () => {
    const { client } = fakeSupabase(tables({ client_records: [deal("2024-11-20")] }));
    const r = await draftTextForClient({ supabase: client, userId: USER, clientId: CLIENT, purpose: "consent_request" });
    expect(r.status).toBe("call_only");
    expect(r.reason).toMatch(/mailing address/);
  });

  it("is a call once implied consent has lapsed (a request is itself a commercial message)", async () => {
    const { client, writes } = fakeSupabase(tables({ client_records: [deal("2024-10-14")] }));
    const r = await draftTextForClient({ supabase: client, userId: USER, clientId: CLIENT, purpose: "consent_request" });
    expect(r.status).toBe("call_only");
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("isn't drafted for a client with no deal (their basis is unknown) or one who already said yes", async () => {
    const none = fakeSupabase(tables());
    expect((await draftTextForClient({ supabase: none.client, userId: USER, clientId: CLIENT, purpose: "consent_request" })).status).toBe("call_only");
    const already = fakeSupabase(tables({ client_records: [deal("2024-11-20")], client_email_consents: [consentRow()] }));
    const r = await draftTextForClient({ supabase: already.client, userId: USER, clientId: CLIENT, purpose: "consent_request" });
    expect(r.status).toBe("call_only");
    expect(r.reason).toMatch(/already gave you express consent/);
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});

describe("withConsentLine", () => {
  it("always ends with the code's own line, once", () => {
    expect(withConsentLine("Want the odd text? Reply YES.")).toBe(`Want the odd text? Reply YES. ${CONSENT_REQUEST_TEXT_LINE}`);
    expect(withConsentLine(`Reply YES. ${CONSENT_REQUEST_TEXT_LINE}`)).toBe(`Reply YES. ${CONSENT_REQUEST_TEXT_LINE}`);
    expect(withConsentLine("You can change your mind later. Reply YES.")).toMatch(new RegExp(`${CONSENT_REQUEST_TEXT_LINE.replace(/[.]/g, "\\.")}$`));
  });
});

describe("pickTextPhone", () => {
  it("prefers a mobile number, treating an untyped number as mobile", () => {
    expect(pickTextPhone({ phone: "506-555-0101", phone_type: "home", secondary_phone: "506-555-0199", secondary_phone_type: "mobile" })).toBe("506-555-0199");
    expect(pickTextPhone({ phone: "506-555-0101", phone_type: null })).toBe("506-555-0101");
  });
  it("falls back to any 10-digit number, else null", () => {
    expect(pickTextPhone({ phone: "506-555-0101", phone_type: "work" })).toBe("506-555-0101");
    expect(pickTextPhone({ phone: "555-0101", secondary_phone: "" })).toBeNull();
  });
});

describe("finalizeTextBody", () => {
  const signOff = "Andrew Shaw, REAL Broker";

  it("swaps em and en dashes for commas and strips quotes", () => {
    const out = finalizeTextBody("\"Hi Sam — hope the move went well – any questions?\"", signOff, "Andrew");
    expect(out.split("\n")[0]).toBe("Hi Sam, hope the move went well, any questions?");
    expect(out).not.toMatch(/[—–]/);
  });

  it("drops a sign-off the model added and appends the real one", () => {
    expect(finalizeTextBody("Hi Sam, how are you? Talk soon, Andrew", signOff, "Andrew").split("\n")[0]).toBe("Hi Sam, how are you?");
    expect(finalizeTextBody("Hi Sam, how are you? - Andrew", signOff, "Andrew").split("\n")[0]).toBe("Hi Sam, how are you?");
  });

  it("keeps a message that merely ends in a capitalized word", () => {
    expect(finalizeTextBody("Hi Sam, are you around Saturday", signOff, "Andrew").split("\n")[0]).toBe("Hi Sam, are you around Saturday");
  });

  it("returns the message alone with no sign-off", () => {
    expect(finalizeTextBody("Hi Sam, how are you? - Andrew", null, "Andrew")).toBe("Hi Sam, how are you?");
  });

  it("caps a long message on a sentence boundary and always ends with the opt-out line", () => {
    const long = `Hi Sam, ${"this is a sentence that keeps going. ".repeat(20)}`;
    const out = finalizeTextBody(long, signOff, "Andrew");
    const [body, name, optOut] = out.split("\n");
    expect(body.length).toBeLessThanOrEqual(TEXT_BODY_MAX_CHARS);
    expect(body.endsWith(".")).toBe(true);
    expect(name).toBe(signOff);
    expect(optOut).toBe(TEXT_OPT_OUT_LINE);
  });
});
