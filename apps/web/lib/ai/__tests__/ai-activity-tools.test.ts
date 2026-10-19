/**
 * Flight Crew's AI activity tools (lib/ai/tools.ts): every persona can say
 * what Flight Crew changed (getAIActivity) and undo it (undoAIChange, behind
 * the approval card), and the chat's approval cards no longer claim a delete
 * "cannot be undone". Synthetic rows only.
 */
import { describe, expect, it } from "vitest";
import {
  APPROVAL_DESCRIPTIONS,
  NEEDS_APPROVAL_TOOLS,
  createAgentTools,
  createCoreAgentTools,
  createPersonaAgentTools,
} from "../tools";
import { fakeSupabase, type Row } from "./helpers/fake-supabase";
import { UNDO_FINGERPRINT_ARG, undoApprovalCard } from "../undo-approval";

const USER = "user-1";

describe("AI activity tools", () => {
  const { client } = fakeSupabase({});

  it("every persona and the core set have getAIActivity and undoAIChange", () => {
    for (const persona of ["captain", "navigator", "dispatcher"] as const) {
      const tools = createPersonaAgentTools(client, USER, persona);
      expect(Object.keys(tools), persona).toEqual(expect.arrayContaining(["getAIActivity", "undoAIChange"]));
    }
    expect(Object.keys(createCoreAgentTools(client, USER))).toEqual(expect.arrayContaining(["getAIActivity", "undoAIChange"]));
  });

  it("undo goes through the approval card; the read tool doesn't", () => {
    expect(NEEDS_APPROVAL_TOOLS.has("undoAIChange")).toBe(true);
    expect(NEEDS_APPROVAL_TOOLS.has("getAIActivity")).toBe(false);
    // The fallback never repeats the model's words (the chat route builds the real card).
    expect(APPROVAL_DESCRIPTIONS.undoAIChange({ changeDescription: "Logged an expense: Staples" })).toBe("Undo a change Flight Crew made");
    const tools = createAgentTools(client, USER) as Record<string, { needsApproval?: unknown }>;
    expect(tools.undoAIChange.needsApproval).toBe(true);
  });

  it("delete cards no longer say 'cannot be undone', and don't promise more than undo does", () => {
    for (const [name, describe] of Object.entries(APPROVAL_DESCRIPTIONS)) {
      expect(describe({}), name).not.toMatch(/cannot be undone/i);
      if (/^delete/.test(name) && /undo/i.test(describe({}))) expect(describe({}), name).toMatch(/if nothing else links to it/);
    }
  });

  it("getAIActivity reports the agent's changes with their toolCallIds", async () => {
    const now = new Date().toISOString();
    const { client: withRows } = fakeSupabase({
      ai_run_writes: [
        {
          id: "w1", user_id: USER, ai_run_id: null, request_id: null, tool_call_id: "toolu_x", tool_name: "logExpense",
          source: "approval", seq: 0, table_name: "receipt_expenses", row_id: "r1", action: "insert",
          before_image: null, after_image: { id: "r1", vendor: "Staples" }, outcome: "ok", error_class: null,
          undone_at: null, created_at: now,
        },
        {
          id: "w2", user_id: "someone-else", ai_run_id: null, request_id: null, tool_call_id: "toolu_other", tool_name: "logExpense",
          source: "approval", seq: 0, table_name: "receipt_expenses", row_id: "r2", action: "insert",
          before_image: null, after_image: { id: "r2", vendor: "Other" }, outcome: "ok", error_class: null,
          undone_at: null, created_at: now,
        },
      ],
      ai_runs: [],
    });
    const tools = createAgentTools(withRows, USER);
    const execute = tools.getAIActivity.execute as (i: unknown, o: unknown) => Promise<string>;
    const text = await execute({ period: "today" }, { toolCallId: "t", messages: [] });
    expect(text).toContain("Logged an expense: Staples. Undo available. (toolCallId: toolu_x)");
    expect(text).not.toContain("toolu_other");
  });

  describe("the undo approval card", () => {
    const now = new Date();
    const ledgerRow = (over: Row): Row => ({
      id: "w1", user_id: USER, ai_run_id: null, request_id: null, tool_call_id: "toolu_client", tool_name: "createClient",
      source: "approval", seq: 0, table_name: "clients", row_id: "c1", action: "insert", before_image: null,
      after_image: { id: "c1", name: "Pat Example" }, outcome: "ok", error_class: null, irreversible_reason: null,
      undone_at: null, created_at: now.toISOString(), ...over,
    });
    const withLedger = () =>
      fakeSupabase({
        ai_run_writes: [
          ledgerRow({}),
          ledgerRow({ id: "w2", tool_call_id: "toolu_expense", tool_name: "logExpense", table_name: "receipt_expenses", row_id: "e1", after_image: { id: "e1", vendor: "Staples" } }),
        ],
      }).client;

    it("shows the change the toolCallId really names, never the model's description", async () => {
      // The model says "expense" but names the client-creating change.
      const card = await undoApprovalCard(withLedger(), USER, { toolCallId: "toolu_client", changeDescription: "Logged an expense: Staples" }, now);
      expect(card.description).toContain('Undo "Created a client: Pat Example"');
      expect(card.description).toContain('Deletes the client "Pat Example" for good');
      expect(card.description).not.toContain("Staples");
      expect(card.args).toEqual({ toolCallId: "toolu_client", [UNDO_FINGERPRINT_ARG]: expect.any(String) });
    });

    it("an unknown change says approving does nothing, and carries no fingerprint", async () => {
      const card = await undoApprovalCard(withLedger(), USER, { toolCallId: "toolu_nope" }, now);
      expect(card.description).toMatch(/wasn't found/);
      expect(card.args).toEqual({ toolCallId: "toolu_nope" });
    });

    it("undoAIChange refuses without the card's fingerprint, or with another change's", async () => {
      const client = withLedger();
      const execute = createAgentTools(client, USER).undoAIChange.execute as (i: unknown, o: unknown) => Promise<string>;
      expect(await execute({ toolCallId: "toolu_client" }, { toolCallId: "t", messages: [] })).toMatch(/Nothing was undone/);
      const otherCard = await undoApprovalCard(client, USER, { toolCallId: "toolu_expense" }, now);
      const swapped = { toolCallId: "toolu_client", [UNDO_FINGERPRINT_ARG]: otherCard.args[UNDO_FINGERPRINT_ARG] };
      expect(await execute(swapped, { toolCallId: "t", messages: [] })).toMatch(/isn't the one that was shown/);
    });
  });
});
