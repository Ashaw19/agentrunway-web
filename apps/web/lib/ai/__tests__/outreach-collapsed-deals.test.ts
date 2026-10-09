/**
 * Collapsed deals are not closings (Andrew, 2026-10-06).
 *
 * A deal that collapsed never closed, so it can't anchor outreach. Before
 * this fix the nightly drafter (detectAndDraftForUser, run by
 * /api/cron/outreach-detector), Flight Control Scan (getTopOpportunities)
 * and the on-demand drafter (draftOutreachForClient) all read collapsed
 * deals as if they had closed:
 *
 *   - a closing-anniversary note for a home the client never bought
 *   - post-close follow-ups, review requests and referral asks for it
 *   - a client whose only deal collapsed treated as an idle past client,
 *     and a newer collapsed deal hiding a real idle past client
 *
 * Scan and the nightly drafter are tested together because they must agree:
 * a Scan card the nightly detector can't reproduce fails when the agent
 * clicks Draft.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({
  models: { default: "test-default", fallback: "test-fallback" },
  heliconeHeaders: () => ({}),
}));
// The route module's request-handling imports; not exercised here.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(), rateLimitHeaders: vi.fn() }));
vi.mock("@/lib/require-pro", () => ({ requirePro: vi.fn() }));

import { generateText } from "ai";
import { detectAndDraftForUser, getTopOpportunities } from "@/app/api/ai/detect-opportunities/route";
import { draftOutreachForClient } from "../draft-services";
import { fakeSupabase, type Row } from "./helpers/fake-supabase";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const USER = "user-1";
const CLIENT = "client-1";

function deal(close_date: string, condition_status: string, n = 1): Row {
  return {
    id: `rec-${n}`, user_id: USER, client_id: CLIENT,
    address: `${n} Elm St`, close_date, gci: 9000, side: "buyer",
    property_use: "primary_residence", condition_date: null, condition_status,
  };
}

function tables(records: Row[]): Record<string, Row[]> {
  return {
    clients: [{
      id: CLIENT, user_id: USER, archived_at: null,
      name: "Sam Lee", first_name: "Sam", last_name: "Lee",
      city: "Saint John", province_region: "NB", birthdate: null,
      communication_tone: "friendly", first_contacted_at: null, last_contact_at: null,
      tags: [], notes: null, status: "cruising", timeframe: null,
      property_interest: null, property_interest_type: null,
      scheduled_for: null, scheduled_phrase: null,
    }],
    user_settings: [{ user_id: USER, display_name: "Andrew Shaw", email_signature: "", ai_voice_guide: null }],
    client_records: records,
    client_memory_profiles: [],
    outreach_queue: [],
  };
}

/** Opportunity types the nightly run queued for drafting. */
async function nightlyTypes(records: Row[]): Promise<string[]> {
  const { client, writes } = fakeSupabase(tables(records));
  await detectAndDraftForUser(USER, client);
  const upsert = writes.find((w) => w.table === "outreach_queue" && w.op === "upsert");
  return ((upsert?.payload as Row[] | undefined) ?? []).map((r) => String(r.opportunity_type));
}

/** Opportunity types on the Scan cards. */
async function scanTypes(records: Row[]): Promise<string[]> {
  const { client } = fakeSupabase(tables(records));
  return (await getTopOpportunities(USER, client)).map((o) => o.opportunity_type);
}

const POST_CLOSE = ["post_close_3", "post_close_14", "post_close_90", "review_request", "referral_ask"];

let savedKeys: Record<string, string | undefined>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 6, 12)); // 2026-10-06, local noon
  savedKeys = { a: process.env.ANTHROPIC_API_KEY, g: process.env.GROQ_API_KEY };
  // Nightly run: no AI key → detect + queue only, no drafting calls.
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GROQ_API_KEY;
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (savedKeys.a !== undefined) process.env.ANTHROPIC_API_KEY = savedKeys.a;
  if (savedKeys.g !== undefined) process.env.GROQ_API_KEY = savedKeys.g;
});

// ── Nightly drafter ──────────────────────────────────────────────────────────

describe("nightly drafter — collapsed deals", () => {
  it("queues a closing anniversary for a deal that closed", async () => {
    // 1-year anniversary on 2026-10-10, inside the 14-day window.
    expect(await nightlyTypes([deal("2025-10-10", "firmed")])).toContain("closing_anniversary");
  });

  it("queues no closing anniversary for a deal that collapsed", async () => {
    expect(await nightlyTypes([deal("2025-10-10", "collapsed")])).not.toContain("closing_anniversary");
  });

  it("queues post-close follow-ups for a deal that closed", async () => {
    // Closed 2026-09-22: 14-day follow-up today, review request on 10-13.
    expect(await nightlyTypes([deal("2026-09-22", "firmed")])).toEqual(
      expect.arrayContaining(["post_close_14", "review_request"]),
    );
  });

  it("queues no post-close follow-ups for a deal that collapsed", async () => {
    const types = await nightlyTypes([deal("2026-09-22", "collapsed")]);
    expect(types.filter((t) => POST_CLOSE.includes(t))).toEqual([]);
  });
});

// ── Flight Control Scan ──────────────────────────────────────────────────────

describe("Scan — collapsed deals", () => {
  it("shows no anniversary or post-close card for a deal that collapsed", async () => {
    const anniv = await scanTypes([deal("2025-10-10", "collapsed")]);
    const post  = await scanTypes([deal("2026-09-22", "collapsed")]);
    expect([...anniv, ...post].filter((t) => t === "closing_anniversary" || POST_CLOSE.includes(t))).toEqual([]);
  });

  it("shows an idle past client whose last deal closed 23 months ago", async () => {
    expect(await scanTypes([deal("2024-11-01", "firmed")])).toContain("idle_client");
  });

  it("doesn't treat a client whose only deal collapsed as an idle past client", async () => {
    expect(await scanTypes([deal("2024-11-01", "collapsed")])).not.toContain("idle_client");
  });

  it("doesn't let a newer collapsed deal hide an idle past client", async () => {
    const types = await scanTypes([deal("2024-11-01", "firmed", 1), deal("2026-06-01", "collapsed", 2)]);
    expect(types).toContain("idle_client");
  });
});

// ── On-demand drafter (CRM client panel, briefing, Flight Crew) ─────────────

describe("on-demand drafter — collapsed deals", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    vi.mocked(generateText).mockReset();
    vi.mocked(generateText).mockResolvedValue({
      text: "Hi Sam,\n\nA year in the new place already.\n\nSUBJECT: one year",
    } as Awaited<ReturnType<typeof generateText>>);
  });

  it("writes the anniversary note for the latest deal that closed, not a newer collapsed one", async () => {
    const { client, writes } = fakeSupabase(tables([
      deal("2025-10-10", "firmed", 1),
      deal("2026-05-01", "collapsed", 2),
    ]));
    const result = await draftOutreachForClient({
      supabase: client, userId: USER, clientId: CLIENT, opportunityType: "closing_anniversary",
    });

    expect(result.status).toBe("created");
    const upsert = writes.find((w) => w.table === "outreach_queue" && w.op === "upsert")?.payload as Row;
    expect(upsert).toMatchObject({
      trigger_date: "2026-10-10",
      context: { close_date: "2025-10-10", address: "1 Elm St" },
    });
  });

  it("refuses an anniversary note when the only deal collapsed", async () => {
    const { client, writes } = fakeSupabase(tables([deal("2025-10-10", "collapsed")]));
    const result = await draftOutreachForClient({
      supabase: client, userId: USER, clientId: CLIENT, opportunityType: "closing_anniversary",
    });

    expect(result.status).toBe("queued");
    expect(result.reason).toMatch(/no closed records/i);
    expect(writes).toEqual([]);
    expect(generateText).not.toHaveBeenCalled();
  });
});
