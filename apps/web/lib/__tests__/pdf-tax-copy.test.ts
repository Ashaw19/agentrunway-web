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
 *   - The business report's Score Breakdown bars were coloured on a ladder of
 *     the PDF's own (80 / 60 / 40). They take the Runway Score engine's bands,
 *     as the dashboard's do.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createElement, isValidElement, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToBuffer, Text } from "@react-pdf/renderer";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  CANONICAL_TAX_DISCLAIMER_SHORT,
  INCOME_TAX_INSTALMENT_DUE_DATES,
  gstHstReportNote,
  validateTaxCopy,
} from "@agent-runway/core/tax-copy";
import { fmtCompact } from "@agent-runway/core/formatters";
import { compare } from "@agent-runway/core/engines/benchmark-engine";
import {
  RISK_BAND_LADDER,
  RISK_BAND_RANGE,
  RISK_LEVEL_LABEL,
  runwayBasisSentence,
  survivalResult,
  type SurvivalResult,
} from "@agent-runway/core/engines/survival-engine";
import { buildHealthReport } from "@agent-runway/core/engines/health-report";
import { bandColorHexForScore, compute as computeRunwayScore } from "@agent-runway/core/engines/runway-score-engine";
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

interface Box {
  page: number;
  left: number;
  right: number;
  bottom: number;
  top: number;
}

interface TextBox extends Box {
  text: string;
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

const sharedHeight = (a: Box, b: Box) => Math.min(a.top, b.top) - Math.max(a.bottom, b.bottom);
const sharedWidth = (a: Box, b: Box) => Math.min(a.right, b.right) - Math.max(a.left, b.left);

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

// The box pdf.js gives a run is its baseline and its font size above it. The
// ink is somewhere else: Helvetica's capitals stop at 0.718 of the size, and
// its descenders hang 0.207 below the baseline (CapHeight and Descender in
// the font's AFM).
const inkTop = (box: TextBox) => box.bottom + 0.718 * (box.top - box.bottom);
const inkBottom = (box: TextBox) => box.bottom - 0.207 * (box.top - box.bottom);

/** Pairs of text runs, one above the other, with less than a point between the ink of the two. */
function touching(boxes: TextBox[]): string[] {
  const hits: string[] = [];
  boxes.forEach((a, i) => {
    for (const b of boxes.slice(i + 1)) {
      if (a.page !== b.page || sharedWidth(a, b) <= 1) continue;
      const [upper, lower] = a.bottom >= b.bottom ? [a, b] : [b, a];
      if (inkBottom(upper) - inkTop(lower) < 1) hits.push(`page ${a.page}: "${upper.text}" against "${lower.text}"`);
    }
  });
  return hits;
}

// ── Reading where a PDF's shapes land ───────────────────────────────────────
// A bar, a badge and a card are filled paths. pdf.js lists a page's drawing
// operators, and each fill carries its path's bounding box in the coordinates
// the operators before it set up. Same units and corner as `textBoxes`.

interface Fill extends Box {
  colour: string;
}

type Matrix = [number, number, number, number, number, number];

/** The matrix that applies `inner`, then `outer`. */
const compose = (outer: Matrix, inner: Matrix): Matrix => [
  outer[0] * inner[0] + outer[2] * inner[1],
  outer[1] * inner[0] + outer[3] * inner[1],
  outer[0] * inner[2] + outer[2] * inner[3],
  outer[1] * inner[2] + outer[3] * inner[3],
  outer[0] * inner[4] + outer[2] * inner[5] + outer[4],
  outer[1] * inner[4] + outer[3] * inner[5] + outer[5],
];

async function fills(pdf: Buffer): Promise<Fill[]> {
  const doc = await getDocument({ data: new Uint8Array(pdf), standardFontDataUrl: STANDARD_FONTS }).promise;
  const shapes: Fill[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const { fnArray, argsArray } = await (await doc.getPage(n)).getOperatorList();
    let matrix: Matrix = [1, 0, 0, 1, 0, 0];
    let colour = "";
    const saved: { matrix: Matrix; colour: string }[] = [];
    fnArray.forEach((fn, i) => {
      const args = argsArray[i];
      if (fn === OPS.save) saved.push({ matrix, colour });
      else if (fn === OPS.restore) ({ matrix, colour } = saved.pop() ?? { matrix, colour });
      else if (fn === OPS.transform) matrix = compose(matrix, args);
      else if (fn === OPS.setFillRGBColor) colour = String(args[0]);
      else if (fn === OPS.constructPath && (args[0] === OPS.fill || args[0] === OPS.eoFill)) {
        const [minX, minY, maxX, maxY] = args[2] as Float32Array;
        const xs = [minX, maxX].map((x, k) => matrix[0] * x + matrix[2] * [minY, maxY][k] + matrix[4]);
        const ys = [minX, maxX].map((x, k) => matrix[1] * x + matrix[3] * [minY, maxY][k] + matrix[5]);
        shapes.push({ page: n, colour, left: Math.min(...xs), right: Math.max(...xs), bottom: Math.min(...ys), top: Math.max(...ys) });
      }
    });
  }
  await doc.destroy();
  return shapes;
}

const LETTER_WIDTH = 612;
const LONG_NAME = "Alexandria Montgomery-Featherstonehaugh Personal Real Estate Corporation";
// A long line may wrap, and react-pdf hyphenates where it breaks a word.
const squash = (text: string) => text.replace(/[\s-]/g, "");

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

// ── Score Breakdown bars ────────────────────────────────────────────────────
// The element tree again, this time for a colour. Each row of the Score
// Breakdown is a label, a track holding the fill, and the score.

type Host = { type: unknown; props: Record<string, unknown> & { children?: ReactNode } };

/** Every View and Text in a document's tree, with function components called through. */
function hostElements(node: ReactNode, out: Host[] = []): Host[] {
  if (Array.isArray(node)) {
    for (const child of node) hostElements(child, out);
    return out;
  }
  if (!isValidElement(node)) return out;
  const el = node as unknown as Host;
  if (typeof el.type === "function") return hostElements((el.type as (p: unknown) => ReactNode)(el.props), out);
  out.push(el);
  return hostElements(el.props.children, out);
}

/** A style prop as one object: react-pdf takes an object or an array of them. */
const styleOf = (el: Host): Record<string, unknown> => Object.assign({}, ...[el.props.style ?? {}].flat(2));

function scoreBars(props: ReturnType<typeof reportProps>) {
  const names = props.runwayScore.components.map((c) => c.label);
  const bars: { label: string; score: number; colour: unknown }[] = [];
  for (const row of hostElements(createElement(BusinessReportPDF, props))) {
    const kids = row.props.children;
    if (!Array.isArray(kids) || kids.length !== 3) continue;
    const [label, track, score] = kids;
    if (!isValidElement(label) || label.type !== Text || !names.includes(flatten(label))) continue;
    const fill = hostElements(track).find((el) => /%$/.test(String(styleOf(el).width)));
    if (fill) bars.push({ label: flatten(label), score: Number(flatten(score)), colour: styleOf(fill).backgroundColor });
  }
  return bars;
}

describe("business report PDF: a score component's bar is the colour the dashboard gives that score", () => {
  // The PDF drew these bars on a ladder of its own: 80 / 60 / 40, in its own
  // blue and red. The dashboard draws them on the engine's bands (81 / 61 /
  // 41), so the two disagreed at 80, 60 and 40, and on the shade below that.
  const real = reportProps().runwayScore;
  const SCORES = [81, 80, 61, 60, 40];
  const runwayScore = { ...real, components: real.components.map((c, i) => ({ ...c, score: SCORES[i] })) };
  const bars = scoreBars(reportProps({ runwayScore }));

  it("draws a bar for each of the five components", () => {
    expect(bars.map((bar) => bar.label)).toEqual(real.components.map((c) => c.label));
    expect(bars.map((bar) => bar.score)).toEqual(SCORES);
  });

  it("80 is blue, 60 is amber and 40 is red", () => {
    expect(bars.map((bar) => bar.colour)).toEqual(["#10B981", "#3B5EF6", "#3B5EF6", "#F59E0B", "#EF4444"]);
  });

  it("takes each colour from the engine", () => {
    for (const bar of bars) {
      expect(bar.colour, `${bar.label} at ${bar.score}`).toBe(bandColorHexForScore(bar.score));
    }
  });

  it("renders to a PDF", async () => {
    const pdf = await renders(BusinessReportPDF, reportProps({ runwayScore }));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
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

  // The months are cash ÷ (burn − pipeline income). The box used to name the
  // cash and the burn only, so with pipeline its own figures did not divide to
  // the months it was headed with.
  it.each(RUNWAYS)("$months: the box's first sentence is the engine's account of the figure", ({ survival }) => {
    const body = blocksOf(BusinessReportPDF, reportProps({ survival })).find((block) =>
      block.startsWith("Based on your cash reserve of"),
    );
    expect(body).toBe(`${runwayBasisSentence(survival)} ${RISK_BAND_LADDER}`);
  });

  describe("with pipeline income", () => {
    // 7,500 ÷ (2,500 − 1,000) = 5.0 months. 7,500 ÷ 2,500 would be 3.0.
    const WITH_PIPELINE = survivalResult(500, 2_000, 7_500, 1_000);

    it("the box names the pipeline income its months are after", () => {
      expect(WITH_PIPELINE.label).toBe("5.0 months");
      const blocks = blocksOf(BusinessReportPDF, reportProps({ survival: WITH_PIPELINE }));
      expect(blocks).toContain(`5.0 months of cash runway · ${RISK_LEVEL_LABEL.healthy}`);
      expect(blocks).toContain(
        "Based on your cash reserve of $7,500 and a monthly burn rate of $2,500, " +
          `less an estimated $1,000 a month of pipeline income. ${RISK_BAND_LADDER}`,
      );
    });

    it("the longer sentence prints clear of the text around it", async () => {
      const boxes = await textBoxes(await renders(BusinessReportPDF, reportProps({ survival: WITH_PIPELINE })));
      expect(boxes.some((box) => box.text.includes("pipeline income"))).toBe(true);
      expect(overprints(boxes).filter((hit) => /cash reserve|pipeline income|burn rate|is critical/.test(hit))).toEqual([]);
    });
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

  it("the Reports page's Cash Runway card states the bands as its PDF does, and gives no instruction", () => {
    const page = source("app/(app)/reports/reports-content.tsx");
    expect(page).toContain("{RISK_BAND_LADDER}");
    expect(page).not.toMatch(/Consider building your reserve|at least 4 months/);
  });

  it("the Reports page's Cash Runway card shows the pipeline income its months are after", () => {
    const page = source("app/(app)/reports/reports-content.tsx");
    expect(page).toContain("survival.monthlyIncome > 0");
    expect(page).toContain("netMonthlyBurn(survival)");
    // "Estimated months without commission income" described cash ÷ burn.
    expect(page).not.toContain("without commission income");
  });
});

// ── Business report PDF: where the text lands ───────────────────────────────
// Layout defects fixed 2026-10-13, found by rendering every page:
//   - Large type was printed over the line under it on every content page:
//     the grade over the score in the round badge ("D" over "55/100"), "76th"
//     over "pctile", each tile's dollar figure against its caption. The page
//     sets `lineHeight: 1.4` at 8pt, react-pdf turns that into 11.2 points
//     where it is declared, and every <Text> on the page inherits the points
//     whatever its own size. Type of 13pt and up now sets its own line height.
//   - The figure above each bar of the monthly chart was hidden behind the top
//     of the bar. It borrowed the month label's style, whose `flex: 1` gives a
//     line of text no height in a column.
//   - A long name ran off the cover's right edge and into the page header's
//     title, and a long address ran into the client's name beside it.

const LONG_BUSINESS = "Montgomery-Featherstonehaugh & Associates Real Estate Professional Corporation Limited";
const LONG_BROKERAGE = "Sample Coastal Homestead Real Estate Brokerage Inc., Independently Owned and Operated";
const LONG_ADDRESS = "1200 Example Street, Unit 14, Sample Municipality-on-the-River, New Brunswick";
const LONG_CLIENT = "Sample Client-Hyphenated and Another Sample Client-Hyphenated";
// Words 4pt wide with their space, so each wrapped line ends within 4pt of the
// full width of whatever column it is in.
const FULL_LINES = "i ".repeat(150).trim();
// Uneven months, so the chart has a bar of every height from none to the tallest.
const MONTHLY_GCI = [4_000, 9_500, 0, 13_000, 26_000, 18_000, 7_500, 12_000, 30_000, 0, 0, 0];

// Every page of the report. The transaction log, the advisor cards and the
// year-over-year page are only printed when there is something to put on them.
function fullReportProps(over: Record<string, unknown> = {}) {
  return reportProps({
    monthlyData: MONTHS.map((month, i) => ({ month, gci: MONTHLY_GCI[i], deals: MONTHLY_GCI[i] > 0 ? 1 : 0 })),
    transactions: [
      ...TEST_TRANSACTIONS.slice(0, 3),
      { ...TEST_TRANSACTIONS[0], id: "tx-long", address: LONG_ADDRESS, client_name: LONG_CLIENT },
      { ...TEST_TRANSACTIONS[0], id: "tx-full", address: FULL_LINES, client_name: FULL_LINES },
    ],
    advisorCards: [
      {
        id: "card",
        category: "pipelineHealth",
        icon: "chart",
        title: "A sample observation about the pipeline",
        evidence: ["A sample line of evidence."],
        action: "A sample action, long enough to run onto a second line. ".repeat(4).trim(),
        estimatedImpact: "+$12,000 GCI",
        impactValue: 12_000,
        priority: 1,
      },
    ],
    historyYears: [
      { year: TEST_YEAR - 2, gci: 90_000, transactions: 9 },
      { year: TEST_YEAR - 1, gci: 110_000, transactions: 11 },
      { year: TEST_YEAR, gci: 120_000, transactions: 12 },
    ],
    referralSummary: { inboundCount: 4, outboundCount: 2, feesEarned: 6_000, feesPaid: 1_500 },
    ...over,
  });
}

describe("business report PDF: layout at LETTER width", () => {
  const COVER_MARGIN = 56;
  const PAGE_MARGIN = 40;
  const BAR_BLUE = "#1e72f2"; // C.blue in the report
  const GRADE_BADGE = 72;
  const PERCENTILE_BADGE = 52;

  const sample = fullReportProps();
  const READERS_OF_THE_REPORT: [string, Record<string, unknown>][] = [
    // Brokerage fee 500 + recurring 2,000 = 2,500 a month, as in the cash runway tests.
    ["a critical cash runway", { survival: survivalResult(500, 2_000, 3_000, 0) }],
    ["a warning cash runway", { survival: survivalResult(500, 2_000, 7_500, 0) }],
    ["a healthy cash runway", { survival: survivalResult(500, 2_000, 11_250, 0) }],
    ["a strong cash runway", { survival: survivalResult(500, 2_000, 30_000, 0) }],
    ["a cash runway at the 24+ month cap", { survival: survivalResult(500, 2_000, 90_000, 0) }],
    ["a cash runway that is not set", { survival: survivalResult(0, 0, 0, 0) }],
    ["long agent, business and brokerage names", { agentName: LONG_NAME, businessName: LONG_BUSINESS, brokerageName: LONG_BROKERAGE }],
    // The widest and the narrowest text the two round badges can hold.
    [
      "grade A+ at 100/100 and the 100th percentile",
      { runwayScore: { ...sample.runwayScore, grade: "A+", score: 100 }, benchmark: { ...sample.benchmark, percentile: 100 } },
    ],
    [
      "grade F at 1/100 and the 1st percentile",
      { runwayScore: { ...sample.runwayScore, grade: "F", score: 1 }, benchmark: { ...sample.benchmark, percentile: 1 } },
    ],
  ];

  describe.each(READERS_OF_THE_REPORT)("%s", (_, over) => {
    const props = fullReportProps(over);
    let boxes: TextBox[] = [];
    let shapes: Fill[] = [];
    beforeAll(async () => {
      const pdf = await renders(BusinessReportPDF, props);
      boxes = await textBoxes(pdf);
      shapes = await fills(pdf);
    });

    /** The page a heading is printed on. */
    const pageOf = (heading: string) => {
      const box = boxes.find(({ text }) => text.startsWith(heading));
      expect(box, heading).toBeDefined();
      return box!.page;
    };

    /** The round badge of the given width that a run of text is printed in. */
    const badgeAround = (box: TextBox, width: number) => {
      const x = (box.left + box.right) / 2;
      const y = (box.bottom + box.top) / 2;
      const badge = shapes.find(
        (shape) =>
          shape.page === box.page &&
          Math.abs(shape.right - shape.left - width) < 0.5 &&
          Math.abs(shape.top - shape.bottom - width) < 0.5 &&
          shape.left < x && x < shape.right && shape.bottom < y && y < shape.top,
      );
      expect(badge, box.text).toBeDefined();
      return badge!;
    };

    /** How far the ink of a run reaches past the edge of the circle drawn in a badge's square. */
    const pastTheCircle = (badge: Fill, box: TextBox) => {
      const radius = (badge.right - badge.left) / 2;
      const corners = [box.left, box.right].flatMap((x) => [inkBottom(box), inkTop(box)].map((y) => [x, y]));
      return Math.max(...corners.map(([x, y]) => Math.hypot(x - badge.left - radius, y - badge.bottom - radius) - radius));
    };

    it("prints every page", () => {
      for (const heading of ["YTD Snapshot", "Gross Commission by Month", "Expense Analysis", "Transaction Log", "Business Health Assessment", "Key Observations", "Annual Performance History", "Referral Network Summary"]) {
        pageOf(heading);
      }
    });

    it("no text is printed over other text", () => {
      expect(overprints(boxes)).toEqual([]);
    });

    it("no line of text touches the line under it", () => {
      expect(touching(boxes)).toEqual([]);
    });

    it("no text runs past the page margins", () => {
      const outside = boxes.filter((box) => {
        const margin = box.page === 1 ? COVER_MARGIN : PAGE_MARGIN;
        return box.left < margin - 0.5 || box.right > LETTER_WIDTH - margin + 0.5;
      });
      expect(outside.map((box) => `page ${box.page}: "${box.text}"`)).toEqual([]);
    });

    it("each month's figure is printed just above its bar, not on it", () => {
      const page = pageOf("Gross Commission by Month");
      const figures = MONTHLY_GCI.filter((gci) => gci > 0).map(fmtCompact);
      const labels = boxes.filter((box) => box.page === page && figures.includes(box.text));
      expect(labels.map((label) => label.text)).toEqual(figures);
      const bars = shapes.filter((shape) => shape.page === page && shape.colour === BAR_BLUE);
      for (const label of labels) {
        // How far the foot of the figure stands above each blue shape under it.
        const above = bars.filter((bar) => sharedWidth(bar, label) > 1 && bar.bottom < inkTop(label)).map((bar) => inkBottom(label) - bar.top);
        expect(Math.min(...above), label.text).toBeGreaterThanOrEqual(0.5);
        expect(Math.min(...above), label.text).toBeLessThanOrEqual(4);
      }
    });

    it("the grade and the score are inside the round badge", () => {
      const page = pageOf("Business Health Assessment");
      const { grade, score } = props.runwayScore;
      for (const text of [grade, `${score}/100`]) {
        const box = boxes.find((candidate) => candidate.page === page && candidate.text === text);
        expect(box, text).toBeDefined();
        expect(pastTheCircle(badgeAround(box!, GRADE_BADGE), box!), text).toBeLessThanOrEqual(0);
      }
    });

    it("the percentile and its caption are inside their circle", () => {
      const page = pageOf("Peer Benchmark Positioning");
      for (const shape of [/^\d+(st|nd|rd|th)$/, /^pctile$/]) {
        const box = boxes.find((candidate) => candidate.page === page && shape.test(candidate.text));
        expect(box, String(shape)).toBeDefined();
        expect(pastTheCircle(badgeAround(box!, PERCENTILE_BADGE), box!), box!.text).toBeLessThanOrEqual(0);
      }
    });

    it("in the transaction log, a line that fills its column stands clear of the column beside it", () => {
      const page = pageOf("Transaction Log");
      const full = boxes.filter((box) => box.page === page && box.text.length > 20 && FULL_LINES.startsWith(box.text));
      const gaps = full.flatMap((line) =>
        boxes
          .filter((box) => box.page === page && box.left > line.left && sharedHeight(box, line) > 1)
          .map((box) => box.left - line.right),
      );
      expect(gaps.length).toBeGreaterThan(3); // each line of the address has a line of the client's name to its right
      expect(Math.min(...gaps)).toBeGreaterThanOrEqual(4);
    });
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
  const footerLines = (name: string) => [
    `Agent Runway · T2125 Summary · ${name} · ${TEST_YEAR} Tax Year`,
    "ESTIMATES ONLY — NOT PROFESSIONAL TAX ADVICE — CONSULT YOUR ACCOUNTANT",
    "© 2026 Agent Runway Inc. · Canada Corporation No. 1786542-2",
  ];
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
