/**
 * Flight Crew's statement import tools (Navigator): the reads describe lines
 * and estimates without writing; the two writes are on the approval card and
 * go through the duplicate check and the RPC functions of migration 00185.
 * Synthetic rows only.
 */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CANONICAL_TAX_DISCLAIMER, STATEMENT_GST_HST_NOTE, validateTaxCopy } from "@agent-runway/core/tax-copy";
import { APPROVAL_DESCRIPTIONS, NEEDS_APPROVAL_TOOLS, createAgentTools, createPersonaAgentTools } from "../tools";
import { fakeSupabase, type Row } from "./helpers/fake-supabase";

const USER = "user-1";
const STMT = "10000000-0000-4000-8000-000000000001";
const L_FUEL = "20000000-0000-4000-8000-000000000001";
const L_PHOTO = "20000000-0000-4000-8000-000000000002";
const L_HELD = "20000000-0000-4000-8000-000000000003";
const R_FUEL = "30000000-0000-4000-8000-000000000001";
const R_A = "30000000-0000-4000-8000-000000000002";
const R_B = "30000000-0000-4000-8000-000000000003";

function line(overrides: Row): Row {
  return {
    user_id: USER, statement_id: STMT, posted_date: null, source_category: null, category_key: null, category_source: "hint",
    hold_reason: null, related_line_id: null, related_receipt_id: null,
    status: "pending", skip_reason: null, match_receipt_id: null, match_method: null, match_confidence: null,
    recurring_expense_id: null, recurring_charge_date: null, duplicate_candidate_count: 0, duplicate_dismissed: false,
    expense_deleted_at: null, confirmed_at: null, direction: "out", business_likelihood: 0.65, likelihood_reason: "Estimated from the merchant name.",
    ...overrides,
  };
}

function tables(): Record<string, Row[]> {
  return {
    imported_statements: [{
      id: STMT, user_id: USER, kind: "credit_card", source_format: "csv:rbc", institution: "RBC", account_label: "RBC Visa",
      file_name: "statement.csv", period_start: "2026-09-01", period_end: "2026-09-30", stated_total_out: null, stated_total_in: null,
      opening_balance: null, closing_balance: null, warnings: [], status: "review", line_count: 3, pending_count: 3,
      confirmed_count: 0, skipped_count: 0, created_at: "2026-10-01T12:00:00Z",
    }],
    statement_lines: [
      line({ id: L_FUEL, line_date: "2026-09-03", description: "SHELL C04512", merchant: "Shell", amount: 54.2, suggested_category_key: "vehicle_fuel", match_receipt_id: R_FUEL, match_method: "exact", duplicate_candidate_count: 1 }),
      line({ id: L_PHOTO, line_date: "2026-09-09", description: "LISTING PHOTO STUDIO", merchant: "Listing Photo Studio", amount: 250, suggested_category_key: null, business_likelihood: null, category_source: null }),
      line({ id: L_HELD, line_date: "2026-09-20", description: "SQ *MARKET", merchant: "Market", amount: 30, suggested_category_key: "meals_client", duplicate_candidate_count: 2, hold_reason: "several", related_receipt_id: R_A }),
    ],
    receipt_expenses: [
      { id: R_FUEL, user_id: USER, vendor: "Shell", expense_date: "2026-09-03", total_amount: 54.2, tax_amount: 7.07, category_key: "vehicle_fuel", receipt_path: "u/1.jpg", source: null, statement_line_id: null },
      { id: R_A, user_id: USER, vendor: "Cafe A", expense_date: "2026-09-20", total_amount: 30, tax_amount: null, category_key: "meals_client", receipt_path: null, source: null, statement_line_id: null },
      { id: R_B, user_id: USER, vendor: "Cafe B", expense_date: "2026-09-20", total_amount: 30, tax_amount: null, category_key: "meals_client", receipt_path: null, source: null, statement_line_id: null },
    ],
    recurring_expenses: [],
  };
}

interface Rpc { name: string; args: Record<string, unknown> }

function setup(rpcResult: (name: string, args: Record<string, unknown>) => unknown = () => ({})) {
  const fake = fakeSupabase(tables());
  const rpcs: Rpc[] = [];
  const client = Object.assign(fake.client, {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcs.push({ name, args });
      return { data: rpcResult(name, args), error: null };
    },
  }) as SupabaseClient;
  const tools = createAgentTools(client, USER);
  const run = async (name: string, args: Record<string, unknown>) => {
    const t = tools[name] as unknown as { execute: (a: unknown, o: unknown) => Promise<string> };
    return t.execute(args, { toolCallId: "t", messages: [] });
  };
  return { run, rpcs, writes: fake.writes };
}

describe("statement import tools: wiring", () => {
  it("Navigator has all five; Captain and Dispatcher have none", () => {
    const names = ["listImportReviewLines", "draftLineCategories", "explainImportLine", "matchReceiptToLine", "confirmImportLines"];
    const client = fakeSupabase({}).client;
    const nav = createPersonaAgentTools(client, USER, "navigator");
    for (const n of names) expect(nav[n], n).toBeDefined();
    for (const persona of ["captain", "dispatcher"] as const) {
      const set = createPersonaAgentTools(client, USER, persona);
      for (const n of names) expect(set[n], `${persona} ${n}`).toBeUndefined();
    }
  });

  it("the two writes are on the approval card, with a description; the reads are not", () => {
    expect(NEEDS_APPROVAL_TOOLS.has("confirmImportLines")).toBe(true);
    expect(NEEDS_APPROVAL_TOOLS.has("matchReceiptToLine")).toBe(true);
    for (const n of ["listImportReviewLines", "draftLineCategories", "explainImportLine"]) expect(NEEDS_APPROVAL_TOOLS.has(n)).toBe(false);
    const tools = createAgentTools(fakeSupabase({}).client, USER);
    for (const n of ["confirmImportLines", "matchReceiptToLine"]) {
      expect((tools[n] as { needsApproval?: unknown }).needsApproval, n).toBe(true);
      expect(typeof APPROVAL_DESCRIPTIONS[n]).toBe("function");
    }
    expect(APPROVAL_DESCRIPTIONS.confirmImportLines({ lines: [{}, {}], skipLineIds: ["x"] })).toMatch(/Confirm 2 statement lines.*not added again.*skip 1 line/);
  });
});

describe("listImportReviewLines", () => {
  it("lists pending lines with IDs, estimates, what is already on file, and the held line's candidates", async () => {
    const { run, writes, rpcs } = setup();
    const text = await run("listImportReviewLines", { status: "pending", limit: 60 });
    expect(text).toContain(`line ID ${L_FUEL}`);
    expect(text).toContain("already on file: Shell $54.20 on 2026-09-03");
    expect(text).toContain("65% business");
    expect(text).toMatch(/could be: Cafe A \$30\.00 on 2026-09-20 \(receipt ID [0-9a-f-]+\); Cafe B/);
    expect(text).toContain("RBC Visa (credit card), 2026-09-01 to 2026-09-30");
    expect(text).toMatch(/Reconciliation: 0 confirmed charges with no receipt on file; 3 receipts in these periods with no statement line/);
    expect(writes).toEqual([]);
    expect(rpcs).toEqual([]);
  });
});

describe("draftLineCategories", () => {
  it("drafts from the line's estimate, says when nothing fits, and saves nothing", async () => {
    const { run, writes } = setup();
    const text = await run("draftLineCategories", {});
    expect(text).toContain("vehicle_fuel = Vehicle: Fuel / Gas");
    expect(text).toContain("already on file: confirming links it, nothing added");
    expect(text).toContain("no item fits; the agent picks one or skips it");
    expect(text).toContain("held: could be a charge already on file");
    expect(writes).toEqual([]);
    expect(validateTaxCopy(text).filter((d) => d.level === "error")).toEqual([]);
  });
});

describe("explainImportLine", () => {
  it("says what confirming does, why GST/HST is empty, the CRA rules and the disclaimer", async () => {
    const { run } = setup();
    const text = await run("explainImportLine", { lineId: L_FUEL });
    expect(text).toContain("Confirming links the two; nothing is added.");
    expect(text).toContain(STATEMENT_GST_HST_NOTE);
    expect(text).toContain(CANONICAL_TAX_DISCLAIMER);
    expect(validateTaxCopy(text).filter((d) => d.level === "error")).toEqual([]);
  });
});

describe("confirmImportLines", () => {
  it("re-checks duplicates, then confirms through fn_confirm_statement_lines, and skips the agent's skips", async () => {
    const { run, rpcs, writes } = setup((name) => name === "fn_confirm_statement_lines"
      ? { created: [{ id: L_PHOTO, receipt_id: "new" }], linked: [{ id: L_FUEL, receipt_id: R_FUEL }], recurring: [], refused: [{ id: L_HELD, reason: "needs_decision" }] }
      : {});
    const text = await run("confirmImportLines", {
      lines: [{ lineId: L_FUEL }, { lineId: L_PHOTO, categoryKey: "marketing_photography" }, { lineId: L_HELD }],
      skipLineIds: [],
    });
    expect(rpcs).toEqual([{ name: "fn_confirm_statement_lines", args: { p_lines: [
      { id: L_FUEL, category_key: null },
      { id: L_PHOTO, category_key: "marketing_photography" },
      { id: L_HELD, category_key: null },
    ] } }]);
    expect(text).toContain("✓ 1 added to the expense records, 1 already on file and linked (not added again).");
    expect(text).toContain("More than one record on file could be this charge.");
    expect(text).toContain("GST/HST on them is empty");
    // The duplicate check ran first and found the held line still held: no
    // flag changed, so nothing was written before the confirm.
    expect(writes.filter((w) => w.op === "update")).toEqual([]);
  });

  it("an unknown category is refused before anything is sent", async () => {
    const { run, rpcs } = setup();
    const text = await run("confirmImportLines", { lines: [{ lineId: L_PHOTO, categoryKey: "travel_meals" }] });
    expect(rpcs).toEqual([]);
    expect(text).toContain("That category isn't one of your expense items.");
  });
});

describe("matchReceiptToLine", () => {
  it("passes the IDs to fn_match_statement_line and explains a refusal", async () => {
    const { run, rpcs } = setup(() => ({ ok: false, reason: "receipt_linked_elsewhere" }));
    const text = await run("matchReceiptToLine", { lineId: L_HELD, receiptId: R_A, lineDescription: "Market on 2026-09-20, $30.00", receiptDescription: "the Cafe A receipt" });
    expect(rpcs).toEqual([{ name: "fn_match_statement_line", args: { p_line_id: L_HELD, p_receipt_id: R_A } }]);
    expect(text).toBe("Not matched: That receipt is already matched to another statement line.");
  });

  it("reports the statement copy it replaced", async () => {
    const { run } = setup(() => ({ ok: true, replaced_receipt_id: "copy" }));
    const text = await run("matchReceiptToLine", { lineId: L_HELD, receiptId: R_A, lineDescription: "Market on 2026-09-20, $30.00", receiptDescription: "the Cafe A receipt" });
    expect(text).toContain("the copy added from the statement was removed");
  });
});
