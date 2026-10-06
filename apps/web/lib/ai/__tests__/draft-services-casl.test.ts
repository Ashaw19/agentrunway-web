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
 * not gated (the app has no view of their consent basis).
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
  heliconeHeaders: () => ({}),
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
