/**
 * The MCP server's statement import tools, run through their real handlers
 * (tool-harness.ts). They mirror Flight Crew's Navigator tools: the reads
 * describe lines from the engine; confirm re-runs the duplicate check before
 * fn_confirm_statement_lines; match goes through fn_match_statement_line.
 * Synthetic rows only.
 */
import { describe, expect, it } from "vitest";
import { callTool, fakeSupabase, loadTools, type Row } from "./tool-harness";

const USER = "user-under-test";
const OTHER = "someone-else";
const STMT = "10000000-0000-4000-8000-000000000001";
const L_FUEL = "20000000-0000-4000-8000-000000000001";
const L_PHOTO = "20000000-0000-4000-8000-000000000002";
const L_LATE = "20000000-0000-4000-8000-000000000003";
const R_FUEL = "30000000-0000-4000-8000-000000000001";
const R_LATE = "30000000-0000-4000-8000-000000000002";

function line(overrides: Row): Row {
  return {
    user_id: USER, statement_id: STMT, source_category: null, category_key: null, category_source: "hint",
    status: "pending", skip_reason: null, match_receipt_id: null, match_method: null, match_confidence: null,
    recurring_expense_id: null, recurring_charge_date: null, duplicate_candidate_count: 0, duplicate_dismissed: false,
    hold_reason: null, related_line_id: null, related_receipt_id: null,
    expense_deleted_at: null, direction: "out", business_likelihood: 0.65, likelihood_reason: "Estimated from the merchant name.",
    ...overrides,
  };
}

function tables(): Record<string, Row[]> {
  return {
    imported_statements: [
      { id: STMT, user_id: USER, kind: "credit_card", institution: "RBC", account_label: "RBC Visa", period_start: "2026-09-01", period_end: "2026-09-30", status: "review", line_count: 3, pending_count: 3, confirmed_count: 0, skipped_count: 0, warnings: [] },
      { id: "theirs", user_id: OTHER, kind: "bank", institution: null, account_label: "Not mine", period_start: "2026-09-01", period_end: "2026-09-30", status: "review", line_count: 1, pending_count: 1, confirmed_count: 0, skipped_count: 0, warnings: [] },
    ],
    statement_lines: [
      line({ id: L_FUEL, line_date: "2026-09-03", description: "SHELL C04512", merchant: "Shell", amount: 54.2, suggested_category_key: "vehicle_fuel", match_receipt_id: R_FUEL, match_method: "exact", match_confidence: 1, duplicate_candidate_count: 1 }),
      line({ id: L_PHOTO, line_date: "2026-09-09", description: "LISTING PHOTO STUDIO", merchant: "Listing Photo Studio", amount: 250, suggested_category_key: null, business_likelihood: null, category_source: null }),
      // A receipt for this one was scanned after the upload.
      line({ id: L_LATE, line_date: "2026-09-21", description: "CAFE CO", merchant: "Cafe Co", amount: 12.4, suggested_category_key: "meals_client", business_likelihood: 0.45 }),
      line({ id: "their-line", user_id: OTHER, statement_id: "theirs", line_date: "2026-09-05", description: "NOT MINE", merchant: null, amount: 1, suggested_category_key: null }),
    ],
    receipt_expenses: [
      { id: R_FUEL, user_id: USER, vendor: "Shell", expense_date: "2026-09-03", total_amount: 54.2, tax_amount: 7.07, category_key: "vehicle_fuel", receipt_path: "u/1.jpg", source: null, statement_line_id: null },
      { id: R_LATE, user_id: USER, vendor: "Cafe Co", expense_date: "2026-09-21", total_amount: 12.4, tax_amount: 1.62, category_key: "meals_client", receipt_path: "u/2.jpg", source: null, statement_line_id: null },
    ],
    recurring_expenses: [],
  };
}

/** fn_set_statement_line_flags as the database runs it: the pending lines' columns change. */
function applyFlags(t: Record<string, Row[]>, args: Record<string, unknown>) {
  for (const u of (args.p_updates as Row[]) ?? []) {
    const row = t.statement_lines.find((l) => l.id === u.id && l.status === "pending");
    if (row) Object.assign(row, u);
  }
}

async function tools(db: ReturnType<typeof fakeSupabase>) {
  return loadTools("statement-import.ts", "getStatementImportTools", db, USER);
}

describe("list_import_review_lines", () => {
  it("lists this agent's pending lines with what confirming would do, and the reconciliation lists", async () => {
    const db = fakeSupabase(tables());
    const out = await callTool<{
      statements: { account: string }[];
      count: number;
      lines: { line_id: string; already_on_file: { kind: string; receipt_id: string } | null; confirming_would: string; business_likelihood_label: string }[];
      reconciliation: { receipts_with_no_statement_line: { receipt_id: string }[] };
    }>(await tools(db), "list_import_review_lines");
    expect(out.statements.map((s) => s.account)).toEqual(["RBC Visa"]);
    expect(out.count).toBe(3);
    const fuel = out.lines.find((l) => l.line_id === L_FUEL)!;
    expect(fuel.already_on_file).toMatchObject({ kind: "receipt", receipt_id: R_FUEL });
    expect(fuel.confirming_would).toBe("link it to the receipt on file; nothing added");
    expect(out.lines.find((l) => l.line_id === L_PHOTO)!.confirming_would).toMatch(/^not add it: That line has no category yet/);
    expect(fuel.business_likelihood_label).toBe("65% business");
    expect(out.reconciliation.receipts_with_no_statement_line.map((r) => r.receipt_id).sort()).toEqual([R_FUEL, R_LATE].sort());
    expect(JSON.stringify(out)).not.toContain("NOT MINE");
    expect(db.updates).toEqual([]);
    expect(db.rpcs).toEqual([]);
  });
});

describe("draft_line_categories and explain_import_line", () => {
  it("drafts from the stored estimate and never writes", async () => {
    const db = fakeSupabase(tables());
    const out = await callTool<{ saved: boolean; drafts: { line_id: string; category_key: string | null; basis: string }[] }>(await tools(db), "draft_line_categories");
    expect(out.saved).toBe(false);
    expect(out.drafts.find((d) => d.line_id === L_PHOTO)).toMatchObject({ category_key: null, basis: "no item estimated; the agent picks one or skips the line" });
    expect(out.drafts.find((d) => d.line_id === L_FUEL)).toMatchObject({ category_key: "vehicle_fuel", basis: "the import's estimate" });
    expect(db.updates).toEqual([]);
  });

  it("explains a line with the GST/HST note, the CRA rules and the disclaimer", async () => {
    const db = fakeSupabase(tables());
    const out = await callTool<{ found: boolean; gst_hst: string; cra_rules: string[]; disclaimer: string; confirming_would: string }>(await tools(db), "explain_import_line", { line_id: L_LATE });
    expect(out.found).toBe(true);
    expect(out.gst_hst).toMatch(/saved with GST\/HST empty/);
    expect(out.cra_rules.join(" ")).toMatch(/50% of the lesser/);
    expect(out.disclaimer).toMatch(/^This is an estimate based on CRA rules/);
  });
});

describe("confirm_import_lines", () => {
  it("re-runs the duplicate check first, so a receipt scanned after the upload links instead of doubling", async () => {
    const t = tables();
    const db = fakeSupabase(t, {
      rpc: (name, args) => {
        if (name === "fn_set_statement_line_flags") return applyFlags(t, args);
        return { created: [], linked: [{ id: L_FUEL }, { id: L_LATE }], recurring: [], refused: [] };
      },
    });
    const out = await callTool<{ added_to_expenses: number; already_on_file_linked: number; not_confirmed: { line_id: string; reason: string }[] }>(await tools(db), "confirm_import_lines", {
      lines: [{ line_id: L_FUEL }, { line_id: L_PHOTO, category_key: "marketing_photography" }, { line_id: L_LATE }],
    });
    // The late receipt is now this line's duplicate: written in one batch
    // (fn_set_statement_line_flags) before the confirm.
    expect(db.rpcs.map((r) => r.name)).toEqual(["fn_set_statement_line_flags", "fn_confirm_statement_lines"]);
    expect(db.rpcs[0].args).toEqual({ p_updates: [{
      id: L_LATE, match_receipt_id: R_LATE, match_method: "exact", match_confidence: 1, recurring_expense_id: null,
      recurring_charge_date: null, duplicate_candidate_count: 1, hold_reason: null, related_line_id: null, related_receipt_id: null,
    }] });
    // The photographer's line has no business estimate: the category passed
    // makes it addable, but isn't the agent's own choice, so a confirm of
    // several leaves it out.
    expect(db.rpcs[1].args).toEqual({ p_lines: [
      { id: L_FUEL, category_key: null },
      { id: L_LATE, category_key: null },
    ] });
    expect(out).toMatchObject({ added_to_expenses: 0, already_on_file_linked: 2 });
    expect(out.not_confirmed).toEqual([{ line_id: L_PHOTO, reason: "bulk_low_likelihood", message: expect.stringMatching(/under 50% business/) }]);
  });

  it("an unverified PDF whose model call failed, with the client's categories, confirms nothing in bulk", async () => {
    const t = tables();
    Object.assign(t.imported_statements[0], { verification: "unverified" });
    // No estimates at all: the model call failed.
    t.statement_lines = [
      line({ id: L_PHOTO, line_date: "2026-09-09", description: "LISTING PHOTO STUDIO", merchant: "Listing Photo Studio", amount: 250, suggested_category_key: null, business_likelihood: null, category_source: null }),
      line({ id: L_LATE, line_date: "2026-09-25", description: "STAPLES 123", merchant: "Staples", amount: 41, suggested_category_key: null, business_likelihood: null, category_source: null }),
    ];
    const db = fakeSupabase(t, { rpc: (name, args) => (name === "fn_set_statement_line_flags" ? applyFlags(t, args) : { created: [], linked: [], recurring: [], refused: [] }) });
    const out = await callTool<{ added_to_expenses: number; not_confirmed: { line_id: string; reason: string }[] }>(await tools(db), "confirm_import_lines", {
      lines: [{ line_id: L_PHOTO, category_key: "marketing_photography" }, { line_id: L_LATE, category_key: "office_supplies" }],
    });
    expect(db.rpcs.filter((r) => r.name === "fn_confirm_statement_lines")).toEqual([]);
    expect(out.added_to_expenses).toBe(0);
    expect(out.not_confirmed.map((r) => r.reason)).toEqual(["bulk_unverified_statement", "bulk_unverified_statement"]);
  });

  it("refuses a line confirming would refuse, instead of leaving it to the database", async () => {
    const t = tables();
    const db = fakeSupabase(t, { rpc: (name, args) => (name === "fn_set_statement_line_flags" ? applyFlags(t, args) : { created: [], linked: [{ id: L_FUEL }], recurring: [], refused: [] }) });
    const out = await callTool<{ not_confirmed: { line_id: string; reason: string }[] }>(await tools(db), "confirm_import_lines", {
      lines: [{ line_id: L_FUEL }, { line_id: L_PHOTO }, { line_id: "20000000-0000-4000-8000-0000000000ff" }],
    });
    expect(out.not_confirmed.map((r) => [r.line_id, r.reason])).toEqual([
      [L_PHOTO, "needs_category"],
      ["20000000-0000-4000-8000-0000000000ff", "not_found"],
    ]);
    expect(db.rpcs.find((r) => r.name === "fn_confirm_statement_lines")?.args).toEqual({ p_lines: [{ id: L_FUEL, category_key: null }] });
  });

  it("checks the item key as the web does, and leaves an under-50% line out of a bulk confirm", async () => {
    const t = tables();
    // The photographer's line now has an estimate, at 40%.
    Object.assign(t.statement_lines[1], { suggested_category_key: "marketing_photography", business_likelihood: 0.4 });
    const db = fakeSupabase(t, {
      rpc: (name, args) => (name === "fn_set_statement_line_flags" ? applyFlags(t, args) : { created: [], linked: [{ id: L_FUEL }], recurring: [], refused: [] }),
    });
    const out = await callTool<{ not_confirmed: { line_id: string; reason: string }[] }>(await tools(db), "confirm_import_lines", {
      lines: [{ line_id: L_FUEL }, { line_id: L_PHOTO }, { line_id: L_LATE, category_key: "travel_meals" }],
    });
    expect(out.not_confirmed).toEqual([
      { line_id: L_LATE, reason: "unknown_category", message: "That category isn't one of your expense items." },
      { line_id: L_PHOTO, reason: "bulk_low_likelihood", message: expect.stringMatching(/under 50% business/) },
    ]);
    expect(db.rpcs.find((r) => r.name === "fn_confirm_statement_lines")?.args).toEqual({ p_lines: [{ id: L_FUEL, category_key: null }] });
  });

  it("skips lines the agent says are not business, and only pending ones", async () => {
    const db = fakeSupabase(tables());
    const out = await callTool<{ skipped: number }>(await tools(db), "confirm_import_lines", { skip_line_ids: [L_PHOTO] });
    expect(out.skipped).toBe(1);
    expect(db.updates[0]).toMatchObject({ table: "statement_lines", values: { status: "skipped", skip_reason: "user" } });
    expect(db.updates[0].filters).toContain("eq(status,pending)");
  });
});

describe("match_receipt_to_line", () => {
  it("calls fn_match_statement_line and passes a refusal on in plain words", async () => {
    const db = fakeSupabase(tables(), { rpc: () => ({ ok: false, reason: "counted_by_recurring" }) });
    const out = await callTool<{ matched: boolean; message: string }>(await tools(db), "match_receipt_to_line", { line_id: L_PHOTO, receipt_id: R_LATE });
    expect(db.rpcs).toEqual([{ name: "fn_match_statement_line", args: { p_line_id: L_PHOTO, p_receipt_id: R_LATE } }]);
    expect(out).toEqual({ matched: false, reason: "counted_by_recurring", message: "That charge is counted by your Recurring Expenses list. A receipt for it would count it a second time." });
  });

  it("rejects ids that aren't ids before calling anything", async () => {
    const db = fakeSupabase(tables());
    const tool = (await tools(db)).find((t) => t.name === "match_receipt_to_line")!;
    await expect(tool.handler({ line_id: "x", receipt_id: R_LATE })).rejects.toThrow(/IDs/);
    expect(db.rpcs).toEqual([]);
  });
});
