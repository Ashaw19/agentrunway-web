/**
 * The opportunity read's pipeline state counts pipeline deals, the set the
 * dashboard's Pipeline card counts. Until 2026-11-04 it counted clients in
 * Boarding, Scheduled or In-Flight status, and told an agent with open deals
 * "you have no active deals". Synthetic rows only.
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

async function depth(clients: Row[], deals: Row[], readError?: string[]) {
  const { client: supabase } = fakeSupabase(
    {
      clients,
      user_settings: [{ user_id: USER, display_name: "Test Agent", email_signature: "" }],
      client_records: [],
      client_memory_profiles: [],
      client_record_co_parties: [],
      outreach_queue: [],
      client_email_consents: [],
      flight_control_dismissals: [],
      next_up_handful: [],
      pipeline_deals: deals,
    },
    readError ? { readError } : undefined,
  );
  const rows = await getTopOpportunities(USER, supabase);
  expect(rows.length).toBeGreaterThan(0);
  return rows[0]?.agent_state?.pipeline_status;
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
    expect(await depth([BIRTHDAY], [], ["pipeline_deals"])).toBe("healthy");
  });
});
