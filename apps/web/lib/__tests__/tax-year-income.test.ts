/**
 * Tax figures count each deal in its tax year; production figures stay on the
 * closing date (2026-10-14).
 *
 * CRA lets a self-employed commission agent report income on the cash method
 * (in the fiscal period it is received) or the accrual method (in the period
 * it is earned): Guide T4002, ch. 1. Every tax figure put a deal in the year
 * of `transactions.date`, its closing date, so a cash-method agent's December
 * closing paid in January sat in the wrong tax year. Real case: a December 17,
 * 2025 listing paid in January 2026.
 *
 * The rule is one helper, core/engines/tax-year.ts. What this file proves:
 *   1. loadTaxYearCarryIn fetches a cash-method agent's earlier closings paid
 *      this year (the rows a dashboard query that starts on January 1 never
 *      sees), and runs no query for an accrual agent.
 *   2. The Scenario Engine's "Your Projection" tax carries the January-paid
 *      listing for a cash-method agent and not for an accrual agent, while its
 *      production figures (projected GCI and deals, YTD GCI, cash, the cash
 *      runway, the Runway Score) are the same for both.
 *   3. Every file that works out an income tax estimate from the agent's deals
 *      reads the year through the helper, or gets the adjustment as a required
 *      input. A new tax surface fails here until it does.
 *   4. The production chains (the cash runway's effective cash, the Runway
 *      Score's health report and benchmark, pace) are never handed tax-year
 *      GCI, and the dashboard's and the chat route's cash position keeps the
 *      closing-date tax estimate.
 *   5. The loaders that start on January 1 load the carry-in; the ones that
 *      hand every closed row to the page do not need to.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createTestSettings } from "@agent-runway/core/engines/__tests__/test-data";
import { calculate } from "@agent-runway/core/engines/canadian-tax-engine";
import { computeProjectedNetForTax } from "@agent-runway/core/engines/effective-cash";
import { taxYearGCIAdjustment } from "@agent-runway/core/engines/tax-year";
import type { Transaction, UserSettings } from "@agent-runway/core/types/database";
import { fakeSupabase, type Row } from "../ai/__tests__/helpers/fake-supabase";
import { loadTaxYearCarryIn } from "../tax-year-carry-in";
import { buildScenarioSeed, computeScenarioResult, seedScenarioInputs } from "../scenario-seed";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const USER = "agent-1";

const row = (
  id: string,
  date: string,
  commission_paid_date: string | null,
  gci: number,
  extra: Partial<Transaction> = {},
): Transaction => ({
  id,
  user_id: USER,
  date,
  commission_paid_date,
  address: `${id} Street`,
  sale_price: 0,
  commission_pct: 0,
  gci_override: gci,
  side: "seller",
  status: "closed",
  client_name: "",
  notes: "",
  team_split_pct: null,
  pipeline_deal_id: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...extra,
});

// The real case: closed December 17, 2025, commission paid January 9, 2026.
const DEC_LISTING = row("dec-listing", "2025-12-17", "2026-01-09", 15_000);

// ── 1. The carry-in loader ──────────────────────────────────────────────────

describe("loadTaxYearCarryIn", () => {
  // Spread into plain rows: the fake client's Row is an open record.
  const TABLE: Row[] = [
    DEC_LISTING,
    row("paid-last-year", "2025-11-03", "2025-12-01", 9_000),
    row("no-paid-date", "2025-12-20", null, 7_000),
    row("closed-this-year", "2026-02-02", "2026-02-09", 11_000),
    row("fell-through", "2025-12-10", "2026-01-05", 6_000, { status: "fallen" }),
    row("2024-paid-2025", "2024-12-15", "2025-01-10", 5_000),
    row("someone-else", "2025-12-18", "2026-01-12", 4_000, { user_id: "agent-2" }),
  ].map((r) => ({ ...r }));

  it("cash method: the closed deals from before January 1 with a paid date this year, and nothing else", async () => {
    const { client } = fakeSupabase({ transactions: TABLE });
    const rows = await loadTaxYearCarryIn(client, USER, { income_reporting_method: "cash" }, 2026);
    expect(rows.map((r) => r.id)).toEqual(["dec-listing"]);
  });

  it("accrual (or no settings row): no query and no rows", async () => {
    const { client } = fakeSupabase({ transactions: TABLE });
    const from = vi.spyOn(client, "from");
    expect(await loadTaxYearCarryIn(client, USER, { income_reporting_method: "accrual" }, 2026)).toEqual([]);
    expect(await loadTaxYearCarryIn(client, USER, null, 2026)).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it("a failed query is an empty carry-in, never a rejection", async () => {
    const { client } = fakeSupabase({ transactions: TABLE }, { unreachable: ["transactions"] });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(loadTaxYearCarryIn(client, USER, { income_reporting_method: "cash" }, 2026)).resolves.toEqual([]);
    spy.mockRestore();
  });
});

// ── 2. The Scenario Engine: tax moves, production does not ──────────────────

describe("Scenario Engine seed: a cash-method agent's tax counts the January-paid listing", () => {
  const NOW = new Date(2026, 6, 15, 12); // July 15, 2026
  const settingsFor = (method: "accrual" | "cash"): UserSettings =>
    createTestSettings({
      province: "newBrunswick",
      split_preset: "p80_20",
      monthly_brokerage_fee: 400,
      goal_gci: 150_000,
      cash_reserve: 20_000,
      income_reporting_method: method,
    });
  // This year's closings, as the dashboard's query returns them.
  const THIS_YEAR = [
    row("feb", "2026-02-10", "2026-02-17", 12_000),
    row("may", "2026-05-05", null, 16_000),
  ];
  const seedFor = (method: "accrual" | "cash") =>
    buildScenarioSeed({
      settings: settingsFor(method),
      transactions: THIS_YEAR,
      carryOverTx: [],
      // Passed for both: the helper ignores paid dates under accrual.
      taxYearCarryIn: [DEC_LISTING],
      pipelineDeals: [],
      listings: [],
      historyItems: [],
      expenses: { expensesYTD: 9_000, monthlyRecurring: 1_000, expensesRemaining: 5_000 },
      now: NOW,
    });

  const accrual = seedFor("accrual");
  const cash = seedFor("cash");

  it("the adjustment is the listing's GCI for the cash method and 0 for accrual", () => {
    expect(cash.taxYearGCIAdjustment).toBe(15_000);
    expect(accrual.taxYearGCIAdjustment).toBe(0);
    expect(cash.taxYearGCIAdjustment).toBe(taxYearGCIAdjustment([...THIS_YEAR, DEC_LISTING], "cash", 2026));
  });

  it("production figures are the same under both methods", () => {
    for (const key of ["ytdGCI", "projectedAnnualGCI", "projectedDealCount", "pipelineWeightedGCI", "cashReserve", "quarterPcts"] as const) {
      expect(cash[key], key).toEqual(accrual[key]);
    }
    expect(accrual.ytdGCI).toBe(28_000);
    const a = computeScenarioResult(accrual, seedScenarioInputs(accrual), NOW);
    const c = computeScenarioResult(cash, seedScenarioInputs(cash), NOW);
    expect(c.runwayScore).toBe(a.runwayScore);
    expect(c.runwayGrade).toBe(a.runwayGrade);
    expect(c.survivalMonths).toBe(a.survivalMonths);
  });

  it("the tax is the dashboard's chain on projected GCI as tax-year income", () => {
    const taxOn = (projectedGCI: number, s: UserSettings) =>
      calculate(
        computeProjectedNetForTax({
          projectedGCI,
          expensesYTD: 9_000,
          expensesRemaining: 5_000,
          settings: s,
          projectedDealCount: accrual.projectedDealCount,
          now: NOW,
        }),
        "newBrunswick",
        Math.max(accrual.projectedDealCount, 1),
      ).totalBurden;

    const a = computeScenarioResult(accrual, seedScenarioInputs(accrual), NOW);
    const c = computeScenarioResult(cash, seedScenarioInputs(cash), NOW);
    expect(a.taxOwed).toBeCloseTo(taxOn(accrual.projectedAnnualGCI, settingsFor("accrual")), 6);
    expect(c.taxOwed).toBeCloseTo(taxOn(cash.projectedAnnualGCI + 15_000, settingsFor("cash")), 6);
    expect(c.taxOwed).toBeGreaterThan(a.taxOwed);
  });

  it("What If keeps the paid-date adjustment on a changed GCI, and the benchmark stays on the GCI typed", () => {
    const bump = { ...seedScenarioInputs(cash), annualGCI: cash.projectedAnnualGCI + 20_000 };
    const sameGciAccrual = { ...seedScenarioInputs(accrual), annualGCI: accrual.projectedAnnualGCI + 35_000 };
    const c = computeScenarioResult(cash, bump, NOW);
    const a = computeScenarioResult(accrual, sameGciAccrual, NOW);
    // +20,000 typed +15,000 paid in from last year = +35,000 of tax-year income.
    expect(c.taxOwed).toBeCloseTo(a.taxOwed, 6);
  });
});

// ── 3–5. Every surface ──────────────────────────────────────────────────────

const ROOTS = ["apps/web/app", "apps/web/lib", "apps/web/components", "apps/web/supabase/functions/mcp-server/tools"];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** Source with comments blanked, so a call named in a comment is not a call. */
function code(file: string): string {
  return readFileSync(path.join(REPO_ROOT, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Calls that work out the year's income tax, or the projected net income it is on. */
const TAX_CALL = /\b(?:calculate|calculateTax|computeProjectedNetForTax|yearTaxEstimate|dealCloseTaxPortion|computeT2125)\s*\(/;

/** Reads the year through core/engines/tax-year.ts. */
const READS_TAX_YEAR = /\b(?:taxYearGCIAdjustment|taxYearProjectedGCI)\s*\(/;

/**
 * Files that compute an income tax figure from the agent's deals and read the
 * tax year themselves.
 */
const READS_THE_YEAR = [
  "apps/web/app/(app)/crm/page.tsx",
  "apps/web/app/(app)/dashboard/dashboard-content.tsx",
  "apps/web/app/(app)/forecast/forecast-content.tsx",
  "apps/web/app/(app)/overhead/overhead-content.tsx",
  "apps/web/app/(app)/reports/reports-content.tsx",
  "apps/web/app/api/chat/route.ts",
  "apps/web/lib/chat-diagnostics.ts",
  "apps/web/lib/scenario-seed.ts",
  "apps/web/supabase/functions/mcp-server/tools/analytics.ts",
];

/** Files whose tax call gets the year another way, and why that is enough. */
const YEAR_BY_INPUT: Record<string, string> = {
  "apps/web/app/(app)/dashboard/closing-day-prompt.tsx":
    "dealCloseTaxPortion on the dashboard's taxEstimateInputs; taxYearGCIAdjustment is a required YearTaxEstimateInputs field",
  "apps/web/app/(app)/transactions/transactions-pipeline-tab.tsx":
    "dealCloseTaxPortion on transactions-content's taxEstimateInputs (taxYearGCIAdjustment required, worked out there)",
  "apps/web/app/(app)/reports/reports-t2125-tab.tsx":
    "computeT2125 reads income_reporting_method and keeps the tax year's deals itself (t2125-engine.ts)",
  "apps/web/app/tools/realtor-tax-estimator/tax-estimator.tsx":
    "public calculator: the visitor types an income, no deals",
  "apps/web/lib/troubleshooting-playbooks.ts":
    "names the functions in the AI's playbook text; computes nothing",
};

describe("every income tax estimate built from the agent's deals reads the tax year", () => {
  const found = ROOTS.flatMap((root) => sourceFiles(path.join(REPO_ROOT, root)))
    .map((full) => path.relative(REPO_ROOT, full))
    .filter((file) => TAX_CALL.test(code(file)))
    .sort();

  it("finds every caller, and only the ones on the lists", () => {
    expect(found).toEqual([...READS_THE_YEAR, ...Object.keys(YEAR_BY_INPUT)].sort());
  });

  it.each(READS_THE_YEAR)("%s reads the year through core/engines/tax-year.ts", (file) => {
    expect(READS_TAX_YEAR.test(code(file))).toBe(true);
  });

  /**
   * The line that hands the tax chain its income, per file (whitespace
   * collapsed). Calling the helper is not enough: its result has to be what
   * the estimate is worked out on.
   */
  const TAX_CHAIN: Record<string, string[]> = {
    "apps/web/app/(app)/crm/page.tsx": ["taxYearGCIAdjustment: taxYearGCIAdjustment( [...transactions, ...taxYearCarryIn],"],
    "apps/web/app/(app)/dashboard/dashboard-content.tsx": [
      "const taxProjectedGCI = taxYearProjectedGCI(projectedGCI, taxGCIAdjustment);",
      "const projectedNet = computeProjectedNet(taxProjectedGCI, settings, projectedDealCount);",
    ],
    "apps/web/app/(app)/forecast/forecast-content.tsx": [
      "const taxProjectedGCI = taxYearProjectedGCI(projectedGCI, taxGCIAdjustment);",
      "const planProjected = computePlanGross(settings, taxProjectedGCI, {",
    ],
    "apps/web/app/(app)/overhead/overhead-content.tsx": [
      "const taxProjectedGCI = taxYearProjectedGCI(projectedGCI, taxGCIAdjustment);",
      "const { grossAfterPlan } = computePlanGross(settings, taxProjectedGCI, {",
    ],
    "apps/web/app/(app)/reports/reports-content.tsx": [
      "const taxProjectedGCI = taxYearProjectedGCI( projectedGCI, taxYearGCIAdjustment(transactions, incomeMethod, currentYear), );",
      "const projectedNet = computeProjectedNet(taxProjectedGCI, settings, projectedDeals);",
    ],
    "apps/web/app/api/chat/route.ts": [
      "const taxProjGCI = taxYearProjectedGCI(projGCI, taxGCIAdjustment);",
      "const projectedNetIncome = computeProjectedNetForTax({ projectedGCI: taxProjGCI,",
    ],
    "apps/web/lib/chat-diagnostics.ts": [
      "const taxProjGCI = taxYearProjectedGCI(projGCI, ctx.taxGCIAdjustment);",
      "const netSEIncome = computeProjectedNetForTax({ projectedGCI: taxProjGCI,",
    ],
    "apps/web/lib/scenario-seed.ts": [
      "const taxGCI = taxYearProjectedGCI(annualGCI, seed.taxYearGCIAdjustment);",
      "computePlanGross(seed.comp, taxGCI, { dealCount })",
    ],
    "apps/web/supabase/functions/mcp-server/tools/analytics.ts": [
      "netIncome = computeProjectedNetForTax({ projectedGCI: taxYearProjectedGCI(projectedGCI, taxGCIAdjustment),",
    ],
  };

  it("every file that reads the year is on the tax-chain list", () => {
    expect(Object.keys(TAX_CHAIN).sort()).toEqual([...READS_THE_YEAR].sort());
  });

  it.each(READS_THE_YEAR)("%s works the estimate out on tax-year income", (file) => {
    const flat = code(file).replace(/\s+/g, " ");
    for (const line of TAX_CHAIN[file]) expect(flat, `${file}: ${line}`).toContain(line);
  });

  it("transactions-content works out the adjustment it hands the pipeline tab", () => {
    const src = code("apps/web/app/(app)/transactions/transactions-content.tsx");
    expect(src).toMatch(/taxYearGCIAdjustment:\s*taxYearGCIAdjustment\(/);
  });

  it("the dashboard hands the Closing Day prompt its adjustment", () => {
    const src = code("apps/web/app/(app)/dashboard/dashboard-content.tsx");
    const prompt = src.slice(src.indexOf("<ClosingDayPrompt"));
    expect(prompt).toMatch(/taxYearGCIAdjustment:\s*taxGCIAdjustment,/);
  });
});

describe("production figures never get tax-year income", () => {
  const TAX_YEAR_VALUE = /\btax(?:Proj(?:ected)?GCI|GCI|YearRows|GCIAdjustment)\b/;

  /** Balanced text of each call to `name(` in a file. */
  function calls(src: string, name: string): string[] {
    const out: string[] = [];
    const re = new RegExp(`\\b${name}\\s*\\(`, "g");
    for (const m of src.matchAll(re)) {
      let depth = 0;
      for (let i = m.index + m[0].length - 1; i < src.length; i++) {
        if (src[i] === "(" || src[i] === "{" || src[i] === "[") depth++;
        else if (src[i] === ")" || src[i] === "}" || src[i] === "]") {
          depth--;
          if (depth === 0) {
            out.push(src.slice(m.index, i + 1));
            break;
          }
        }
      }
    }
    return out;
  }

  it.each(READS_THE_YEAR)("%s: effective cash, the health report, the benchmark and pace stay on closing dates", (file) => {
    const src = code(file);
    for (const name of [
      "computeEffectiveCashForSurvival",
      "buildHealthReport",
      "compare",
      "benchmarkCompare",
      "projectedYearEndGCI",
      "projectedYearEndTransactions",
      "paceVsGoalPercent",
      "survivalResult",
    ]) {
      for (const call of calls(src, name)) {
        expect(TAX_YEAR_VALUE.test(call), `${file}: ${call.slice(0, 120)}`).toBe(false);
      }
    }
  });

  it("the dashboard's and the chat route's cash position keep the closing-date tax estimate", () => {
    for (const file of ["apps/web/app/(app)/dashboard/dashboard-content.tsx", "apps/web/app/api/chat/route.ts"]) {
      const src = code(file);
      const cash = calls(src, "computeCashPosition");
      expect(cash.length, file).toBe(1);
      expect(cash[0], file).toMatch(/ytdTaxSetAside:\s*closingYearTaxBurden \* Math\.min\(/);
    }
  });
});

describe("loaders", () => {
  it.each([
    "apps/web/app/(app)/dashboard/page.tsx",
    "apps/web/app/(app)/overhead/page.tsx",
    "apps/web/app/(app)/scenarios/page.tsx",
    "apps/web/app/(app)/crm/page.tsx",
  ])("%s queries this year's closings only, so it loads the carry-in", (file) => {
    const src = code(file);
    expect(src).toMatch(/\.from\("transactions"\)[\s\S]{0,200}\.gte\("date",/);
    expect(src).toMatch(/\bloadTaxYearCarryIn\(supabase, user\.id, \w+, \w+\)/);
  });

  it.each([
    "apps/web/app/(app)/forecast/page.tsx",
    "apps/web/app/(app)/reports/page.tsx",
    "apps/web/app/(app)/transactions/page.tsx",
  ])("%s hands every closed row to the page: no lower bound on the date", (file) => {
    const src = code(file);
    const start = src.indexOf('.from("transactions")');
    expect(start).toBeGreaterThan(-1);
    expect(src.slice(start, src.indexOf(".limit(", start))).not.toMatch(/\.gte?\("date"/);
  });

  it("the chat route, the diagnostics and the MCP tax tool select the paid date", () => {
    expect(code("apps/web/app/api/chat/route.ts")).toMatch(/\.from\("transactions"\)\.select\("[^"]*\bcommission_paid_date\b/);
    expect(code("apps/web/lib/chat-diagnostics.ts")).toMatch(/\.select\("[^"]*\bcommission_paid_date\b[^"]*status"\)/);
    const mcp = code("apps/web/supabase/functions/mcp-server/tools/analytics.ts");
    expect(mcp).toMatch(/\.lt\("date", yearStart\)\s*\.gte\("commission_paid_date", yearStart\)/);
    expect(mcp).toMatch(/"national_quarter_pcts, income_reporting_method, "/);
  });
});
