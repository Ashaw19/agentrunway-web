/**
 * New-client welcome and contact anniversary key off the Atlantic day of the
 * first contact (2026-10-13).
 *
 * clients.first_contacted_at is a timestamptz. Both detectors cut it with
 * `.slice(0, 10)`, the UTC date, so a first contact logged from 9 pm
 * Atlantic (8 pm in winter) got a welcome and an anniversary one day late,
 * and one logged on Dec 31 evening got no anniversary card in December at
 * all: its start year read as the next one.
 *
 * Moving the day moves trigger_date, and outreach_queue is unique on
 * (user, client, type, trigger_date). A client who already has a row or a
 * dismissal under the old date must stay on it, or the nightly run drafts
 * the same occasion a second time. These tests pin both halves.
 *
 * Scan (getTopOpportunities) and the nightly drafter (detectAndDraftForUser)
 * are tested together: the Draft button pins Scan's card by trigger_date, so
 * the two must compute the same one.
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
import type { SupabaseClient } from "@supabase/supabase-js";
import { fakeSupabase, type Row } from "./helpers/fake-supabase";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const USER = "user-1";
const CLIENT = "client-1";

const OCT9_10PM_ADT = "2026-10-10T01:00:00+00:00"; // Fri Oct 9 2026, 22:00 ADT
const OCT9_NOON_ADT = "2026-10-09T15:00:00+00:00"; // Fri Oct 9 2026, 12:00 ADT
const NOV1_2025_1030PM_ADT = "2025-11-02T01:30:00+00:00"; // Sat Nov 1 2025, 22:30 ADT
const DEC31_2025_10PM_AST = "2026-01-01T02:00:00+00:00"; // Wed Dec 31 2025, 22:00 AST
const JAN5_2026_11AM_AST = "2026-01-05T15:00:00+00:00"; // Mon Jan 5 2026, 11:00 AST

const OCT25_NOON = "2026-10-25T15:00:00Z"; // Sun Oct 25 2026, 12:00 ADT
const DEC20_NOON = "2026-12-20T16:00:00Z"; // Sun Dec 20 2026, 12:00 AST
const DEC25_NOON = "2026-12-25T16:00:00Z"; // Fri Dec 25 2026, 12:00 AST

interface Scenario {
  firstContactedAt: string;
  /** A year-old active lead gets a "going quiet" call card instead, and Scan shows one card per client. */
  status?: "boarding" | "cruising";
  queue?: Row[];
  dismissals?: Row[];
}

function tables({ firstContactedAt, status = "boarding", queue = [], dismissals = [] }: Scenario): Record<string, Row[]> {
  return {
    clients: [{
      id: CLIENT, user_id: USER, archived_at: null,
      name: "Sam Lee", first_name: "Sam", last_name: "Lee",
      city: "Saint John", province_region: "NB", birthdate: null,
      communication_tone: "friendly",
      first_contacted_at: firstContactedAt, last_contact_at: firstContactedAt,
      created_at: firstContactedAt,
      tags: [], notes: null, status, timeframe: null,
      property_interest: null, property_interest_type: null,
      scheduled_for: null, scheduled_phrase: null, email_opt_out_at: null,
    }],
    user_settings: [{ user_id: USER, display_name: "Andrew Shaw", email_signature: "", ai_voice_guide: null }],
    client_records: [],
    client_memory_profiles: [],
    client_record_co_parties: [],
    outreach_queue: queue,
    flight_control_dismissals: dismissals,
  };
}

function queued(opportunity_type: string, trigger_date: string, status: string, sent_at: string | null = null): Row {
  return {
    id: `q-${opportunity_type}-${trigger_date}`, user_id: USER, client_id: CLIENT,
    opportunity_type, trigger_date, status, sent_at, ai_subject: "Welcome", context: {},
  };
}

function dismissed(opportunity_type: string, trigger_date: string): Row {
  return { user_id: USER, client_id: CLIENT, opportunity_type, trigger_date };
}

/** trigger_date of each Scan card of one type. */
async function scanDates(type: string, s: Scenario): Promise<string[]> {
  const { client } = fakeSupabase(tables(s));
  return (await getTopOpportunities(USER, client))
    .filter((o) => o.opportunity_type === type)
    .map((o) => o.trigger_date);
}

/**
 * trigger_date of each row of one type the nightly run sends to the upsert.
 * The pin is the Draft button: it carries the card past the score bar, the
 * way a click in Scan does.
 */
async function nightlyDates(type: string, s: Scenario, pin?: OpportunityPin): Promise<string[]> {
  const { client, writes } = fakeSupabase(tables(s));
  await detectAndDraftForUser(USER, client, { pin });
  const upsert = writes.find((w) => w.table === "outreach_queue" && w.op === "upsert");
  return ((upsert?.payload as Row[] | undefined) ?? [])
    .filter((r) => r.opportunity_type === type)
    .map((r) => String(r.trigger_date));
}

const pinFor = (opportunity_type: string, trigger_date: string): OpportunityPin =>
  ({ client_id: CLIENT, opportunity_type, trigger_date });

let savedKeys: Record<string, string | undefined>;

beforeAll(() => {
  vi.stubEnv("TZ", "UTC");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(OCT25_NOON));
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

it("runs in the server's zone", () => {
  expect(new Date(OCT9_10PM_ADT).getDate()).toBe(10);
});

// ── New client welcome: first contact + 7 days ───────────────────────────────

describe("new client welcome — first contact on Oct 9 at 10 pm Atlantic", () => {
  const WELCOME = "new_client_welcome";
  const evening: Scenario = { firstContactedAt: OCT9_10PM_ADT };

  it("Scan dates it a week after Oct 9, not after the UTC date (Oct 10)", async () => {
    expect(await scanDates(WELCOME, evening)).toEqual(["2026-10-16"]);
  });

  it("the nightly run queues the same date Scan shows", async () => {
    expect(await nightlyDates(WELCOME, evening, pinFor(WELCOME, "2026-10-16"))).toEqual(["2026-10-16"]);
  });

  it("a daytime first contact keeps the date it always had", async () => {
    const daytime: Scenario = { firstContactedAt: OCT9_NOON_ADT };
    expect(await scanDates(WELCOME, daytime)).toEqual(["2026-10-16"]);
    expect(await nightlyDates(WELCOME, daytime, pinFor(WELCOME, "2026-10-16"))).toEqual(["2026-10-16"]);
  });

  // Rows written before the fix sit under the UTC date, Oct 17.
  describe.each([
    ["a draft awaiting review", queued(WELCOME, "2026-10-17", "ready")],
    ["a welcome already sent", queued(WELCOME, "2026-10-17", "sent", "2026-10-10T14:00:00+00:00")],
    ["a welcome the agent skipped", queued(WELCOME, "2026-10-17", "skipped")],
  ])("with %s under the old date", (_label, row) => {
    const s: Scenario = { ...evening, queue: [row] };

    it("the nightly run stays on the old date, so the unique key ignores it", async () => {
      const dates = await nightlyDates(WELCOME, s, pinFor(WELCOME, "2026-10-17"));
      expect(dates).not.toContain("2026-10-16");
      expect(dates).toEqual(["2026-10-17"]);
    });

    it("Scan shows the card under the old date", async () => {
      expect(await scanDates(WELCOME, s)).toEqual(["2026-10-17"]);
    });
  });

  it("the Draft button on that card finds the existing draft", async () => {
    const s: Scenario = { ...evening, queue: [queued(WELCOME, "2026-10-17", "ready")] };
    const [shown] = await scanDates(WELCOME, s);
    const { client } = fakeSupabase(tables(s));
    const result = await detectAndDraftForUser(USER, client, { pin: pinFor(WELCOME, shown) });
    expect(result.pinned).toBe(true);
  });

  it("a card dismissed under the old date stays dismissed", async () => {
    const s: Scenario = { ...evening, dismissals: [dismissed(WELCOME, "2026-10-17")] };
    expect(await scanDates(WELCOME, s)).toEqual([]);
    expect(await nightlyDates(WELCOME, s, pinFor(WELCOME, "2026-10-16"))).toEqual([]);
    expect(await nightlyDates(WELCOME, s, pinFor(WELCOME, "2026-10-17"))).toEqual([]);
  });

  it("a row under the new date is not moved by a stray one under the old", async () => {
    const s: Scenario = {
      ...evening,
      queue: [queued(WELCOME, "2026-10-16", "ready"), queued(WELCOME, "2026-10-17", "skipped")],
    };
    expect(await scanDates(WELCOME, s)).toEqual(["2026-10-16"]);
  });
});

// ── Contact anniversary: first contact + N years ─────────────────────────────

describe("contact anniversary — first contact on Nov 1 2025 at 10:30 pm Atlantic", () => {
  const ANNIV = "contact_anniversary";
  const evening: Scenario = { firstContactedAt: NOV1_2025_1030PM_ADT, status: "cruising" };

  it("Scan dates the first anniversary Nov 1, not the UTC date (Nov 2)", async () => {
    expect(await scanDates(ANNIV, evening)).toEqual(["2026-11-01"]);
  });

  it("the nightly run queues the same date Scan shows", async () => {
    expect(await nightlyDates(ANNIV, evening, pinFor(ANNIV, "2026-11-01"))).toEqual(["2026-11-01"]);
  });

  it("stays on the old date when a draft already exists under it", async () => {
    const s: Scenario = { ...evening, queue: [queued(ANNIV, "2026-11-02", "ready")] };
    expect(await scanDates(ANNIV, s)).toEqual(["2026-11-02"]);
    expect(await nightlyDates(ANNIV, s, pinFor(ANNIV, "2026-11-02"))).toEqual(["2026-11-02"]);
  });

  it("stays dismissed when the card was dismissed under the old date", async () => {
    const s: Scenario = { ...evening, dismissals: [dismissed(ANNIV, "2026-11-02")] };
    expect(await scanDates(ANNIV, s)).toEqual([]);
    expect(await nightlyDates(ANNIV, s, pinFor(ANNIV, "2026-11-01"))).toEqual([]);
  });
});

describe("contact anniversary — first contact on Dec 31 2025 at 10 pm Atlantic", () => {
  const ANNIV = "contact_anniversary";
  const newYearsEve: Scenario = { firstContactedAt: DEC31_2025_10PM_AST, status: "cruising" };

  beforeEach(() => {
    vi.setSystemTime(new Date(DEC20_NOON));
  });

  // The UTC date is Jan 1 2026, so in December the client read as zero years
  // in and the anniversary was never looked for.
  it("Scan shows the first anniversary on Dec 31 2026", async () => {
    expect(await scanDates(ANNIV, newYearsEve)).toEqual(["2026-12-31"]);
  });

  it("the nightly run queues it for Dec 31 2026", async () => {
    expect(await nightlyDates(ANNIV, newYearsEve, pinFor(ANNIV, "2026-12-31"))).toEqual(["2026-12-31"]);
  });
});

describe("contact anniversary — first contact on Jan 5 2026, seen from Dec 25", () => {
  const ANNIV = "contact_anniversary";
  const earlyJanuary: Scenario = { firstContactedAt: JAN5_2026_11AM_AST, status: "cruising" };

  beforeEach(() => {
    vi.setSystemTime(new Date(DEC25_NOON));
  });

  // The first anniversary is 11 days out, in the next calendar year. Counted
  // as this year minus the first-contact year the client was zero years in
  // until Jan 1, so the card missed the first ten days of its window.
  it("Scan shows the first anniversary on Jan 5 2027", async () => {
    expect(await scanDates(ANNIV, earlyJanuary)).toEqual(["2027-01-05"]);
  });

  it("the nightly run queues it for Jan 5 2027, as year 1", async () => {
    const { client, writes } = fakeSupabase(tables(earlyJanuary));
    await detectAndDraftForUser(USER, client, { pin: pinFor(ANNIV, "2027-01-05") });
    const upsert = writes.find((w) => w.table === "outreach_queue" && w.op === "upsert");
    const rows = ((upsert?.payload as Row[] | undefined) ?? []).filter((r) => r.opportunity_type === ANNIV);
    expect(rows.map((r) => [r.trigger_date, (r.context as Row).anniversary_year])).toEqual([["2027-01-05", 1]]);
  });
});

// ── The rows on file can't be read ───────────────────────────────────────────

describe("when the occurrences already on file can't be read", () => {
  const WELCOME = "new_client_welcome";
  const s: Scenario = { firstContactedAt: OCT9_10PM_ADT, queue: [queued(WELCOME, "2026-10-17", "ready")] };

  /** The same fake, with the first-contact occurrences query failing. */
  function withFailingOccurrences(client: SupabaseClient): SupabaseClient {
    type Builder = {
      in: (k: string, vs: readonly unknown[]) => Builder;
      then: (resolve: (v: unknown) => unknown) => Promise<unknown>;
    };
    const from = (table: string) => {
      const builder = (client.from as unknown as (t: string) => Builder)(table);
      if (table !== "outreach_queue") return builder;
      const realIn = builder.in;
      builder.in = (k, vs) => {
        if (k === "opportunity_type") {
          builder.then = (resolve) =>
            Promise.resolve({ data: null, error: { message: "statement timeout" } }).then(resolve);
        }
        return realIn(k, vs);
      };
      return builder;
    };
    return { from } as unknown as SupabaseClient;
  }

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  // Dated blind, the welcome would land on Oct 16 beside the Oct 17 draft.
  it("the nightly run queues no welcome rather than risk a second draft", async () => {
    const { client, writes } = fakeSupabase(tables(s));
    await detectAndDraftForUser(USER, withFailingOccurrences(client), { pin: pinFor(WELCOME, "2026-10-16") });
    const upsert = writes.find((w) => w.table === "outreach_queue" && w.op === "upsert");
    expect(((upsert?.payload as Row[] | undefined) ?? []).filter((r) => r.opportunity_type === WELCOME)).toEqual([]);
    expect(console.error).toHaveBeenCalledWith(
      "[detect-opportunities] first-contact occurrences fetch failed:", "statement timeout",
    );
  });

  it("Scan shows no welcome card", async () => {
    const { client } = fakeSupabase(tables(s));
    const cards = await getTopOpportunities(USER, withFailingOccurrences(client));
    expect(cards.filter((o) => o.opportunity_type === WELCOME)).toEqual([]);
  });
});
