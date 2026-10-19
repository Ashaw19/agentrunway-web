/**
 * Flight Crew's CASL consent tools (00183), on the Dispatcher:
 *   - recordConsent / withdrawConsent are write tools behind the approval
 *     card; how (method) and when (date) are required by the schema and by
 *     the shared writer; the record says it came from Flight Crew;
 *   - recordConsent's description tells the model never to infer consent;
 *   - withdrawConsent sets the opt-out every drafter reads, ends the active
 *     records and skips drafts waiting on that channel;
 *   - listConsentLapsing lists past clients whose implied consent from a
 *     purchase ends soon or just ended, and leaves out express consent and
 *     unsubscribes;
 *   - getClientSummary states each channel's consent.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { asSchema } from "ai";
import { APPROVAL_DESCRIPTIONS, NEEDS_APPROVAL_TOOLS, createAgentTools, createPersonaAgentTools, describeApproval } from "../tools";
import { fakeSupabase, type Row } from "./helpers/fake-supabase";

const USER = "user-1";
const SAM = "00000000-0000-4000-8000-000000000001";
const PAT = "00000000-0000-4000-8000-000000000002";
const LEE = "00000000-0000-4000-8000-000000000003";

const client = (id: string, name: string, over: Row = {}): Row => ({
  id, user_id: USER, name, archived_at: null, status: "cruising",
  email_opt_out_at: null, sms_opt_out_at: null, created_at: "2020-01-01T12:00:00Z",
  ...over,
});
const deal = (clientId: string, close_date: string, n: number): Row => ({
  id: `rec-${n}`, user_id: USER, client_id: clientId, close_date, condition_status: "firmed",
});

function tools(extra: Record<string, Row[]> = {}) {
  const { client: sb, writes } = fakeSupabase({
    clients: [client(SAM, "Sam Lee"), client(PAT, "Pat Kim"), client(LEE, "Lee Roy")],
    client_records: [deal(SAM, "2024-11-01", 1), deal(PAT, "2024-09-26", 2), deal(LEE, "2021-01-01", 3)],
    client_record_co_parties: [],
    client_email_consents: [],
    outreach_queue: [],
    ...extra,
  });
  return { t: createAgentTools(sb, USER), writes };
}

type Execute = (input: Record<string, unknown>, opts: unknown) => Promise<string>;
const run = (t: ReturnType<typeof tools>["t"], tool: string, input: Record<string, unknown>) =>
  (t[tool].execute as Execute)(input, { toolCallId: "t", messages: [] });

async function accepts(tool: string, input: Record<string, unknown>): Promise<boolean> {
  const validate = asSchema(tools().t[tool].inputSchema).validate;
  if (!validate) throw new Error(`${tool} has no validator`);
  return (await validate(input)).success;
}

beforeAll(() => {
  vi.stubEnv("TZ", "UTC");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-06T15:00:00Z")); // noon Atlantic
});
afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const yes = { clientId: SAM, clientName: "Sam Lee", channels: ["email"], basis: "express", method: "verbal", date: "2026-10-05", wording: "Sure, keep me posted" };

describe("recordConsent", () => {
  it("is a Dispatcher write tool behind the approval card", () => {
    expect(NEEDS_APPROVAL_TOOLS.has("recordConsent")).toBe(true);
    const dispatcher = createPersonaAgentTools(fakeSupabase({}).client, USER, "dispatcher");
    expect(Object.keys(dispatcher)).toEqual(expect.arrayContaining(["recordConsent", "withdrawConsent", "listConsentLapsing"]));
    for (const persona of ["captain", "navigator"] as const) {
      expect(Object.keys(createPersonaAgentTools(fakeSupabase({}).client, USER, persona))).not.toContain("recordConsent");
    }
    const card = APPROVAL_DESCRIPTIONS.recordConsent(yes);
    expect(card).toContain("express consent for Sam Lee (email): on a phone call, 2026-10-05");
  });

  it("requires how and when", async () => {
    expect(await accepts("recordConsent", yes)).toBe(true);
    const { method: _m, ...noMethod } = yes;
    const { date: _d, ...noDate } = yes;
    expect(await accepts("recordConsent", noMethod)).toBe(false);
    expect(await accepts("recordConsent", noDate)).toBe(false);
    expect(await accepts("recordConsent", { ...yes, method: "vibes" })).toBe(false);
    expect(await accepts("recordConsent", { ...yes, date: "Oct 5" })).toBe(false);
  });

  it("tells the model never to infer consent", () => {
    const d = tools().t.recordConsent.description ?? "";
    expect(d).toMatch(/Never infer consent/i);
    expect(d).toMatch(/method and date are REQUIRED/);
  });

  it("writes one agent record per channel, marked as made through Flight Crew", async () => {
    const { t, writes } = tools();
    const out = await run(t, "recordConsent", { ...yes, channels: ["email", "sms"] });
    expect(out).toMatch(/^✓ Express consent recorded for Sam Lee \(email and texts\)/);
    const insert = writes.find((w) => w.table === "client_email_consents" && w.op === "insert");
    expect(insert?.payload).toEqual([
      expect.objectContaining({ channel: "email", source: "agent", method: "verbal", recorded_via: "flight_crew", consented_at: "2026-10-05T15:00:00.000Z" }),
      expect.objectContaining({ channel: "sms", source: "agent", recorded_via: "flight_crew" }),
    ]);
  });

  it("refuses a date in the future and writes nothing", async () => {
    const { t, writes } = tools();
    const out = await run(t, "recordConsent", { ...yes, date: "2026-10-07" });
    expect(out).toMatch(/^Not recorded: .*future/);
    expect(writes).toEqual([]);
  });

  it("refuses express consent dated before their unsubscribe", async () => {
    const { t, writes } = tools({ clients: [client(SAM, "Sam Lee", { email_opt_out_at: "2026-10-05T20:00:00Z" })] });
    const out = await run(t, "recordConsent", yes);
    expect(out).toMatch(/unsubscribed from email after the date/);
    expect(writes).toEqual([]);
  });

  it("writes nothing for another account's client", async () => {
    const { t, writes } = tools({ clients: [client(SAM, "Sam Lee", { user_id: "someone-else" })] });
    expect(await run(t, "recordConsent", yes)).toMatch(/Client not found/);
    expect(writes).toEqual([]);
  });
});

describe("approval cards name the client from the database", () => {
  const db = () => fakeSupabase({ clients: [client(SAM, "Sam Lee"), client(PAT, "Pat Kim", { user_id: "someone-else" })] }).client;

  it("uses the name on file for the id that will be written, not the name the model typed", async () => {
    const card = await describeApproval("recordConsent", { ...yes, clientName: "Samantha Wrongperson" }, db(), USER);
    expect(card).toContain("for Sam Lee (email)");
    expect(card).not.toContain("Wrongperson");
    const stop = await describeApproval("withdrawConsent", { clientId: SAM, clientName: "Somebody Else", channels: ["sms"], method: "verbal", date: "2026-10-05" }, db(), USER);
    expect(stop).toContain("Sam Lee asked to stop");
    expect(stop).not.toContain("Somebody Else");
  });

  it("says so when the id isn't the agent's client", async () => {
    expect(await describeApproval("recordConsent", { ...yes, clientId: PAT, clientName: "Pat Kim" }, db(), USER))
      .toBe("This client isn't in your CRM. Approving will save nothing.");
    expect(await describeApproval("recordConsent", { ...yes, clientId: undefined }, db(), USER))
      .toMatch(/isn't in your CRM/);
  });

  it("leaves other tools' cards as they were", async () => {
    expect(await describeApproval("createContactTask", { clientName: "Typed", title: "Call", dueDate: "2026-10-07" }, db(), USER))
      .toBe(APPROVAL_DESCRIPTIONS.createContactTask({ clientName: "Typed", title: "Call", dueDate: "2026-10-07" }));
  });
});

describe("withdrawConsent", () => {
  const stop = { clientId: PAT, clientName: "Pat Kim", channels: ["sms"], method: "text_reply", date: "2026-10-06", note: "Replied STOP" };

  it("is behind the approval card, which says what changes", () => {
    expect(NEEDS_APPROVAL_TOOLS.has("withdrawConsent")).toBe(true);
    expect(APPROVAL_DESCRIPTIONS.withdrawConsent(stop)).toMatch(/Pat Kim asked to stop \(texts\): text reply, 2026-10-06/);
  });

  it("requires how and when", async () => {
    const { method: _m, ...noMethod } = stop;
    expect(await accepts("withdrawConsent", stop)).toBe(true);
    expect(await accepts("withdrawConsent", noMethod)).toBe(false);
  });

  it("sets the text opt-out, ends text records and skips waiting text drafts", async () => {
    const { t, writes } = tools();
    const out = await run(t, "withdrawConsent", stop);
    expect(out).toMatch(/^✓ Withdrawal recorded for Pat Kim \(texts\)/);
    const optOut = writes.find((w) => w.table === "clients" && w.op === "update");
    expect(optOut?.payload).toEqual({
      sms_opt_out_at: "2026-10-06T15:00:00.000Z", sms_opt_out_source: "agent",
      sms_opt_out_method: "text_reply", sms_opt_out_note: "Replied STOP",
    });
    expect(writes.find((w) => w.table === "client_email_consents" && w.op === "update")?.payload)
      .toMatchObject({ withdrawn_method: "text_reply" });
    expect(writes.find((w) => w.table === "outreach_queue" && w.op === "update")?.payload)
      .toEqual({ status: "skipped" });
  });
});

describe("listConsentLapsing", () => {
  it("lists a past client whose consent ends soon and one whose consent just ended", async () => {
    const out = await run(tools().t, "listConsentLapsing", {});
    expect(out).toContain("Sam Lee: implied consent ends November 1, 2026 (26 days)");
    expect(out).toContain("Pat Kim: implied consent ended September 26, 2026; ask by phone");
    expect(out).not.toContain("Lee Roy"); // ended years ago
  });

  it("leaves out a client with express consent or an unsubscribe", async () => {
    const out = await run(tools({
      clients: [client(SAM, "Sam Lee", { email_opt_out_at: "2026-09-01T12:00:00Z" }), client(PAT, "Pat Kim"), client(LEE, "Lee Roy")],
      client_email_consents: [{
        id: "c1", user_id: USER, client_id: PAT, kind: "other", source: "agent", channel: "email", basis: "express",
        method: "verbal", consent_text: "yes", evidence_note: null, consented_at: "2026-09-30T15:00:00Z", recorded_via: "web",
        withdrawn_at: null, withdrawn_method: null, withdrawn_note: null, created_at: "2026-09-30T15:00:00Z",
      }],
    }).t, "listConsentLapsing", {});
    expect(out).toMatch(/^No past client's implied consent/);
  });

  it("states the rule as information, not advice", async () => {
    const out = await run(tools().t, "listConsentLapsing", {});
    expect(out).not.toMatch(/\b(should|must|recommend|need to)\b/i);
  });
});

describe("getClientSummary", () => {
  it("states each channel's consent", async () => {
    const out = await run(tools().t, "getClientSummary", { clientId: LEE, clientName: "Lee Roy" });
    expect(out).toContain("CASL consent: Email Lapsed: call only; Texts Lapsed: call only.");
  });
});
