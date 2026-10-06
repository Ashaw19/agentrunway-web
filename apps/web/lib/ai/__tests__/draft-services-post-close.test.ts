/**
 * On-demand referral asks and review requests (Andrew, 2026-10-06).
 *
 * The CRM client panel's "Ask for Referral" and "Request Review" buttons POST
 * referral_ask / review_request to /api/ai/draft-outreach. Neither type was in
 * DRAFTABLE_OUTREACH_TYPES, so every click came back 400 and an error toast.
 *
 * These pin the on-demand path for both types:
 *   - Written around the client's most recent closed deal. Collapsed and
 *     future-dated deals don't count; no closed deal means an honest refusal.
 *   - Trigger date mirrors the Flight Control cadence (close + 21 days for a
 *     review, close + 45 for a referral, nurture-engine) while that draft
 *     could still exist, so a click reuses it instead of making a twin. For
 *     an older deal it is the first of the month, like a past-client check-in.
 *   - The prompt states the real time since closing, not the cadence's fixed
 *     "about 3 weeks" / "about 6 weeks".
 *   - The PR #274 CASL gate still runs first: a lapsed past client gets a
 *     call suggestion, never a draft.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({
  models: { default: "test-default", fallback: "test-fallback" },
  heliconeHeaders: () => ({}),
}));

import { generateText } from "ai";
import { DRAFTABLE_OUTREACH_TYPES, draftOutreachForClient } from "../draft-services";
import { fakeSupabase, type Row } from "./helpers/fake-supabase";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const USER = "user-1";
const CLIENT = "client-1";

function deal(close_date: string, condition_status: string | null = "firmed"): Row {
  return {
    id: `rec-${close_date}`, user_id: USER, client_id: CLIENT,
    address: "12 Elm St", close_date, gci: 9000, side: "buyer",
    property_use: "primary", condition_status,
  };
}

function tables(records: Row[], extra: Record<string, Row[]> = {}): Record<string, Row[]> {
  return {
    clients: [{
      id: CLIENT, user_id: USER, archived_at: null,
      name: "Sam Lee", first_name: "Sam", last_name: "Lee",
      city: "Saint John", province_region: "NB", birthdate: null,
      communication_tone: "friendly", status: "cruising", timeframe: null,
      property_interest: null, property_interest_type: null,
      notes: null, tags: [], last_contact_at: null,
    }],
    user_settings: [{ user_id: USER, display_name: "Andrew Shaw", email_signature: "", ai_voice_guide: null }],
    client_records: records,
    outreach_queue: [],
    ...extra,
  };
}

const mockGenerate = vi.mocked(generateText);

function promptSent(): string {
  const call = mockGenerate.mock.calls[0]?.[0] as { prompt?: string } | undefined;
  return call?.prompt ?? "";
}

function upserted(writes: ReturnType<typeof fakeSupabase>["writes"]): Row | undefined {
  return writes.find((w) => w.table === "outreach_queue" && w.op === "upsert")?.payload as Row | undefined;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 6, 12)); // 2026-10-06, local noon
  process.env.ANTHROPIC_API_KEY = "test-key";
  mockGenerate.mockReset();
  mockGenerate.mockResolvedValue({
    text: "Hi Sam,\n\nHope the new place is treating you well.\n\nSUBJECT: quick note",
  } as Awaited<ReturnType<typeof generateText>>);
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("draftOutreachForClient — on-demand referral asks and review requests", () => {
  it("accepts both types on the on-demand route", () => {
    expect(DRAFTABLE_OUTREACH_TYPES).toContain("referral_ask");
    expect(DRAFTABLE_OUTREACH_TYPES).toContain("review_request");
  });

  it("drafts a referral ask on the Flight Control cadence date for a recent deal", async () => {
    // Closed 2026-08-10; the cadence date (+45) is 2026-09-24, 12 days ago.
    const { client, writes } = fakeSupabase(tables([deal("2026-08-10")]));
    const result = await draftOutreachForClient({
      supabase: client, userId: USER, clientId: CLIENT, opportunityType: "referral_ask",
    });

    expect(result.status).toBe("created");
    expect(upserted(writes)).toMatchObject({
      opportunity_type: "referral_ask",
      trigger_date: "2026-09-24",
      context: { address: "12 Elm St", close_date: "2026-08-10", side: "buyer", days_after_close: 45 },
    });
    expect(promptSent()).toMatch(/referral ask/i);
  });

  it("drafts a review request with the real time since closing", async () => {
    // Closed 16 days ago; the cadence date (+21) is still ahead.
    const { client, writes } = fakeSupabase(tables([deal("2026-09-20")]));
    const result = await draftOutreachForClient({
      supabase: client, userId: USER, clientId: CLIENT, opportunityType: "review_request",
    });

    expect(result.status).toBe("created");
    expect(upserted(writes)).toMatchObject({ opportunity_type: "review_request", trigger_date: "2026-10-11" });
    expect(promptSent()).toMatch(/review request/i);
    expect(promptSent()).toContain("about 2 weeks since closing");
  });

  it("uses the first of the month and the real gap for an older deal", async () => {
    const { client, writes } = fakeSupabase(tables([deal("2025-03-01")]));
    const result = await draftOutreachForClient({
      supabase: client, userId: USER, clientId: CLIENT, opportunityType: "referral_ask",
    });

    expect(result.status).toBe("created");
    expect(upserted(writes)).toMatchObject({ trigger_date: "2026-10-01" });
    expect(promptSent()).toContain("about 19 months after closing");
    expect(promptSent()).not.toContain("6 weeks");
  });

  it("points at the draft Flight Control already made for the same deal", async () => {
    const cronRow = {
      id: "q-cron", user_id: USER, client_id: CLIENT,
      opportunity_type: "review_request", trigger_date: "2026-10-11", status: "ready",
    };
    const { client, writes } = fakeSupabase(tables([deal("2026-09-20")], { outreach_queue: [cronRow] }));
    const result = await draftOutreachForClient({
      supabase: client, userId: USER, clientId: CLIENT, opportunityType: "review_request",
    });

    expect(result.status).toBe("existing");
    expect(result.queueItemId).toBe("q-cron");
    expect(writes).toEqual([]);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it.each(["referral_ask", "review_request"] as const)(
    "%s: refuses a client with no closed deal, without writing",
    async (opportunityType) => {
      const { client, writes } = fakeSupabase(tables([]));
      const result = await draftOutreachForClient({
        supabase: client, userId: USER, clientId: CLIENT, opportunityType,
      });

      expect(result.status).toBe("queued");
      expect(result.queueItemId).toBe("");
      expect(result.reason).toMatch(/no closed deal/i);
      expect(writes).toEqual([]);
      expect(mockGenerate).not.toHaveBeenCalled();
    },
  );

  it("does not count a collapsed deal as a closing", async () => {
    const { client, writes } = fakeSupabase(tables([deal("2026-08-10", "collapsed")]));
    const result = await draftOutreachForClient({
      supabase: client, userId: USER, clientId: CLIENT, opportunityType: "review_request",
    });

    expect(result.reason).toMatch(/no closed deal/i);
    expect(writes).toEqual([]);
  });

  it("does not count a deal whose close date is still ahead", async () => {
    const { client, writes } = fakeSupabase(tables([deal("2026-11-15")]));
    const result = await draftOutreachForClient({
      supabase: client, userId: USER, clientId: CLIENT, opportunityType: "review_request",
    });

    expect(result.reason).toMatch(/no closed deal/i);
    expect(writes).toEqual([]);
  });

  it.each(["referral_ask", "review_request"] as const)(
    "%s: CASL gate refuses a lapsed past client, even with a draft on file",
    async (opportunityType) => {
      const oldRow = {
        id: "q-old", user_id: USER, client_id: CLIENT,
        opportunity_type: opportunityType, trigger_date: "2026-10-01", status: "ready",
      };
      const { client, writes } = fakeSupabase(tables([deal("2023-05-01")], { outreach_queue: [oldRow] }));
      const result = await draftOutreachForClient({
        supabase: client, userId: USER, clientId: CLIENT, opportunityType,
      });

      expect(result.status).toBe("call_only");
      expect(result.reason).toMatch(/CASL/);
      expect(writes).toEqual([]);
      expect(mockGenerate).not.toHaveBeenCalled();
    },
  );
});
