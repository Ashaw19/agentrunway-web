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
 *
 * Display defects fixed the same day, found by looking at the rendered pages:
 *   - The business report's expense ratio bar printed its fill beside its
 *     label: "66%" next to "Expense Ratio · 33.0% of GCI". The goal bar printed
 *     "100%" beside "$250,000 of $200,000".
 *   - The T2125 PDF's three footer lines printed on top of each other on every
 *     page, the last one past the page edge. Where text lands is read back from
 *     the rendered PDF with pdf.js (`textBoxes`).
 *   - The business report's Cash Runway box gave instructions ("Immediate
 *     action required", "Consider increasing your reserve") and called a
 *     12-month runway "within the recommended 4–6+ month safety buffer". It
 *     now states the survival engine's bands, in the engine's words.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createElement, isValidElement, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToBuffer, Text } from "@react-pdf/renderer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  CANONICAL_TAX_DISCLAIMER_SHORT,
  INCOME_TAX_INSTALMENT_DUE_DATES,
  gstHstReportNote,
  validateTaxCopy,
} from "@agent-runway/core/tax-copy";
import { compare } from "@agent-runway/core/engines/benchmark-engine";
import {
  RISK_BAND_LADDER,
  RISK_BAND_RANGE,
  RISK_LEVEL_LABEL,
  survivalResult,
  type SurvivalResult,
} from "@agent-runway/core/engines/survival-engine";
import { buildHealthReport } from "@agent-runway/core/engines/health-report";
import { compute as computeRunwayScore } from "@agent-runway/core/engines/runway-score-engine";
import { computeT2125 } from "@agent-runway/core/engines/t2125-engine";
import { createTestSettings, TEST_TRANSACTIONS, TEST_YEAR } from "@agent-runway/core/engines/__tests__/test-data";
import type { CcaAsset } from "@agent-runway/core/types/database";
import { BusinessReportPDF } from "@/components/pdf/business-report-pdf";
import { T2125Pdf } from "@/components/pdf/t2125-pdf";
import { GuidePdf } from "@/components/pdf/guide-pdf";

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

/** The props of every element of the named component in a document's tree. */
function propsOf(node: ReactNode, name: string, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    for (const child of node) propsOf(child, name, out);
    return out;
  }
  if (!isValidElement(node)) return out;
  const { type, props } = node as { type: unknown; props: Record<string, unknown> & { children?: ReactNode } };
  if (typeof type !== "function") return propsOf(props.children, name, out);
  if (type.name === name) out.push(props);
  return propsOf((type as (p: unknown) => ReactNode)(props), name, out);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const blocksOf = (component: any, props: Record<string, unknown>) => textBlocks(createElement(component, props));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const renders = (component: any, props: Record<string, unknown>) => renderToBuffer(createElement(component, props) as any);

const errorsIn = (text: string) => validateTaxCopy(text).filter((d) => d.level === "error");

// ── Reading where a PDF's text lands ────────────────────────────────────────
// The element tree says what is printed, not where. For layout the rendered
// PDF is read back with pdf.js: one box per run of text, in points from the
// page's bottom-left corner.

interface TextBox {
  page: number;
  text: string;
  left: number;
  right: number;
  bottom: number;
  top: number;
}

// The PDFs use Helvetica, one of the 14 standard fonts a PDF does not embed.
const STANDARD_FONTS = `${path.dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"))}/standard_fonts/`;

async function textBoxes(pdf: Buffer): Promise<TextBox[]> {
  const doc = await getDocument({ data: new Uint8Array(pdf), standardFontDataUrl: STANDARD_FONTS }).promise;
  const boxes: TextBox[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const { items } = await (await doc.getPage(n)).getTextContent();
    for (const item of items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const [left, bottom] = item.transform.slice(4) as number[];
      boxes.push({ page: n, text: item.str, left, right: left + item.width, bottom, top: bottom + item.height });
    }
  }
  await doc.destroy();
  return boxes;
}

const sharedHeight = (a: TextBox, b: TextBox) => Math.min(a.top, b.top) - Math.max(a.bottom, b.bottom);
const sharedWidth = (a: TextBox, b: TextBox) => Math.min(a.right, b.right) - Math.max(a.left, b.left);

/** Pairs of text runs printed on top of each other, by more than a point each way. */
function overprints(boxes: TextBox[]): string[] {
  const hits: string[] = [];
  boxes.forEach((a, i) => {
    for (const b of boxes.slice(i + 1)) {
      if (a.page === b.page && sharedWidth(a, b) > 1 && sharedHeight(a, b) > 1) {
        hits.push(`page ${a.page}: "${a.text}" over "${b.text}"`);
      }
    }
  });
  return hits;
}

const LETTER_WIDTH = 612;

// ── Business report PDF ─────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function reportProps(over: Record<string, unknown> = {}) {
  const ytdGCI = (over.ytdGCI as number | undefined) ?? 120_000;
  const goalGCI = 200_000;
  const fraction = 0.75;
  const projectedGCI = 160_000;
  const pipelineWeighted = 40_000;
  const expenseRatio = (over.expenseRatio as number | undefined) ?? 33;
  const expensesYTD = (ytdGCI * expenseRatio) / 100;
  const benchmark = compare(projectedGCI, 6);
  const survival = (over.survival as SurvivalResult | undefined) ?? survivalResult(500, 2_000, 30_000, 0);
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

describe("business report PDF: expense ratio wording", () => {
  it.each([
    [12, "under"],
    [27, "within"],
    [33, "above"],
    [47, "above"],
  ])("a ratio of %i is called %s the target range", (ratio, word) => {
    const all = blocksOf(BusinessReportPDF, reportProps({ expenseRatio: ratio })).join("\n");
    expect(all).toContain(`Your expense ratio of ${ratio}% is ${word} the 25–30% target range.`);
  });

  it("the bar's note says what the ratio is", () => {
    const blocks = blocksOf(BusinessReportPDF, reportProps());
    expect(blocks).toContain("YTD expenses divided by YTD GCI. The target range is 25–30%.");
  });
});

// A bar prints its label, then one figure to the right of it.
function barOf(blocks: string[], labelStart: string) {
  const at = blocks.findIndex((block) => block.startsWith(labelStart));
  return { label: blocks[at], figure: blocks[at + 1] };
}

describe("business report PDF: a bar's figure is the one its label gives", () => {
  // The expense ratio bar is drawn on a 0–50% scale, so its fill is twice the
  // ratio. The fill used to be the figure: 33.0% printed "66%".
  it.each([
    [12, "12.0%"],
    [33, "33.0%"],
    [47, "47.0%"],
    [60, "60.0%"],
  ])("an expense ratio of %i prints %s", (ratio, figure) => {
    const bar = barOf(blocksOf(BusinessReportPDF, reportProps({ expenseRatio: ratio })), "Expense Ratio ·");
    expect(bar.label).toContain(`Expense Ratio · ${figure} of GCI`);
    expect(bar.figure).toBe(figure);
  });

  // The fill stops at the end of the bar. The figure does not stop with it.
  it.each([
    [120_000, "60%"],
    [200_000, "100%"],
    [250_000, "125%"],
  ])("GCI of %i against a 200,000 goal prints %s", (ytdGCI, figure) => {
    const bar = barOf(blocksOf(BusinessReportPDF, reportProps({ ytdGCI })), "Annual GCI Goal Progress ·");
    expect(bar.label).toContain("of $200,000");
    expect(bar.figure).toBe(figure);
  });
});

describe("business report PDF: cash runway is stated against the engine's bands", () => {
  // Brokerage fee 500 + recurring 2,000 = 2,500 a month.
  const RUNWAYS = [
    { level: "critical", months: "1.2 months", survival: survivalResult(500, 2_000, 3_000, 0) },
    { level: "warning", months: "3.0 months", survival: survivalResult(500, 2_000, 7_500, 0) },
    { level: "healthy", months: "4.5 months", survival: survivalResult(500, 2_000, 11_250, 0) },
    { level: "strong", months: "12.0 months", survival: survivalResult(500, 2_000, 30_000, 0) },
    { level: "strong", months: "24+ months", survival: survivalResult(500, 2_000, 90_000, 0) },
  ] as const;
  const NOT_SET = survivalResult(0, 0, 0, 0);

  it.each(RUNWAYS)("$months: the box names the band and lists all four", ({ level, months, survival }) => {
    expect(survival.riskLevel).toBe(level);
    const blocks = blocksOf(BusinessReportPDF, reportProps({ survival }));
    const title = `${months} of cash runway · ${RISK_LEVEL_LABEL[level]}`;
    expect(blocks).toContain(title);
    const body = blocks.find((block) => block.startsWith("Based on your cash reserve of"));
    expect(body).toMatch(/^Based on your cash reserve of \$[\d,]+ and a monthly burn rate of \$2,500\. /);
    expect(body?.endsWith(` ${RISK_BAND_LADDER}`)).toBe(true);
    expect(`${title} ${body}`).not.toContain("—");
  });

  it.each(RUNWAYS)("$months: the assessment says which range that is", ({ level, months, survival }) => {
    const all = blocksOf(BusinessReportPDF, reportProps({ survival })).join("\n");
    expect(all).toContain(
      ` Your cash runway of ${months} is in the ${RISK_LEVEL_LABEL[level]} range (${RISK_BAND_RANGE[level]}).`,
    );
  });

  it.each([...RUNWAYS.map((r) => r.survival), NOT_SET])("no instruction is left ($label)", (survival) => {
    const all = blocksOf(BusinessReportPDF, reportProps({ survival })).join("\n");
    expect(all).not.toMatch(/immediate action required/i);
    expect(all).not.toMatch(/increasing your reserve|building your reserve/i);
    expect(all).not.toMatch(/professional security|safety buffer|near-term priority|calculated risks/i);
    expect(all).not.toMatch(/recommended 4/i);
  });

  it("with no reserve and no costs entered, the box says Not Set and prints no month count", () => {
    expect(NOT_SET.riskLevel).toBe("notConfigured");
    const blocks = blocksOf(BusinessReportPDF, reportProps({ survival: NOT_SET }));
    expect(blocks).toContain(RISK_LEVEL_LABEL.notConfigured);
    expect(blocks).toContain(
      "Based on your cash reserve of $0 and a monthly burn rate of $0. Add your cash reserve and monthly costs in Settings to see your runway.",
    );
    const all = blocks.join("\n");
    expect(all).not.toMatch(/-1\.0/); // the engine's "not configured" sentinel
    expect(all).not.toContain("Your cash runway of");
    expect(all).not.toContain(RISK_BAND_LADDER);
  });

  it.each([...RUNWAYS.map((r) => r.survival), NOT_SET])("renders to a PDF ($label)", async (survival) => {
    const pdf = await renders(BusinessReportPDF, reportProps({ survival }));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});

describe("the bands are worded once, in the survival engine", () => {
  it("the Guide PDF states the same four bands", () => {
    const blocks = blocksOf(GuidePdf, { province: "newBrunswick", businessStructure: "sole_prop", splitPreset: "p80_20" });
    expect(blocks).toContain(`Cash Reserve \u00F7 Net Monthly Burn. ${RISK_BAND_LADDER}`);
  });

  it("the Reports page's badge takes the band's word from the engine, as its PDF does", () => {
    const page = source("app/(app)/reports/reports-content.tsx");
    expect(page).toContain("label: RISK_LEVEL_LABEL[level]");
    expect(page).not.toMatch(/const RISK_LABEL\b/);
  });
});

// ── T2125 PDF ───────────────────────────────────────────────────────────────

function t2125Props(ccaAssets: CcaAsset[] = []) {
  const settings = createTestSettings({ gst_hst_registered: true });
  const result = computeT2125({ settings, transactions: TEST_TRANSACTIONS, expenses: [], ccaAssets, taxYear: TEST_YEAR });
  return { result, settings, taxYear: TEST_YEAR };
}

// One row in the PDF's Capital Cost Allowance table.
const OFFICE_ASSET: CcaAsset = {
  id: "asset",
  user_id: "user",
  cca_class: 8,
  class_rate: 0.2,
  class_half_year: true,
  description: "Office equipment",
  acquisition_date: `${TEST_YEAR}-03-01`,
  original_cost: 2_000,
  business_use_pct: 1,
  opening_ucc: 0,
  additions_this_year: 2_000,
  disposals_this_year: 0,
  cca_claimed_prior: 0,
  notes: null,
  created_at: `${TEST_YEAR}-03-01T12:00:00Z`,
  updated_at: `${TEST_YEAR}-03-01T12:00:00Z`,
};

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

describe("T2125 PDF: layout at LETTER width", () => {
  const MARGIN = 40;
  const LONG_NAME = "Alexandria Montgomery-Featherstonehaugh Personal Real Estate Corporation";
  const footerLines = (name: string) => [
    `Agent Runway · T2125 Summary · ${name} · ${TEST_YEAR} Tax Year`,
    "ESTIMATES ONLY — NOT PROFESSIONAL TAX ADVICE — CONSULT YOUR ACCOUNTANT",
    "© 2026 Agent Runway Inc. · Canada Corporation No. 1786542-2",
  ];
  // A long line may wrap, and react-pdf hyphenates where it breaks a word.
  const squash = (text: string) => text.replace(/[\s-]/g, "");

  /** Section headers that a page break cut in two, or cut off from the first line under them. */
  function strandedHeaders(props: ReturnType<typeof t2125Props>, boxes: TextBox[]): string[] {
    const headers = propsOf(createElement(T2125Pdf, props), "SectionHeader");
    expect(headers.length).toBeGreaterThan(5);
    // The footer is drawn last on each page, so it sits between one page's text and the next's.
    const footer = footerLines(props.result.agentName).map(squash);
    const flowing = boxes.filter((box) => !footer.some((line) => line.includes(squash(box.text))));
    return headers.flatMap(({ title }) => {
      const at = flowing.findIndex((box) => squash(box.text) === squash(String(title).toUpperCase()));
      expect(at, String(title)).toBeGreaterThanOrEqual(0);
      const [heading, subtitle, firstLine] = flowing.slice(at, at + 3);
      const pages = [heading.page, subtitle.page, firstLine.page];
      return new Set(pages).size === 1 ? [] : [`${title}: pages ${pages.join(", ")}`];
    });
  }

  describe.each([
    ["a short agent name", "Sample Agent"],
    ["a long agent name", LONG_NAME],
  ])("%s", (_, name) => {
    const base = t2125Props();
    const props = { ...base, result: { ...base.result, agentName: name } };
    let boxes: TextBox[] = [];
    beforeAll(async () => {
      boxes = await textBoxes(await renders(T2125Pdf, props));
    });

    it("no text is printed over other text", () => {
      expect(overprints(boxes)).toEqual([]);
    });

    it("no text runs past the page margins", () => {
      const outside = boxes.filter((box) => box.left < MARGIN - 0.5 || box.right > LETTER_WIDTH - MARGIN + 0.5);
      expect(outside.map((box) => `page ${box.page}: "${box.text}"`)).toEqual([]);
    });

    it("every page carries the three footer lines, whole", () => {
      const pages = [...new Set(boxes.map((box) => box.page))];
      expect(pages.length).toBeGreaterThan(1);
      for (const page of pages) {
        const printed = squash(boxes.filter((box) => box.page === page).map((box) => box.text).join(""));
        for (const line of footerLines(name)) expect(printed, `page ${page}`).toContain(squash(line));
      }
    });

    // The footer needs room at the foot of the page, which moves the page
    // breaks. A break must not land inside a section header or right after one.
    it("a section header stays on one page with the first line under it", () => {
      expect(strandedHeaders(props, boxes)).toEqual([]);
    });

    it("a line's note stands clear of the amount beside it", () => {
      const notes = boxes.filter((box) => /^\* User-declared %$|^Gross: /.test(box.text));
      expect(notes.length).toBeGreaterThan(0);
      for (const note of notes) {
        const amount = boxes.find(
          (box) => box.page === note.page && /^\$[\d,.]+$/.test(box.text) && box.left >= note.left && sharedHeight(box, note) > 1,
        );
        expect(amount, note.text).toBeDefined();
        expect(amount!.left - note.right, note.text).toBeGreaterThanOrEqual(4);
      }
    });
  });

  // Each asset adds a row above the last sections of the page, so the sweep
  // walks every header on that page across the page break.
  it("wherever the page break falls, no section header is cut in two or left behind", async () => {
    const stranded: string[] = [];
    for (let assets = 0; assets <= 8; assets++) {
      const props = t2125Props(Array.from({ length: assets }, (_, i) => ({ ...OFFICE_ASSET, id: `asset-${i}` })));
      const found = strandedHeaders(props, await textBoxes(await renders(T2125Pdf, props)));
      stranded.push(...found.map((header) => `${assets} assets: ${header}`));
    }
    expect(stranded).toEqual([]);
  }, 30_000);

  it("the footer's wording is unchanged", () => {
    const blocks = blocksOf(T2125Pdf, t2125Props());
    for (const line of footerLines("Sarah Chen")) expect(blocks).toContain(line);
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
