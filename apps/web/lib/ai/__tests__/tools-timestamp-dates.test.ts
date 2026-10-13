/**
 * Flight Crew tools print a timestamp on its Atlantic day (2026-10-13).
 *
 * last_contact_at, created_at, activity_date and archived_at are timestamptz.
 * The tools printed them with `new Date(ts).toLocaleDateString("en-CA")`,
 * which is the runtime's date. Vercel runs in UTC, so a call logged at 9 pm
 * Atlantic was reported to the AI as made tomorrow, and one on Dec 31
 * evening as made next year.
 *
 * The suite runs with TZ=UTC, the server's zone, so it fails on any machine
 * if a tool goes back to the runtime's date.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createAgentTools } from "../tools";
import { fakeSupabase, type Row } from "./helpers/fake-supabase";

const USER = "user-1";
const SAM = "00000000-0000-4000-8000-000000000001";
const LEE = "00000000-0000-4000-8000-000000000002";

const OCT9_EVENING = "2026-10-10T01:00:00+00:00"; // Oct 9, 22:00 ADT
const DEC31_EVENING = "2027-01-01T02:00:00+00:00"; // Dec 31 2026, 22:00 AST
const AUG3_EVENING = "2026-08-04T00:30:00+00:00"; // Aug 3, 21:30 ADT

const TABLES: Record<string, Row[]> = {
  clients: [
    {
      id: SAM, user_id: USER, name: "Sam Lee", status: "boarding", tags: ["VIP"],
      communication_tone: "friendly", archived_at: null, archive_reason: null,
      email: null, phone: null, city: null, notes: null,
      last_contact_at: OCT9_EVENING, created_at: AUG3_EVENING,
    },
    {
      id: LEE, user_id: USER, name: "Lee Archer", status: "cruising", tags: [],
      communication_tone: "friendly", archived_at: DEC31_EVENING, archive_reason: "moved away",
      email: null, phone: null, last_contact_at: null, created_at: AUG3_EVENING,
    },
  ],
  contact_activities: [
    { id: "a1", user_id: USER, client_id: SAM, type: "call", description: "Evening call", activity_date: OCT9_EVENING },
    { id: "a2", user_id: USER, client_id: SAM, type: "text", description: "New Year's Eve text", activity_date: DEC31_EVENING },
  ],
  contact_tasks: [],
  pipeline_deals: [],
  client_relationships: [],
  transactions: [],
};

type Execute = (input: Record<string, unknown>, opts: unknown) => Promise<string>;

function run(tool: string, input: Record<string, unknown>): Promise<string> {
  const { client } = fakeSupabase(TABLES);
  const tools = createAgentTools(client, USER);
  return (tools[tool].execute as Execute)(input, { toolCallId: "t", messages: [] });
}

beforeAll(() => {
  vi.stubEnv("TZ", "UTC");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("Flight Crew tools: timestamps read on the Atlantic day", () => {
  it("runs in the server's zone", () => {
    expect(new Date(OCT9_EVENING).getDate()).toBe(10);
  });

  it("searchClients: last contact", async () => {
    const out = await run("searchClients", { query: "Sam" });
    expect(out).toContain("Last contact: 2026-10-09");
  });

  it("getClientSummary: client since, last contact and recent activity", async () => {
    const out = await run("getClientSummary", { clientId: SAM, clientName: "Sam Lee" });
    expect(out).toContain("Since: 2026-08-03");
    expect(out).toContain("Last Contact: 2026-10-09");
    expect(out).toContain("call on 2026-10-09 — Evening call");
    expect(out).toContain("text on 2026-12-31 — New Year's Eve text");
  });

  it("searchClientsByFilter: last contact", async () => {
    const out = await run("searchClientsByFilter", { tag: "VIP" });
    expect(out).toContain("last contact: 2026-10-09");
  });

  it("searchActivities: activity date", async () => {
    const out = await run("searchActivities", { clientId: SAM });
    expect(out).toContain("• 2026-10-09 — call");
    expect(out).toContain("• 2026-12-31 — text");
  });

  it("searchArchivedClients: archived date", async () => {
    const out = await run("searchArchivedClients", {});
    expect(out).toContain("archived 2026-12-31");
  });
});
