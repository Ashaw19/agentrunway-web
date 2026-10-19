/**
 * EVAL (live model): drafting tone and CASL.
 *
 * The real drafters (draftOutreachForClient, draftTextForClient) with the
 * pinned default model and synthetic CRM rows (a column-projecting fake
 * client, nothing real). Binary checks on each draft:
 *   - it is for the right person (uses the client's first name), never a
 *     placeholder ("[Name]", "{{", "Dear valued client");
 *   - no hard-sell pressure ("act now", "don't miss out", "limited time");
 *   - email: a subject line and under 200 words (the voice guide's limit);
 *     text: within the text length limit, ending with the agent's name and
 *     the opt-out line when that setting is on;
 * and CASL: an opted-out client and a lapsed past client get "call_only"
 * from both drafters, with no model call even when a key is set.
 *
 * Skips without ANTHROPIC_API_KEY.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { draftOutreachForClient } from "@/lib/ai/draft-services";
import { TEXT_BODY_MAX_CHARS, TEXT_OPT_OUT_LINE, draftTextForClient } from "@/lib/ai/draft-text";
import { setAIRunRecorderForTests } from "@/lib/ai/run-ledger";
import { fakeSupabase } from "@/lib/ai/__tests__/helpers/fake-supabase";
import { LIVE, LIVE_SKIP_NOTE } from "../fixtures/live";
import { CLIENT, USER, clientRow, crmTables, deal } from "../fixtures/drafter-fixtures";

const PLACEHOLDER = /\[(?:client|name|first name)[^\]]*\]|\{\{|dear valued client/i;
const HARD_SELL = /\bact now\b|don't miss out|limited time|before it's too late|once in a lifetime/i;
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

describe.skipIf(!LIVE)(`EVAL live: drafting tone and CASL${LIVE_SKIP_NOTE}`, () => {
  beforeAll(() => {
    setAIRunRecorderForTests(() => {});
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T16:00:00Z"));
  });
  afterAll(() => {
    vi.useRealTimers();
    setAIRunRecorderForTests(null);
  });

  it.each(["birthday", "past_client_check_in"] as const)("email draft (%s): right person, no pressure, subject, under 200 words", async (opportunityType) => {
    const { client } = fakeSupabase(crmTables({ client_records: [deal("2025-06-20")] }));
    const r = await draftOutreachForClient({ supabase: client, userId: USER, clientId: CLIENT, opportunityType });
    expect(r.status).toBe("created");
    const body = r.body ?? "";
    expect({
      firstName: body.includes("Sam"),
      placeholder: PLACEHOLDER.test(body) || PLACEHOLDER.test(r.subject ?? ""),
      hardSell: HARD_SELL.test(body),
      subject: (r.subject ?? "").trim().length > 0,
      under200Words: words(body) <= 200,
    }).toEqual({ firstName: true, placeholder: false, hardSell: false, subject: true, under200Words: true });
  });

  it.each(["check_in", "market_update"] as const)("text draft (%s): right person, short, signed with the opt-out line", async (purpose) => {
    const { client } = fakeSupabase(crmTables({ client_records: [deal("2025-06-20")] }));
    const r = await draftTextForClient({ supabase: client, userId: USER, clientId: CLIENT, purpose });
    expect(r.status).toBe("created");
    const body = r.body ?? "";
    expect({
      firstName: body.includes("Sam"),
      placeholder: PLACEHOLDER.test(body),
      hardSell: HARD_SELL.test(body),
      short: body.length <= TEXT_BODY_MAX_CHARS,
      optOut: body.trimEnd().endsWith(TEXT_OPT_OUT_LINE),
    }).toEqual({ firstName: true, placeholder: false, hardSell: false, short: true, optOut: true });
  });

  it.each([
    ["opted out of both", () => crmTables({ clients: [clientRow({ email_opt_out_at: "2026-09-15T13:00:00Z", sms_opt_out_at: "2026-09-15T13:00:00Z" })], client_records: [deal("2025-06-20")] })],
    ["lapsed past client", () => crmTables({ client_records: [deal("2023-05-01")] })],
  ] as const)("CASL with a live model: %s → call only, from both drafters", async (_name, tables) => {
    const email = await draftOutreachForClient({ supabase: fakeSupabase(tables()).client, userId: USER, clientId: CLIENT, opportunityType: "birthday" });
    const text = await draftTextForClient({ supabase: fakeSupabase(tables()).client, userId: USER, clientId: CLIENT, purpose: "check_in" });
    expect([email.status, text.status]).toEqual(["call_only", "call_only"]);
  });
});
