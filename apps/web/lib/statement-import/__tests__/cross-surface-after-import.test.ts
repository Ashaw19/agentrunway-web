/**
 * After a statement import, every surface reads the same expense total, and
 * a charge already on file counts once.
 *
 * The import runs as it does in production, minus the database: the CSV
 * parser, the rule estimates, the duplicate check (buildLineRows), and the
 * confirm (confirmationOutcome + expenseRowForStatementLine: the same
 * branches and columns as fn_confirm_statement_lines, which the database
 * behaviour checks run). The rows a confirm adds are then read by each
 * surface's own query, run against a column-projecting fake (a column a
 * page doesn't select comes back missing), with the query pinned to the
 * page's source so the two can't drift:
 *
 *   dashboard        dashboard/page.tsx's receipt query, then its ytdExpenseTotals call
 *   Expenses page    expenses/page.tsx's query, then expenses-content.tsx's call
 *   T2125 tab        reports/page.tsx's query and call, then computeT2125 on the entries
 *   MCP server       get_expenses and get_dashboard_kpis, the real handlers
 *
 * The statement holds a fuel charge with its receipt already on file and the
 * car lease, which the Recurring Expenses list already counts on its date.
 * Neither may add a cent. Synthetic data only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expenseTaxContext, type ReceiptTotalsRow } from "@agent-runway/core/engines/expense-totals-engine";
import { ytdExpenseTotals } from "@agent-runway/core/engines/t2125-expenses-engine";
import { computeT2125 } from "@agent-runway/core/engines/t2125-engine";
import { confirmationOutcome, expenseRowForStatementLine } from "@agent-runway/core/engines/statement-import-engine";
import { atlanticNoon } from "@agent-runway/core/lib/local-date";
import type { RecurringExpense } from "@agent-runway/core/types/database";
import { createTestSettings } from "@agent-runway/core/engines/__tests__/test-data";
import { parseStatementCsv } from "@/lib/import/bank-csv/parse";
import { classifyByRules, unclassified } from "../classify";
import { buildLineRows, fingerprintLines, type StatementLineInsert } from "../stage";
import { readFileSync } from "node:fs";
import path from "node:path";
import { callTool, fakeSupabase, loadTools, type Row } from "@/lib/mcp-server/__tests__/tool-harness";

const WEB = path.resolve(__dirname, "../../..");
const squash = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s+/g, " ");
const page = (rel: string) => squash(readFileSync(path.join(WEB, rel), "utf8"));

const USER = "user-under-test";
const OCT_13 = new Date("2026-10-13T15:00:00Z");

const STATEMENT = [
  '"Account Type","Account Number","Transaction Date","Cheque Number","Description 1","Description 2","CAD$","USD$"',
  'Visa,4510000000000000,9/3/2026,,"SHELL C04512","SAINT JOHN NB",-54.20,,', // receipt on file
  'Visa,4510000000000000,9/9/2026,,"LISTING PHOTO STUDIO","",-250.00,,', // new: photography
  'Visa,4510000000000000,9/12/2026,,"CANVA* PRO","",-16.99,,', // new: software
  'Visa,4510000000000000,9/15/2026,,"TOYOTA FINANCIAL PAD","",-575.00,,', // the lease: already counted
  'Visa,4510000000000000,9/20/2026,,"SOBEYS #432","",-88.10,,', // personal: skipped
  'Visa,4510000000000000,9/22/2026,,"TIM HORTONS #0912","",-4.50,,', // new: meal
  'Visa,4510000000000000,9/25/2026,,"PAYMENT - THANK YOU","",500.00,,', // money in: skipped
].join("\n");

const SETTINGS = {
  user_id: USER,
  province: "newBrunswick",
  gst_hst_registered: true,
  vehicle_business_use_pct: 0.8,
  home_office_business_use_pct: 0,
  brokerage_withholds_hst: false,
  filing_frequency: "quarterly",
  business_number: null,
  goal_gci: 200000,
  goal_transactions: 20,
  ytd_gci: 0,
  ytd_transactions: 0,
  use_national_seasonality: false,
  national_quarter_pcts: null,
  split_preset: "p100_0",
  post_cap_threshold_gci: 0,
  post_cap_agent_pct: 1,
  post_cap_brokerage_pct: 0,
  tx_fee_rate_pct: 0,
  tx_fee_annual_cap: 0,
  monthly_brokerage_fee: 0,
  comp_plan: "simple_split",
  runway_score_snapshot: { score: 72, grade: "C", month: "2026-10", components: [] },
};

const LEASE: RecurringExpense = {
  id: "lease", user_id: USER, name: "Car lease", amount: 575, category_key: "vehicle_payment", frequency: "monthly",
  day_of_month: 15, month_of_year: null, hst_included: true, hst_amount: 75, vehicle_pct_applicable: true, notes: "",
  start_date: "2026-01-01", end_date: null, is_active: true, created_at: "2026-01-01T12:00:00Z", updated_at: "2026-01-01T12:00:00Z",
};

type ReceiptRow = {
  id: string; user_id: string; expense_date: string; category_key: string | null; total_amount: number; tax_amount: number | null;
  vendor: string; statement_line_id: string | null; source: string | null;
};

const RECEIPTS_BEFORE: ReceiptRow[] = [
  // The fuel receipt scanned at the pump, with its printed HST.
  { id: "r-shell", user_id: USER, expense_date: "2026-09-03", category_key: "vehicle_fuel", total_amount: 54.2, tax_amount: 7.07, vendor: "Shell", statement_line_id: null, source: null },
  { id: "r-board", user_id: USER, expense_date: "2026-02-01", category_key: "prof_board_mls", total_amount: 115, tax_amount: 15, vendor: "Board", statement_line_id: null, source: null },
];

const ITEMS = [
  { user_id: USER, key: "vehicle_fuel", title: "Fuel", ytd_amount: 0, monthly_recurring: 0, expense_categories: { key: "vehicle", title: "Vehicle" } },
  { user_id: USER, key: "vehicle_payment", title: "Vehicle Payment", ytd_amount: 0, monthly_recurring: 0, expense_categories: { key: "vehicle", title: "Vehicle" } },
  { user_id: USER, key: "marketing_photography", title: "Photography", ytd_amount: 0, monthly_recurring: 0, expense_categories: { key: "marketing", title: "Marketing" } },
  { user_id: USER, key: "office_software", title: "Software", ytd_amount: 0, monthly_recurring: 0, expense_categories: { key: "office_tech", title: "Office & Tech" } },
  { user_id: USER, key: "meals_client", title: "Client Meals", ytd_amount: 0, monthly_recurring: 0, expense_categories: { key: "meals", title: "Meals" } },
  { user_id: USER, key: "prof_board_mls", title: "Board", ytd_amount: 0, monthly_recurring: 0, expense_categories: { key: "professional", title: "Professional Fees" } },
];

/** Upload → review (the agent picks the photographer's category) → confirm all pending. */
function runImport(receipts: ReceiptRow[], idPrefix = "line", statementId = "stmt-1", earlierLines: StatementLineInsert[] = []) {
  const parsed = parseStatementCsv(STATEMENT, { kind: "credit_card" });
  const classifications = parsed.lines.map((l) => classifyByRules({
    description: l.description, merchant: l.merchant, amount: l.amount, direction: l.direction,
    sourceCategory: l.sourceCategory, sourceBusiness: l.sourceBusiness,
  }) ?? unclassified());
  let n = 0;
  const lines: StatementLineInsert[] = buildLineRows({
    userId: USER,
    statementId,
    lines: parsed.lines,
    fingerprints: fingerprintLines(parsed.lines, "RBC Visa"),
    classifications,
    receipts,
    recurring: [LEASE],
    // The earlier import's lines, as confirmed by its run below.
    existingLines: earlierLines.map((l) => ({ ...l, status: l.status === "pending" ? ("confirmed" as const) : l.status })),
    newId: () => `${idPrefix}-${n++}`,
  });

  const added: ReceiptRow[] = [];
  const linked = new Map<string, string>();
  const outcomes = new Map<string, string>();
  for (const line of lines) {
    const override = line.description.startsWith("LISTING PHOTO") ? "marketing_photography" : null;
    const outcome = confirmationOutcome(line, override);
    outcomes.set(line.description, outcome.action === "refuse" ? `refuse:${outcome.reason}` : outcome.action);
    if (outcome.action === "create") {
      const row = expenseRowForStatementLine({ id: line.id, line_date: line.line_date, amount: line.amount, description: line.description, merchant: line.merchant }, outcome.categoryKey, "RBC Visa");
      added.push({ id: `exp-${line.id}`, user_id: USER, expense_date: row.expense_date, category_key: row.category_key, total_amount: row.total_amount, tax_amount: row.tax_amount, vendor: row.vendor, statement_line_id: row.statement_line_id, source: row.source });
    } else if (outcome.action === "link_receipt") {
      linked.set(outcome.receiptId, line.id);
    }
  }
  const after = receipts.map((r) => (linked.has(r.id) ? { ...r, statement_line_id: linked.get(r.id)! } : r)).concat(added);
  return { lines, added, after, outcomes };
}

/**
 * Each surface's own receipt and item queries, as their source writes them
 * (pinned below), run against the fake: a column a page doesn't select
 * comes back missing, a filter it doesn't apply lets other rows in.
 */
const SURFACES = {
  dashboard: {
    file: "app/(app)/dashboard/page.tsx",
    query: '.from("receipt_expenses") .select("category_key, total_amount, tax_amount") .eq("user_id", user.id) .gte("expense_date", `${dashYear}-01-01`) .limit(10000)',
    call: "const expenseCtx = expenseTaxContext(settingsRow, await logbookPromise); const expenseTotals = ytdExpenseTotals({ receipts: receiptTotalsResult.data, recurring: (recurringExpResult.data ?? []) as RecurringExpense[], expenseItems: expItemResult.data, ctx: expenseCtx, now: today, });",
    columns: "category_key, total_amount, tax_amount",
  },
  expensesPage: {
    file: "app/(app)/expenses/page.tsx",
    query: '.from("receipt_expenses") .select("category_key, total_amount, tax_amount, expense_date") .eq("user_id", user.id) .gte("expense_date", `${year}-01-01`) .limit(10000)',
    call: null,
    columns: "category_key, total_amount, tax_amount, expense_date",
  },
  reports: {
    file: "app/(app)/reports/page.tsx",
    query: '.from("receipt_expenses") .select("category_key, total_amount, tax_amount") .eq("user_id", user.id) .gte("expense_date", `${year}-01-01`) .limit(10000)',
    call: "const expenseCtx = expenseTaxContext(settingsRaw, await logbookPromise); const expenseTotals = ytdExpenseTotals({ receipts: receiptTotalsResult.data, recurring: (recurringExpResult.data ?? []) as RecurringExpense[], expenseItems: expItemResult.data, ctx: expenseCtx, now: today, });",
    columns: "category_key, total_amount, tax_amount",
  },
} as const;
const EXPENSES_CONTENT_CALL =
  "ytdExpenseTotals({ receipts: receiptTotalRows, recurring: recurringExpenses, expenseItems: [...categories.flatMap((c) => c.items), ...hiddenExpenseItems], ctx: expenseTaxCtx, now: new Date(), })";

/** One surface's figures: its query over the rows, then the engine call it makes. */
async function surfaceTotals(surface: keyof typeof SURFACES, receipts: ReceiptRow[]) {
  const db = fakeSupabase({ receipt_expenses: receipts });
  const { data } = await db.client
    .from("receipt_expenses")
    .select(SURFACES[surface].columns)
    .eq("user_id", USER)
    .gte("expense_date", "2026-01-01")
    .limit(10000);
  return ytdExpenseTotals({
    // The fake returns rows as `unknown`: these are the projected receipt rows.
    receipts: data as ReceiptTotalsRow[],
    recurring: [LEASE],
    expenseItems: ITEMS.map((i) => ({ key: i.key, monthly_recurring: i.monthly_recurring })),
    ctx: expenseTaxContext(SETTINGS),
    now: atlanticNoon(),
  });
}

/** The dashboard's figures (the reference the others are compared with). */
const engineTotals = (receipts: ReceiptRow[]) => surfaceTotals("dashboard", receipts);

async function t2125Line9369(receipts: ReceiptRow[]) {
  const totals = await surfaceTotals("reports", receipts);
  return computeT2125({
    settings: createTestSettings({ province: "newBrunswick", gst_hst_registered: true, vehicle_business_use_pct: 0.8, home_office_business_use_pct: 0 }),
    transactions: [],
    expenses: totals.tracked.entries,
    homeOfficeCosts: totals.tracked.homeOfficeCosts,
    ccaAssets: [],
    taxYear: 2026,
    // As the T2125 tab passes it: the page's expenseTaxContext share (no
    // logbook rows here, so the declared 80%).
    vehicleBusinessUsePct: expenseTaxContext(SETTINGS).vehicleBusinessUsePct,
    // The current Atlantic year, as the tab passes it.
    paymentsYear: 2026,
  }).line9369_totalExpenses;
}

function mcpTables(receipts: ReceiptRow[]): Record<string, Row[]> {
  return {
    user_settings: [SETTINGS],
    transactions: [],
    pipeline_deals: [],
    listing_appointments: [],
    history_items: [],
    receipt_expenses: receipts,
    recurring_expenses: [{ ...LEASE }],
    expense_items: ITEMS,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(OCT_13);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("statement import: one total everywhere, each charge once", () => {
  it("confirming links the two charges already on file and adds only the new ones", () => {
    const { outcomes, added } = runImport(RECEIPTS_BEFORE);
    expect(Object.fromEntries(outcomes)).toEqual({
      "SHELL C04512 SAINT JOHN NB": "link_receipt",
      "LISTING PHOTO STUDIO": "create",
      "CANVA* PRO": "create",
      "TOYOTA FINANCIAL PAD": "recurring",
      "SOBEYS #432": "refuse:not_pending",
      "TIM HORTONS #0912": "create",
      "PAYMENT - THANK YOU": "refuse:not_pending",
    });
    expect(added.map((a) => [a.vendor, a.total_amount, a.category_key, a.tax_amount])).toEqual([
      ["Listing Photo Studio", 250, "marketing_photography", null],
      ["Canva Pro", 16.99, "office_software", null],
      ["Tim Hortons", 4.5, "meals_client", null],
    ]);
  });

  it("YTD Expenses rises by the new charges only: the fuel receipt and the lease are not counted twice", async () => {
    const before = await engineTotals(RECEIPTS_BEFORE);
    const { after } = runImport(RECEIPTS_BEFORE);
    const now = await engineTotals(after);
    // 250 + 16.99 + 4.50. GST/HST is empty on the new rows, so nothing comes off.
    expect(Math.round((now.expensesYTD - before.expensesYTD) * 100) / 100).toBe(271.49);
    // Had the lease line been added as an expense, it would read 575 more.
    expect(now.recurringYTD).toBe(before.recurringYTD);
    // The fuel receipt keeps its printed HST and is still one receipt.
    expect(after.filter((r) => r.expense_date === "2026-09-03")).toHaveLength(1);
  });

  it("each page's own query and call is the one pinned here", () => {
    for (const surface of Object.values(SURFACES)) {
      const src = page(surface.file);
      expect(src, surface.file).toContain(surface.query);
      if (surface.call) expect(src, surface.file).toContain(surface.call);
    }
    expect(page("app/(app)/expenses/expenses-content.tsx")).toContain(EXPENSES_CONTENT_CALL);
    // No surface leaves rows added from a statement out.
    for (const file of [...Object.values(SURFACES).map((x) => x.file), "app/(app)/expenses/expenses-content.tsx"]) {
      expect(page(file), file).not.toMatch(/\.(?:eq|neq|is)\("source"/);
    }
  });

  it("the dashboard, the Expenses page, the T2125 tab and the MCP server agree after the import", async () => {
    const { after } = runImport(RECEIPTS_BEFORE);
    const dashboard = await surfaceTotals("dashboard", after);
    const expensesPage = await surfaceTotals("expensesPage", after);
    const reports = await surfaceTotals("reports", after);
    expect(expensesPage.expensesYTD).toBe(dashboard.expensesYTD);
    expect(reports.expensesYTD).toBe(dashboard.expensesYTD);

    // T2125: the same lines, after the 50% meal limit and the 80% vehicle share.
    const lineBefore = await t2125Line9369(RECEIPTS_BEFORE);
    const lineAfter = await t2125Line9369(after);
    expect(Math.round((lineAfter - lineBefore) * 100) / 100).toBe(250 + 16.99 + 4.5 * 0.5);
    expect(lineAfter).toBeCloseTo(dashboard.tracked.deductibleTotal - dashboard.tracked.byRule.home, 6);

    const db = fakeSupabase(mcpTables(after));
    const expenses = await callTool<{ total_ytd: number }>(await loadTools("expenses.ts", "getExpenseTools", db, USER), "get_expenses");
    const kpis = await callTool<{ ytd_expenses: number }>(await loadTools("analytics.ts", "getAnalyticsTools", db, USER), "get_dashboard_kpis");
    expect(expenses.total_ytd).toBe(Math.round(dashboard.expensesYTD * 100) / 100);
    expect(kpis.ytd_expenses).toBe(Math.round(dashboard.expensesYTD));
  });

  it("the same month imported again from another file (a PDF after the CSV) adds nothing: its lines are held, not linked", async () => {
    const first = runImport(RECEIPTS_BEFORE);
    // The second file: other fingerprints (another account name, other
    // wording), so the upload stages its lines. Each charge the first import
    // added is reconciled with a line in the first import: the second
    // file's copy is held for the agent, never linked, never added.
    const second = runImport(first.after, "again", "stmt-2", first.lines);
    const outcomes = [...second.outcomes.entries()];
    expect(outcomes.filter(([, o]) => o === "create")).toEqual([]);
    expect(Object.fromEntries(outcomes)).toEqual({
      "SHELL C04512 SAINT JOHN NB": "refuse:needs_decision",
      "LISTING PHOTO STUDIO": "refuse:needs_decision",
      "CANVA* PRO": "refuse:needs_decision",
      // The first import's lease line already holds September's lease charge.
      "TOYOTA FINANCIAL PAD": "refuse:needs_decision",
      "SOBEYS #432": "refuse:not_pending",
      "TIM HORTONS #0912": "refuse:needs_decision",
      "PAYMENT - THANK YOU": "refuse:not_pending",
    });
    for (const l of second.lines.filter((x) => x.direction === "out" && x.status === "pending")) {
      expect(["several", "other_import"], l.description).toContain(l.hold_reason);
    }
    expect((await engineTotals(second.after)).expensesYTD).toBe((await engineTotals(first.after)).expensesYTD);
  });

  it("the same file uploaded again stages nothing: its fingerprints are already on file", () => {
    const first = runImport(RECEIPTS_BEFORE);
    expect(fingerprintLines(parseStatementCsv(STATEMENT, { kind: "credit_card" }).lines, "RBC Visa"))
      .toEqual(first.lines.map((l) => l.fingerprint));
  });
});
