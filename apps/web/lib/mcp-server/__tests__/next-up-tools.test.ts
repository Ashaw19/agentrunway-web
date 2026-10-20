/**
 * The MCP Next up tools (supabase/functions/mcp-server/tools/next-up.ts), run
 * for real under the tool harness:
 *   - get_next_up reads the web app's /api/next-up?persist=0&draft=0 with the
 *     caller's own token (fetch is stubbed), the payload the phone and Flight
 *     Crew read, and writes nothing;
 *   - skip_suggested_client saves a skip on the occurrence that payload shows;
 *   - snooze_suggested_client and stop_suggesting_client save a Later or a
 *     Stop, or move the client to the Hangar, through core record-writers
 *     (the Deno copy, aliased to packages/core under vitest).
 * Synthetic rows only.
 */
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { HandfulItem, NextUpPayload } from "@agent-runway/core/lib/next-up/types";
import { laterUntil, stopUntil } from "@agent-runway/core/lib/suggestion-dismissals";
import { MCP_TOOLS_DIR } from "./registry-source";
import { fakeSupabase, type FakeSupabase, type Row } from "./tool-harness";

interface Tool {
  name: string;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
  handler: (args: unknown) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>;
}
type Factory = (db: unknown, userId: string, token: string) => Tool[];

const USER = "00000000-0000-4000-8000-0000000000aa";
const SAM = "00000000-0000-4000-8000-000000000001";
const PAT = "00000000-0000-4000-8000-000000000002";
const LEE = "00000000-0000-4000-8000-000000000003";

// 12:00 Atlantic (ADT, UTC-3) on Monday 2026-10-19.
const NOW = new Date("2026-10-19T15:00:00Z");

async function load(db: FakeSupabase): Promise<Tool[]> {
  // A computed path, so tsc doesn't follow the Deno file (see tool-harness.ts).
  const mod = (await import(/* @vite-ignore */ path.join(MCP_TOOLS_DIR, "next-up.ts"))) as { getNextUpTools: Factory };
  return mod.getNextUpTools(db.client, USER, "caller-token");
}

const call = async (tools: Tool[], name: string, args: Record<string, unknown> = {}) => {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`${name} is not registered`);
  return tool.handler(args);
};

const item = (over: Partial<HandfulItem> = {}): HandfulItem => ({
  client_id:        SAM,
  client_name:      "Sam Lee",
  opportunity_type: "idle_client",
  trigger_date:     "2026-10-19",
  label:            "No contact in 6 months",
  why_now:          "Last talked in April.",
  contact_channel:  "call",
  phone:            "5065550101",
  text:             { status: "ready", queue_id: "q1", body: "Hi Sam" },
  ...over,
});

const payload = (over: Partial<NextUpPayload> = {}): NextUpPayload => ({
  day:          "2026-10-19",
  target:       5,
  done_today:   1,
  generated_at: NOW.toISOString(),
  handful:      [item()],
  snoozed:      [{ client_id: LEE, client_name: "Lee Roy", until: "2026-10-20T11:00:00.000Z", phone: null }],
  urgent:       { new_leads: 0, overdue_tasks: 3, deal_deadlines: 1 },
  ...over,
});

const seed = () => fakeSupabase({
  clients: [
    { id: SAM, user_id: USER, name: "Sam Lee", archived_at: null, archive_reason: null },
    { id: PAT, user_id: USER, name: "Pat Kim", archived_at: null, archive_reason: null },
    { id: LEE, user_id: USER, name: "Lee Roy", archived_at: "2026-09-01T12:00:00Z", archive_reason: "moved_away" },
  ] as Row[],
  flight_control_dismissals: [],
});

const fetchMock = vi.fn();
const respond = (body: unknown, status = 200) =>
  fetchMock.mockImplementation(async () => new Response(JSON.stringify(body), { status }));

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  vi.stubGlobal("Deno", { env: { get: () => undefined } });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("get_next_up", () => {
  it("is read-only and reads /api/next-up with persist and drafting off, as the caller", async () => {
    respond(payload());
    const db = seed();
    const tools = await load(db);
    expect(tools.find((t) => t.name === "get_next_up")?.annotations?.readOnlyHint).toBe(true);

    const out = await call(tools, "get_next_up");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://agentrunway.ca/api/next-up?persist=0&draft=0");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer caller-token");

    const json = JSON.parse(out.content[0].text);
    expect(json).toMatchObject({ day: "2026-10-19", done_today: 1, target: 5, urgent: { new_leads: 0, overdue_tasks: 3, deal_deadlines: 1 } });
    expect(json.handful).toEqual([
      { client: { id: SAM, name: "Sam Lee" }, reason: "No contact in 6 months", why_now: "Last talked in April.", channel: expect.stringMatching(/^text/) },
    ]);
    expect(json.on_later).toEqual([{ client: { id: LEE, name: "Lee Roy" }, until: expect.stringMatching(/^8:00\sa\.m\. tomorrow$/) }]);
    expect(db.writes).toEqual([]);
  });

  it("follows AGENT_RUNWAY_APP_URL", async () => {
    vi.stubGlobal("Deno", { env: { get: (k: string) => (k === "AGENT_RUNWAY_APP_URL" ? "https://preview.example.test/" : undefined) } });
    respond(payload());
    await call(await load(seed()), "get_next_up");
    expect(fetchMock.mock.calls[0][0]).toBe("https://preview.example.test/api/next-up?persist=0&draft=0");
  });

  it("passes on the web app's refusal", async () => {
    respond({ error: "Pro required", code: "SUBSCRIPTION_REQUIRED" }, 403);
    const out = await call(await load(seed()), "get_next_up");
    expect(out.isError).toBe(true);
    expect(out.content[0].text).toMatch(/Pro required/);
  });
});

describe("skip_suggested_client", () => {
  it("is a write tool, not destructive, and saves the payload's occurrence", async () => {
    respond(payload());
    const db = seed();
    const tools = await load(db);
    expect(tools.find((t) => t.name === "skip_suggested_client")?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });

    const out = await call(tools, "skip_suggested_client", { client_id: SAM });
    expect(out.isError).toBeFalsy();
    expect(fetchMock.mock.calls[0][0]).toBe("https://agentrunway.ca/api/next-up?persist=0&draft=0");
    const skips = db.writesTo("flight_control_dismissals");
    expect(skips).toHaveLength(1);
    expect(skips[0].op).toBe("insert");
    expect(skips[0].rows[0]).toMatchObject({
      user_id: USER, client_id: SAM, opportunity_type: "idle_client", trigger_date: "2026-10-19", kind: "skip",
    });
    expect(db.writes).toHaveLength(1);
    expect(out.content[0].text).toMatch(/Skipped Sam Lee this time/);
  });

  it("refuses a client outside today's handful and writes nothing", async () => {
    respond(payload());
    const db = seed();
    const out = await call(await load(db), "skip_suggested_client", { client_id: PAT });
    expect(out.isError).toBe(true);
    expect(out.content[0].text).toBe("Pat Kim isn't in today's suggestions.");
    expect(db.writes).toEqual([]);
  });

  it("refuses an id that isn't an id", async () => {
    const db = seed();
    const out = await call(await load(db), "skip_suggested_client", { client_id: "sam" });
    expect(out.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.writes).toEqual([]);
  });
});

describe("snooze_suggested_client", () => {
  it("'tonight' saves a Later until laterUntil('tonight', now)", async () => {
    const db = seed();
    const tools = await load(db);
    expect(tools.find((t) => t.name === "snooze_suggested_client")?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    const out = await call(tools, "snooze_suggested_client", { client_id: PAT, until: "tonight" });
    expect(out.isError).toBeFalsy();
    const holds = db.writesTo("flight_control_dismissals");
    expect(holds).toHaveLength(1);
    expect(holds[0]).toMatchObject({ op: "upsert", onConflict: "user_id,client_id,opportunity_type,trigger_date" });
    expect(holds[0].rows[0]).toMatchObject({
      client_id: PAT, kind: "later", opportunity_type: "any", trigger_date: "2026-10-19",
      until: laterUntil("tonight", NOW).toISOString(),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a client in the Hangar", async () => {
    const db = seed();
    const out = await call(await load(db), "snooze_suggested_client", { client_id: LEE, until: "tomorrow" });
    expect(out.isError).toBe(true);
    expect(out.content[0].text).toMatch(/Lee Roy is in the Hangar/);
    expect(db.writes).toEqual([]);
  });
});

describe("stop_suggesting_client", () => {
  it("is flagged destructive (it can move a client to the Hangar)", async () => {
    const tools = await load(seed());
    expect(tools.find((t) => t.name === "stop_suggesting_client")?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });

  it("6_months saves a Stop until stopUntil('6_months', now)", async () => {
    const db = seed();
    await call(await load(db), "stop_suggesting_client", { client_id: SAM, duration: "6_months" });
    expect(db.writesTo("flight_control_dismissals")[0].rows[0]).toMatchObject({
      client_id: SAM, kind: "stop", until: stopUntil("6_months", NOW).toISOString(),
    });
  });

  it("hangar archives the client", async () => {
    const db = seed();
    const out = await call(await load(db), "stop_suggesting_client", { client_id: SAM, duration: "hangar" });
    expect(out.content[0].text).toMatch(/Sam Lee moved to the Hangar/);
    const update = db.writesTo("clients");
    expect(update).toHaveLength(1);
    expect(update[0].rows[0]).toMatchObject({ archive_reason: "other", archived_at: expect.any(String) });
    expect(db.tables.clients.find((c) => c.id === SAM)?.archived_at).toEqual(expect.any(String));
  });
});
