/**
 * The opportunity read's pipeline state counts pipeline deals, the set the
 * dashboard's Pipeline card counts. Until 2026-11-04 it counted clients in
 * Boarding, Scheduled or In-Flight status, and told an agent with open deals
 * "you have no active deals". Listings count too: with none of either the read
 * says empty, the same "empty" the dashboard says. Synthetic rows only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({
  models: { default: "test-default", fallback: "test-fallback" },
  aiCallHeaders: () => ({}),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(), rateLimitHeaders: vi.fn() }));
vi.mock("@/lib/require-pro", () => ({ requirePro: vi.fn() }));

import { getTopOpportunities } from "@/app/api/ai/detect-opportunities/route";
import { fakeSupabase, type Row } from "./helpers/fake-supabase";

const USER = "user-1";

function client(id: string, status: string, birthdate: string | null = null): Row {
  return {
    id, user_id: USER, archived_at: null, name: `Client ${id}`, first_name: "Client", last_name: id,
    city: "Saint John", province_region: "NB", birthdate, communication_tone: "friendly",
    first_contacted_at: null, last_contact_at: null, created_at: "2020-01-01T12:00:00Z",
    tags: [], notes: null, status, timeframe: null, property_interest: null, property_interest_type: null,
    scheduled_for: null, scheduled_phrase: null, email_opt_out_at: null, sms_opt_out_at: null,
  };
}

const deal = (id: string, stage: string): Row => ({ id, user_id: USER, stage });
const listing = (id: string, status: string): Row => ({ id, user_id: USER, status });

async function read(clients: Row[], deals: Row[], { readError, listings = [], records = [] }: {
  readError?: string[];
  listings?: Row[];
  records?: Row[];
} = {}) {
  const { client: supabase } = fakeSupabase(
    {
      clients,
      user_settings: [{ user_id: USER, display_name: "Test Agent", email_signature: "" }],
      client_records: records,
      client_memory_profiles: [],
      client_record_co_parties: [],
      outreach_queue: [],
      client_email_consents: [],
      flight_control_dismissals: [],
      next_up_handful: [],
      pipeline_deals: deals,
      listing_appointments: listings,
    },
    readError ? { readError } : undefined,
  );
  const rows = await getTopOpportunities(USER, supabase);
  expect(rows.length).toBeGreaterThan(0);
  return rows;
}

async function depth(clients: Row[], deals: Row[], opts?: Parameters<typeof read>[2]) {
  return (await read(clients, deals, opts))[0]?.agent_state?.pipeline_status;
}

// A birthday six days out gives the read a card to carry its state.
const BIRTHDAY = client("b", "cruising", "1985-10-25");

describe("the opportunity read's pipeline state", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T15:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("is empty with active clients but no deals", async () => {
    const clients = [BIRTHDAY, client("1", "boarding"), client("2", "in_flight"), client("3", "scheduled"), client("4", "in_flight")];
    expect(await depth(clients, [])).toBe("empty");
  });

  it("is healthy with three open deals and no active clients", async () => {
    expect(await depth([BIRTHDAY], [deal("a", "lead"), deal("b", "offer"), deal("c", "firm")])).toBe("healthy");
  });

  it("leaves closed and lost deals out", async () => {
    expect(await depth([BIRTHDAY], [deal("a", "closed"), deal("b", "lost"), deal("c", "lead")])).toBe("light");
  });

  it("does not call the pipeline empty when the read failed", async () => {
    expect(await depth([BIRTHDAY], [], { readError: ["pipeline_deals"] })).toBe("healthy");
  });

  it("is light, not empty, with active listings and no deals, as the dashboard chip says", async () => {
    const listings = [listing("l1", "active"), listing("l2", "scheduled")];
    const rows = await read([BIRTHDAY], [], { listings });
    expect(rows[0]?.agent_state?.pipeline_status).toBe("light");
    expect(rows[0]?.agent_state?.urgency_level).not.toBe("critical");
    for (const r of rows) {
      const copy = [r.financial_impact, r.primary_reason, r.risk_if_ignored].join(" ");
      expect(copy).not.toMatch(/no active deals|pipeline empty|pipeline is empty|you need listings/i);
    }
  });

  it("leaves listings that aren't scheduled or active out", async () => {
    expect(await depth([BIRTHDAY], [], { listings: [listing("l1", "lost"), listing("l2", "closed")] })).toBe("empty");
  });

  it("does not call the pipeline empty when the listings read failed", async () => {
    expect(await depth([BIRTHDAY], [], { readError: ["listing_appointments"] })).toBe("light");
  });

  it("does not add listings to the deal thresholds", async () => {
    const listings = [listing("l1", "active"), listing("l2", "active"), listing("l3", "active")];
    expect(await depth([BIRTHDAY], [deal("a", "lead")], { listings })).toBe("light");
  });

  it("says the pipeline is light, not that clients are short, to a behind agent with active clients", async () => {
    const fresh = { ...client("new", "cruising"), first_contacted_at: "2026-10-12T15:00:00Z" };
    // Six active clients, contacted recently so they don't fill the read with quiet-lead cards.
    const clients = [fresh, ...["1", "2", "3", "4", "5", "6"].map((id) => ({ ...client(id, "in_flight"), last_contact_at: "2026-10-18T15:00:00Z" }))];
    // Closings in past years and none this year: behind, by the read's own test.
    const records = ["2024-05-01", "2024-08-01", "2025-05-01", "2025-08-01"].map((close_date, i) => ({
      id: `r${i}`, user_id: USER, client_id: "1", address: null, close_date, gci: 8000,
      side: "buyer", property_use: null, condition_date: null, condition_status: null,
    }));
    const rows = await read(clients, [deal("a", "lead")], { records });
    const welcome = rows.find((r) => r.opportunity_type === "new_client_welcome");
    expect(welcome?.agent_state?.pace_status).toBe("behind");
    expect(welcome?.financial_impact).toMatch(/pipeline is light/i);
    expect(welcome?.financial_impact).not.toMatch(/active clients/i);
  });
});
