/**
 * The GST/HST return worksheet PDF renders, and the page is wired to the
 * engine's CRA lines (2026-10-13).
 *
 * The PDF component is `@ts-nocheck` (react-pdf's class components don't
 * type-check under React 19), so nothing but a real render catches a typo in
 * it. This renders it with the shape of a real quarter.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToBuffer } from "@react-pdf/renderer";
import { computeGST34 } from "@agent-runway/core/engines/gst34-engine";
import { buildGST34Worksheet } from "@agent-runway/core/engines/gst34-worksheet";
import { getFilingPeriods } from "@agent-runway/core/engines/filing-period-engine";
import { Gst34WorksheetPdf } from "@/components/pdf/gst34-worksheet-pdf";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "../../.."); // apps/web/

const [, Q2] = getFilingPeriods("quarterly", 2026);
const receipts = [
  { vendor: "Fuel stop", expense_date: "2026-04-17", total_amount: 94.38, tax_amount: 12.31, category_key: "vehicle_fuel", receipt_path: "u/a.jpg" },
  { vendor: "Diner", expense_date: "2026-05-10", total_amount: 94.99, tax_amount: 12.39, category_key: "meals_client", receipt_path: null },
  { vendor: "Power co", expense_date: "2026-06-12", total_amount: 230, tax_amount: 30, category_key: "home_utilities", receipt_path: null },
  { vendor: "Software", expense_date: "2026-06-20", total_amount: 140, tax_amount: 0, category_key: "office_software", receipt_path: null },
];
const recurring = [
  { id: "lease", name: "Vehicle lease", category_key: "vehicle_payment", vehicle_use: true, occurrences: 3, paid: 2041.71, tax_amount: 266.31 },
];

function build(rows = receipts) {
  const result = computeGST34({
    province: "newBrunswick", period: Q2, frequency: "quarterly", periodTransactions: [], instalmentsPaid: 0,
    periodReceipts: [
      ...rows.map((r) => ({ total_amount: r.total_amount, tax_amount: r.tax_amount, category_key: r.category_key })),
      ...recurring.map((e) => ({ total_amount: null, tax_amount: e.tax_amount, category_key: e.category_key, vehicle_use: e.vehicle_use })),
    ],
    vehicleBusinessUsePct: 0.8, homeOfficeBusinessUsePct: 0.15,
  });
  const worksheet = buildGST34Worksheet({ receipts: rows, recurring, vehicleBusinessUsePct: 0.8, homeOfficeBusinessUsePct: 0.15, line106: result.line106 });
  return { result, worksheet };
}

async function render(props: ReturnType<typeof build>, extra: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const el = createElement(Gst34WorksheetPdf as any, {
    period: Q2, frequency: "quarterly", agentName: "Sample Agent", businessNumber: "123456789RT0001",
    vehiclePct: 0.8, homePct: 0.15, ...props, ...extra,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToBuffer(el as any);
}

describe("GST/HST return worksheet PDF", () => {
  it("renders a real quarter to a PDF", async () => {
    const pdf = await render(build());
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(3000);
  }, 30_000);

  it("renders a nil return, with no expenses and no business number", async () => {
    const pdf = await render(build([]), { businessNumber: null });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  }, 30_000);

  it("renders when the expense list and line 106 disagree (the warning box)", async () => {
    const props = build();
    const short = buildGST34Worksheet({ receipts: receipts.slice(0, 1), recurring, vehicleBusinessUsePct: 0.8, homeOfficeBusinessUsePct: 0.15, line106: props.result.line106 });
    expect(short.differenceFromLine106).not.toBe(0);
    const pdf = await render({ result: props.result, worksheet: short });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  }, 30_000);
});

describe("REGRESSION — the Expenses page shows CRA's lines, and never the limits as line 107", () => {
  const content = readFileSync(path.join(WEB, "app/(app)/expenses/expenses-content.tsx"), "utf8");
  const pdfSrc = readFileSync(path.join(WEB, "components/pdf/gst34-worksheet-pdf.tsx"), "utf8");

  it("the card and the PDF render the engine's filing lines", () => {
    expect(content).toContain("gst34Result.filingLines");
    expect(pdfSrc).toContain("result.filingLines.map(");
    // The old card hand-picked 106 / 107 / 108 as "deduction" rows.
    expect(content).not.toMatch(/line\.line === "107"/);
    expect(content).not.toContain("ITC adjustments");
  });

  it("the worksheet is built from the period's receipts and reconciled to line 106", () => {
    expect(content).toMatch(/buildGST34Worksheet\(\{\s*receipts: receiptsInPeriod\(receipts, activePeriod\)/);
    expect(content).toContain("line106: gst34Result.line106");
    expect(pdfSrc).toContain("worksheet.differenceFromLine106 !== 0");
  });

  it("says who types what", () => {
    expect(content).toContain('"You enter"');
    expect(content).toContain('"CRA calculates"');
  });
});
