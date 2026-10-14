/**
 * Every marginal rate the web app prints or prices with is looked up at net
 * income for tax (2026-10-14).
 *
 * What was wrong, on the Overhead page:
 *   - The Tax Readiness card's "Marginal rate" was
 *     `marginalRate(Math.max(projectedGCI, ytdGCI), province)`: looked up at
 *     GCI, before the split, plan fees, brokerage fees and the year's
 *     expenses. The dashboard and Forecast look it up at `netForTax`, so
 *     Overhead could print a higher bracket for the same agent.
 *   - The Savings Impact bar's "Already Capturing" was the year's expenses x
 *     that rate, while its "Untapped Potential" cards are priced at the rate
 *     on net income (tax-optimization-engine). One bar, two rates.
 *   - Overhead's projected GCI left listing appointments out. The dashboard,
 *     Forecast, Reports, the Flight Crew and the MCP tools count them, so
 *     Overhead's net income for tax, and its whole tax card, was lower than
 *     the dashboard's for an agent with listing appointments.
 *
 * Now: one input (`netForTax`, the dashboard's) for every `marginalRate(`
 * call in apps/web, and one rule for pricing a deduction (`deductionTaxRate`)
 * for both segments of the bar. This file scans the source for every call,
 * so a new one looked up at GCI fails here.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marginalRate } from "@agent-runway/core/engines/canadian-tax-engine";
import { deductionTaxRate, generateTaxOptimizations, type TaxOptimizationInput } from "@agent-runway/core/engines/tax-optimization-engine";
import { yearTaxEstimate, type YearTaxEstimateInputs } from "@agent-runway/core/engines/deal-tax-portion";
import { computeListingWeightedGCI } from "@agent-runway/core/engines/projection-engine";
import { createTestSettings } from "@agent-runway/core/engines/__tests__/test-data";
import { alreadyCapturingNote, validateTaxCopy } from "@agent-runway/core/tax-copy";
import { KNOWLEDGE_BASE } from "@/lib/knowledge-base";
import { getPlaybooks } from "@/lib/troubleshooting-playbooks";
import { classifyTopicMulti } from "@/lib/troubleshooting-classifier";
import { fmtCurrency, fmtPct } from "@/lib/formatters";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "../.."); // apps/web/
const source = (rel: string) => readFileSync(path.join(WEB, rel), "utf8");

const DASHBOARD = "app/(app)/dashboard/dashboard-content.tsx";
const FORECAST = "app/(app)/forecast/forecast-content.tsx";
const OVERHEAD = "app/(app)/overhead/overhead-content.tsx";
const OVERHEAD_PAGE = "app/(app)/overhead/page.tsx";

/** The dashboard's net income for tax: what every marginal rate is looked up at. */
const NET_FOR_TAX = "const netForTax = Math.max(0, projectedNet - annualExpenses);";

// ─────────────────────────────────────────────────────────────────────────
// Source scan
// ─────────────────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set(["node_modules", ".next", "__tests__", ".turbo", "coverage"]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** Code without comments, so a comment that names the old lookup does not count as a call. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** The argument list of the call whose "(" is at `open`. */
function callArgs(src: string, open: number): string[] {
  const args: string[] = [];
  let depth = 0;
  let start = open + 1;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) {
        args.push(src.slice(start, i).trim());
        return args;
      }
    } else if (ch === "," && depth === 1) {
      args.push(src.slice(start, i).trim());
      start = i + 1;
    }
  }
  throw new Error("unbalanced call");
}

/** `[file, first argument]` for every call of `fn(` in apps/web. */
function callsOf(fn: string): Array<[string, string]> {
  const calls: Array<[string, string]> = [];
  const re = new RegExp(`(?<![\\w.])${fn}\\(`, "g");
  for (const file of sourceFiles(WEB)) {
    const code = stripComments(readFileSync(file, "utf8"));
    for (const m of code.matchAll(re)) {
      if (/function\s+$/.test(code.slice(Math.max(0, m.index! - 12), m.index))) continue;
      const open = m.index! + fn.length;
      calls.push([path.relative(WEB, file), callArgs(code, open)[0]]);
    }
  }
  return calls;
}

/** The `netIncome` an engine input object is given, in the call starting at `fn(`. */
function netIncomeArgs(fn: string): Array<[string, string]> {
  const found: Array<[string, string]> = [];
  const re = new RegExp(`(?<![\\w.])${fn}\\(`, "g");
  for (const file of sourceFiles(WEB)) {
    const code = stripComments(readFileSync(file, "utf8"));
    for (const m of code.matchAll(re)) {
      if (/function\s+$/.test(code.slice(Math.max(0, m.index! - 12), m.index))) continue;
      const call = callArgs(code, m.index! + fn.length)[0];
      // An object literal: `netIncome: x,` or shorthand `netIncome,`. A named
      // input variable: read its declaration in the same file.
      const literal = call.startsWith("{")
        ? call
        : (code.match(new RegExp(`const ${call}[^=]*=\\s*(\\{[\\s\\S]*?\\n\\s*\\};)`)) ?? [])[1] ?? "";
      const prop = literal.match(/\bnetIncome\s*(?::\s*([^,\n}]+))?[,\n}]/);
      found.push([path.relative(WEB, file), prop ? (prop[1] ?? "netIncome").trim() : "(not found)"]);
    }
  }
  return found;
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Every marginalRate( call
// ─────────────────────────────────────────────────────────────────────────

const MARGINAL_CALLS = callsOf("marginalRate");

describe("every marginalRate( call in apps/web", () => {
  it("finds the three tax cards that print a marginal rate (sanity)", () => {
    const files = MARGINAL_CALLS.map(([file]) => file);
    for (const f of [DASHBOARD, FORECAST, OVERHEAD]) expect(files).toContain(f);
  });

  it.each(MARGINAL_CALLS)("%s looks the rate up at net income for tax (%s)", (_file, arg) => {
    expect(arg).toBe("netForTax");
  });

  it.each(MARGINAL_CALLS.map(([file]) => file))("%s works netForTax out the dashboard's way", (file) => {
    const code = source(file);
    expect(code).toContain(NET_FOR_TAX);
    expect(code).toContain("const annualExpenses = expensesYTD + expensesRemaining;");
  });

  it("no call looks it up at GCI, YTD GCI or the goal", () => {
    for (const [file, arg] of MARGINAL_CALLS) {
      expect(arg, file).not.toMatch(/gci|goal/i);
    }
  });

  it("the deal-close screens call no marginal rate at all", () => {
    const files = MARGINAL_CALLS.map(([file]) => file);
    expect(files).not.toContain("app/(app)/dashboard/closing-day-prompt.tsx");
    expect(files).not.toContain("app/(app)/transactions/transactions-pipeline-tab.tsx");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Engines that look a marginal rate up at a `netIncome` input
// ─────────────────────────────────────────────────────────────────────────

/**
 * Known exception, out of this change's scope: the CRM client tiers' tax
 * factor is given `settings.ytd_gci` (a GCI figure) as `netIncome`. Listed so
 * the test fails when it is fixed and the entry can come out.
 */
const KNOWN_NOT_NET: Record<string, string> = {
  "app/(app)/crm/clients-content.tsx": "settings.ytd_gci",
};

describe("engines that look a marginal rate up at their netIncome input", () => {
  it("tax-optimization-engine is given net income for tax on every surface", () => {
    const calls = netIncomeArgs("generateTaxOptimizations");
    expect(calls.map(([f]) => f)).toEqual(expect.arrayContaining([DASHBOARD, FORECAST, OVERHEAD]));
    for (const [file, arg] of calls) {
      if (file === "app/(app)/reports/reports-t2125-tab.tsx") {
        // The T2125 PDF: the T2125's own net business income (line 8270).
        expect(arg).toBe("netIncome");
        expect(source(file)).toContain("const netIncome = result.line8270_netBusinessIncome;");
      } else {
        expect(arg, file).toBe("netForTax");
      }
    }
  });

  it("client-valuation-engine: every caller is net income for tax, or a listed exception", () => {
    const calls = netIncomeArgs("computeClientValuations");
    expect(calls.map(([f]) => f)).toContain("app/(app)/crm/clients-content.tsx");
    for (const [file, arg] of calls) {
      if (file in KNOWN_NOT_NET) expect(arg, file).toBe(KNOWN_NOT_NET[file]);
      else expect(arg, file).toBe("netForTax");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Overhead's net income for tax is the dashboard's
// ─────────────────────────────────────────────────────────────────────────

describe("Overhead's net income for tax is the dashboard's", () => {
  const overhead = source(OVERHEAD);
  const dashboard = source(DASHBOARD);

  it("projected GCI counts listing appointments, as on the dashboard", () => {
    const projection = "projectedYearEndGCI(ytdGCI, pipelineWeightedGCI + listingWeightedGCI, fraction, goalGCI)";
    expect(dashboard).toContain(projection);
    expect(overhead).toContain(projection);
    expect(dashboard).toContain("const listingWeightedGCI = computeListingWeightedGCI(activeListings);");
    expect(overhead).toContain("const listingWeightedGCI = computeListingWeightedGCI(activeListings);");
  });

  it("the Overhead page loads listing appointments with the dashboard page's query", () => {
    const query = (src: string) => {
      const at = src.indexOf('.from("listing_appointments")');
      expect(at).toBeGreaterThan(-1);
      return src.slice(at, src.indexOf(".limit(", at)).replace(/\s+/g, " ");
    };
    expect(query(source(OVERHEAD_PAGE))).toBe(query(source("app/(app)/dashboard/page.tsx")));
    expect(source(OVERHEAD_PAGE)).toContain("activeListings={(listingResult.data ?? []) as ListingAppointment[]}");
  });

  it("the projected net and the tax estimate are the dashboard's chain", () => {
    expect(overhead).toContain("const { grossAfterPlan } = computePlanGross(settings, projectedGCI, {");
    expect(overhead).toContain("return grossAfterPlan - brokerageFeeAnnual;");
    expect(overhead).toContain(NET_FOR_TAX);
    expect(overhead).toContain("calculateTax(netForTax, settings.province, Math.max(projectedDealCount, 1))");
  });

  it("the old lookup at GCI is gone", () => {
    expect(overhead).not.toContain("marginalRate(Math.max(projectedGCI, ytdGCI)");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Worked example: the agent the bug showed on
// ─────────────────────────────────────────────────────────────────────────

const NOW = new Date(2026, 6, 15, 12); // July 15, 2026

const AGENT: YearTaxEstimateInputs = {
  settings: createTestSettings({
    province: "newBrunswick",
    split_preset: "p80_20",
    goal_gci: 180_000,
    use_national_seasonality: true,
    national_quarter_pcts: [0.2, 0.3, 0.3, 0.2],
  }),
  ytdGCI: 90_000,
  ytdDealCount: 8,
  pipelineDeals: [
    { id: "p1", estimated_price: 450_000, estimated_commission_pct: 0.025, probability_override: null, stage: "firm" },
  ],
  listings: [
    { estimated_list_price: 600_000, estimated_commission_pct: 0.025, status: "active" },
    { estimated_list_price: 400_000, estimated_commission_pct: 0.025, status: "scheduled" },
  ],
  historyItems: [],
  expensesYTD: 18_000,
  expensesRemaining: 12_000,
  now: NOW,
};
const YEAR = yearTaxEstimate(AGENT);
const ANNUAL_EXPENSES = AGENT.expensesYTD + AGENT.expensesRemaining;

describe("worked example (New Brunswick, 80/20, listing appointments on the books)", () => {
  it("listing appointments move projected GCI and the tax estimate (they were left out on Overhead)", () => {
    expect(computeListingWeightedGCI(AGENT.listings)).toBeGreaterThan(0);
    const without = yearTaxEstimate({ ...AGENT, listings: [] });
    expect(YEAR.projectedGCI).toBeGreaterThan(without.projectedGCI);
    expect(YEAR.tax.totalBurden).toBeGreaterThan(without.tax.totalBurden);
  });

  it("net income for tax sits well under GCI, and the rate looked up at GCI is higher", () => {
    expect(YEAR.netForTax).toBeLessThan(YEAR.projectedGCI * 0.8);
    expect(marginalRate(YEAR.projectedGCI, "newBrunswick")).toBeGreaterThan(marginalRate(YEAR.netForTax, "newBrunswick"));
  });

  it("Already Capturing = the year's expenses x the rate on net income for tax", () => {
    const rate = deductionTaxRate(YEAR.netForTax, "newBrunswick");
    expect(rate).toBe(marginalRate(YEAR.netForTax, "newBrunswick"));
    const oldCaptured = ANNUAL_EXPENSES * marginalRate(Math.max(YEAR.projectedGCI, AGENT.ytdGCI), "newBrunswick");
    expect(ANNUAL_EXPENSES * rate).toBeLessThan(oldCaptured);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. The Savings Impact bar: both segments priced one way
// ─────────────────────────────────────────────────────────────────────────

const OPT_INPUT: TaxOptimizationInput = {
  netIncome: YEAR.netForTax,
  projectedGCI: YEAR.projectedGCI,
  annualExpenses: ANNUAL_EXPENSES,
  dealCount: Math.max(YEAR.projectedDealCount, 1),
  province: "newBrunswick",
  experienceYears: 5,
  isIncorporated: false,
  corpType: null,
  compensationMethod: "salary",
  homeOfficeSqFootage: null,
  homeOfficeBusinessUsePct: 0,
  homeOfficeRentMonthly: 0,
  homeOfficeUtilitiesMonthly: 0,
  homeOfficePropertyTaxAnnual: 0,
  homeOfficeInsuranceMonthly: 0,
  homeOfficeMaintenanceAnnual: 0,
  homeOfficeCondoFeesMonthly: 0,
  vehicleType: "none",
  vehicleBusinessUsePct: 0,
  hasTrackedMileage: false,
  annualMileageKm: 0,
  gstHstRegistered: false,
  gstHstPaidOnExpenses: 0,
  gstHstRemitted: 0,
  taxInstalmentsPaid: 0,
  cppInstalmentPaidYTD: 0,
  hasProfDevExpenses: true,
  hasMarketingExpenses: true,
  hasClientGiftExpenses: true,
  hasMealExpenses: true,
  hasLicensingExpenses: true,
  ccaAssetCount: 1,
  dismissed: [],
};

describe("the Savings Impact bar", () => {
  it("deductionTaxRate is the marginal rate on net income, and 0 with no net income", () => {
    for (const net of [10_000, 60_000, 120_000, 260_000]) {
      expect(deductionTaxRate(net, "ontario")).toBe(marginalRate(net, "ontario"));
    }
    expect(deductionTaxRate(0, "ontario")).toBe(0);
    expect(deductionTaxRate(-5_000, "ontario")).toBe(0);
  });

  it("an Untapped Potential card is priced at deductionTaxRate on the same net income", () => {
    const rrsp = generateTaxOptimizations(OPT_INPUT).cards.find((c) => c.id === "rrspOptimization");
    expect(rrsp).toBeDefined();
    const room = Math.min(YEAR.netForTax * 0.18, 33_810);
    expect(rrsp!.estimatedSavings).toBeCloseTo(room * deductionTaxRate(YEAR.netForTax, "newBrunswick"), 6);
  });

  it("Overhead hands the bar deductionTaxRate at netForTax, and the bar prices the year's expenses with it", () => {
    const overhead = source(OVERHEAD);
    expect(overhead).toContain("deductionRate={settings ? deductionTaxRate(netForTax, settings.province) : 0}");
    expect(overhead).toContain("const captured = annualExpenses * deductionRate;");
    expect(overhead).toContain("title={alreadyCapturingNote(captured, annualExpenses, deductionRate)}");
    expect(overhead).not.toMatch(/annualExpenses \* marginalTaxRate/);
  });

  it("the hover text gives the figures it used and passes validateTaxCopy", () => {
    const rate = deductionTaxRate(YEAR.netForTax, "newBrunswick");
    const note = alreadyCapturingNote(ANNUAL_EXPENSES * rate, ANNUAL_EXPENSES, rate);
    expect(note).toContain(`Already Capturing: ${fmtCurrency(Math.round(ANNUAL_EXPENSES * rate))}`);
    expect(note).toContain(`(${fmtCurrency(ANNUAL_EXPENSES)})`);
    expect(note).toContain(`the ${fmtPct(rate)} marginal rate on projected net income`);
    expect(note).toMatch(/estimate/);
    expect(validateTaxCopy(note).filter((d) => d.level === "error")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 6. The AI knows
// ─────────────────────────────────────────────────────────────────────────

describe("the Flight Crew's knowledge", () => {
  it("the knowledge base gives Overhead's marginal rate and Already Capturing their definitions", () => {
    const overhead = KNOWLEDGE_BASE.slice(KNOWLEDGE_BASE.indexOf("**OVERHEAD**"), KNOWLEDGE_BASE.indexOf("**SETTINGS**"));
    expect(overhead).toMatch(/"Marginal rate" = the combined federal \+ provincial rate on the next dollar of projected net income for tax/);
    expect(overhead).toMatch(/projected GCI counts listing appointments/);
    expect(overhead).toMatch(/"Already Capturing" = the year's expenses × that marginal rate/);
    expect(overhead).toMatch(/Changed 2026-10-14/);
  });

  it("the Overhead playbook explains both, and is reached by the bar's labels", () => {
    for (const q of ["What does Already Capturing mean?", "Why did my untapped potential change?", "savings impact bar"]) {
      expect(classifyTopicMulti(q).map((t) => t.topic), q).toContain("overhead");
    }
    const playbook = getPlaybooks(["overhead"]);
    expect(playbook).toMatch(/\*\*Marginal rate\*\* \(a row on the Tax Readiness card\)/);
    expect(playbook).toMatch(/\*\*Savings Impact bar\*\*/);
    expect(playbook).toMatch(/deductionTaxRate/);
    const added = [
      playbook.slice(playbook.indexOf("**Marginal rate** (a row"), playbook.indexOf("3. **Quarterly Instalment Amounts**")),
      playbook.slice(playbook.indexOf("7. **Savings Impact bar**"), playbook.indexOf("8. **Per-Deal Tax Estimate**")),
    ];
    for (const text of added) {
      expect(text.length).toBeGreaterThan(100);
      expect(validateTaxCopy(text).filter((d) => d.level === "error")).toEqual([]);
    }
  });
});
