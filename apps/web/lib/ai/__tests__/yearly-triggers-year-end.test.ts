/**
 * Closing anniversaries and birthdays in early January are found in late
 * December (2026-10-13).
 *
 * The contact-anniversary detector counted calendar years (this year minus
 * the first-contact year), so a first anniversary on Jan 5 stayed hidden
 * until Jan 1 — see first-contact-trigger-day.test.ts. These two detectors
 * were checked for the same gap and do not have it: both decide from the
 * date itself. The cases here keep it that way, for Scan
 * (getTopOpportunities) and the nightly drafter (detectAndDraftForUser),
 * which each carry their own copy of the loops.
 *
 * Runs with TZ=UTC, the server's zone.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({
  models: { default: "test-default", fallback: "test-fallback" },
  heliconeHeaders: () => ({}),
}));
// The route module's request-handling imports; not exercised here.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(), rateLimitHeaders: vi.fn() }));
vi.mock("@/lib/require-pro", () => ({ requirePro: vi.fn() }));

import { detectAndDraftForUser, getTopOpportunities, type OpportunityPin } from "@/app/api/ai/detect-opportunities/route";
import { fakeSupabase, type Row } from "./helpers/fake-supabase";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const USER = "user-1";
const CLIENT = "client-1";

const DEC25_NOON = "2026-12-25T16:00:00Z"; // Fri Dec 25 2026, 12:00 AST

interface Scenario {
  birthdate?: string;
  closeDates?: string[];
}

function tables({ birthdate, closeDates = [] }: Scenario): Record<string, Row[]> {
  return {
    clients: [{
      id: CLIENT, user_id: USER, archived_at: null,
      name: "Sam Lee", first_name: "Sam", last_name: "Lee",
      city: "Saint John", province_region: "NB", birthdate: birthdate ?? null,
      communication_tone: "friendly",
      first_contacted_at: null, last_contact_at: null,
      created_at: "2020-01-15T15:00:00+00:00",
      tags: [], notes: null, status: "cruising", timeframe: null,
      property_interest: null, property_interest_type: null,
      scheduled_for: null, scheduled_phrase: null, email_opt_out_at: null,
    }],
    user_settings: [{ user_id: USER, display_name: "Andrew Shaw", email_signature: "", ai_voice_guide: null }],
    client_records: closeDates.map((close_date, i) => ({
      id: `rec-${i + 1}`, user_id: USER, client_id: CLIENT,
      address: `${i + 1} Elm St`, close_date, gci: 9000, side: "buyer",
      property_use: "primary_residence", condition_date: null, condition_status: "firmed",
    })),
    client_memory_profiles: [],
    client_record_co_parties: [],
    outreach_queue: [],
    flight_control_dismissals: [],
  };
}

/** [trigger_date, anniversary_year] of each Scan card of one type. */
async function scan(type: string, s: Scenario): Promise<unknown[][]> {
  const { client } = fakeSupabase(tables(s));
  return (await getTopOpportunities(USER, client))
    .filter((o) => o.opportunity_type === type)
    .map((o) => [o.trigger_date, (o.context as Row).anniversary_year ?? null]);
}

/** The same, for each row the nightly run sends to the upsert. The pin is the Draft button. */
async function nightly(type: string, s: Scenario, trigger_date: string): Promise<unknown[][]> {
  const { client, writes } = fakeSupabase(tables(s));
  const pin: OpportunityPin = { client_id: CLIENT, opportunity_type: type, trigger_date };
  await detectAndDraftForUser(USER, client, { pin });
  const upsert = writes.find((w) => w.table === "outreach_queue" && w.op === "upsert");
  return ((upsert?.payload as Row[] | undefined) ?? [])
    .filter((r) => r.opportunity_type === type)
    .map((r) => [r.trigger_date, (r.context as Row).anniversary_year ?? null]);
}

let savedKeys: Record<string, string | undefined>;

beforeAll(() => {
  vi.stubEnv("TZ", "UTC");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(DEC25_NOON));
  savedKeys = { a: process.env.ANTHROPIC_API_KEY, g: process.env.GROQ_API_KEY };
  // No AI key: detect and queue only, no drafting calls.
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

// ── Closing anniversary: close date + N years ────────────────────────────────

describe("closing anniversary on Jan 5, seen from Dec 25", () => {
  const ANNIV = "closing_anniversary";
  const YEARS: [number, string][] = [
    [1, "2026-01-05"],
    [2, "2025-01-05"],
    [3, "2024-01-05"],
    [5, "2022-01-05"],
    [10, "2017-01-05"],
  ];

  it.each(YEARS)("Scan shows year %i", async (yr, closeDate) => {
    expect(await scan(ANNIV, { closeDates: [closeDate] })).toEqual([["2027-01-05", yr]]);
  });

  // A second purchase in March keeps the client inside the two-year CASL
  // window. Without it the nightly run leaves years 2 and up as a call card
  // (lib/crm/outreach-consent.ts), which is not what is under test here.
  it.each(YEARS)("the nightly run queues year %i", async (yr, closeDate) => {
    const closeDates = yr === 1 ? [closeDate] : [closeDate, "2026-03-10"];
    expect(await nightly(ANNIV, { closeDates }, "2027-01-05")).toEqual([["2027-01-05", yr]]);
  });

  it("the window opens 14 days ahead, on Dec 22", async () => {
    const s: Scenario = { closeDates: ["2026-01-05"] };
    vi.setSystemTime(new Date("2026-12-21T16:00:00Z"));
    expect(await nightly(ANNIV, s, "2027-01-05")).toEqual([]);
    vi.setSystemTime(new Date("2026-12-22T16:00:00Z"));
    expect(await nightly(ANNIV, s, "2027-01-05")).toEqual([["2027-01-05", 1]]);
  });
});

// ── Birthday: the next one ───────────────────────────────────────────────────

describe("birthday on Jan 5, seen from Dec 25", () => {
  const BIRTHDAY = "birthday";
  const s: Scenario = { birthdate: "1985-01-05" };

  it("Scan shows it for Jan 5 next year", async () => {
    expect(await scan(BIRTHDAY, s)).toEqual([["2027-01-05", null]]);
  });

  it("the nightly run queues it for Jan 5 next year", async () => {
    expect(await nightly(BIRTHDAY, s, "2027-01-05")).toEqual([["2027-01-05", null]]);
  });
});
