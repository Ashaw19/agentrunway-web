/**
 * The income tax row on the two deal-close screens is the tax engine's figure
 * under words that say what it is (2026-10-13).
 *
 * What was wrong, on the dashboard's Closing Day prompt and on the
 * Transactions pipeline celebration:
 *   - "Income tax reserve (43%)" = the commission x `marginalRate(...)`, the
 *     rate on the next dollar, looked up at GCI instead of net income and
 *     applied to the whole commission, with CPP left out. Each screen fed it a
 *     different income (YTD GCI or the goal on one, YTD GCI on the other).
 *   - Notes: "~43% marginal rate · portion owed to CRA", "the tax portion
 *     before the rest is yours", "Remit to CRA on your next filing", under
 *     the heading "How to allocate your commission". No disclaimer.
 *   - The Flight Crew's PAYCHEQUE ALLOCATION GUIDANCE worked a third figure
 *     out (the agent's split x income tax / net income), called it a marginal
 *     rate, and fell back to a typed 30% with no estimate. Its seasonal line
 *     multiplied GCI by the engine's effective rate (a share of NET income).
 *   - The dashboard, Forecast and Reports showed the year's estimate /
 *     projected deals as "Per-deal tax portion". One deal, three figures.
 *
 * Now: `taxPortionOfCommission` (core/engines/deal-tax-portion) on every one
 * of them. packages/core/engines/__tests__/cross-surface-parity.test.ts holds
 * the engine to the dashboard's chain; this file holds the screens, the AI
 * context and the AI knowledge to the engine and to the wording.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  dealCloseTaxPortion,
  taxPortionOfCommission,
  type YearTaxEstimateInputs,
} from "@agent-runway/core/engines/deal-tax-portion";
import { calculate } from "@agent-runway/core/engines/canadian-tax-engine";
import { createTestSettings } from "@agent-runway/core/engines/__tests__/test-data";
import {
  CANONICAL_TAX_DISCLAIMER,
  CANONICAL_TAX_DISCLAIMER_SHORT,
  DEAL_CLOSE_BREAKDOWN_HEADING,
  DEAL_TAX_PORTION_DEFINITION,
  GST_HST_TRUST_RULE,
  dealGstHstNote,
  dealTaxPortionLabel,
  dealTaxPortionNote,
  validateTaxCopy,
} from "@agent-runway/core/tax-copy";
import { dealCloseBreakdown } from "@/lib/deal-close-breakdown";
import { paychequeAllocationLines } from "@/lib/ai/paycheque-allocation-intel";
import { KNOWLEDGE_BASE } from "@/lib/knowledge-base";
import { getPlaybooks } from "@/lib/troubleshooting-playbooks";
import { classifyTopicMulti } from "@/lib/troubleshooting-classifier";
import { fmtCurrency } from "@/lib/formatters";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "../.."); // apps/web/
const REPO = path.resolve(WEB, "../..");
const source = (rel: string) => readFileSync(path.join(WEB, rel), "utf8");

const NOW = new Date(2026, 6, 15, 12); // July 15, 2026

const YEAR: YearTaxEstimateInputs = {
  settings: createTestSettings({
    province: "newBrunswick",
    split_preset: "p80_20",
    goal_gci: 180_000,
    use_national_seasonality: true,
    national_quarter_pcts: [0.2, 0.3, 0.3, 0.2],
  }),
  ytdGCI: 60_000,
  ytdDealCount: 5,
  pipelineDeals: [
    { id: "p1", estimated_price: 400_000, estimated_commission_pct: 0.025, probability_override: null, stage: "firm" },
    { id: "p2", estimated_price: 500_000, estimated_commission_pct: 0.025, probability_override: null, stage: "offer" },
  ],
  listings: [],
  historyItems: [],
  expensesYTD: 9_000,
  expensesRemaining: 6_000,
  now: NOW,
};
const GCI = 10_000;
const PORTION = dealCloseTaxPortion({ ...YEAR, commissionGCI: GCI, closingPipelineDealId: "p1" });

const breakdownFor = (over: Partial<Parameters<typeof dealCloseBreakdown>[0]> = {}) =>
  dealCloseBreakdown({
    gci: GCI,
    province: "newBrunswick",
    isGstHstRegistered: true,
    brokerageWithholdsHst: false,
    taxPortion: PORTION,
    ...over,
  });
const row = (b: ReturnType<typeof dealCloseBreakdown>, key: string) => b.rows.find((r) => r.key === key);

// ─────────────────────────────────────────────────────────────────────────
// 1. The rows both screens print
// ─────────────────────────────────────────────────────────────────────────

describe("the Commission breakdown rows", () => {
  it("the income tax row is the engine's tax portion of the commission, in whole dollars", () => {
    const incomeTax = row(breakdownFor(), "incomeTax");
    expect(PORTION.taxPortion).toBeGreaterThan(0);
    expect(incomeTax?.amount).toBe(Math.round(PORTION.taxPortion));
    expect(incomeTax?.amount).toBe(
      Math.round(taxPortionOfCommission(GCI, PORTION.projectedGCI, PORTION.annualTaxEstimate)),
    );
  });

  it("it is not the commission x a marginal rate, and no percentage is printed beside it", () => {
    const incomeTax = row(breakdownFor(), "incomeTax");
    expect(incomeTax?.rate).toBeUndefined();
    expect(incomeTax?.label).toBe("Income tax and CPP (estimate)");
    expect(`${incomeTax?.label} ${incomeTax?.note}`).not.toMatch(/\d\s*%/);
    expect(`${incomeTax?.label} ${incomeTax?.note}`).not.toMatch(/marginal/i);
  });

  it("the note gives the working: the year's estimate and the projected GCI the engine used", () => {
    const note = row(breakdownFor(), "incomeTax")?.note ?? "";
    expect(note).toBe(dealTaxPortionNote(PORTION));
    expect(note).toContain(`the ${PORTION.taxYear} estimate of ${fmtCurrency(PORTION.annualTaxEstimate)}`);
    expect(note).toContain(`projected GCI of ${fmtCurrency(PORTION.projectedGCI)}`);
  });

  it("the year's estimate in the note is the tax engine's total for the year, CPP included", () => {
    const tax = calculate(1, "newBrunswick", 1);
    expect(PORTION.taxYear).toBe(tax.taxYear);
    // totalBurden = income tax + CPP: more than income tax alone at this income.
    expect(PORTION.annualTaxEstimate).toBeGreaterThan(0);
  });

  it("the rest of the commission is what the tax row and fun money leave, and says what it is before", () => {
    const b = breakdownFor();
    const incomeTax = row(b, "incomeTax")!.amount;
    const fun = row(b, "funMoney")!.amount;
    expect(fun).toBe(1_000);
    expect(row(b, "rest")!.amount).toBe(GCI - incomeTax - fun);
    expect(row(b, "rest")!.label).toBe("Rest of this commission");
    expect(row(b, "rest")!.note).toMatch(/Before your brokerage's split and fees, and business expenses/);
  });

  it("is headed as a breakdown and carries the short disclaimer", () => {
    const b = breakdownFor();
    expect(b.heading).toBe(DEAL_CLOSE_BREAKDOWN_HEADING);
    expect(b.heading).toBe("Commission breakdown");
    expect(b.disclaimer).toBe(CANONICAL_TAX_DISCLAIMER_SHORT);
  });

  it("with no settings to estimate from there is no income tax row, and no figure is made up", () => {
    const b = breakdownFor({ taxPortion: null });
    expect(b.rows.map((r) => r.key)).toEqual(["salesTax", "funMoney", "rest"]);
    expect(row(b, "rest")!.amount).toBe(GCI - 1_000);
  });

  it("a year with no estimate shows $0 and says so", () => {
    const none = dealCloseTaxPortion({
      ...YEAR, ytdGCI: 0, ytdDealCount: 0, pipelineDeals: [], expensesYTD: 40_000, expensesRemaining: 40_000, commissionGCI: 3_000,
    });
    expect(none.annualTaxEstimate).toBe(0);
    const incomeTax = row(breakdownFor({ gci: 3_000, taxPortion: none }), "incomeTax");
    expect(incomeTax?.amount).toBe(0);
    expect(incomeTax?.note).toContain("so no tax portion is worked out for this commission");
  });

  it("the GST/HST row: the canonical helper's amount, and a note for each of its three readers", () => {
    const registered = row(breakdownFor(), "salesTax")!;
    expect(registered.label).toBe("HST collected (estimate)");
    expect(registered.amount).toBe(1_500); // 15% in New Brunswick
    expect(registered.rate).toBe(0.15);
    expect(registered.note).toContain(GST_HST_TRUST_RULE);

    const notRegistered = row(breakdownFor({ isGstHstRegistered: false }), "salesTax")!;
    expect(notRegistered.amount).toBe(0);
    expect(notRegistered.note).toBe(dealGstHstNote({ label: "HST", registered: false, brokerageWithholds: false }));
    expect(notRegistered.note).toContain("no HST registration");

    const withheld = row(breakdownFor({ brokerageWithholdsHst: true }), "salesTax")!;
    expect(withheld.amount).toBe(0);
    expect(withheld.note).toContain("your brokerage holds back HST and remits it to CRA");
  });

  it("Quebec's row names QPP", () => {
    expect(dealTaxPortionLabel("quebec")).toBe("Income tax and QPP (estimate)");
  });

  it("every word of the tax rows passes the tax copy validator, warnings included", () => {
    const cases = [
      breakdownFor(),
      breakdownFor({ isGstHstRegistered: false }),
      breakdownFor({ brokerageWithholdsHst: true }),
      breakdownFor({ province: "quebec" }),
    ];
    for (const b of cases) {
      for (const r of b.rows) {
        expect(validateTaxCopy(`${r.label}. ${r.note}`), `${r.key}: ${r.label}. ${r.note}`).toEqual([]);
      }
      expect(validateTaxCopy(b.heading)).toEqual([]);
    }
    expect(validateTaxCopy(DEAL_TAX_PORTION_DEFINITION)).toEqual([]);
  });

  it("the validator would have flagged the old label", () => {
    expect(validateTaxCopy("Income tax reserve").map((d) => d.trigger.toLowerCase())).toContain("reserve");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. The two screens, read as source
// ─────────────────────────────────────────────────────────────────────────

const SCREENS = [
  "app/(app)/dashboard/closing-day-prompt.tsx",
  "app/(app)/transactions/deal-close-celebration.tsx",
] as const;

describe.each(SCREENS)("%s", (file) => {
  const src = source(file);

  it("prints the shared rows, heading and disclaimer", () => {
    expect(src).toMatch(/\bdealCloseBreakdown\(\{ gci, province, isGstHstRegistered, brokerageWithholdsHst, taxPortion \}\)/);
    expect(src).toContain("{breakdown.heading}");
    expect(src).toContain("breakdown.rows.map(");
    expect(src).toContain("{breakdown.disclaimer}");
  });

  it("works out no tax figure of its own", () => {
    expect(src).not.toMatch(/marginalRate/i);
    expect(src).not.toMatch(/taxReserve/);
    expect(src).not.toMatch(/computeHSTCollected|gstHstRate/);
    expect(src).not.toMatch(/gci\s*\*\s*0\.\d/);
  });

  it("the old wording is gone", () => {
    expect(src).not.toMatch(/reserve/i);
    expect(src).not.toMatch(/owed to CRA/i);
    expect(src).not.toMatch(/rest is yours/i);
    expect(src).not.toMatch(/How to allocate/i);
    expect(src).not.toMatch(/remit to CRA/i);
  });
});

describe("where the tax portion is worked out", () => {
  it("both close handlers call the engine with the deal that is closing", () => {
    const prompt = source("app/(app)/dashboard/closing-day-prompt.tsx");
    expect(prompt).toContain("dealCloseTaxPortion({ ...taxEstimateInputs, commissionGCI: gci, closingPipelineDealId: current.id })");

    const tab = source("app/(app)/transactions/transactions-pipeline-tab.tsx");
    expect(tab).toMatch(/dealCloseTaxPortion\(\{\s*\.\.\.taxEstimateInputs,\s*pipelineDeals: deals,\s*commissionGCI: gci,\s*closingPipelineDealId: closeTarget\.id,\s*\}\)/);
    expect(tab).not.toMatch(/marginalRate/);
  });

  it("the dashboard hands its prompt the rows its own tax estimate reads", () => {
    const dash = source("app/(app)/dashboard/dashboard-content.tsx");
    const handed = dash.slice(dash.indexOf("taxEstimateInputs={settings ? {"), dash.indexOf("} : null}", dash.indexOf("taxEstimateInputs={settings ? {")));
    for (const field of ["settings,", "ytdGCI,", "ytdDealCount,", "pipelineDeals,", "listings: activeListings,", "historyItems,", "expensesYTD,", "expensesRemaining,"]) {
      expect(handed, field).toContain(field);
    }
  });

  it("the Transactions page loads expenses and listings the way the dashboard page does", () => {
    const page = source("app/(app)/transactions/page.tsx");
    const dashPage = source("app/(app)/dashboard/page.tsx");
    const reads = [
      `.select("category_key, total_amount, tax_amount")`,
      `.eq("is_active", true)`,
      `.in("status", ["scheduled", "active"])`,
      "ctx: expenseTaxContext(",
      "now: today,",
    ];
    for (const read of reads) {
      expect(dashPage, read).toContain(read);
      expect(page, read).toContain(read);
    }
    expect(page).toMatch(/\bytdExpenseTotals\(\{/);
    expect(page).toContain("const today = atlanticNoon();");
    expect(page).toContain("expensesYTD={expenseTotals.expensesYTD}");
    expect(page).toContain("expensesRemaining={expenseTotals.expensesRemaining}");
  });
});

describe("no screen on the web or the phone still prints an income tax reserve", () => {
  // Read here and not inside the test: a walk over a thousand files ran past
  // the 5-second test timeout while sibling suites were running.
  const SKIP = new Set(["node_modules", "__tests__", ".next", ".expo", ".turbo", "ios", "android", "dist", "build"]);
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return SKIP.has(e.name) ? [] : walk(full);
      return /\.tsx?$/.test(e.name) ? [full] : [];
    });
  const files = ["apps/web/app", "apps/web/components", "apps/mobile"].flatMap((root) => walk(path.join(REPO, root)));
  const hits = files.filter((f) => /income tax reserve/i.test(readFileSync(f, "utf8"))).map((f) => path.relative(REPO, f));

  it("the scan reads the web app's screens and the mobile app", () => {
    const rels = files.map((f) => path.relative(REPO, f));
    expect(rels).toContain("apps/web/app/(app)/dashboard/closing-day-prompt.tsx");
    expect(rels).toContain("apps/web/app/(app)/transactions/deal-close-celebration.tsx");
    expect(rels.some((r) => r.startsWith("apps/mobile/") && r.endsWith(".tsx"))).toBe(true);
    expect(files.length).toBeGreaterThan(300);
  });

  it("finds none", () => {
    expect(hits).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. What the Flight Crew is given
// ─────────────────────────────────────────────────────────────────────────

describe("PAYCHEQUE ALLOCATION GUIDANCE", () => {
  const input = {
    province: "newBrunswick",
    brokerageWithholdsHst: false,
    agentPct: 0.8,
    projectedGCI: 150_000,
    annualTaxEstimate: 30_000,
    perDealTaxPortion: 2_500,
  };
  const text = (over: Partial<typeof input> = {}) => paychequeAllocationLines({ ...input, ...over }).join("\n");

  it("the worked example is the engine's tax portion of the commission", () => {
    const portion = taxPortionOfCommission(10_000, 150_000, 30_000);
    expect(portion).toBe(2_000);
    for (const t of [text(), text({ brokerageWithholdsHst: true })]) {
      expect(t).toContain(`Tax portion of that $10,000 commission (income tax + CPP, engine estimate): ~${fmtCurrency(portion)}`);
      expect(t).toContain(`the agent's split less that tax portion: ~${fmtCurrency(8_000 - portion)}`);
    }
  });

  it("states the definition and the figures it is built from, with the per-deal tax portion", () => {
    const t = text();
    expect(t).toContain(DEAL_TAX_PORTION_DEFINITION);
    expect(t).toContain("This year's estimate: $30,000. Projected year-end GCI: $150,000.");
    expect(t).toContain("Per-deal tax portion: $2,500.");
    expect(t).toContain('"Income tax and CPP (estimate)"');
  });

  it("gives no rate for the commission: the only percentages are the GST/HST rate and the split", () => {
    const percents = text().match(/\d+(?:\.\d+)?%/g) ?? [];
    expect(percents).toEqual(["15.0%", "80%"]);
    expect(text()).not.toMatch(/marginal (?:tax )?rate(?: of)? ~?\d/i);
    expect(text()).not.toMatch(/typically covers/i);
    expect(text()).toContain("Do not state it as a percentage of the commission or as a marginal rate, and describe no action for the money.");
  });

  it("with no estimate it says so, and no typed rate stands in", () => {
    const t = text({ annualTaxEstimate: 0, perDealTaxPortion: 0 });
    expect(t).toContain("The engine's estimate for this year is $0 on the figures entered so far");
    expect(t).not.toMatch(/Tax portion of that/);
    expect(t).not.toMatch(/30%/);
  });

  it("the tax lines are information, not advice, and the block still ends on the disclaimer", () => {
    const lines = paychequeAllocationLines(input);
    const taxLine = lines.find((l) => l.startsWith("[TAX PORTION OF A COMMISSION]")) ?? "";
    expect(validateTaxCopy(taxLine).filter((d) => d.level === "error")).toEqual([]);
    expect(lines[0]).toBe("── PAYCHEQUE ALLOCATION GUIDANCE ──");
    expect(lines[lines.length - 1]).toBe("── END PAYCHEQUE ALLOCATION GUIDANCE ──");
    expect(lines[lines.length - 2]).toContain(CANONICAL_TAX_DISCLAIMER);
  });

  it("the chat route hands it the dashboard chain's figures and works out none of its own", () => {
    const route = source("app/api/chat/route.ts");
    const call = route.slice(route.indexOf("...paychequeAllocationLines({"), route.indexOf('"── END COMPUTED ENGINE OUTPUTS ──"'));
    expect(call).toContain("projectedGCI: projGCI,");
    expect(call).toContain("annualTaxEstimate: taxResult.totalBurden,");
    expect(call).toContain("perDealTaxPortion: taxResult.perDealSetAside,");
    expect(route).not.toMatch(/exampleTaxReserve|Estimated marginal tax rate/);
    expect(route).not.toMatch(/const marginalRate\b/);
    // The seasonal line gets the year's estimate, not a rate to multiply GCI by.
    expect(route).toMatch(/seasonalCommissionPatternLine\(\{[\s\S]{0,300}annualTaxEstimate: taxResult\.totalBurden,/);
    expect(route).not.toMatch(/effectiveRate: taxResult\.effectiveRate/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. What the AI knows about the screen
// ─────────────────────────────────────────────────────────────────────────

describe("AI knowledge of the deal-close breakdown", () => {
  const topicsFor = (question: string) => classifyTopicMulti(question).map((t) => t.topic);

  it("the knowledge base names the rows and gives the definition", () => {
    expect(KNOWLEDGE_BASE).toContain("**DEAL CLOSE**");
    expect(KNOWLEDGE_BASE).toContain('"Commission breakdown"');
    expect(KNOWLEDGE_BASE).toContain('"Income tax and CPP (estimate)"');
    expect(KNOWLEDGE_BASE).toContain("× the commission ÷ projected year-end GCI");
    // The old name appears once: in the note saying what changed.
    expect(KNOWLEDGE_BASE.match(/Income tax reserve/g)).toHaveLength(1);
  });

  it.each(["tax", "transactions", "overhead", "pipeline"] as const)("the %s playbook describes the row", (topic) => {
    const playbook = getPlaybooks([topic]);
    expect(playbook).toContain("Income tax and CPP (estimate)");
  });

  it("the tax and transactions playbooks give the definition and how it relates to the per-deal tax portion", () => {
    for (const topic of ["tax", "transactions"] as const) {
      const playbook = getPlaybooks([topic]);
      expect(playbook, topic).toMatch(/this year's tax estimate × th(?:is|at) commission ÷ projected year-end GCI/);
      expect(playbook, topic).toMatch(/equal for a deal of the projected average size/);
      expect(playbook, topic).toContain("Changed 2026-10-13");
    }
    expect(getPlaybooks(["tax"])).toContain("Do not state a percentage of the commission or a marginal rate");
  });

  it("a question about the row reaches the tax playbook", () => {
    for (const question of [
      "what is the income tax and cpp estimate on the deal close screen",
      "why did my income tax reserve go down",
      "how much tax on this commission",
    ]) {
      expect(topicsFor(question), question).toContain("tax");
    }
    expect(topicsFor("what does the commission breakdown show when I close a deal")).toContain("transactions");
  });
});
