/**
 * Flight Crew's Next up tools (lib/ai/tools.ts):
 *   - getNextUp (read; Captain and Dispatcher) relays today's handful from
 *     buildNextUpPayload(persist: false), the payload the phone and the MCP
 *     server read, and writes nothing;
 *   - skipSuggestedClient, snoozeSuggestedClient and stopSuggestingClient
 *     (Dispatcher, behind the approval card) write through core
 *     record-writers: a skip on the handful's own occurrence, a Later until
 *     laterUntil, a Stop until stopUntil, the Hangar through
 *     writeClientToHangar.
 * buildNextUpPayload is stubbed; the database is the MCP tool harness's
 * in-memory client (lib/mcp-server/__tests__/tool-harness.ts), which applies
 * filters, upserts on the conflict key and returns an update's rows, as the
 * Hangar writer needs. Synthetic rows only.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { HandfulItem, NextUpPayload } from "@agent-runway/core/lib/next-up/types";
import { laterUntil, stopUntil } from "@agent-runway/core/lib/suggestion-dismissals";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fakeSupabase, type Row } from "../../mcp-server/__tests__/tool-harness";

vi.mock("@/lib/crm/next-up-payload", () => ({ buildNextUpPayload: vi.fn() }));

import { buildNextUpPayload } from "@/lib/crm/next-up-payload";
import {
  APPROVAL_DESCRIPTIONS,
  NEEDS_APPROVAL_TOOLS,
  createAgentTools,
  createPersonaAgentTools,
  describeApproval,
} from "../tools";

const USER = "user-1";
const SAM = "00000000-0000-4000-8000-000000000001";
const PAT = "00000000-0000-4000-8000-000000000002";
const LEE = "00000000-0000-4000-8000-000000000003";
const DANA = "00000000-0000-4000-8000-000000000004";

// 12:00 Atlantic (ADT, UTC-3) on Monday 2026-10-19.
const NOW = new Date("2026-10-19T15:00:00Z");

const WRITE_TOOLS = ["skipSuggestedClient", "snoozeSuggestedClient", "stopSuggestingClient"] as const;

const client = (id: string, name: string, over: Row = {}): Row => ({
  id, user_id: USER, name, archived_at: null, archive_reason: null, status: "cruising", ...over,
});

const item = (over: Partial<HandfulItem> = {}): HandfulItem => ({
  client_id:        SAM,
  client_name:      "Sam Lee",
  opportunity_type: "birthday",
  trigger_date:     "2026-10-22",
  label:            "Birthday in 3 days",
  why_now:          "Sam's birthday is Thursday.",
  contact_channel:  "email",
  phone:            "5065550101",
  text:             { status: "draftable" },
  ...over,
});

const payload = (over: Partial<NextUpPayload> = {}): NextUpPayload => ({
  day:          "2026-10-19",
  target:       5,
  done_today:   2,
  generated_at: NOW.toISOString(),
  handful:      [item()],
  snoozed:      [],
  urgent:       { new_leads: 1, overdue_tasks: 0, deal_deadlines: 2 },
  ...over,
});

function setup(tables: Record<string, Row[]> = {}, next: NextUpPayload = payload()) {
  vi.mocked(buildNextUpPayload).mockResolvedValue(next);
  const fake = fakeSupabase({
    clients: [client(SAM, "Sam Lee"), client(PAT, "Pat Kim"), client(LEE, "Lee Roy", { archived_at: "2026-09-01T12:00:00Z", archive_reason: "moved_away" }), client(DANA, "Dana Other", { user_id: "someone-else" })],
    flight_control_dismissals: [],
    ...tables,
  });
  const db = fake.client as unknown as SupabaseClient;
  return { client: db, writes: fake.writes, tables: fake.tables, t: createAgentTools(db, USER) };
}

const empty = () => fakeSupabase({}).client as unknown as SupabaseClient;

type Execute = (input: Record<string, unknown>, opts: unknown) => Promise<string>;
const run = (t: ReturnType<typeof setup>["t"], tool: string, input: Record<string, unknown>) =>
  (t[tool].execute as Execute)(input, { toolCallId: "t", messages: [] });

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.mocked(buildNextUpPayload).mockReset());
afterAll(() => vi.useRealTimers());

describe("getNextUp", () => {
  it("relays today's payload, read with persist off, and writes nothing", async () => {
    const { t, client: db, writes } = setup({}, payload({
      handful: [
        item(),
        item({ client_id: PAT, client_name: "Pat Kim", opportunity_type: "consent_lapsing", label: "Email consent ends Nov 2", why_now: "Implied consent from Pat's purchase ends Nov 2.", text: { status: "call_only", reason: "Pat Kim unsubscribed from texts." } }),
      ],
      snoozed: [{ client_id: LEE, client_name: "Lee Roy", until: "2026-10-19T22:00:00.000Z", phone: null }],
    }));
    const out = JSON.parse(await run(t, "getNextUp", {}));

    expect(vi.mocked(buildNextUpPayload)).toHaveBeenCalledWith(USER, db, { persist: false, now: expect.any(Date) });
    expect(out).toMatchObject({
      day: "2026-10-19",
      done_today: 2,
      target: 5,
      urgent: { new_leads: 1, overdue_tasks: 0, deal_deadlines: 2 },
    });
    expect(out.handful).toEqual([
      { client: { id: SAM, name: "Sam Lee" }, reason: "Birthday in 3 days", why_now: "Sam's birthday is Thursday.", channel: expect.stringMatching(/^text or call/) },
      { client: { id: PAT, name: "Pat Kim" }, reason: "Email consent ends Nov 2", why_now: "Implied consent from Pat's purchase ends Nov 2.", channel: expect.stringContaining("Pat Kim unsubscribed from texts.") },
    ]);
    expect(out.handful[1].channel).toMatch(/^call only/);
    // Back at 19:00 Atlantic, said on the Atlantic clock.
    expect(out.on_later).toEqual([{ client: { id: LEE, name: "Lee Roy" }, until: expect.stringMatching(/^7:00\sp\.m\. today$/) }]);
    expect(writes).toEqual([]);
  });

  it("is a read tool: no approval card", () => {
    expect(NEEDS_APPROVAL_TOOLS.has("getNextUp")).toBe(false);
    expect(APPROVAL_DESCRIPTIONS.getNextUp).toBeUndefined();
  });

  it("says so when today's list can't be read", async () => {
    const { t } = setup();
    vi.mocked(buildNextUpPayload).mockRejectedValue(new Error("boom"));
    expect(await run(t, "getNextUp", {})).toMatch(/Couldn't read today's Next up/);
  });
});

describe("skipSuggestedClient", () => {
  it("writes one skip row on the occurrence today's handful shows", async () => {
    const { t, writes } = setup();
    const out = await run(t, "skipSuggestedClient", { clientId: SAM });

    expect(out).toMatch(/^✓ Skipped Sam Lee this time\./);
    const dismissals = writes.filter((w) => w.table === "flight_control_dismissals");
    expect(dismissals).toHaveLength(1);
    expect(dismissals[0].op).toBe("insert");
    expect(dismissals[0].rows[0]).toMatchObject({
      user_id: USER, client_id: SAM, opportunity_type: "birthday", trigger_date: "2026-10-22", kind: "skip",
    });
    expect(dismissals[0].rows[0]).not.toHaveProperty("until");
    expect(writes).toHaveLength(1);
  });

  it("refuses a client who isn't in today's handful, and writes nothing", async () => {
    const { t, writes } = setup();
    expect(await run(t, "skipSuggestedClient", { clientId: PAT })).toBe("Pat Kim isn't in today's suggestions.");
    expect(writes).toEqual([]);
  });

  it("writes nothing for a client who isn't the agent's", async () => {
    const { t, writes } = setup({}, payload({ handful: [item({ client_id: DANA, client_name: "Dana Other" })] }));
    expect(await run(t, "skipSuggestedClient", { clientId: DANA })).toMatch(/isn't in your CRM/);
    expect(writes).toEqual([]);
  });
});

describe("snoozeSuggestedClient", () => {
  it("'tonight' holds the client until laterUntil('tonight', now)", async () => {
    const { t, writes } = setup();
    const out = await run(t, "snoozeSuggestedClient", { clientId: PAT, until: "tonight" });

    const hold = writes.filter((w) => w.table === "flight_control_dismissals");
    expect(hold).toHaveLength(1);
    expect(hold[0]).toMatchObject({ op: "upsert", onConflict: "user_id,client_id,opportunity_type,trigger_date" });
    expect(hold[0].rows[0]).toMatchObject({
      user_id: USER, client_id: PAT, kind: "later", opportunity_type: "any", trigger_date: "2026-10-19",
      until: laterUntil("tonight", NOW).toISOString(),
    });
    expect(laterUntil("tonight", NOW).toISOString()).toBe("2026-10-19T22:00:00.000Z");
    expect(out).toMatch(/^✓ Pat Kim is on Later until 7:00\sp\.m\. today: no suggestions for them until then\.$/);
  });

  it("'tomorrow' is 08:00 Atlantic the next day", async () => {
    const { t, writes } = setup();
    await run(t, "snoozeSuggestedClient", { clientId: SAM, until: "tomorrow" });
    expect(writes[0].rows[0]).toMatchObject({ kind: "later", until: "2026-10-20T11:00:00.000Z" });
  });

  it("from 19:00 Atlantic, 'tonight' is refused and nothing is written", async () => {
    const { t, writes } = setup();
    vi.setSystemTime(new Date("2026-10-19T22:30:00Z")); // 19:30 ADT
    try {
      expect(await run(t, "snoozeSuggestedClient", { clientId: SAM, until: "tonight" })).toMatch(/past 19:00.*in_an_hour or tomorrow/);
    } finally {
      vi.setSystemTime(NOW);
    }
    expect(writes).toEqual([]);
  });

  it("a running Stop is relayed, not claimed as a Later, and nothing is written", async () => {
    const { t, writes } = setup({
      flight_control_dismissals: [{
        id: "d1", user_id: USER, client_id: SAM, opportunity_type: "any", trigger_date: "2026-10-10",
        kind: "stop", until: "2027-01-10T04:00:00.000Z", dismissed_at: "2026-10-10T15:00:00Z",
      }],
    });
    const out = await run(t, "snoozeSuggestedClient", { clientId: SAM, until: "tomorrow" });
    expect(out).toMatch(/^Nothing changed: Suggestions for Sam Lee are already stopped until January 10, 2027\./);
    expect(out).not.toMatch(/Later until/);
    expect(writes).toEqual([]);
  });

  it("refuses a client in the Hangar or not in the CRM", async () => {
    const { t, writes } = setup();
    expect(await run(t, "snoozeSuggestedClient", { clientId: LEE, until: "tomorrow" })).toMatch(/Lee Roy is in the Hangar/);
    expect(await run(t, "snoozeSuggestedClient", { clientId: DANA, until: "tomorrow" })).toMatch(/isn't in your CRM/);
    expect(writes).toEqual([]);
  });
});

describe("stopSuggestingClient", () => {
  it("3_months holds the client until stopUntil('3_months', now)", async () => {
    const { t, writes } = setup();
    const out = await run(t, "stopSuggestingClient", { clientId: PAT, duration: "3_months" });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ table: "flight_control_dismissals", op: "upsert" });
    expect(writes[0].rows[0]).toMatchObject({ client_id: PAT, kind: "stop", until: stopUntil("3_months", NOW).toISOString() });
    expect(out).toMatch(/^✓ Suggestions for Pat Kim are stopped until January 19, 2027\./);
    // A timed Stop leaves a consent-lapsing notice up; the reply says so.
    expect(out).toMatch(/consent-lapsing notice/);
  });

  it("6_months uses stopUntil('6_months', now)", async () => {
    const { t, writes } = setup();
    await run(t, "stopSuggestingClient", { clientId: SAM, duration: "6_months" });
    expect(writes[0].rows[0]).toMatchObject({ kind: "stop", until: stopUntil("6_months", NOW).toISOString() });
  });

  it("hangar archives the client through writeClientToHangar", async () => {
    const { t, writes, tables } = setup();
    const out = await run(t, "stopSuggestingClient", { clientId: SAM, duration: "hangar" });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ table: "clients", op: "update" });
    expect(writes[0].rows[0]).toMatchObject({ archive_reason: "other", archived_at: expect.any(String) });
    expect(writes[0].filters).toEqual(expect.arrayContaining([`eq(id,${SAM})`, `eq(user_id,${USER})`, "is(archived_at,null)"]));
    expect(tables.clients.find((c) => c.id === SAM)?.archived_at).toEqual(expect.any(String));
    expect(out).toMatch(/^✓ Sam Lee moved to the Hangar\./);
  });

  it("refuses a client already in the Hangar", async () => {
    const { t, writes } = setup();
    expect(await run(t, "stopSuggestingClient", { clientId: LEE, duration: "3_months" })).toMatch(/Lee Roy is in the Hangar/);
    expect(writes).toEqual([]);
  });
});

describe("approval cards", () => {
  it("every new write tool is behind the approval card and has a description", () => {
    const tools = createAgentTools(empty(), USER) as Record<string, { needsApproval?: unknown }>;
    for (const name of WRITE_TOOLS) {
      expect(NEEDS_APPROVAL_TOOLS.has(name), name).toBe(true);
      expect(typeof APPROVAL_DESCRIPTIONS[name], name).toBe("function");
      expect(tools[name].needsApproval, name).toBe(true);
    }
  });

  it("say what happens, in the brief's words", () => {
    expect(APPROVAL_DESCRIPTIONS.skipSuggestedClient({ clientId: SAM, clientName: "Sam Lee" }))
      .toBe("Skip Sam Lee this time. They come back at their next reason to reach out.");
    expect(APPROVAL_DESCRIPTIONS.snoozeSuggestedClient({ clientId: SAM, clientName: "Sam Lee", until: "tonight" }))
      .toMatch(/^Hide Sam Lee from suggestions until 7:00\sp\.m\. today\.$/);
    expect(APPROVAL_DESCRIPTIONS.snoozeSuggestedClient({ clientId: SAM, clientName: "Sam Lee", until: "tomorrow" }))
      .toMatch(/^Hide Sam Lee from suggestions until 8:00\sa\.m\. tomorrow\.$/);
    expect(APPROVAL_DESCRIPTIONS.stopSuggestingClient({ clientId: SAM, clientName: "Sam Lee", duration: "3_months" }))
      .toBe("No suggestions for Sam Lee for 3 months.");
    expect(APPROVAL_DESCRIPTIONS.stopSuggestingClient({ clientId: SAM, clientName: "Sam Lee", duration: "6_months" }))
      .toBe("No suggestions for Sam Lee for 6 months.");
    expect(APPROVAL_DESCRIPTIONS.stopSuggestingClient({ clientId: SAM, clientName: "Sam Lee", duration: "hangar" }))
      .toBe("Move Sam Lee to the Hangar.");
  });

  it("never say 'cannot be undone', and use no em dash", () => {
    for (const name of WRITE_TOOLS) {
      for (const args of [{}, { clientName: "Sam Lee", until: "in_an_hour", duration: "hangar" }]) {
        const card = APPROVAL_DESCRIPTIONS[name](args);
        expect(card, name).not.toMatch(/cannot be undone/i);
        expect(card, name).not.toContain("—");
      }
    }
  });

  it("name the client from the database, not the model's words", async () => {
    const { client: db } = setup();
    expect(await describeApproval("skipSuggestedClient", { clientId: SAM, clientName: "Samantha Typed" }, db, USER))
      .toBe("Skip Sam Lee this time. They come back at their next reason to reach out.");
    expect(await describeApproval("stopSuggestingClient", { clientId: DANA, duration: "hangar" }, db, USER))
      .toMatch(/isn't in your CRM/);
  });
});

describe("persona sets", () => {
  const keys = (persona: "captain" | "navigator" | "dispatcher") =>
    Object.keys(createPersonaAgentTools(empty(), USER, persona));

  it("Captain and Dispatcher read Next up; only Dispatcher skips, snoozes or stops", () => {
    expect(keys("captain")).toContain("getNextUp");
    expect(keys("dispatcher")).toEqual(expect.arrayContaining(["getNextUp", ...WRITE_TOOLS]));
    for (const name of WRITE_TOOLS) {
      expect(keys("captain")).not.toContain(name);
      expect(keys("navigator")).not.toContain(name);
    }
    expect(keys("navigator")).not.toContain("getNextUp");
  });
});
