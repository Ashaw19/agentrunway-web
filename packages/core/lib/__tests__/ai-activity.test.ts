/**
 * Reading the AI run ledger (core/lib/ai-activity.ts, migration 00182):
 * grouping writes into one action per tool call, the net change per record,
 * when Undo is offered, and the words the lists show. Synthetic rows only.
 */
import { describe, expect, it } from "vitest";
import type { AiRunWrite } from "../../types/database";
import { write } from "./ai-ledger-fixtures";
import {
  AI_UNDO_WINDOW_DAYS,
  actionUndoBlocker,
  changedColumns,
  describeAction,
  describeRowChange,
  formatAiCost,
  groupWritesIntoActions,
  insertableImage,
  isRedactedText,
  jsonEqual,
  netRowChanges,
  redactRow,
  rowMatchesImage,
  summarizeRuns,
  toolLabel,
  undoConsequences,
  undoTableBlocker,
} from "../ai-activity";

const NOW = new Date("2026-10-18T16:00:00.000Z");

describe("groupWritesIntoActions", () => {
  it("one action per tool call, newest first, writes in order", () => {
    const actions = groupWritesIntoActions([
      write({ tool_call_id: "a", seq: 1, created_at: "2026-10-18T10:00:01Z", action: "update" }),
      write({ tool_call_id: "a", seq: 0, created_at: "2026-10-18T10:00:00Z" }),
      write({ tool_call_id: "b", created_at: "2026-10-18T12:00:00Z" }),
    ]);
    expect(actions.map((a) => a.toolCallId)).toEqual(["b", "a"]);
    expect(actions[1].writes.map((w) => w.seq)).toEqual([0, 1]);
    expect(actions[1].createdAt).toBe("2026-10-18T10:00:00Z");
  });

  it("undone only when every successful write is undone; failures counted", () => {
    const [partial] = groupWritesIntoActions([
      write({ undone_at: "2026-10-18T15:00:00Z" }),
      write({ row_id: "r2", seq: 1 }),
    ]);
    expect(partial.undone).toBe(false);
    const [all] = groupWritesIntoActions([
      write({ undone_at: "2026-10-18T15:00:00Z" }),
      write({ seq: 1, outcome: "error", row_id: null, after_image: null, error_class: "42703" }),
    ]);
    expect(all.undone).toBe(true);
    expect(all.undoneAt).toBe("2026-10-18T15:00:00Z");
    expect(all.failed).toBe(true);
    expect(all.failedWrites).toBe(1);
  });
});

describe("netRowChanges", () => {
  it("an insert then an update of the same row is one created record, ending at the last image", () => {
    const changes = netRowChanges([
      write({ table_name: "outreach_queue", action: "insert", after_image: { id: "r1", status: "draft" } }),
      write({ table_name: "outreach_queue", seq: 1, action: "update", before_image: { id: "r1", status: "draft" }, after_image: { id: "r1", status: "ready" } }),
    ]);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "created", before: null, after: { id: "r1", status: "ready" } });
    expect(changes[0].writeIds).toHaveLength(2);
  });

  it("created then deleted in the same call leaves nothing to undo", () => {
    expect(
      netRowChanges([
        write({ action: "insert" }),
        write({ seq: 1, action: "delete", before_image: { id: "r1" }, after_image: null }),
      ]),
    ).toEqual([]);
  });

  it("skips failed and undone writes unless asked", () => {
    const ws = [write({ undone_at: "2026-10-18T15:00:00Z" }), write({ row_id: null, outcome: "error" })];
    expect(netRowChanges(ws)).toEqual([]);
    expect(netRowChanges(ws, { includeUndone: true })).toHaveLength(1);
  });
});

describe("row images", () => {
  it("AI-written draft text is stored as a length and hash, never the text", () => {
    const row = { id: "q1", ai_subject: "Happy home anniversary, Pat", ai_body: "", status: "ready" };
    const red = redactRow("outreach_queue", row)!;
    expect(isRedactedText(red.ai_subject)).toBe(true);
    expect(JSON.stringify(red)).not.toContain("Pat");
    expect(red.ai_body).toBe(""); // empty stays empty
    expect(red.status).toBe("ready");
    // Other tables are stored as they are.
    expect(redactRow("clients", { id: "c", notes: "likes boats" })).toEqual({ id: "c", notes: "likes boats" });
  });

  it("a fresh row matches its redacted image, and a changed draft doesn't", () => {
    const row = { id: "q1", ai_body: "Hi Pat", status: "ready" };
    const image = redactRow("outreach_queue", row);
    expect(rowMatchesImage("outreach_queue", row, image)).toBe(true);
    expect(rowMatchesImage("outreach_queue", { ...row, ai_body: "Hi Pat!" }, image)).toBe(false);
  });

  it("jsonEqual compares nested values and key sets", () => {
    expect(jsonEqual({ a: [1, { b: null }] }, { a: [1, { b: null }] })).toBe(true);
    expect(jsonEqual({ a: 1 }, { a: 1, b: undefined })).toBe(true);
    expect(jsonEqual({ a: 1 }, { a: 1, b: null })).toBe(false);
    expect(jsonEqual([1, 2], [2, 1])).toBe(false);
  });

  it("changedColumns leaves out the key, updated_at and generated columns", () => {
    const before = { id: "m1", km: 10, deduction: 7.3, updated_at: "t1", notes: "a" };
    const after = { id: "m1", km: 20, deduction: 14.6, updated_at: "t2", notes: "a" };
    expect(changedColumns("mileage_logs", before, after)).toEqual(["km"]);
    expect(insertableImage("mileage_logs", before)).not.toHaveProperty("deduction");
  });
});

describe("actionUndoBlocker", () => {
  const action = (ws: AiRunWrite[]) => groupWritesIntoActions(ws)[0];

  it("offers undo on a recent, reviewed change", () => {
    expect(actionUndoBlocker(action([write({})]), NOW)).toBeNull();
  });

  it("refuses: undone, nothing saved, too old, not reviewed for undo, no earlier version", () => {
    expect(actionUndoBlocker(action([write({ undone_at: "2026-10-18T15:00:00Z" })]), NOW)).toBe("Already undone.");
    expect(actionUndoBlocker(action([write({ outcome: "error", row_id: null })]), NOW)).toMatch(/didn't save/);
    const old = new Date(NOW.getTime() - (AI_UNDO_WINDOW_DAYS + 1) * 86_400_000).toISOString();
    expect(actionUndoBlocker(action([write({ created_at: old })]), NOW)).toMatch(/30 days/);
    expect(actionUndoBlocker(action([write({ table_name: "income_goals" })]), NOW)).toMatch(/income goal/);
    expect(actionUndoBlocker(action([write({ table_name: "some_new_table" })]), NOW)).toMatch(/isn't set up for undo/);
    expect(actionUndoBlocker(action([write({ action: "update", before_image: null })]), NOW)).toMatch(/earlier version/);
  });

  it("refuses in planning what the apply couldn't do: earlier AI text, the income goal, irreversible rows", () => {
    const redacted = { $redacted: "ai_text", length: 6, hash: "abcd1234" };
    expect(
      actionUndoBlocker(action([write({ table_name: "outreach_queue", action: "update", before_image: { id: "r1", ai_body: redacted }, after_image: { id: "r1", ai_body: { ...redacted, hash: "ffff0000" } } })]), NOW),
    ).toMatch(/AI-written text/);
    expect(
      actionUndoBlocker(action([write({ table_name: "user_settings", row_id: "u1", action: "update", before_image: { user_id: "u1", goal_gci: 1 }, after_image: { user_id: "u1", goal_gci: 2 } })]), NOW),
    ).toMatch(/Annual Goal/);
    expect(actionUndoBlocker(action([write({ irreversible_reason: "Other records were linked to it." })]), NOW)).toBe("Other records were linked to it.");
    // CASL evidence (00183): a consent record and an unsubscribe are never undone.
    expect(actionUndoBlocker(action([write({ tool_name: "recordConsent", table_name: "client_email_consents", after_image: { id: "r1", channel: "email" } })]), NOW)).toMatch(/CASL evidence/);
    expect(
      actionUndoBlocker(action([write({ table_name: "clients", row_id: "c1", action: "update", before_image: { id: "c1", sms_opt_out_at: null }, after_image: { id: "c1", sms_opt_out_at: "2026-10-14T12:00:00Z" } })]), NOW),
    ).toMatch(/unsubscribe is CASL evidence/);
    // A draft the AI created can still be removed.
    expect(actionUndoBlocker(action([write({ table_name: "outreach_queue", after_image: { id: "r1", ai_body: redacted } })]), NOW)).toBeNull();
  });

  it("every table Flight Crew writes is either reviewed for undo or excluded with a reason", () => {
    for (const t of ["clients", "transactions", "receipt_expenses", "recurring_expenses", "mileage_logs", "t2125_cca_assets", "user_settings", "outreach_queue"]) {
      expect(undoTableBlocker(t), t).toBeNull();
    }
    expect(undoTableBlocker("ai_run_writes")).toMatch(/ledger/);
  });
});

describe("words", () => {
  it("says what undo will do before it does it", () => {
    const [a] = groupWritesIntoActions([
      write({ tool_name: "createClient", table_name: "clients", row_id: "c1", after_image: { id: "c1", name: "Pat Example" } }),
      write({ tool_name: "createClient", seq: 1, table_name: "receipt_expenses", row_id: "e1", action: "update", before_image: { id: "e1", vendor: "A" }, after_image: { id: "e1", vendor: "B" } }),
    ]);
    expect(undoConsequences(a)).toEqual(['Deletes the client "Pat Example" for good', 'Puts back the expense "B": vendor']);
    const [deletedCall] = groupWritesIntoActions([
      write({ tool_name: "deleteContactActivity", table_name: "contact_activities", row_id: "a1", action: "delete", before_image: { id: "a1", type: "call", description: "Spring listing chat" }, after_image: null }),
    ]);
    expect(undoConsequences(deletedCall)[0]).toMatch(/^Brings back the activity "Spring listing chat" \(bringing it back counts as logging it again/);
    const [deletedNote] = groupWritesIntoActions([
      write({ tool_name: "deleteContactActivity", table_name: "contact_activities", row_id: "a1", action: "delete", before_image: { id: "a1", type: "note", description: "Memo" }, after_image: null }),
    ]);
    expect(undoConsequences(deletedNote)).toEqual(['Brings back the activity "Memo"']);
  });

  it("labels known tools and falls back to the tool name in words", () => {
    expect(toolLabel("logExpense")).toBe("Logged an expense");
    expect(toolLabel("somethingNewHere")).toBe("Something new here");
  });

  it("names the record from its image", () => {
    const [a] = groupWritesIntoActions([write({})]);
    expect(describeAction(a)).toBe("Logged an expense: Staples");
    expect(
      describeRowChange({ table: "receipt_expenses", rowId: "r1", kind: "changed", before: { id: "r1", vendor: "A", total_amount: 1 }, after: { id: "r1", vendor: "B", total_amount: 1 }, writeIds: [] }),
    ).toBe("Changed expense: vendor");
  });

  it("summarizes runs by feature with failures and cost", () => {
    const s = summarizeRuns([
      { feature: "chat", outcome: "ok", estimated_cost_usd: 0.01 },
      { feature: "chat", outcome: "error", estimated_cost_usd: null },
      { feature: "receipt-ocr", outcome: "aborted", estimated_cost_usd: 0.002 },
    ]);
    expect(s).toMatchObject({ calls: 3, failed: 1, aborted: 1 });
    expect(s.costUsd).toBeCloseTo(0.012, 6);
    expect(s.byFeature[0]).toMatchObject({ feature: "chat", calls: 2, failed: 1 });
    expect(formatAiCost(0.0042)).toBe("$0.0042");
    expect(formatAiCost(1.271)).toBe("$1.27");
    expect(formatAiCost(0)).toBe("$0.00");
  });
});
