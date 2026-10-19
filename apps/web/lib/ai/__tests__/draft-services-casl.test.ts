/**
 * CASL gate on the on-demand email drafters (Andrew, 2026-10-06).
 *
 * Implied consent to email from a purchase lasts two years. PR #273 applied
 * that to Flight Control Scan and the nightly cron. These tests pin the same
 * rule on the other two drafters in draft-services.ts:
 *
 *   - draftOutreachForClient (/api/ai/draft-outreach, CRM briefing, and the
 *     Flight Crew Dispatcher tool)
 *   - draftWorkflowMessage   (/api/workflow/generate-draft, Flight Plan templates)
 *
 * A past client whose most recent closed, non-collapsed deal is two or more
 * years old by the send date gets an honest refusal and a call suggestion.
 * Nothing is written and no AI call is made. Clients with no closed deal are
 * not gated (the app has no view of their consent basis). A co-buyer named on
 * a deal (client_record_co_parties) counts as having closed it, even though
 * the deal row is held by the other party.
 *
 * The fake Supabase client below returns only the columns each query
 * selects, so a drafter that forgets to select `condition_status` cannot see
 * collapsed deals, and the collapsed-deal test fails. That is the exact
 * failure #273's commit notes for the Scan path.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({
  models: { default: "test-default", fallback: "test-fallback" },
  aiCallHeaders: () => ({}),
}));

import { generateText } from "ai";
import { draftOutreachForClient, draftWorkflowMessage } from "../draft-services";
import type { WorkflowTemplate } from "@agent-runway/core/types/database";
import { fakeSupabase, type Row } from "./helpers/fake-supabase";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const USER = "user-1";
const CLIENT = "client-1";

function clientRow(overrides: Row = {}): Row {
  return {
    id: CLIENT, user_id: USER, archived_at: null,
    name: "Sam Lee", first_name: "Sam", last_name: "Lee",
    city: "Saint John", province_region: "NB", birthdate: "1985-11-02",
    communication_tone: "friendly", status: "cruising", timeframe: null,
    property_interest: null, property_interest_type: null,
    notes: null, tags: [], last_contact_at: null,
    ...overrides,
  };
}

function deal(close_date: string, condition_status: string | null = "firmed"): Row {
  return {
    id: `rec-${close_date}`, user_id: USER, client_id: CLIENT,
    address: "12 Elm St", close_date, gci: 9000, side: "buyer",
    property_use: "primary", condition_status,
  };
}

function tables(records: Row[], extra: Record<string, Row[]> = {}): Record<string, Row[]> {
  return {
    clients: [clientRow()],
    user_settings: [{ user_id: USER, display_name: "Andrew Shaw", email_signature: "", ai_voice_guide: null }],
    client_records: records,
    outreach_queue: [],
    workflow_drafts: [],
    ...extra,
  };
}

const template: WorkflowTemplate = {
  id: "tmpl-1",
  user_id: null,
  trigger_event: "anniversary",
  name: "Home anniversary",
  subject_template: "Happy home anniversary, {{client_first_name}}",
  body_prompt: "Write a short home-anniversary note.",
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const mockGenerate = vi.mocked(generateText);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 6, 12)); // 2026-10-06, local noon
  process.env.ANTHROPIC_API_KEY = "test-key";
  mockGenerate.mockReset();
  mockGenerate.mockResolvedValue({
    text: "Hi Sam,\n\nA couple of homes came up near you this month.\n\nSUBJECT: quick note",
  } as Awaited<ReturnType<typeof generateText>>);
});

afterEach(() => {
  vi.useRealTimers();
});

// ── draftOutreachForClient ───────────────────────────────────────────────────

describe("draftOutreachForClient — CASL gate", () => {
  it("refuses a past client whose last deal closed more than two years ago", async () => {
    const { client, writes } = fakeSupabase(tables([deal("2023-05-01")]));
    const result = await draftOutreachForClient({
      supabase: client, userId: USER, clientId: CLIENT, opportunityType: "past_client_check_in",
    });

    expect(result.status).toBe("call_only");
    expect(result.reason).toMatch(/CASL/);
    expect(result.reason).toContain("May 2023");
    expect(result.clientName).toBe("Sam Lee");
    expect(writes.filter((w) => w.table === "outreach_queue")).toEqual([]);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("refuses rather than pointing at an existing draft for a lapsed client", async () => {
    const existing = {
      id: "q-1", user_id: USER, client_id: CLIENT,
      opportunity_type: "past_client_check_in", trigger_date: "2026-10-01", status: "ready",
    };
    const { client } = fakeSupabase(tables([deal("2023-05-01")], { outreach_queue: [existing] }));
    const result = await draftOutreachForClient({
      supabase: client, userId: USER, clientId: CLIENT, opportunityType: "past_client_check_in",
    });

    expect(result.status).toBe("call_only");
  });

  it("does not count a newer collapsed deal as a purchase", async () => {
    const { client, writes } = fakeSupabase(tables([
      deal("2022-01-10", "firmed"),
      deal("2026-03-01", "collapsed"),
    ]));
    const result = await draftOutreachForClient({
      supabase: client, userId: USER, clientId: CLIENT, opportunityType: "past_client_check_in",
    });

    expect(result.status).toBe("call_only");
    expect(writes).toEqual([]);
  });

  it("measures at the trigger date when the message goes out after the two-year mark", async () => {
    // Today (10-06) is inside the window; the 2-year anniversary (10-20) is not.
    const { client } = fakeSupabase(tables([deal("2024-10-20")]));
    const result = await draftOutreachForClient({
      supabase: client, userId: USER, clientId: CLIENT, opportunityType: "closing_anniversary",
    });

    expect(result.status).toBe("call_only");
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("drafts for a past client inside the two-year window", async () => {
    const { client, writes } = fakeSupabase(tables([deal("2025-06-01")]));
    const result = await draftOutreachForClient({
      supabase: client, userId: USER, clientId: CLIENT, opportunityType: "past_client_check_in",
    });

    expect(result.status).toBe("created");
    expect(writes.some((w) => w.table === "outreach_queue" && w.op === "upsert")).toBe(true);
    expect(mockGenerate).toHaveBeenCalled();
  });

  it("does not gate a client with no closed deal", async () => {
    const { client } = fakeSupabase(tables([]));
    const result = await draftOutreachForClient({
      supabase: client, userId: USER, clientId: CLIENT, opportunityType: "birthday",
    });

    expect(result.status).toBe("created");
  });
});

// ── Co-buyers ────────────────────────────────────────────────────────────────
// A couple's deal is one client_records row held by one spouse (#257). The
// client being drafted for is the other spouse, linked as a co-party.

function spouseDeal(close_date: string, condition_status: string | null = "firmed"): Row {
  return {
    id: "rec-spouse", user_id: USER, client_id: "spouse-1",
    address: "12 Elm St", close_date, gci: 9000, side: "buyer",
    property_use: "primary", condition_status,
  };
}

const coBuyerLink: Row = { id: "cp-1", user_id: USER, client_record_id: "rec-spouse", co_client_id: CLIENT };

describe("CASL gate — co-buyers", () => {
  it("refuses outreach to a co-buyer whose shared deal closed more than two years ago", async () => {
    const { client, writes } = fakeSupabase(tables([spouseDeal("2023-05-01")], {
      client_record_co_parties: [coBuyerLink],
    }));
    const result = await draftOutreachForClient({
      supabase: client, userId: USER, clientId: CLIENT, opportunityType: "birthday",
    });

    expect(result.status).toBe("call_only");
    expect(result.reason).toContain("May 2023");
    expect(writes).toEqual([]);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("refuses a Flight Plan draft to a lapsed co-buyer", async () => {
    const { client, writes } = fakeSupabase(tables([spouseDeal("2023-05-01")], {
      client_record_co_parties: [coBuyerLink],
    }));
    const result = await draftWorkflowMessage({ supabase: client, userId: USER, clientId: CLIENT, template });

    expect(result.status).toBe("call_only");
    expect(writes).toEqual([]);
  });

  it("does not credit a collapsed shared deal to the co-buyer", async () => {
    const { client } = fakeSupabase(tables([spouseDeal("2023-05-01", "collapsed")], {
      client_record_co_parties: [coBuyerLink],
    }));
    const result = await draftOutreachForClient({
      supabase: client, userId: USER, clientId: CLIENT, opportunityType: "birthday",
    });

    expect(result.status).toBe("created");
  });

  it("drafts for a co-buyer inside the two-year window", async () => {
    const { client } = fakeSupabase(tables([spouseDeal("2025-06-01")], {
      client_record_co_parties: [coBuyerLink],
    }));
    const outreach = await draftOutreachForClient({
      supabase: client, userId: USER, clientId: CLIENT, opportunityType: "birthday",
    });
    const workflow = await draftWorkflowMessage({ supabase: client, userId: USER, clientId: CLIENT, template });

    expect(outreach.status).toBe("created");
    expect(workflow.status).toBe("created");
  });
});

// ── draftWorkflowMessage ─────────────────────────────────────────────────────

describe("draftWorkflowMessage — CASL gate", () => {
  it("refuses a past client whose last deal closed more than two years ago", async () => {
    const { client, writes } = fakeSupabase(tables([deal("2023-05-01")]));
    const result = await draftWorkflowMessage({ supabase: client, userId: USER, clientId: CLIENT, template });

    expect(result.status).toBe("call_only");
    expect(result.reason).toMatch(/CASL/);
    expect(result.clientName).toBe("Sam Lee");
    expect(writes.filter((w) => w.table === "workflow_drafts")).toEqual([]);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("does not count a newer collapsed deal as a purchase", async () => {
    const { client } = fakeSupabase(tables([
      deal("2022-01-10", "firmed"),
      deal("2026-03-01", "collapsed"),
    ]));
    const result = await draftWorkflowMessage({ supabase: client, userId: USER, clientId: CLIENT, template });

    expect(result.status).toBe("call_only");
  });

  it("drafts for a past client inside the two-year window", async () => {
    const { client, writes } = fakeSupabase(tables([deal("2025-06-01")]));
    const result = await draftWorkflowMessage({ supabase: client, userId: USER, clientId: CLIENT, template });

    expect(result.status).toBe("created");
    expect(writes.some((w) => w.table === "workflow_drafts" && w.op === "insert")).toBe(true);
  });

  it("does not gate a client with no closed deal", async () => {
    const { client } = fakeSupabase(tables([]));
    const result = await draftWorkflowMessage({ supabase: client, userId: USER, clientId: CLIENT, template });

    expect(result.status).toBe("created");
  });
});

/**
 * Unsubscribed from all email (00173, website leads): clients.email_opt_out_at
 * makes both drafters call-only, even for a client whose deal is recent. The
 * fake returns only selected columns, so a drafter that forgets to select
 * email_opt_out_at can't see the opt-out and these fail.
 */
describe("email opt-out", () => {
  const optedOut = (records: Row[]) =>
    fakeSupabase({ ...tables(records), clients: [clientRow({ email_opt_out_at: "2026-09-15T13:00:00+00:00" })] });

  it("draftOutreachForClient refuses, inside the two-year window too", async () => {
    const { client, writes } = optedOut([deal("2025-06-01")]);
    const result = await draftOutreachForClient({
      supabase: client, userId: USER, clientId: CLIENT, opportunityType: "past_client_check_in",
    });
    expect(result.status).toBe("call_only");
    expect(result.reason).toContain("unsubscribed from your emails on September 15, 2026");
    expect(result.reason).not.toContain("—");
    expect(writes).toEqual([]);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("draftWorkflowMessage refuses", async () => {
    const { client, writes } = optedOut([]);
    const result = await draftWorkflowMessage({ supabase: client, userId: USER, clientId: CLIENT, template });
    expect(result.status).toBe("call_only");
    expect(result.reason).toContain("unsubscribed");
    expect(writes).toEqual([]);
  });
});

/**
 * CASL consent ledger (00183): express consent the agent recorded reopens
 * drafting for a past client whose implied consent lapsed; an unsubscribe
 * (or a withdrawal) blocks the channel it covers whatever else is on file;
 * a consent request goes out only before the lapse (s.1(3)) and carries the
 * identification and unsubscribe line (s.6(2), Regs s.4(e)).
 */
function consentRow(overrides: Row = {}): Row {
  return {
    id: "consent-1", user_id: USER, client_id: CLIENT, kind: "other", source: "agent",
    channel: "email", basis: "express", method: "verbal", consent_text: "Happy to keep hearing from you",
    evidence_note: null, consented_at: "2026-09-20T15:00:00+00:00", recorded_via: "web",
    withdrawn_at: null, withdrawn_method: null, withdrawn_note: null, created_at: "2026-09-20T15:00:00+00:00",
    ...overrides,
  };
}

describe("consent ledger — express consent and withdrawals", () => {
  it("express email consent lets draftOutreachForClient draft for a lapsed past client", async () => {
    const { client } = fakeSupabase(tables([deal("2021-05-01")], { client_email_consents: [consentRow()] }));
    const result = await draftOutreachForClient({
      supabase: client, userId: USER, clientId: CLIENT, opportunityType: "past_client_check_in",
    });
    expect(result.status).toBe("created");
    expect(mockGenerate).toHaveBeenCalled();
  });

  it("express email consent lets draftWorkflowMessage draft for a lapsed past client", async () => {
    const { client } = fakeSupabase(tables([deal("2021-05-01")], { client_email_consents: [consentRow()] }));
    const result = await draftWorkflowMessage({ supabase: client, userId: USER, clientId: CLIENT, template });
    expect(result.status).not.toBe("call_only");
    expect(result.status).not.toBe("error");
  });

  it("express consent for texts only doesn't open email", async () => {
    const { client } = fakeSupabase(tables([deal("2021-05-01")], { client_email_consents: [consentRow({ channel: "sms" })] }));
    const result = await draftOutreachForClient({
      supabase: client, userId: USER, clientId: CLIENT, opportunityType: "past_client_check_in",
    });
    expect(result.status).toBe("call_only");
  });

  it("a withdrawn express consent doesn't open email", async () => {
    const { client } = fakeSupabase(tables([deal("2021-05-01")], {
      client_email_consents: [consentRow({ withdrawn_at: "2026-10-01T15:00:00+00:00", withdrawn_method: "verbal" })],
    }));
    const result = await draftOutreachForClient({
      supabase: client, userId: USER, clientId: CLIENT, opportunityType: "past_client_check_in",
    });
    expect(result.status).toBe("call_only");
  });

  it("an unsubscribe after the express consent blocks both drafters, never drafted", async () => {
    const t = {
      ...tables([deal("2021-05-01")], { client_email_consents: [consentRow()] }),
      clients: [clientRow({ email_opt_out_at: "2026-10-01T12:00:00+00:00" })],
    };
    const a = fakeSupabase(t);
    expect((await draftOutreachForClient({ supabase: a.client, userId: USER, clientId: CLIENT, opportunityType: "past_client_check_in" })).status).toBe("call_only");
    const b = fakeSupabase(t);
    expect((await draftWorkflowMessage({ supabase: b.client, userId: USER, clientId: CLIENT, template })).status).toBe("call_only");
    expect(a.writes).toEqual([]);
    expect(b.writes).toEqual([]);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("a withdrawal from texts only doesn't stop email", async () => {
    const { client } = fakeSupabase({ ...tables([deal("2025-06-01")]), clients: [clientRow({ sms_opt_out_at: "2026-10-01T12:00:00+00:00" })] });
    const result = await draftOutreachForClient({
      supabase: client, userId: USER, clientId: CLIENT, opportunityType: "past_client_check_in",
    });
    expect(result.status).toBe("created");
  });

  it("drafts nothing when the consent record can't be read", async () => {
    const { client, writes } = fakeSupabase(tables([deal("2025-06-01")]), { unreachable: ["client_email_consents"] });
    const result = await draftOutreachForClient({
      supabase: client, userId: USER, clientId: CLIENT, opportunityType: "past_client_check_in",
    });
    expect(result.status).toBe("queued");
    expect(result.reason).toMatch(/couldn't read their consent/);
    expect(writes).toEqual([]);
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});

describe("consent ledger — consent request (consent_lapsing)", () => {
  // Today is 2026-10-06. A closing on 2024-11-20 lapses 2026-11-20.
  const settings = [{
    user_id: USER, display_name: "Andrew Shaw", email_signature: "", ai_voice_guide: null,
    brokerage_name: "REAL Broker", phone: "506-555-0100", mailing_address: "123 Main St, Saint John NB E2L 1A1",
  }];

  it("drafts the ask while implied consent holds, keyed on the last implied day, with the CASL lines", async () => {
    const { client, writes } = fakeSupabase(tables([deal("2024-11-20")], { user_settings: settings }));
    const result = await draftOutreachForClient({
      supabase: client, userId: USER, clientId: CLIENT, opportunityType: "consent_lapsing",
    });
    expect(result.status).toBe("created");
    const upsert = writes.find((w) => w.table === "outreach_queue" && w.op === "upsert")?.payload as Row;
    expect(upsert).toMatchObject({ opportunity_type: "consent_lapsing", trigger_date: "2026-11-19" });
    // SOR/2012-36 s.2: name, mailing address, and a phone, email or website.
    expect(result.body).toContain("Andrew Shaw, REAL Broker\n123 Main St, Saint John NB E2L 1A1\n506-555-0100");
    expect(result.body).toMatch(/change your mind at any time/);
    expect(result.body).toMatch(/reply "unsubscribe"/);
  });

  it("isn't drafted without a mailing address, and says where to add it", async () => {
    const { client, writes } = fakeSupabase(tables([deal("2024-11-20")], {
      user_settings: [{ ...settings[0], mailing_address: null }],
    }));
    const result = await draftOutreachForClient({
      supabase: client, userId: USER, clientId: CLIENT, opportunityType: "consent_lapsing",
    });
    expect(result.status).toBe("queued");
    expect(result.queueItemId).toBe("");
    expect(result.reason).toMatch(/mailing address/);
    expect(result.reason).toMatch(/Flight Control, under Email Signature/);
    expect(writes).toEqual([]);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("isn't drafted without a phone, email or website", async () => {
    const { client } = fakeSupabase(tables([deal("2024-11-20")], {
      user_settings: [{ ...settings[0], phone: null }],
    }));
    const result = await draftOutreachForClient({
      supabase: client, userId: USER, clientId: CLIENT, opportunityType: "consent_lapsing",
    });
    expect(result.status).toBe("queued");
    expect(result.reason).toMatch(/phone number, email or website/);
  });

  it("uses the email signature as the identification when there is one", async () => {
    const { client } = fakeSupabase(tables([deal("2024-11-20")], {
      user_settings: [{ ...settings[0], mailing_address: null, email_signature: "Andrew Shaw\nREAL Broker\n9 King St, Saint John NB E2L 4N8\nandrew@example.ca" }],
    }));
    const result = await draftOutreachForClient({
      supabase: client, userId: USER, clientId: CLIENT, opportunityType: "consent_lapsing",
    });
    // The signature has a postal code and an email: nothing added from Settings.
    expect(result.body).toContain("9 King St, Saint John NB E2L 4N8\nandrew@example.ca");
    expect(result.body).not.toContain("123 Main St");
    expect(result.body).not.toContain("506-555-0100");
  });

  it("is call-only once implied consent has lapsed: the ask is a commercial message too", async () => {
    const { client, writes } = fakeSupabase(tables([deal("2024-10-01")], { user_settings: settings }));
    const result = await draftOutreachForClient({
      supabase: client, userId: USER, clientId: CLIENT, opportunityType: "consent_lapsing",
    });
    expect(result.status).toBe("call_only");
    expect(writes).toEqual([]);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("isn't drafted for a client with no deal on record", async () => {
    const { client } = fakeSupabase(tables([], { user_settings: settings }));
    const result = await draftOutreachForClient({
      supabase: client, userId: USER, clientId: CLIENT, opportunityType: "consent_lapsing",
    });
    expect(result.status).toBe("call_only");
    expect(result.reason).toMatch(/no closed deal on record/);
  });
});
