/**
 * GET /api/next-up: the phone dashboard's day (and Flight Crew's and MCP's),
 * built by lib/crm/next-up-payload.ts from the handful (next_up_handful,
 * Flight Control's picks) with each card's text status checked under CASL.
 *
 *   ready      today's text is drafted and waiting (outreach_queue, sms)
 *   draftable  consent allows a text and there's a number to text
 *   call_only  core consentStatus refuses a text (lapsed past client, an SMS
 *              opt-out), the consent request can't go as a text, or consent
 *              couldn't be read (fails closed)
 *   no_phone   no number with at least 10 digits on file
 *
 * Only draftable cards are drafted, after the response, one at a time, with
 * source "next_up" and the card's label as the drafter's note. Nothing is
 * ever sent. Synthetic rows only.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TopOpportunity } from "@agent-runway/core/types/database";

const { state, pending, checkRateLimit, draftTextForClient, getTopOpportunities } = vi.hoisted(() => ({
  state: {
    user: true,
    client: null as unknown,
    admin: null as unknown,
  },
  pending: [] as Promise<unknown>[],
  checkRateLimit: vi.fn(),
  draftTextForClient: vi.fn(),
  getTopOpportunities: vi.fn(),
}));

// after(cb) runs cb at once; the test can wait for what it started.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (task: (() => unknown) | Promise<unknown>) => {
      pending.push(Promise.resolve(typeof task === "function" ? task() : task));
    },
  };
});
vi.mock("@/lib/supabase/request-user", () => ({
  getRequestUser: async () => (state.user ? { user: { id: "user-1" }, supabase: state.client } : null),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => state.admin }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit, rateLimitHeaders: () => ({}) }));
vi.mock("@/app/api/ai/detect-opportunities/route", () => ({ getTopOpportunities }));
vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({ models: { default: "m", fallback: "f" }, aiCallHeaders: () => ({}) }));
vi.mock("@/lib/ai/draft-text", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/draft-text")>()),
  draftTextForClient,
}));

import { GET } from "@/app/api/next-up/route";
import { buildNextUpPayload } from "@/lib/crm/next-up-payload";
import { CONSENT_READ_FAILED } from "@/lib/crm/consent-gate";
import {
  activePipelineDeals,
} from "@agent-runway/core/types/database";
import {
  conditionDeadlineDays,
  dealDeadlineDays,
  isNewLead,
  isOverdueTask,
} from "@agent-runway/core/lib/next-up/rules";
import type { HandfulItem, NextUpPayload } from "@agent-runway/core/lib/next-up/types";
import { fakeSupabase, type Row } from "../ai/__tests__/helpers/fake-supabase";

const USER = "user-1";
const NOW = new Date("2026-10-19T18:00:00Z"); // Mon Oct 19 2026, 15:00 ADT
const TODAY = "2026-10-19";
const TONIGHT = "2026-10-19T22:00:00Z";       // 19:00 ADT

function opp(client_id: string, client_name: string, over: Partial<TopOpportunity> = {}): TopOpportunity {
  return {
    client_id, client_name, client_city: null,
    opportunity_type: "idle_client", trigger_date: "2026-10-01", score: 60,
    label: `${client_name.split(" ")[0]} · no contact in 14 months`,
    why_this_matters: "Past client.", why_now: "It's been over a year.", suggested_angle: "Check in.",
    context_level: "sparse", contact_channel: "email", call_reason: null, client_record_id: null,
    context: {}, financial_impact: "", is_primary: false, primary_reason: null, risk_if_ignored: null,
    ...over,
  } as TopOpportunity;
}

function client(id: string, name: string, over: Row = {}): Row {
  return {
    id, user_id: USER, name, status: "cruising", archived_at: null,
    created_at: "2024-01-01T12:00:00Z", last_contact_at: "2025-06-01T12:00:00Z",
    email_opt_out_at: null, sms_opt_out_at: null,
    phone: "(506) 555-0101", phone_type: "mobile", secondary_phone: null, secondary_phone_type: null,
    ...over,
  };
}

/** A closed deal for the consent read (client_records, own deal). */
function deal(client_id: string, close_date: string): Row {
  return { id: `rec-${client_id}`, user_id: USER, client_id, close_date, condition_status: "firmed", condition_date: null };
}

function smsRow(client_id: string, over: Row = {}): Row {
  return {
    id: `q-${client_id}`, user_id: USER, client_id, channel: "sms", opportunity_type: "text_message",
    trigger_date: TODAY, status: "ready", ai_body: "Hi there", final_body: null, sent_at: null, context: {},
    ...over,
  };
}

const SETTINGS: Row = {
  user_id: USER, display_name: "Andrew Shaw", brokerage_name: "REAL Broker", text_footer: true,
  mailing_address: "1 King St, Saint John NB E2L 1A1", email_signature: null, phone: "506-555-0199",
  subscription_tier: "professional", subscription_status: "active",
};

/** Five handful clients, one of each text status. */
function fiveTables(extra: Record<string, Row[]> = {}): Record<string, Row[]> {
  return {
    clients: [
      client("c-ready", "Riley Ready"),
      client("c-draft", "Dana Draft"),
      client("c-lapsed", "Lee Lapsed"),
      client("c-optout", "Olive Optout", { sms_opt_out_at: "2026-09-01T12:00:00Z" }),
      client("c-nophone", "Nora Nophone", { phone: null, phone_type: null }),
    ],
    client_records: [deal("c-lapsed", "2024-01-15")],
    client_record_co_parties: [],
    client_email_consents: [],
    outreach_queue: [smsRow("c-ready", { final_body: "Hi Riley, edited" })],
    next_up_handful: [],
    flight_control_dismissals: [],
    contact_tasks: [],
    pipeline_deals: [],
    user_settings: [SETTINGS],
    ...extra,
  };
}

const FIVE = [
  opp("c-ready", "Riley Ready"),
  opp("c-draft", "Dana Draft", { opportunity_type: "birthday", trigger_date: "2026-10-25", label: "Dana · birthday Oct 25" }),
  opp("c-lapsed", "Lee Lapsed", { contact_channel: "call", call_reason: "casl_lapsed" }),
  opp("c-optout", "Olive Optout"),
  opp("c-nophone", "Nora Nophone"),
];

function setup(tables: Record<string, Row[]>, opts: { pro?: boolean } = {}) {
  const user = fakeSupabase(tables);
  const admin = fakeSupabase({
    user_settings: [{ ...SETTINGS, subscription_tier: opts.pro === false ? "starter" : "professional" }],
    organization_members: [],
  });
  state.client = user.client;
  state.admin = admin.client;
  return user;
}

const get = (query = "") =>
  GET(new Request(`http://localhost/api/next-up${query}`, { headers: { authorization: "Bearer test-token" } }));

async function payloadOf(query = ""): Promise<NextUpPayload> {
  const res = await get(query);
  expect(res.status).toBe(200);
  return (await res.json()) as NextUpPayload;
}

const item = (p: NextUpPayload, id: string): HandfulItem => {
  const found = p.handful.find((h) => h.client_id === id);
  if (!found) throw new Error(`${id} not in the handful`);
  return found;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  state.user = true;
  pending.length = 0;
  checkRateLimit.mockReset();
  checkRateLimit.mockResolvedValue({ allowed: true, remaining: 59, resetAt: new Date(0) });
  draftTextForClient.mockReset();
  draftTextForClient.mockImplementation(async (input: { clientId: string }) => ({ status: "created", clientId: input.clientId, clientName: "x" }));
  getTopOpportunities.mockReset();
  getTopOpportunities.mockResolvedValue(FIVE);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  await Promise.allSettled(pending);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GET /api/next-up: the gate", () => {
  it("401 with no user", async () => {
    setup(fiveTables());
    state.user = false;
    const res = await get();
    expect(res.status).toBe(401);
    expect(getTopOpportunities).not.toHaveBeenCalled();
  });

  it("403 when not Pro", async () => {
    setup(fiveTables(), { pro: false });
    const res = await get();
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "SUBSCRIPTION_REQUIRED" });
    expect(getTopOpportunities).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("429 past 60 requests an hour", async () => {
    setup(fiveTables());
    checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date(0) });
    const res = await get();
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith(USER, "next_up", 60, 60);
    expect(getTopOpportunities).not.toHaveBeenCalled();
  });

  it("500 when the handful can't be built", async () => {
    setup(fiveTables());
    getTopOpportunities.mockRejectedValue(new Error("clients fetch failed"));
    expect((await get()).status).toBe(500);
  });
});

describe("GET /api/next-up: the payload", () => {
  it("serves the day, the target and the handful in Flight Control's order", async () => {
    setup(fiveTables());
    const p = await payloadOf("?draft=0");
    expect(p.day).toBe(TODAY);
    expect(p.target).toBe(5);
    expect(p.done_today).toBe(0);
    expect(p.generated_at).toBe(NOW.toISOString());
    expect(p.handful.map((h) => h.client_id)).toEqual(["c-ready", "c-draft", "c-lapsed", "c-optout", "c-nophone"]);
    expect(item(p, "c-draft")).toEqual({
      client_id: "c-draft", client_name: "Dana Draft", opportunity_type: "birthday", trigger_date: "2026-10-25",
      label: "Dana · birthday Oct 25", why_now: "It's been over a year.", contact_channel: "email",
      phone: "(506) 555-0101", text: { status: "draftable" },
    });
    expect(p.snoozed).toEqual([]);
    // The handful's own reads: no other user's id reaches a query.
    const [userId, , opts] = getTopOpportunities.mock.calls[0];
    expect(userId).toBe(USER);
    expect(opts.now).toEqual(NOW);
  });

  it("never more than the target, even if Flight Control returns more", async () => {
    setup(fiveTables({ clients: [...fiveTables().clients, client("c-six", "Sam Six")] }));
    getTopOpportunities.mockResolvedValue([...FIVE, opp("c-six", "Sam Six")]);
    const p = await payloadOf("?draft=0&persist=0");
    expect(p.handful).toHaveLength(5);
  });

  it("a lapsed past client is call_only, with no Text", async () => {
    setup(fiveTables());
    const p = await payloadOf("?draft=0");
    const lapsed = item(p, "c-lapsed");
    expect(lapsed.text).toEqual({ status: "call_only", reason: expect.any(String) });
    // Call stays possible.
    expect(lapsed.phone).toBe("(506) 555-0101");
    expect(lapsed.contact_channel).toBe("call");
  });

  it("an SMS opt-out is call_only", async () => {
    setup(fiveTables());
    const p = await payloadOf("?draft=0");
    expect(item(p, "c-optout").text).toEqual({ status: "call_only", reason: expect.stringMatching(/unsubscribed from your texts/) });
  });

  it("an email opt-out alone still allows a text", async () => {
    setup(fiveTables({
      clients: fiveTables().clients.map((c) => (c.id === "c-draft" ? { ...c, email_opt_out_at: "2026-09-01T12:00:00Z" } : c)),
    }));
    const p = await payloadOf("?draft=0");
    expect(item(p, "c-draft").text).toEqual({ status: "draftable" });
  });

  it("no mobile or other phone is no_phone", async () => {
    setup(fiveTables());
    const p = await payloadOf("?draft=0");
    const none = item(p, "c-nophone");
    expect(none.text).toEqual({ status: "no_phone" });
    expect(none.phone).toBeNull();
  });

  it("a number too short to text is no_phone, but is still there to call", async () => {
    setup(fiveTables({
      clients: fiveTables().clients.map((c) => (c.id === "c-nophone" ? { ...c, phone: "555-0101", phone_type: "home" } : c)),
    }));
    const p = await payloadOf("?draft=0");
    expect(item(p, "c-nophone")).toMatchObject({ text: { status: "no_phone" }, phone: "555-0101" });
  });

  it("a landline only is still the number to text (pickTextPhone), and the phone shown", async () => {
    setup(fiveTables({
      clients: fiveTables().clients.map((c) => (c.id === "c-draft"
        ? { ...c, phone: null, phone_type: null, secondary_phone: "506-555-0177", secondary_phone_type: "home" }
        : c)),
    }));
    const p = await payloadOf("?draft=0");
    expect(item(p, "c-draft")).toMatchObject({ text: { status: "draftable" }, phone: "506-555-0177" });
  });

  it("today's ready sms row is ready with its id and body", async () => {
    setup(fiveTables());
    const p = await payloadOf("?draft=0");
    expect(item(p, "c-ready").text).toEqual({ status: "ready", queue_id: "q-c-ready", body: "Hi Riley, edited" });
  });

  it("a ready row from another day, or a skipped one, isn't ready", async () => {
    setup(fiveTables({
      outreach_queue: [
        smsRow("c-ready", { trigger_date: "2026-10-18" }),
        smsRow("c-draft", { id: "q-skipped", status: "skipped" }),
      ],
    }));
    const p = await payloadOf("?draft=0");
    expect(item(p, "c-ready").text).toEqual({ status: "draftable" });
    expect(item(p, "c-draft").text).toEqual({ status: "draftable" });
  });

  it("a ready text is not ready once consent refuses it (opted out after it was drafted)", async () => {
    setup(fiveTables({ outreach_queue: [smsRow("c-optout")] }));
    const p = await payloadOf("?draft=0");
    expect(item(p, "c-optout").text).toMatchObject({ status: "call_only" });
  });

  it("a client texted today isn't offered another text", async () => {
    setup(fiveTables({ outreach_queue: [smsRow("c-draft", { status: "sent", sent_at: "2026-10-19T14:00:00Z" })] }));
    const p = await payloadOf("?draft=0&persist=0");
    expect(item(p, "c-draft").text).toEqual({ status: "call_only", reason: "You already texted Dana Draft today." });
  });

  it("consent that can't be read is call_only: it fails closed", async () => {
    const user = fakeSupabase(fiveTables(), { readError: ["client_email_consents"] });
    setup(fiveTables());
    state.client = user.client;
    const p = await payloadOf("?draft=0");
    for (const h of p.handful) expect(h.text).toEqual({ status: "call_only", reason: CONSENT_READ_FAILED });
  });

  describe("a consent-lapsing card (the text is the consent request)", () => {
    // Bought 2024-11-20: implied consent lapses 2026-11-20, 32 days out.
    const lapsing = () => fiveTables({
      clients: [client("c-ask", "Alex Ask")],
      client_records: [deal("c-ask", "2024-11-20")],
      outreach_queue: [],
    });
    const card = opp("c-ask", "Alex Ask", { opportunity_type: "consent_lapsing", trigger_date: "2026-09-21", label: "Alex · consent lapses Nov 20" });

    it("is draftable while implied consent holds and the sign-off is complete", async () => {
      setup(lapsing());
      getTopOpportunities.mockResolvedValue([card]);
      const p = await payloadOf("?draft=0");
      expect(item(p, "c-ask").text).toEqual({ status: "draftable" });
    });

    it("is call_only with the text footer off (no sender identification on a text)", async () => {
      const t = lapsing();
      t.user_settings = [{ ...SETTINGS, text_footer: false }];
      setup(t);
      getTopOpportunities.mockResolvedValue([card]);
      const p = await payloadOf("?draft=0");
      expect(item(p, "c-ask").text).toEqual({ status: "call_only", reason: expect.stringMatching(/won't draft this ask as a text/) });
    });

    it("is call_only with no mailing address on file", async () => {
      const t = lapsing();
      t.user_settings = [{ ...SETTINGS, mailing_address: null }];
      setup(t);
      getTopOpportunities.mockResolvedValue([card]);
      const p = await payloadOf("?draft=0");
      expect(item(p, "c-ask").text).toMatchObject({ status: "call_only" });
    });

    it("is call_only when the client already gave express consent (nothing to ask)", async () => {
      const t = lapsing();
      t.client_email_consents = [{
        id: "consent-1", user_id: USER, client_id: "c-ask", kind: "other", source: "agent",
        channel: "sms", basis: "express", method: "text_reply", consent_text: "Yes please",
        evidence_note: null, consented_at: "2026-10-01T15:00:00Z", recorded_via: "mobile",
        withdrawn_at: null, withdrawn_method: null, withdrawn_note: null, created_at: "2026-10-01T15:00:00Z",
      }];
      setup(t);
      getTopOpportunities.mockResolvedValue([card]);
      const p = await payloadOf("?draft=0");
      expect(item(p, "c-ask").text).toEqual({ status: "call_only", reason: expect.stringMatching(/express consent/) });
    });
  });

  it("a client on Later is in snoozed with their number, not in the handful", async () => {
    setup(fiveTables({
      clients: [...fiveTables().clients, client("c-later", "Lou Later", { phone: "506-555-0144", phone_type: "mobile" })],
      next_up_handful: [{
        id: "pin-later", user_id: USER, client_id: "c-later", opportunity_type: "idle_client", trigger_date: "2026-10-01",
        rank: 5, added_at: "2026-10-19T12:00:00Z", handled_at: null, handled_how: null,
      }],
      flight_control_dismissals: [{
        id: "d-1", user_id: USER, client_id: "c-later", opportunity_type: "any", trigger_date: TODAY,
        kind: "later", until: TONIGHT, dismissed_at: "2026-10-19T13:00:00Z",
      }],
    }));
    getTopOpportunities.mockResolvedValue(FIVE.slice(0, 4));
    const p = await payloadOf("?draft=0&persist=0");
    expect(p.snoozed).toEqual([{ client_id: "c-later", client_name: "Lou Later", until: TONIGHT, phone: "506-555-0144" }]);
    expect(p.handful.map((h) => h.client_id)).not.toContain("c-later");
    expect(getTopOpportunities.mock.calls[0][2]).toMatchObject({ reservedSlots: 1 });
  });
});

describe("GET /api/next-up: persisting", () => {
  it("persist=0 writes nothing", async () => {
    const user = setup(fiveTables());
    await payloadOf("?persist=0&draft=0");
    expect(user.writes).toEqual([]);
  });

  it("by default the handful's picks are pinned (the payload itself writes nothing else)", async () => {
    const user = setup(fiveTables());
    await payloadOf("?draft=0");
    expect(user.writes.map((w) => w.table)).toEqual(Array(5).fill("next_up_handful"));
    expect(user.writes.every((w) => w.op === "insert")).toBe(true);
  });
});

describe("GET /api/next-up: drafting the handful's texts", () => {
  it("draft=0 never calls the drafter; otherwise only draftable items are drafted, with source next_up and the card's label as the note", async () => {
    setup(fiveTables());
    await payloadOf("?draft=0");
    await Promise.all(pending);
    expect(pending).toHaveLength(0);
    expect(draftTextForClient).not.toHaveBeenCalled();

    const p = await payloadOf();
    await Promise.all(pending);
    const draftable = p.handful.filter((h) => h.text.status === "draftable");
    expect(draftable.map((h) => h.client_id)).toEqual(["c-draft"]);
    expect(draftTextForClient).toHaveBeenCalledTimes(1);
    expect(draftTextForClient).toHaveBeenCalledWith({
      supabase: state.client, userId: USER, clientId: "c-draft",
      purpose: "check_in", note: "Dana · birthday Oct 25", source: "next_up",
    });
  });

  it("a consent-lapsing card is drafted as the consent request", async () => {
    setup(fiveTables({
      clients: [...fiveTables().clients, client("c-ask", "Alex Ask")],
      client_records: [deal("c-lapsed", "2024-01-15"), deal("c-ask", "2024-11-20")],
    }));
    getTopOpportunities.mockResolvedValue([
      ...FIVE.slice(0, 4),
      opp("c-ask", "Alex Ask", { opportunity_type: "consent_lapsing", trigger_date: "2026-09-21", label: "Alex · consent lapses Nov 20" }),
    ]);
    await payloadOf();
    await Promise.all(pending);
    expect(draftTextForClient.mock.calls.map(([i]) => [i.clientId, i.purpose])).toEqual([
      ["c-draft", "check_in"],
      ["c-ask", "consent_request"],
    ]);
  });

  it("drafts one at a time, and a draft that fails or hangs never holds up or fails the response", async () => {
    setup(fiveTables({ outreach_queue: [] }));
    let inFlight = 0;
    let maxInFlight = 0;
    let calls = 0;
    draftTextForClient.mockImplementation(async (input: { clientId: string }) => {
      calls++;
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      if (calls === 1) throw new Error("model down");
      return { status: "created", clientId: input.clientId, clientName: "x" };
    });
    const res = await get();
    expect(res.status).toBe(200);
    await expect(Promise.all(pending)).resolves.toBeDefined();
    expect(calls).toBe(2); // c-ready (no row today) and c-draft
    expect(maxInFlight).toBe(1);

    // A draft that never finishes: the response still comes back.
    pending.length = 0;
    draftTextForClient.mockImplementation(() => new Promise(() => {}));
    const res2 = await get("?persist=0");
    expect(res2.status).toBe(200);
    pending.length = 0; // the hung draft is never awaited
  });
});

describe("GET /api/next-up: urgent counts", () => {
  const clients: Row[] = [
    client("lead-new", "New Lead", { status: "boarding", last_contact_at: null, created_at: "2026-10-18T00:00:00Z" }),
    client("lead-49h", "Old Lead", { status: "boarding", last_contact_at: null, created_at: "2026-10-17T17:00:00Z" }),
    client("lead-48h", "Edge Lead", { status: "boarding", last_contact_at: null, created_at: "2026-10-17T18:00:00Z" }),
    client("lead-called", "Called Lead", { status: "boarding", last_contact_at: "2026-10-19T12:00:00Z", created_at: "2026-10-19T10:00:00Z" }),
    client("lead-archived", "Gone Lead", { status: "boarding", last_contact_at: null, created_at: "2026-10-19T10:00:00Z", archived_at: "2026-10-19T11:00:00Z" }),
    client("lead-inflight", "Busy Lead", { status: "in_flight", last_contact_at: null, created_at: "2026-10-19T10:00:00Z" }),
  ];
  const task = (id: string, due_date: string, completed_at: string | null = null, user_id = USER): Row =>
    ({ id, user_id, client_id: null, title: id, due_date, completed_at });
  const tasks: Row[] = [
    task("t-yesterday", "2026-10-18"),
    task("t-last-week", "2026-10-10"),
    task("t-today", TODAY),
    task("t-done", "2026-10-17", "2026-10-18T12:00:00Z"),
    task("t-other-user", "2026-10-18", null, "user-2"),
  ];
  const pd = (id: string, stage: string, expected_close_date: string | null): Row =>
    ({ id, user_id: USER, stage, expected_close_date, address: id, client_name: null });
  const pipeline: Row[] = [
    pd("d-in-7", "conditional", "2026-10-26"),
    pd("d-in-8", "firm", "2026-10-27"),
    pd("d-closed", "closed", "2026-10-20"),
    pd("d-lost", "lost", "2026-10-21"),
    pd("d-past", "offer", "2026-10-18"),
    pd("d-undated", "lead", null),
  ];
  const cr = (id: string, condition_date: string | null, condition_status: string | null): Row =>
    ({ id, user_id: USER, client_id: "c-other", close_date: null, condition_date, condition_status });
  const records: Row[] = [
    cr("r-pending", "2026-10-21", "pending"),
    cr("r-firmed", "2026-10-21", "firmed"),
    cr("r-collapsed", "2026-10-21", "collapsed"),
    cr("r-later", "2026-10-30", "pending"),
  ];

  it("urgent counts use the core predicates", async () => {
    setup(fiveTables({
      clients: [...fiveTables().clients, ...clients],
      contact_tasks: tasks,
      pipeline_deals: pipeline,
      client_records: [deal("c-lapsed", "2024-01-15"), ...records],
    }));
    const p = await payloadOf("?draft=0&persist=0");
    expect(p.urgent).toEqual({ new_leads: 1, overdue_tasks: 2, deal_deadlines: 2 });

    // The same rows through the core predicates give the same counts.
    const mine = <T extends Row>(rows: T[]) => rows.filter((r) => r.user_id === USER);
    expect(p.urgent.new_leads).toBe(
      clients.filter((c) => isNewLead(c as unknown as Parameters<typeof isNewLead>[0], NOW)).length);
    expect(p.urgent.overdue_tasks).toBe(
      mine(tasks).filter((t) => isOverdueTask(t as unknown as Parameters<typeof isOverdueTask>[0], TODAY)).length);
    expect(p.urgent.deal_deadlines).toBe(
      activePipelineDeals(pipeline as { stage: string; expected_close_date: string | null }[])
        .filter((d) => dealDeadlineDays(d, TODAY) !== null).length
      + records.filter((r) => conditionDeadlineDays(r as Parameters<typeof conditionDeadlineDays>[0], TODAY) !== null).length);
  });

  it("a count that can't be read is 0, and the handful is still served", async () => {
    const user = fakeSupabase(fiveTables({ contact_tasks: tasks }), { readError: ["contact_tasks", "pipeline_deals"] });
    setup(fiveTables());
    state.client = user.client;
    const p = await payloadOf("?draft=0&persist=0");
    expect(p.urgent.overdue_tasks).toBe(0);
    expect(p.urgent.deal_deadlines).toBe(0);
    expect(p.handful).toHaveLength(5);
  });
});

describe("buildNextUpPayload", () => {
  it("never drafts and, with persist false, never writes", async () => {
    const { client: sb, writes } = fakeSupabase(fiveTables());
    const p = await buildNextUpPayload(USER, sb as SupabaseClient, { persist: false, now: NOW });
    expect(p.handful).toHaveLength(5);
    expect(draftTextForClient).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
});
