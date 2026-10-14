/**
 * The CRM client tiers price "After Tax" at the dashboard's net income for
 * tax, and "Runway" at the dashboard's monthly burn (2026-10-14).
 *
 * What was wrong, on the Clients page's Portfolio tab:
 *   - The After Tax factor (10% of the composite score) is 1 − the marginal
 *     rate, and the rate was looked up at `settings.ytd_gci`. Nothing in the
 *     app writes `user_settings.ytd_gci` (its default is 0, and in prod 11 of
 *     12 accounts held 0 on 2026-10-14), so the rate was 0% and After Tax read
 *     100¢ for every client. Where the column did hold a figure, it was a GCI
 *     figure, before the split, fees and expenses: a higher bracket than the
 *     agent is in. Every other marginal rate in apps/web is looked up at the
 *     dashboard's `netForTax`.
 *   - The monthly burn for the Runway factor summed
 *     `expense_items.monthly_recurring` only: the Recurring Expenses list was
 *     left out, and nothing was net of ITCs. The dashboard's burn is
 *     brokerage fee + `ytdExpenseTotals(...).monthlyRecurring`.
 *
 * Now the CRM page loads the dashboard page's rows, works out
 * `yearTaxEstimate(...).netForTax` and `ytdExpenseTotals(...)` the way the
 * dashboard does, and hands both to the client valuation.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marginalRate } from "@agent-runway/core/engines/canadian-tax-engine";
import { computeClientValuations, type ClientGroupInput, type ClientValuationInput } from "@agent-runway/core/engines/client-valuation-engine";
import { yearTaxEstimate } from "@agent-runway/core/engines/deal-tax-portion";
import { ytdExpenseTotals } from "@agent-runway/core/engines/t2125-expenses-engine";
import { survivalResult } from "@agent-runway/core/engines/survival-engine";
import { createTestSettings } from "@agent-runway/core/engines/__tests__/test-data";
import type { RecurringExpense } from "@agent-runway/core/types/database";
import { validateTaxCopy } from "@agent-runway/core/tax-copy";
import { KNOWLEDGE_BASE } from "@/lib/knowledge-base";
import { getPlaybooks } from "@/lib/troubleshooting-playbooks";
import { classifyTopicMulti } from "@/lib/troubleshooting-classifier";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "../.."); // apps/web/
const source = (rel: string) => readFileSync(path.join(WEB, rel), "utf8");

const CRM_PAGE = source("app/(app)/crm/page.tsx");
const CRM = source("app/(app)/crm/clients-content.tsx");
const DASHBOARD_PAGE = source("app/(app)/dashboard/page.tsx");

/** The query on `table`, from `.from(` to its `.limit(`, whitespace collapsed and the year variable named one way. */
function query(src: string, table: string): string {
  const at = src.indexOf(`.from("${table}")`);
  expect(at, table).toBeGreaterThan(-1);
  return src
    .slice(at, src.indexOf(".limit(", at))
    .replace(/\s+/g, " ")
    .replace(/\$\{(?:dashYear|taxYear)\}/g, "${YEAR}");
}

/** The `computeClientValuations(` call in the CRM, comments and all. */
function valuationCall(): string {
  const at = CRM.indexOf("computeClientValuations(\n");
  expect(at).toBeGreaterThan(-1);
  return CRM.slice(at, CRM.indexOf("metaMap,\n", at));
}

// ─────────────────────────────────────────────────────────────────────────
// 1. The CRM page reads the dashboard page's rows
// ─────────────────────────────────────────────────────────────────────────

describe("the CRM page loads what the dashboard's tax estimate reads", () => {
  it.each(["transactions", "pipeline_deals", "history_items", "receipt_expenses", "recurring_expenses", "expense_items"])(
    "%s: the dashboard page's query",
    (table) => {
      expect(query(CRM_PAGE, table)).toBe(query(DASHBOARD_PAGE, table));
    },
  );

  it("on the Atlantic calendar, like the dashboard page", () => {
    expect(CRM_PAGE).toContain("const today = atlanticNoon();");
    expect(CRM_PAGE).toContain("const taxYear = today.getFullYear();");
  });

  it("the listing appointments are the dashboard's scheduled and active ones", () => {
    // The CRM loads every listing appointment for its own screens; the
    // dashboard's query keeps only these two statuses.
    expect(query(DASHBOARD_PAGE, "listing_appointments")).toContain('.in("status", ["scheduled", "active"])');
    expect(CRM_PAGE).toContain('listings: listingAppointments.filter((l) => l.status === "scheduled" || l.status === "active"),');
  });

  it("expenses are the dashboard's one engine call", () => {
    const call = (src: string) => {
      const at = src.indexOf("const expenseTotals = ytdExpenseTotals({");
      expect(at).toBeGreaterThan(-1);
      return src.slice(at, src.indexOf("});", at)).replace(/\s+/g, " ");
    };
    const dashboard = call(DASHBOARD_PAGE)
      .replace("receiptTotalsResult.data", "RECEIPTS")
      .replace("recurringExpResult.data", "RECURRING")
      .replace("expItemResult.data", "ITEMS")
      .replace("expenseTaxContext(settingsRow)", "CTX");
    const crm = call(CRM_PAGE)
      .replace("receiptTotalsResult.data", "RECEIPTS")
      .replace("recurringExpResult.data", "RECURRING")
      .replace("expensesResult.data", "ITEMS")
      .replace("expenseTaxContext(settings)", "CTX");
    expect(crm).toBe(dashboard);
  });

  it("net income for tax is yearTaxEstimate's, from the dashboard's YTD GCI and deal count", () => {
    expect(CRM_PAGE).toContain("? yearTaxEstimate({");
    expect(CRM_PAGE).toContain("ytdGCI: transactions.reduce((sum, tx) => sum + computeGCI(tx), 0),");
    expect(CRM_PAGE).toContain("ytdDealCount: transactions.length,");
    expect(CRM_PAGE).toContain("expensesYTD: expenseTotals.expensesYTD,");
    expect(CRM_PAGE).toContain("expensesRemaining: expenseTotals.expensesRemaining,");
    expect(CRM_PAGE).toContain("}).netForTax");
    expect(CRM_PAGE).toContain("netForTax={netForTax}");
    expect(CRM_PAGE).toContain("monthlyRecurring={expenseTotals.monthlyRecurring}");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. The client valuation takes them
// ─────────────────────────────────────────────────────────────────────────

describe("the CRM's client valuation", () => {
  it("looks the marginal rate up at netForTax, not at a GCI column", () => {
    const call = valuationCall();
    expect(call).toContain("netIncome: netForTax,");
    const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(code(call)).not.toContain("ytd_gci");
    expect(code(CRM)).not.toMatch(/\bytd_gci\b/);
  });

  it("takes the dashboard's monthly burn: brokerage fee + ytdExpenseTotals' monthly figure", () => {
    expect(CRM).toContain("const survival = survivalResult(\n      settings.monthly_brokerage_fee,\n      monthlyRecurring,\n      0,");
    expect(valuationCall()).toContain("monthlyBurn: survival.monthlyBurn,");
    // The old sum of the per-item monthly figures, Recurring Expenses list left out.
    expect(CRM).not.toMatch(/\.monthly_recurring\b/);
    expect(CRM).not.toMatch(/expenseItems/);
  });

  it("recomputes when either figure changes", () => {
    expect(CRM).toContain("[grouped, totalGCI, settings, monthlyRecurring, netForTax, localClients]");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Worked example
// ─────────────────────────────────────────────────────────────────────────

const NOW = new Date(2026, 6, 15, 12); // July 15, 2026
const PROVINCE = "newBrunswick" as const;
const SETTINGS = createTestSettings({
  province: PROVINCE,
  split_preset: "p80_20",
  goal_gci: 150_000,
  use_national_seasonality: false,
  ytd_gci: 0, // as stored: nothing writes it
});
const YEAR = yearTaxEstimate({
  settings: SETTINGS,
  ytdGCI: 80_000,
  ytdDealCount: 6,
  pipelineDeals: [
    { id: "p1", estimated_price: 500_000, estimated_commission_pct: 0.025, probability_override: null, stage: "firm" },
  ],
  listings: [{ estimated_list_price: 450_000, estimated_commission_pct: 0.025, status: "active" }],
  historyItems: [],
  expensesYTD: 12_000,
  expensesRemaining: 6_000,
  taxYearGCIAdjustment: 0,
  now: NOW,
});

const CLIENTS: ClientGroupInput[] = [
  { clientId: "a", name: "Client A", totalGCI: 31_000, dealCount: 2, avgDeal: 15_500, lastDeal: "2026-03-01", years: [2026, 2024] },
  { clientId: "b", name: "Client B", totalGCI: 12_000, dealCount: 1, avgDeal: 12_000, lastDeal: "2025-06-01", years: [2025] },
  { clientId: "c", name: "Client C", totalGCI: 8_500, dealCount: 1, avgDeal: 8_500, lastDeal: "2021-05-01", years: [2021] },
  { clientId: "d", name: "Client D", totalGCI: 5_500, dealCount: 1, avgDeal: 5_500, lastDeal: "2026-02-01", years: [2026] },
];
const TOTAL_GCI = CLIENTS.reduce((s, c) => s + c.totalGCI, 0);

const input = (o: Partial<ClientValuationInput>): ClientValuationInput => ({
  clients: CLIENTS,
  totalGCI: TOTAL_GCI,
  monthlyBurn: 1_500,
  province: PROVINCE,
  netIncome: 0,
  agentExperienceYears: null,
  ...o,
});

const byId = (vs: ReturnType<typeof computeClientValuations>["valuations"]) =>
  Object.fromEntries(vs.map((v) => [v.clientId, v]));

describe("worked example: After Tax (New Brunswick, 80/20)", () => {
  const before = computeClientValuations(input({ netIncome: SETTINGS.ytd_gci }));
  const after = computeClientValuations(input({ netIncome: YEAR.netForTax }));
  const cents = Math.round((1 - marginalRate(YEAR.netForTax, PROVINCE)) * 100);

  it("before: a 0% rate, so After Tax read 100¢ for every client", () => {
    for (const v of before.valuations) expect(v.taxEfficiencyCents).toBe(100);
  });

  it("after: 1 − the marginal rate at the dashboard's net income for tax", () => {
    expect(YEAR.netForTax).toBeGreaterThan(0);
    expect(YEAR.netForTax).toBeLessThan(YEAR.projectedGCI);
    expect(cents).toBeLessThan(100);
    for (const v of after.valuations) {
      expect(v.taxEfficiencyCents).toBe(cents);
      expect(v.compositeBreakdown.tax).toBeCloseTo(cents * 0.1, 10);
    }
  });

  it("a GCI figure would have priced it at a higher bracket than the agent is in", () => {
    expect(marginalRate(YEAR.projectedGCI, PROVINCE)).toBeGreaterThan(marginalRate(YEAR.netForTax, PROVINCE));
  });

  it("every composite drops by the same points, so the order and the tiers hold here", () => {
    const b = byId(before.valuations);
    for (const v of after.valuations) {
      const drop = b[v.clientId!].compositeScore - v.compositeScore;
      expect(Math.abs(drop - (100 - cents) * 0.1)).toBeLessThanOrEqual(1);
      expect(v.tier).toBe(b[v.clientId!].tier);
    }
    expect(after.valuations.map((v) => v.clientId)).toEqual(before.valuations.map((v) => v.clientId));
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Worked example: Runway
// ─────────────────────────────────────────────────────────────────────────

const recurring = (o: Partial<RecurringExpense>): RecurringExpense => ({
  id: "re-1",
  user_id: "u1",
  name: "Board dues",
  amount: 115,
  category_key: "prof_board_mls",
  frequency: "monthly",
  day_of_month: 1,
  month_of_year: null,
  hst_included: true,
  hst_amount: 15,
  vehicle_pct_applicable: false,
  notes: "",
  start_date: "2025-01-01",
  end_date: null,
  is_active: true,
  created_at: "2025-01-01T12:00:00Z",
  updated_at: "2025-01-01T12:00:00Z",
  ...o,
});
const NOT_REGISTERED = { gstHstRegistered: false, vehicleBusinessUsePct: 0.8, homeOfficeBusinessUsePct: 0 };
const REGISTRANT = { ...NOT_REGISTERED, gstHstRegistered: true };

describe("worked example: Runway, monthly costs only on the Recurring Expenses list", () => {
  const rows = [recurring({}), recurring({ id: "re-2", name: "CRM subscription", amount: 230, hst_amount: 30, category_key: "office_software" })];
  const totals = (ctx: typeof NOT_REGISTERED) =>
    ytdExpenseTotals({ receipts: [], recurring: rows, expenseItems: [], ctx, now: NOW });
  const noFee = 0;

  it("the dashboard's monthly figure counts the list, net of ITCs for a registrant", () => {
    expect(totals(NOT_REGISTERED).monthlyRecurring).toBeCloseTo(345, 6);
    expect(totals(REGISTRANT).monthlyRecurring).toBeCloseTo(300, 6);
  });

  it("before: the per-item monthly figures alone, so the burn was 0 and Runway read 0.0mo for every client", () => {
    const oldMonthly = ([] as { monthly_recurring: number | null }[]).reduce((s, e) => s + (e.monthly_recurring ?? 0), 0);
    const burn = survivalResult(noFee, oldMonthly, 0).monthlyBurn;
    expect(burn).toBe(0);
    for (const v of computeClientValuations(input({ monthlyBurn: burn })).valuations) {
      expect(v.runwayImpactMonths).toBe(0);
      expect(v.compositeBreakdown.runway).toBe(0);
    }
  });

  it("after: the client's GCI in months of the dashboard's burn", () => {
    const burn = survivalResult(noFee, totals(NOT_REGISTERED).monthlyRecurring, 0).monthlyBurn;
    expect(burn).toBeCloseTo(345, 6);
    const after = byId(computeClientValuations(input({ monthlyBurn: burn })).valuations);
    for (const c of CLIENTS) {
      expect(after[c.clientId!].runwayImpactMonths).toBe(Math.round((c.totalGCI / burn) * 10) / 10);
      expect(after[c.clientId!].runwayImpactMonths).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. The AI knows
// ─────────────────────────────────────────────────────────────────────────

describe("the Flight Crew's knowledge", () => {
  it("the knowledge base defines After Tax and Runway the new way and dates the change", () => {
    const at = KNOWLEDGE_BASE.indexOf("**Client Tiers**");
    expect(at).toBeGreaterThan(-1);
    const line = KNOWLEDGE_BASE.slice(at, KNOWLEDGE_BASE.indexOf("\n", at));
    expect(line).toMatch(/"After Tax" = cents left of each \$1 of GCI after the estimated marginal rate on projected net income for tax \(the dashboard's net income for tax/);
    expect(line).toMatch(/"Runway" = the client's lifetime GCI in months of the dashboard's monthly burn/);
    expect(line).toMatch(/Recurring Expenses list included/);
    expect(line).toMatch(/Changed 2026-10-14/);
    expect(validateTaxCopy(line).filter((d) => d.level === "error")).toEqual([]);
  });

  it("the CRM playbook explains both factors, the change and the question it raises", () => {
    const crm = getPlaybooks(["crm"]);
    const tiers = crm.slice(crm.indexOf("### Client Tiers"), crm.indexOf("### Stale Lead Detection"));
    expect(tiers).toMatch(/\*\*After Tax\*\* \(Tax Efficiency\)/);
    expect(tiers).toMatch(/yearTaxEstimate\(\.\.\.\)\.netForTax/);
    expect(tiers).toMatch(/\*\*Runway Impact\*\* \(Runway\)/);
    expect(tiers).toMatch(/ytdExpenseTotals\(\.\.\.\)\.monthlyRecurring/);
    expect(tiers).toMatch(/\*\*Changed 2026-10-14\*\*/);
    const qa = crm.slice(crm.indexOf("**\"Why did my clients' composite scores drop?\""), crm.indexOf("**\"How do relationships work?\"**"));
    expect(qa.length).toBeGreaterThan(200);
    for (const text of [tiers, qa]) {
      expect(validateTaxCopy(text).filter((d) => d.level === "error")).toEqual([]);
    }
  });

  it("the questions reach the CRM playbook", () => {
    for (const q of [
      "Why did my clients' composite scores drop?",
      "What does After Tax mean on a client card?",
      "Why is my client tier different now?",
    ]) {
      expect(classifyTopicMulti(q).map((t) => t.topic), q).toContain("crm");
    }
  });
});
