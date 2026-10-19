/**
 * EVAL: CASL gating on every drafter.
 *
 * Binary check, per drafter x per client: a client who unsubscribed from a
 * channel, or a past client whose implied consent from their last closed
 * (non-collapsed) deal ran out 24 months later by the send date (their own
 * deal or one they co-bought), never gets a draft on that channel: the
 * drafter answers "call_only", makes no AI call and writes nothing. Express
 * consent on file for a channel (the 00183 consent ledger) allows it until
 * withdrawn. Clients inside the window, or with no closed deal, get a draft.
 *
 * Drafters covered (the ones that write a draft for one client):
 *   - draftOutreachForClient: email (Flight Crew Dispatcher, CRM briefing
 *     Draft, the client panel's AI Actions)
 *   - draftWorkflowMessage: email (Flight Plan templates)
 *   - draftTextForClient: texts (the iPhone text queue, draftClientTexts)
 * Flight Control Scan and the nightly drafter decide email vs call with the
 * same core consentStatus(); its truth table is the first block.
 *
 * Deterministic: the model is mocked; the fake client returns only the
 * columns each query selects (lib/ai/__tests__/helpers/fake-supabase.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({
  models: { default: "eval-default", fallback: "eval-fallback" },
  aiCallHeaders: () => ({}),
}));

import { generateText } from "ai";
import { draftOutreachForClient, draftWorkflowMessage } from "@/lib/ai/draft-services";
import { draftTextForClient } from "@/lib/ai/draft-text";
import { consentStatus, type ConsentRecordInput } from "@agent-runway/core/engines/casl-consent-engine";
import type { WorkflowTemplate } from "@agent-runway/core/types/database";
import { fakeSupabase, type Row } from "@/lib/ai/__tests__/helpers/fake-supabase";
import { CLIENT, SPOUSE, USER, clientRow, crmTables, deal } from "../fixtures/drafter-fixtures";

// Today in these evals: 2026-10-14, 1 pm Atlantic.
const NOW = new Date("2026-10-14T16:00:00Z");

const template: WorkflowTemplate = {
  id: "eval-tmpl",
  user_id: null,
  trigger_event: "anniversary",
  name: "Home anniversary",
  subject_template: "Happy home anniversary, {{client_first_name}}",
  body_prompt: "Write a short home-anniversary note.",
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

interface Scenario {
  name: string;
  tables: () => Record<string, Row[]>;
  /** Refused on each channel. */
  gated: { email: boolean; sms: boolean };
}

function consentRow(over: Row): Row {
  return {
    id: `consent-${String(over.channel ?? "email")}`, user_id: USER, client_id: CLIENT, kind: "other", source: "agent",
    channel: "email", basis: "express", method: "verbal", consent_text: "", consented_at: "2026-09-01T12:00:00Z",
    withdrawn_at: null, ...over,
  };
}

const SCENARIOS: Scenario[] = [
  {
    name: "unsubscribed from email, with a recent deal",
    tables: () => crmTables({ clients: [clientRow({ email_opt_out_at: "2026-09-15T13:00:00+00:00" })], client_records: [deal("2025-06-01")] }),
    gated: { email: true, sms: false },
  },
  {
    name: "unsubscribed from texts, with a recent deal",
    tables: () => crmTables({ clients: [clientRow({ sms_opt_out_at: "2026-09-15T13:00:00+00:00" })], client_records: [deal("2025-06-01")] }),
    gated: { email: false, sms: true },
  },
  {
    name: "past client, last deal 24 months and a day ago",
    tables: () => crmTables({ client_records: [deal("2024-10-13")] }),
    gated: { email: true, sms: true },
  },
  {
    name: "past client, last deal exactly 24 months ago",
    tables: () => crmTables({ client_records: [deal("2024-10-14")] }),
    gated: { email: true, sms: true },
  },
  {
    name: "past client, a newer collapsed deal doesn't renew consent",
    tables: () => crmTables({ client_records: [deal("2022-01-10"), deal("2026-03-01", { condition_status: "collapsed" })] }),
    gated: { email: true, sms: true },
  },
  {
    name: "co-buyer named on a deal that closed 3 years ago",
    tables: () =>
      crmTables({
        clients: [clientRow(), clientRow({ id: SPOUSE, name: "Pat Example", first_name: "Pat" })],
        client_records: [deal("2023-05-01", { client: SPOUSE, id: "rec-shared" })],
        client_record_co_parties: [{ id: "cp-1", user_id: USER, client_record_id: "rec-shared", co_client_id: CLIENT }],
      }),
    gated: { email: true, sms: true },
  },
  {
    name: "lapsed past client with express consent to email on file",
    tables: () => crmTables({ client_records: [deal("2023-05-01")], client_email_consents: [consentRow({ channel: "email" })] }),
    gated: { email: false, sms: true },
  },
  {
    name: "lapsed past client whose express consent was withdrawn",
    tables: () =>
      crmTables({ client_records: [deal("2023-05-01")], client_email_consents: [consentRow({ channel: "email", withdrawn_at: "2026-10-01T12:00:00Z" })] }),
    gated: { email: true, sms: true },
  },
  {
    name: "past client, last deal 24 months less a day ago",
    tables: () => crmTables({ client_records: [deal("2024-10-15")] }),
    gated: { email: false, sms: false },
  },
  {
    name: "past client inside the window",
    tables: () => crmTables({ client_records: [deal("2025-06-20")] }),
    gated: { email: false, sms: false },
  },
  {
    name: "no closed deal on record",
    tables: () => crmTables(),
    gated: { email: false, sms: false },
  },
];

const DRAFTERS: Array<{
  name: string;
  channel: "email" | "sms";
  run: (supabase: ReturnType<typeof fakeSupabase>["client"]) => Promise<{ status: string }>;
}> = [
  {
    name: "draftOutreachForClient (email)",
    channel: "email",
    run: (supabase) => draftOutreachForClient({ supabase, userId: USER, clientId: CLIENT, opportunityType: "birthday" }),
  },
  {
    name: "draftWorkflowMessage (Flight Plan email)",
    channel: "email",
    run: (supabase) => draftWorkflowMessage({ supabase, userId: USER, clientId: CLIENT, template }),
  },
  {
    name: "draftTextForClient (text)",
    channel: "sms",
    run: (supabase) => draftTextForClient({ supabase, userId: USER, clientId: CLIENT, purpose: "check_in" }),
  },
];

const DRAFT_TABLES = new Set(["outreach_queue", "workflow_drafts", "newsletter_queue"]);
const mockGenerate = vi.mocked(generateText);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  process.env.ANTHROPIC_API_KEY ||= "eval-placeholder";
  mockGenerate.mockReset();
  mockGenerate.mockResolvedValue({
    text: "Hi Sam, hope the fall has been good to you so far. Thinking of you this week.\n\nSUBJECT: thinking of you",
  } as Awaited<ReturnType<typeof generateText>>);
});
afterEach(() => vi.useRealTimers());

describe("EVAL casl: consentStatus (Scan, nightly drafter, every drafter)", () => {
  const express = (over: Partial<ConsentRecordInput> = {}): ConsentRecordInput => ({
    channel: "email", basis: "express", source: "agent", kind: "other", method: "verbal", consented_at: "2026-09-01T12:00:00Z", ...over,
  });
  it.each([
    ["no deal, no record", [], [], {}, "2026-10-14", { email: true, sms: true }],
    ["deal 23 months ago", ["2024-11-20"], [], {}, "2026-10-14", { email: true, sms: true }],
    ["deal exactly 24 months ago", ["2024-10-14"], [], {}, "2026-10-14", { email: false, sms: false }],
    ["deal 3 years ago", ["2023-05-01"], [], {}, "2026-10-14", { email: false, sms: false }],
    ["inside today, past the line on the send date", ["2024-10-20"], [], {}, "2026-10-25", { email: false, sms: false }],
    ["deal 3 years ago, express email consent", ["2023-05-01"], [express()], {}, "2026-10-14", { email: true, sms: false }],
    ["express consent withdrawn", ["2023-05-01"], [express({ withdrawn_at: "2026-10-01T12:00:00Z" })], {}, "2026-10-14", { email: false, sms: false }],
    ["express consent, then unsubscribed", [], [express()], { email_opt_out_at: "2026-10-02T12:00:00Z" }, "2026-10-14", { email: false, sms: true }],
    ["unsubscribed from texts only", ["2025-06-01"], [], { sms_opt_out_at: "2026-10-02T12:00:00Z" }, "2026-10-14", { email: true, sms: false }],
  ] as const)("%s", (_name, closes, consents, client, today, expected) => {
    const s = consentStatus({
      client,
      closedDeals: closes.map((close_date) => ({ close_date, condition_status: "firmed" })),
      consents,
      today,
    });
    expect({ email: s.email.canMessage, sms: s.sms.canMessage }).toEqual(expected);
  });
});

describe("EVAL casl: no email or text draft for opted-out or lapsed clients", () => {
  for (const drafter of DRAFTERS) {
    for (const s of SCENARIOS) {
      const gated = s.gated[drafter.channel];
      it(`${drafter.name}: ${s.name} → ${gated ? "call only, nothing drafted" : "drafted"}`, async () => {
        const { client, writes } = fakeSupabase(s.tables());
        const result = await drafter.run(client);
        const draftWrites = writes.filter((w) => DRAFT_TABLES.has(w.table));
        if (gated) {
          expect(result.status).toBe("call_only");
          expect(mockGenerate).not.toHaveBeenCalled();
          expect(draftWrites).toEqual([]);
        } else {
          expect(result.status).not.toBe("call_only");
          expect(result.status).toBe("created");
          expect(mockGenerate).toHaveBeenCalled();
        }
      });
    }
  }
});
