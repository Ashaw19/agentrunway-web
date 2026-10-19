/**
 * A confirm of more lines than one request takes ("Confirm all" on a big
 * import) goes in batches, and every batch of a confirm of several is judged
 * by the bulk rules, even a last batch of one line. Synthetic rows only.
 */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LINE_BATCH, batches, confirmRequests } from "../batches";
import { MAX_CONFIRM_LINES, confirmStatementLines } from "../server";
import { fakeSupabase, type Row } from "@/lib/ai/__tests__/helpers/fake-supabase";

const USER = "user-1";
const STMT = "10000000-0000-4000-8000-000000000001";
const L1 = "20000000-0000-4000-8000-000000000001";

function setup(verification: string) {
  const t: Record<string, Row[]> = {
    imported_statements: [{ id: STMT, user_id: USER, verification }],
    statement_lines: [{
      id: L1, user_id: USER, statement_id: STMT, line_date: "2026-09-09", description: "LISTING PHOTO STUDIO", merchant: "Listing Photo Studio",
      amount: 250, direction: "out", status: "pending", suggested_category_key: "marketing_photography", category_key: null, category_source: "hint",
      business_likelihood: 0.9, match_receipt_id: null, recurring_expense_id: null, duplicate_candidate_count: 0, duplicate_dismissed: false,
      hold_reason: null, related_line_id: null, related_receipt_id: null, expense_deleted_at: null,
    }],
    receipt_expenses: [],
    recurring_expenses: [],
  };
  const rpcs: string[] = [];
  const client = Object.assign(fakeSupabase(t).client, {
    rpc: async (name: string) => {
      rpcs.push(name);
      return { data: name === "fn_confirm_statement_lines" ? { created: [{ id: L1, receipt_id: "r" }], linked: [], recurring: [], refused: [] } : {}, error: null };
    },
  }) as SupabaseClient;
  return { client, rpcs };
}

describe("confirm batches", () => {
  it("splits at the server's limit, and marks every batch of a confirm of several as bulk", () => {
    expect(LINE_BATCH).toBe(MAX_CONFIRM_LINES);
    const ids = Array.from({ length: 4001 }, (_, i) => `line-${i}`);
    expect(batches(ids).map((b) => b.length)).toEqual([2000, 2000, 1]);
    const requests = confirmRequests(ids, false);
    expect(requests.map((r) => [r.lines.length, r.bulk])).toEqual([[2000, true], [2000, true], [1, true]]);
    expect(confirmRequests(["only"], true)).toEqual([{ action: "confirm", bulk: false, lines: [{ id: "only" }] }]);
  });

  it("a batch of one line marked bulk goes through the bulk rules", async () => {
    const { client, rpcs } = setup("unverified");
    const out = await confirmStatementLines(client, USER, [{ id: L1 }], { bulk: true });
    expect(out.refused).toEqual([{ id: L1, reason: "bulk_unverified_statement" }]);
    expect(rpcs).not.toContain("fn_confirm_statement_lines");
  });

  it("the agent's single line, not marked bulk, is confirmed as asked", async () => {
    const { client, rpcs } = setup("unverified");
    const out = await confirmStatementLines(client, USER, [{ id: L1 }]);
    expect(out.created).toEqual([{ id: L1, receipt_id: "r" }]);
    expect(rpcs).toContain("fn_confirm_statement_lines");
  });

  it("refuses more lines than one request takes", async () => {
    const { client } = setup("reconciled");
    const many = Array.from({ length: MAX_CONFIRM_LINES + 1 }, (_, i) => ({ id: `20000000-0000-4000-8000-${String(i).padStart(12, "0")}` }));
    await expect(confirmStatementLines(client, USER, many)).rejects.toThrow(/too many lines/);
  });
});
