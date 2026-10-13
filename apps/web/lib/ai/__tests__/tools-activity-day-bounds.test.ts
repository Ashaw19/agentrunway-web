/**
 * Flight Crew tools filter a timestamp to an Atlantic day (2026-10-13).
 *
 * contact_activities.activity_date and pipeline_deals.created_at are
 * timestamptz. The tools bounded them with `${date}T00:00:00` and
 * `${date}T23:59:59`, which Postgres reads as UTC. "What did I do on Oct 9"
 * then missed everything logged from 9 pm that evening and picked up the
 * evening of Oct 8, and a month's summary took the last evening of the
 * month before and dropped its own.
 *
 * The fake database compares timestamps the way Postgres does, a bare one
 * read as UTC. Runs with TZ=UTC, the server's zone.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createAgentTools } from "../tools";
import { fakeSupabase, type Row } from "./helpers/fake-supabase";

const USER = "user-1";
const SAM = "00000000-0000-4000-8000-000000000001";

const OCT8_10PM_ADT = "2026-10-09T01:00:00+00:00"; // Thu Oct 8, 22:00 ADT
const OCT9_10AM_ADT = "2026-10-09T13:00:00+00:00"; // Fri Oct 9, 10:00 ADT
const OCT9_10PM_ADT = "2026-10-10T01:00:00+00:00"; // Fri Oct 9, 22:00 ADT
const DEC31_10PM_AST = "2027-01-01T02:00:00+00:00"; // Thu Dec 31, 22:00 AST

const SEP30_10PM_ADT = "2026-10-01T01:00:00+00:00"; // Wed Sep 30, 22:00 ADT
const OCT15_NOON_ADT = "2026-10-15T15:00:00+00:00";
const OCT31_11PM_ADT = "2026-11-01T02:00:00+00:00"; // Sat Oct 31, 23:00 ADT

const activity = (id: string, type: string, description: string, activity_date: string): Row =>
  ({ id, user_id: USER, client_id: SAM, type, description, activity_date, clients: { name: "Sam Lee" } });

type Execute = (input: Record<string, unknown>, opts: unknown) => Promise<string>;

function run(tables: Record<string, Row[]>, tool: string, input: Record<string, unknown>): Promise<string> {
  const { client } = fakeSupabase(tables);
  const tools = createAgentTools(client, USER);
  return (tools[tool].execute as Execute)(input, { toolCallId: "t", messages: [] });
}

beforeAll(() => {
  vi.stubEnv("TZ", "UTC");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.useRealTimers();
});

it("runs in the server's zone", () => {
  expect(new Date(OCT9_10PM_ADT).getDate()).toBe(10);
});

describe("searchActivities: a date means the Atlantic day", () => {
  const TABLES = {
    contact_activities: [
      activity("a0", "call", "Call the evening before", OCT8_10PM_ADT),
      activity("a1", "showing", "Morning showing", OCT9_10AM_ADT),
      activity("a2", "call", "Evening call", OCT9_10PM_ADT),
      activity("a3", "text", "New Year's Eve text", DEC31_10PM_AST),
    ],
  };
  const search = (input: Record<string, unknown>) => run(TABLES, "searchActivities", input);

  it("Oct 9 has the 10 pm call and not the one from the evening of Oct 8", async () => {
    const out = await search({ startDate: "2026-10-09", endDate: "2026-10-09" });
    expect(out).toContain("Found 2 activities");
    expect(out).toContain("Morning showing");
    expect(out).toContain("Evening call");
    expect(out).not.toContain("Call the evening before");
  });

  it("Oct 8 has its own evening call", async () => {
    const out = await search({ startDate: "2026-10-08", endDate: "2026-10-08" });
    expect(out).toContain("Found 1 activity");
    expect(out).toContain("Call the evening before");
  });

  it("Dec 31 has the 10 pm text; Jan 1 does not", async () => {
    expect(await search({ startDate: "2026-12-31", endDate: "2026-12-31" })).toContain("New Year's Eve text");
    expect(await search({ startDate: "2027-01-01", endDate: "2027-01-01" })).toBe("No activities found matching your criteria.");
  });

  it("a start date alone leaves out the evening before it", async () => {
    const out = await search({ startDate: "2026-10-10" });
    expect(out).not.toContain("Evening call");
    expect(out).toContain("New Year's Eve text");
  });

  it("an end date alone keeps that day's evening", async () => {
    const out = await search({ endDate: "2026-10-08" });
    expect(out).toContain("Found 1 activity");
    expect(out).toContain("Call the evening before");
  });

  it("asks for YYYY-MM-DD when a date can't be read", async () => {
    expect(await search({ startDate: "last Friday" })).toBe(
      "Dates must be YYYY-MM-DD. Got startDate \"last Friday\".",
    );
    expect(await search({ endDate: "2026-02-30" })).toBe(
      "Dates must be YYYY-MM-DD. Got endDate \"2026-02-30\".",
    );
  });
});

describe("performance tools: a month is the Atlantic month", () => {
  const TABLES = {
    contact_activities: [
      activity("p0", "call", "Last evening of September", SEP30_10PM_ADT),
      activity("p1", "meeting", "Mid October", OCT15_NOON_ADT),
      activity("p2", "text", "Last evening of October", OCT31_11PM_ADT),
    ],
    pipeline_deals: [
      { id: "d0", user_id: USER, stage: "lead", estimated_price: 500_000, created_at: SEP30_10PM_ADT },
      { id: "d1", user_id: USER, stage: "lead", estimated_price: 300_000, created_at: OCT31_11PM_ADT },
    ],
  };

  const onNov2 = () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-02T16:00:00Z")); // Mon Nov 2, 12:00 AST
  };

  it("getPerformanceSummary: October counts Oct 31 at 11 pm, not Sep 30 at 10 pm", async () => {
    onNov2();
    const out = await run(TABLES, "getPerformanceSummary", { period: "month", offset: 1 });
    expect(out).toContain("(2026-10-01 to 2026-10-31)");
    expect(out).toContain("**Activities**: 2 total");
    expect(out).toContain("1 meeting");
    expect(out).toContain("1 text");
    expect(out).not.toContain("1 call");
    expect(out).toContain("**New Pipeline Deals**: 1 added — $300000.00 total value");
  });

  it("comparePerformance: October has two activities and September one", async () => {
    onNov2();
    const out = await run(TABLES, "comparePerformance", { period: "month", periodAOffset: 1, periodBOffset: 2 });
    expect(out).toContain("| Activities | 2 | 1 |");
  });
});
