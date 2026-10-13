/**
 * Tax copy in the downloadable PDFs states CRA's rules as CRA states them and
 * never as advice (2026-10-13).
 *
 * What was wrong:
 *   - The business report PDF printed one GST/HST sentence for every reader:
 *     "you are responsible for remitting HST to the CRA if your annual income
 *     exceeds $30,000. Keep a dedicated account for these funds." Two
 *     directives, and not CRA's rule (the small supplier limit is revenue from
 *     taxable supplies in a single calendar quarter or over four consecutive
 *     calendar quarters). A non-registrant, and a registrant whose brokerage
 *     remits the tax, both read "$0 collected" in front of it.
 *   - The T2125 PDF and tab listed the GST/HST filing dates (Apr 30, Jul 31,
 *     Oct 31, Jan 31) as income tax instalment due dates, under a
 *     "Recommended" column.
 *
 * The wording now lives in `@agent-runway/core/tax-copy` (cra-rules.ts), with
 * its CRA sources, and is tested there string by string. This file proves the
 * PDFs print it.
 *
 * The PDF components are `@ts-nocheck` (react-pdf's class components don't
 * type-check under React 19), so nothing but a real render catches a typo in
 * them. Each is rendered to a PDF here, and its element tree is read for the
 * text it prints.
 */
import { describe, expect, it } from "vitest";
import { createElement, isValidElement, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToBuffer, Text } from "@react-pdf/renderer";
import {
  CANONICAL_TAX_DISCLAIMER_SHORT,
  INCOME_TAX_INSTALMENT_DUE_DATES,
  gstHstReportNote,
  validateTaxCopy,
} from "@agent-runway/core/tax-copy";
import { compare } from "@agent-runway/core/engines/benchmark-engine";
import { survivalResult } from "@agent-runway/core/engines/survival-engine";
import { buildHealthReport } from "@agent-runway/core/engines/health-report";
import { compute as computeRunwayScore } from "@agent-runway/core/engines/runway-score-engine";
import { computeT2125 } from "@agent-runway/core/engines/t2125-engine";
import { createTestSettings, TEST_TRANSACTIONS, TEST_YEAR } from "@agent-runway/core/engines/__tests__/test-data";
import { BusinessReportPDF } from "@/components/pdf/business-report-pdf";
import { T2125Pdf } from "@/components/pdf/t2125-pdf";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "../.."); // apps/web/
const source = (rel: string) => readFileSync(path.join(WEB, rel), "utf8");

// ── Reading a PDF's text without parsing the PDF ────────────────────────────
// A react-pdf document is plain function components over string primitives,
// so calling the components gives the tree, and every <Text> is one block.

function flatten(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flatten).join("");
  if (!isValidElement(node)) return "";
  const { type, props } = node as { type: unknown; props: { children?: ReactNode } };
  if (typeof type === "function") return flatten((type as (p: unknown) => ReactNode)(props));
  return flatten(props.children);
}

function textBlocks(node: ReactNode, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const child of node) textBlocks(child, out);
    return out;
  }
  if (!isValidElement(node)) return out;
  const { type, props } = node as { type: unknown; props: { children?: ReactNode } };
  if (typeof type === "function") return textBlocks((type as (p: unknown) => ReactNode)(props), out);
  if (type === Text) {
    out.push(flatten(props.children).replace(/\s+/g, " ").trim());
    return out;
  }
  return textBlocks(props.children, out);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const blocksOf = (component: any, props: Record<string, unknown>) => textBlocks(createElement(component, props));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const renders = (component: any, props: Record<string, unknown>) => renderToBuffer(createElement(component, props) as any);

const errorsIn = (text: string) => validateTaxCopy(text).filter((d) => d.level === "error");

// ── Business report PDF ─────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function reportProps(over: Record<string, unknown> = {}) {
  const ytdGCI = 120_000;
  const goalGCI = 200_000;
  const fraction = 0.75;
  const projectedGCI = 160_000;
  const pipelineWeighted = 40_000;
  const expenseRatio = (over.expenseRatio as number | undefined) ?? 33;
  const expensesYTD = (ytdGCI * expenseRatio) / 100;
  const benchmark = compare(projectedGCI, 6);
  const survival = survivalResult(500, 2_000, 30_000, 0);
  const runwayScore = computeRunwayScore(
    buildHealthReport(ytdGCI, goalGCI, fraction, pipelineWeighted, expensesYTD),
    benchmark.percentile,
    survival.months,
  );
  return {
    agentName: "Sample Agent",
    brokerageName: "Sample Realty",
    businessName: "",
    province: "newBrunswick",
    year: TEST_YEAR,
    ytdGCI,
    ytdDeals: 12,
    buyerDeals: 7,
    sellerDeals: 5,
    avgDealSize: 10_000,
    pipelineWeighted,
    pipelineCount: 4,
    goalGCI,
    fraction,
    projectedGCI,
    agentPct: 0.8,
    brokerageTake: 24_000,
    txFees: 1_200,
    brokerageFeeYTD: 4_500,
    agentGrossNet: 90_300,
    expensesYTD,
    netPreTax: 90_300 - expensesYTD,
    afterTaxNet: 40_000,
    projectedNet: 70_000,
    taxResult: {
      taxYear: TEST_YEAR,
      totalCPP: 8_000,
      federalTax: 9_000,
      provincialTax: 7_000,
      totalBurden: 24_000,
      effectiveRate: 0.34,
      quarterlyEstimate: 6_000,
      perDealSetAside: 1_500,
    },
    gstHstCollectedYTD: 18_000,
    gstHstLabel: "HST",
    gstHstRegistered: true,
    brokerageWithholdsHst: false,
    expenseRatio,
    expenseRows: [
      { key: "marketing", title: "Marketing", ytd: expensesYTD * 0.6, monthly: 1_200 },
      { key: "vehicle", title: "Vehicle", ytd: expensesYTD * 0.4, monthly: 800 },
    ],
    monthlyRecurring: 2_000,
    bands: { p10: 120_000, p25: 140_000, p50: 160_000, p75: 180_000, p90: 200_000 },
    monthlyData: MONTHS.map((month, i) => ({ month, gci: i < 9 ? ytdGCI / 9 : 0, deals: i < 9 ? 1 : 0 })),
    benchmark,
    survival,
    runwayScore,
    advisorCards: [],
    transactions: [],
    ...over,
  };
}

const READERS = [
  { name: "not registered", flags: { gstHstRegistered: false, brokerageWithholdsHst: false, gstHstCollectedYTD: 0 } },
  { name: "registered", flags: { gstHstRegistered: true, brokerageWithholdsHst: false, gstHstCollectedYTD: 18_000 } },
  { name: "registered, brokerage holds the tax back", flags: { gstHstRegistered: true, brokerageWithholdsHst: true, gstHstCollectedYTD: 0 } },
] as const;

describe("business report PDF: GST/HST note", () => {
  it.each(READERS)("$name: prints that reader's note, then the tax disclaimer", ({ flags }) => {
    const props = reportProps(flags);
    const note = gstHstReportNote({
      label: "HST",
      registered: flags.gstHstRegistered,
      brokerageWithholds: flags.brokerageWithholdsHst,
      collectedYTD: flags.gstHstCollectedYTD,
      ytdGCI: props.ytdGCI,
    });
    const blocks = blocksOf(BusinessReportPDF, props);
    expect(blocks).toContain(`${note} ${CANONICAL_TAX_DISCLAIMER_SHORT}`);
    expect(errorsIn(`${note} ${CANONICAL_TAX_DISCLAIMER_SHORT}`)).toEqual([]);
  });

  it.each(READERS)("$name: none of the old sentence is left anywhere in the report", ({ flags }) => {
    const all = blocksOf(BusinessReportPDF, reportProps(flags)).join("\n");
    expect(all).not.toMatch(/annual income/i);
    expect(all).not.toMatch(/responsible for remitting/i);
    expect(all).not.toMatch(/dedicated account/i);
    expect(all).not.toMatch(/reaches your pocket/i);
  });

  it("a non-registrant is not shown an amount collected", () => {
    const all = blocksOf(BusinessReportPDF, reportProps(READERS[0].flags)).join("\n");
    expect(all).toContain("no HST registration");
    expect(all).not.toMatch(/\$0(\.00)? collected/);
  });

  it.each(READERS)("$name: renders to a PDF", async ({ flags }) => {
    const pdf = await renders(BusinessReportPDF, reportProps(flags));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});

// One target and one set of bands on every surface: EXPENSE_RATIO_BANDS in
// packages/core/engines/expense-ratio-bands.ts. The sentences are pinned here
// as the PDF prints them; expense-ratio-bands-canonical.test.ts fails if a
// surface states a figure of its own again.
describe("business report PDF: expense ratio wording", () => {
  it.each([
    [12, "well within"],
    [27, "within"],
    [33, "within"],
    [35, "within"],
    [47, "above"],
    [62, "well above"],
  ])("a ratio of %i is called %s the target", (ratio, word) => {
    const all = blocksOf(BusinessReportPDF, reportProps({ expenseRatio: ratio })).join("\n");
    expect(all).toContain(`Your expense ratio of ${ratio}% is ${word} Agent Runway's target of 35% of GCI or less.`);
  });

  it("a ratio just past the target prints its decimal and reads as above it", () => {
    const all = blocksOf(BusinessReportPDF, reportProps({ expenseRatio: 35.4 })).join("\n");
    expect(all).toContain("Your expense ratio of 35.4% is above Agent Runway's target of 35% of GCI or less.");
  });

  it("the bar's label and note give the target, and say whose it is", () => {
    const blocks = blocksOf(BusinessReportPDF, reportProps());
    expect(blocks).toContain("Expense Ratio · 33.0% of GCI (target: 35% or less)");
    expect(blocks).toContain("YTD expenses divided by YTD GCI. Agent Runway's target for the expense ratio is 35% of GCI or less.");
  });

  it("says nothing about the target when no expenses are recorded", () => {
    const all = blocksOf(BusinessReportPDF, reportProps({ expenseRatio: 0 })).join("\n");
    expect(all).not.toContain("Your expense ratio of");
  });

  it("never states the old 25–30% range or calls a figure an industry benchmark", () => {
    const all = [
      ...blocksOf(BusinessReportPDF, reportProps()),
      ...blocksOf(BusinessReportPDF, reportProps({ expenseRatio: 47 })),
    ].join("\n");
    expect(all).not.toMatch(/25\s?[–-]\s?3[05]\s?%/);
    expect(all).not.toMatch(/industry (benchmark|average)/i);
  });
});

// ── T2125 PDF ───────────────────────────────────────────────────────────────

function t2125Props() {
  const settings = createTestSettings({ gst_hst_registered: true });
  const result = computeT2125({ settings, transactions: TEST_TRANSACTIONS, expenses: [], ccaAssets: [], taxYear: TEST_YEAR });
  return { result, settings, taxYear: TEST_YEAR };
}

describe("T2125 PDF: instalment tracker", () => {
  const blocks = blocksOf(T2125Pdf, t2125Props());
  const all = blocks.join("\n");

  it("lists CRA's income tax instalment dates", () => {
    for (const { long } of INCOME_TAX_INSTALMENT_DUE_DATES) expect(blocks).toContain(long);
    expect(blocks).toContain("Due Mar 15, Jun 15, Sep 15, Dec 15");
  });

  it("does not list the GST/HST filing dates as instalment dates", () => {
    expect(all).not.toMatch(/April 30|July 31|October 31|January 31|Apr\/Jul\/Oct\/Jan/);
  });

  it('heads the amount "Estimated", not "Recommended"', () => {
    expect(blocks).toContain("Estimated");
    expect(all).not.toMatch(/recommend/i);
  });

  it("renders to a PDF", async () => {
    const pdf = await renders(T2125Pdf, t2125Props());
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});

// ── Source: the same shapes, where a render can't reach ─────────────────────

describe("the Reports page hands the PDF both GST/HST settings", () => {
  const page = source("app/(app)/reports/reports-content.tsx");

  it("registration comes from gst_hst_registered, and the brokerage flag is passed", () => {
    // Left out, the PDF would read `undefined` and print the non-registrant note for a registrant.
    expect(page).toMatch(/gstHstRegistered:\s*settings\.gst_hst_registered \?\? false/);
    expect(page).toMatch(/brokerageWithholdsHst:\s*settings\.brokerage_withholds_hst \?\? false/);
  });

  it("the page prints the same note as its PDF", () => {
    expect(page).toContain("gstHstReportNote(");
    expect(page).not.toMatch(/must be remitted/);
  });
});

describe("no loose statement of the $30,000 rule, and no instalment advice wording", () => {
  const FILES = [
    "components/pdf/business-report-pdf.tsx",
    "components/pdf/t2125-pdf.tsx",
    "components/pdf/expense-export-pdf.tsx",
    "components/pdf/guide-pdf.tsx",
    "lib/reports/cheat-sheet-pdf-doc.tsx",
    "app/(app)/reports/reports-content.tsx",
    "app/(app)/reports/reports-t2125-tab.tsx",
    "lib/knowledge-base.ts",
    "lib/troubleshooting-playbooks.ts",
    "app/api/chat/route.ts",
    "app/(app)/settings/settings-content.tsx",
    "app/onboarding/page.tsx",
    "content/blog/the-real-cost-of-a-real-estate-deal.mdx",
  ];

  // The limit as a yearly or 12-month figure, or as income.
  const LOOSE = [
    /annual (income|revenue) exceeds/i,
    /\$30,?000 annual/i,
    /rolling 12-month/i,
    /\$30K\/12mo/i,
    /below \$30K revenue/i,
    /under \$30,000 threshold/i,
  ];

  it.each(FILES)("%s", (rel) => {
    const text = source(rel);
    expect(LOOSE.filter((shape) => shape.test(text)).map(String)).toEqual([]);
  });

  it.each(["components/pdf/t2125-pdf.tsx", "app/(app)/reports/reports-t2125-tab.tsx"])(
    "%s: instalment dates come from the shared CRA list",
    (rel) => {
      const text = source(rel);
      expect(text).toContain("INCOME_TAX_INSTALMENT_DUE_DATES");
      // "recommendedQuarterly" is the engine's field name; the printed word is what's checked.
      expect(text.replace(/recommendedQuarterly/g, "")).not.toMatch(/recommended/i);
      expect(text).not.toMatch(/"(Apr 30|Jul 31|Oct 31|Jan 31|April 30|July 31|October 31|January 31)"/);
    },
  );

  it("the guide PDF prints no dollar limit for client gifts", () => {
    expect(source("components/pdf/guide-pdf.tsx")).not.toMatch(/Client gifts:[^<]*\$\d/);
  });
});
