/**
 * Flight Control's consent_lapsing opportunity and the consent ledger in
 * both detector paths (CASL consent ledger, 00183):
 *
 *   - Scan (getTopOpportunities): from 60 days before a past client's
 *     implied consent from their purchase lapses, an email card asking to
 *     keep in touch; from the lapse day, for 30 days, a call card (a consent
 *     request is itself a commercial message, CASL s.1(3)). Not held back by
 *     the 14-day contact hold; gone once sent, dismissed, or once express
 *     consent is on record. Express consent reopens email cards for a lapsed
 *     past client; an unsubscribe makes every card a call.
 *   - Nightly drafter (detectAndDraftForUser): queues the ask (never the
 *     call card), queues email types for a lapsed past client with express
 *     consent, re-checks consent on rows queued earlier and skips refused
 *     ones, and drafts nothing when the ledger can't be read.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({
  models: { default: "test-default", fallback: "test-fallback" },
  heliconeHeaders: () => ({}),
}));

import { generateText } from "ai";
import { detectAndDraftForUser, getTopOpportunities } from "@/app/api/ai/detect-opportunities/route";
import { fakeSupabase, type Row } from "./helpers/fake-supabase";

const USER = "user-1";
const CLIENT = "client-1";

function deal(close_date: string, n = 1): Row {
  return {
    id: `rec-${n}`, user_id: USER, client_id: CLIENT,
    address: `${n} Elm St`, close_date, gci: 9000, side: "buyer",
    property_use: "primary_residence", condition_date: null, condition_status: "firmed",
  };
}

function clientRow(over: Row = {}): Row {
  return {
    id: CLIENT, user_id: USER, archived_at: null,
    name: "Sam Lee", first_name: "Sam", last_name: "Lee",
    city: "Saint John", province_region: "NB", birthdate: null,
    communication_tone: "friendly", first_contacted_at: null, last_contact_at: null,
    created_at: "2020-01-01T12:00:00Z",
    tags: [], notes: null, status: "cruising", timeframe: null,
    property_interest: null, property_interest_type: null,
    scheduled_for: null, scheduled_phrase: null,
    email_opt_out_at: null, sms_opt_out_at: null,
    ...over,
  };
}

function consentRow(over: Row = {}): Row {
  return {
    id: "consent-1", user_id: USER, client_id: CLIENT, kind: "other", source: "agent",
    channel: "email", basis: "express", method: "email_reply", consent_text: "Yes, keep in touch",
    evidence_note: null, consented_at: "2026-09-20T15:00:00+00:00", recorded_via: "web",
    withdrawn_at: null, withdrawn_method: null, withdrawn_note: null, created_at: "2026-09-20T15:00:00+00:00",
    ...over,
  };
}

function tables(records: Row[], extra: Record<string, Row[]> = {}): Record<string, Row[]> {
  return {
    clients: [clientRow()],
    user_settings: [{
      user_id: USER, display_name: "Andrew Shaw", email_signature: "", ai_voice_guide: null,
      brokerage_name: "REAL Broker", phone: "506-555-0100", mailing_address: "123 Main St, Saint John NB E2L 1A1",
    }],
    client_records: records,
    client_memory_profiles: [],
    outreach_queue: [],
    client_email_consents: [],
    ...extra,
  };
}

async function scan(t: Record<string, Row[]>) {
  const { client } = fakeSupabase(t);
  return getTopOpportunities(USER, client);
}

async function nightly(t: Record<string, Row[]>, options?: Parameters<typeof fakeSupabase>[1]) {
  const { client, writes } = fakeSupabase(t, options);
  const result = await detectAndDraftForUser(USER, client);
  const upsert = writes.find((w) => w.table === "outreach_queue" && w.op === "upsert");
  return { result, writes, queued: ((upsert?.payload as Row[] | undefined) ?? []) };
}

let savedKeys: Record<string, string | undefined>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-06T15:00:00Z")); // noon Atlantic, 2026-10-06
  savedKeys = { a: process.env.ANTHROPIC_API_KEY, g: process.env.GROQ_API_KEY };
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GROQ_API_KEY;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.mocked(generateText).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (savedKeys.a !== undefined) process.env.ANTHROPIC_API_KEY = savedKeys.a;
  if (savedKeys.g !== undefined) process.env.GROQ_API_KEY = savedKeys.g;
});

// 2024-11-01 closing → implied consent lapses 2026-11-01 (26 days away).
const LAPSING = "2024-11-01";
// 2024-09-26 closing → lapsed 2026-09-26 (10 days ago).
const JUST_LAPSED = "2024-09-26";

describe("Scan — consent_lapsing", () => {
  it("asks by email inside the 60-day window, keyed on the last implied day, ahead of the idle-client card", async () => {
    const cards = await scan(tables([deal(LAPSING)]));
    const card = cards.find((c) => c.client_id === CLIENT);
    expect(card?.opportunity_type).toBe("consent_lapsing");
    expect(card?.trigger_date).toBe("2026-10-31");
    expect(card?.contact_channel).toBe("email");
    expect(card?.label).toContain("November 1, 2026");
    expect(card?.why_now).toMatch(/CASL/);
    expect(card?.why_now).not.toMatch(/\b(should|must|recommend|need to)\b/i);
  });

  it("is a call card once implied consent has lapsed", async () => {
    const card = (await scan(tables([deal(JUST_LAPSED)]))).find((c) => c.opportunity_type === "consent_lapsing");
    expect(card?.contact_channel).toBe("call");
    expect(card?.call_reason).toBe("consent_lapsed");
    expect(card?.label).toContain("ended September 26, 2026");
  });

  it("isn't shown 61+ days before the lapse, or 30+ days after it", async () => {
    expect((await scan(tables([deal("2024-12-06")]))).some((c) => c.opportunity_type === "consent_lapsing")).toBe(false);
    expect((await scan(tables([deal("2024-09-06")]))).some((c) => c.opportunity_type === "consent_lapsing")).toBe(false);
  });

  it("isn't held back by a recent contact", async () => {
    const t = tables([deal(LAPSING)], { clients: [clientRow({ last_contact_at: "2026-10-04T15:00:00Z" })] });
    expect((await scan(t)).some((c) => c.opportunity_type === "consent_lapsing")).toBe(true);
  });

  it("is gone once the request was marked sent, or the card dismissed", async () => {
    const sent = tables([deal(LAPSING)], {
      outreach_queue: [{ id: "q-1", user_id: USER, client_id: CLIENT, opportunity_type: "consent_lapsing", trigger_date: "2026-10-31", status: "sent", sent_at: "2026-09-01T15:00:00Z" }],
    });
    expect((await scan(sent)).some((c) => c.opportunity_type === "consent_lapsing")).toBe(false);
    const dismissed = tables([deal(LAPSING)], {
      flight_control_dismissals: [{ id: "d-1", user_id: USER, client_id: CLIENT, opportunity_type: "consent_lapsing", trigger_date: "2026-10-31" }],
    });
    expect((await scan(dismissed)).some((c) => c.opportunity_type === "consent_lapsing")).toBe(false);
  });

  it("isn't shown once express consent is on record; the past client's cards are email again", async () => {
    const cards = await scan(tables([deal("2023-05-01")], { client_email_consents: [consentRow()] }));
    expect(cards.some((c) => c.opportunity_type === "consent_lapsing")).toBe(false);
    const card = cards.find((c) => c.client_id === CLIENT);
    expect(card).toBeDefined();
    expect(card?.contact_channel).toBe("email");
  });

  it("a lapsed past client with no express consent stays a call card", async () => {
    const card = (await scan(tables([deal("2023-05-01")]))).find((c) => c.client_id === CLIENT);
    expect(card?.contact_channel).toBe("call");
    expect(card?.call_reason).toBe("casl_lapsed");
  });

  it("an unsubscribed client gets no consent card, and every card is a call", async () => {
    const cards = await scan(tables([deal(LAPSING)], { clients: [clientRow({ email_opt_out_at: "2026-09-01T12:00:00Z" })] }));
    expect(cards.some((c) => c.opportunity_type === "consent_lapsing")).toBe(false);
    for (const c of cards.filter((x) => x.client_id === CLIENT)) {
      expect(c.contact_channel).toBe("call");
      expect(c.call_reason).toBe("opted_out");
    }
  });

  it("errors rather than show email cards when the ledger can't be read", async () => {
    const { client } = fakeSupabase(tables([deal(LAPSING)]), { unreachable: ["client_email_consents"] });
    await expect(getTopOpportunities(USER, client)).rejects.toThrow();
  });
});

describe("nightly drafter — consent ledger", () => {
  it("queues the consent request before the lapse, keyed on the last implied day", async () => {
    const { queued } = await nightly(tables([deal(LAPSING)]));
    const ask = queued.find((r) => r.opportunity_type === "consent_lapsing");
    expect(ask).toMatchObject({ client_id: CLIENT, trigger_date: "2026-10-31", status: "draft" });
  });

  it("doesn't queue the ask without the agent's mailing address; Scan says what to add", async () => {
    const t = tables([deal(LAPSING)], {
      user_settings: [{ user_id: USER, display_name: "Andrew Shaw", email_signature: "", ai_voice_guide: null, brokerage_name: "REAL Broker", phone: "506-555-0100" }],
    });
    const { queued } = await nightly(t);
    expect(queued.some((r) => r.opportunity_type === "consent_lapsing")).toBe(false);
    const card = (await scan(t)).find((c) => c.opportunity_type === "consent_lapsing");
    expect(card?.context.identity_missing).toMatch(/mailing address/);
    expect(card?.context.identity_missing_label).toBe("Needs your mailing address");
  });

  it("labels the card by what is actually missing", async () => {
    const noContact = tables([deal(LAPSING)], {
      user_settings: [{ user_id: USER, display_name: "Andrew Shaw", email_signature: "", brokerage_name: "REAL Broker", phone: null, mailing_address: "123 Main St, Saint John NB E2L 1A1" }],
    });
    const card = (await scan(noContact)).find((c) => c.opportunity_type === "consent_lapsing");
    expect(card?.context.identity_missing_label).toBe("Needs your phone, email or website");
    expect(card?.context.identity_missing).toMatch(/phone number, email or website/);
  });

  it("never queues the call card after the lapse", async () => {
    const { queued } = await nightly(tables([deal(JUST_LAPSED)]));
    expect(queued.some((r) => r.opportunity_type === "consent_lapsing")).toBe(false);
  });

  it("queues email for a lapsed past client with express consent, and not without it", async () => {
    // 3-year closing anniversary on 2026-10-10, inside the 14-day window.
    const withConsent = await nightly(tables([deal("2023-10-10")], { client_email_consents: [consentRow()] }));
    expect(withConsent.queued.map((r) => r.opportunity_type)).toContain("closing_anniversary");
    const without = await nightly(tables([deal("2023-10-10")]));
    expect(without.queued.map((r) => r.opportunity_type)).not.toContain("closing_anniversary");
  });

  it("queues nothing for an unsubscribed client, express consent before it or not", async () => {
    const { queued } = await nightly(tables([deal("2023-10-10")], {
      clients: [clientRow({ email_opt_out_at: "2026-10-01T12:00:00Z" })],
      client_email_consents: [consentRow()],
    }));
    expect(queued.filter((r) => r.client_id === CLIENT)).toEqual([]);
  });

  it("drafts nothing when the consent ledger can't be read", async () => {
    const { result, writes } = await nightly(tables([deal(LAPSING)]), { unreachable: ["client_email_consents"] });
    expect(result).toEqual({ detected: 0, drafted: 0, pinned: false });
    expect(writes.filter((w) => w.table === "outreach_queue")).toEqual([]);
  });

  it("skips a row queued earlier once the client has unsubscribed, without drafting it", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const old = {
      id: "q-old", user_id: USER, client_id: CLIENT, opportunity_type: "past_client_check_in",
      trigger_date: "2026-10-01", status: "draft", ai_subject: null, channel: "email",
      created_at: "2026-10-01T12:00:00Z", context: {}, clients: { name: "Sam Lee" },
    };
    const { writes } = await nightly(tables([deal("2025-06-01")], {
      clients: [clientRow({ email_opt_out_at: "2026-10-05T12:00:00Z" })],
      outreach_queue: [old],
    }));
    const skip = writes.find((w) => w.table === "outreach_queue" && w.op === "update" && (w.payload as Row).status === "skipped");
    expect(skip).toBeDefined();
    expect(vi.mocked(generateText)).not.toHaveBeenCalled();
  });
});
