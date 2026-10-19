/**
 * fn_confirm_statement_lines (migration 00185) and confirmationOutcome
 * (statement-import-engine) make the same decision, in the same order: the
 * Imports tab's confirm summary, Flight Crew and the MCP server describe
 * what confirming does with the engine; the database does it with the SQL.
 *
 * What the SQL DOES is tested by running it: scripts/db/behavior-checks.sql
 * (CI's db-functions job, every migration replayed into a real Postgres)
 * calls these functions as the signed-in role with row level security on,
 * and checks the rows they leave. This file pins the two things a run can't:
 * that the branch order still mirrors the engine, and that the behaviour
 * checks still cover each function. The item key list is pinned in
 * statement-import-keys.test.ts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { confirmationOutcome, expenseRowForStatementLine } from "@agent-runway/core/engines/statement-import-engine";

const SQL = readFileSync(path.join(__dirname, "../../../supabase/migrations/00185_statement_import.sql"), "utf8");

function fnBody(name: string): string {
  const start = SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  const bodyStart = SQL.indexOf("AS $$", start);
  const bodyEnd = SQL.indexOf("$$;", bodyStart + 5);
  return SQL.slice(bodyStart, bodyEnd);
}

describe("fn_confirm_statement_lines mirrors confirmationOutcome", () => {
  const body = fnBody("fn_confirm_statement_lines");
  const at = (needle: string) => {
    const i = body.indexOf(needle);
    expect(i, needle).toBeGreaterThan(-1);
    return i;
  };

  it("checks in the engine's order: pending, money out, then (unless dismissed) receipt, recurring, held, then category", () => {
    const order = [
      at("v_line.status <> 'pending'"),
      at("v_line.direction <> 'out'"),
      at("IF NOT v_line.duplicate_dismissed THEN"),
      at("v_line.match_receipt_id IS NOT NULL"),
      at("v_line.recurring_expense_id IS NOT NULL"),
      at("v_line.hold_reason IS NOT NULL OR v_line.duplicate_candidate_count > 1"),
      at("v_category := coalesce(nullif(btrim(coalesce(v_item->>'category_key', '')), ''), v_line.category_key, v_line.suggested_category_key)"),
      at("INSERT INTO receipt_expenses"),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);

    // The engine's branches in the same order.
    const base = { status: "pending" as const, direction: "out" as const, suggested_category_key: "other_misc" };
    expect(confirmationOutcome({ ...base, status: "skipped" }).action).toBe("refuse");
    expect(confirmationOutcome({ ...base, direction: "in" })).toEqual({ action: "refuse", reason: "not_a_charge" });
    expect(confirmationOutcome({ ...base, match_receipt_id: "r", recurring_expense_id: "re", duplicate_candidate_count: 3 }).action).toBe("link_receipt");
    expect(confirmationOutcome({ ...base, recurring_expense_id: "re", duplicate_candidate_count: 3 }).action).toBe("recurring");
    expect(confirmationOutcome({ ...base, duplicate_candidate_count: 2 })).toEqual({ action: "refuse", reason: "needs_decision" });
    expect(confirmationOutcome({ ...base, hold_reason: "refund", duplicate_candidate_count: 1 })).toEqual({ action: "refuse", reason: "needs_decision" });
    expect(confirmationOutcome({ ...base, duplicate_dismissed: true, match_receipt_id: "r" }).action).toBe("create");
  });

  it("the refusal reasons are the engine's (plus the two only the database can see)", () => {
    const reasons = [...body.matchAll(/'reason', '([a-z_]+)'/g)].map((m) => m[1]);
    expect(new Set(reasons)).toEqual(new Set(["not_found", "not_pending", "not_a_charge", "needs_decision", "needs_category", "unknown_category"]));
  });

  it("a line already on file is linked and nothing is inserted on that branch", () => {
    const link = body.slice(at("v_line.match_receipt_id IS NOT NULL"), at("v_line.recurring_expense_id IS NOT NULL"));
    expect(link).toMatch(/UPDATE receipt_expenses\s+SET statement_line_id = v_line\.id/);
    expect(link).not.toMatch(/INSERT/);
    const recurring = body.slice(at("v_line.recurring_expense_id IS NOT NULL"), at("v_line.hold_reason IS NOT NULL OR v_line.duplicate_candidate_count > 1"));
    expect(recurring).not.toMatch(/INSERT|receipt_expenses/);
  });

  it("inserts the columns of expenseRowForStatementLine, GST/HST and subtotal NULL", () => {
    const insert = body.slice(at("INSERT INTO receipt_expenses ("), body.indexOf("RETURNING id INTO v_receipt_id;", at("INSERT INTO receipt_expenses (")));
    const cols = insert.slice(insert.indexOf("(") + 1, insert.indexOf(")")).split(",").map((c) => c.trim());
    const row = expenseRowForStatementLine({ id: "l", line_date: "2026-09-10", amount: 1, description: "X" }, "other_misc", "Card");
    expect(cols).toEqual(["user_id", ...Object.keys(row)]);
    const values = insert.slice(insert.indexOf("VALUES"));
    // tax_amount and subtotal are the 5th and 6th values: NULL.
    expect(values).toMatch(/v_line\.amount,\s+NULL,\s+NULL,\s+'CAD'/);
    expect(row.tax_amount).toBeNull();
    // The note is the engine's wording.
    expect(values).toContain("'From statement import'");
    expect(values).toContain("'From statement import, ' || btrim(v_label)");
    expect(row.notes).toBe("From statement import, Card");
    // The vendor is cut to the engine's length.
    expect(values).toContain(", 120)");
  });

  it("a row the line already made is reused, never doubled", () => {
    expect(body).toMatch(/WHERE re\.user_id = v_uid AND re\.statement_line_id = v_line\.id;\s+IF v_receipt_id IS NULL THEN\s+INSERT INTO receipt_expenses/);
  });
});

describe("migration 00185 is additive and RLS-guarded", () => {
  it("adds only nullable columns to receipt_expenses, and drops nothing", () => {
    const alter = SQL.slice(SQL.indexOf("ALTER TABLE public.receipt_expenses"), SQL.indexOf(";", SQL.indexOf("ALTER TABLE public.receipt_expenses")));
    expect(alter).not.toMatch(/NOT NULL/);
    expect(SQL).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
  });

  it("the RPC functions run under the caller's row level security", () => {
    for (const fn of ["fn_confirm_statement_lines", "fn_match_statement_line", "fn_reopen_statement_lines", "fn_set_statement_line_flags"]) {
      const head = SQL.slice(SQL.indexOf(`FUNCTION public.${fn}(`), SQL.indexOf("AS $$", SQL.indexOf(`FUNCTION public.${fn}(`)));
      expect(head, fn).toMatch(/SECURITY INVOKER/);
      expect(head, fn).toMatch(/SET search_path = public/);
    }
  });
});

describe("the database behaviour checks run each function as the signed-in agent", () => {
  const CHECKS = readFileSync(path.join(__dirname, "../../../../../scripts/db/behavior-checks.sql"), "utf8");
  const block = CHECKS.slice(CHECKS.indexOf("-- 00185: statement import"));

  it("switches to the authenticated role, with the JWT claim auth.uid() reads", () => {
    expect(block).toContain("SET LOCAL ROLE authenticated;");
    expect(block).toContain("set_config('request.jwt.claim.sub', v_user::text, true)");
  });

  it.each([
    ["fn_confirm_statement_lines(", "confirm: link, recurring, held refused, one row added, idempotent"],
    ["fn_set_statement_line_flags(", "the duplicate check's batched write"],
    ["fn_match_statement_line(", "a receipt replaces the statement copy"],
    ["fn_reopen_statement_lines(", "back to review keeps a receipt"],
    ["DELETE FROM receipt_expenses WHERE id = v_copy", "a deleted expense sends its line back"],
    ["INSERT INTO receipt_expenses (user_id, vendor, expense_date, total_amount, tax_amount, receipt_path)", "a receipt saved later takes over the line"],
    ["UPDATE recurring_expenses SET day_of_month", "a changed recurring expense sends its line back"],
    ["generate_series(1, 5000)", "5,000 lines inside the statement timeout"],
    ["another agent''s line was confirmable", "row level security"],
  ])("covers %s (%s)", (needle) => {
    expect(block).toContain(needle);
  });
});
