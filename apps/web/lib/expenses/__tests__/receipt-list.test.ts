/**
 * The receipt list is for display. Numbers never come from it (2026-10-13).
 *
 * The Expenses page loaded "the last 50 receipts" for the on-screen log and
 * then built the GST34 summary, the CSV export and the PDF receipt log on
 * that same list. An account that passed 50 receipts in a year (122 here,
 * after a year of software receipts was entered) got:
 *
 *   - a Q2 HST summary that left out a $639.75 input tax credit on a May
 *     invoice, because 50 newer receipts had pushed it off the list;
 *   - "accountant-ready" exports that stopped at 50 rows.
 *
 * Nothing errored. The summary just showed a smaller refund.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RECEIPT_LIST_COLUMNS,
  RECEIPT_LIST_PAGE,
  receiptListDateFilter,
  receiptSectionCount,
  receiptSectionTitle,
  receiptsForYear,
  receiptsInPeriod,
} from "../receipt-list";
import { receiptSections } from "@agent-runway/core/lib/receipt-sections";
import { computeGST34 } from "@agent-runway/core/engines/gst34-engine";
import { getFilingPeriods } from "@agent-runway/core/engines/filing-period-engine";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../.."); // agentrunway-web/
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), "utf8");

const [, Q2, Q3] = getFilingPeriods("quarterly", 2026);

describe("receiptsInPeriod", () => {
  const rows = [
    { id: "a", expense_date: "2026-03-31" },
    { id: "b", expense_date: "2026-04-01" },
    { id: "c", expense_date: "2026-06-30" },
    { id: "d", expense_date: "2026-07-01" },
    { id: "e", expense_date: null },
  ];

  it("keeps receipts dated inside the period, both ends included", () => {
    expect(receiptsInPeriod(rows, Q2).map((r) => r.id)).toEqual(["b", "c"]);
    expect(receiptsInPeriod(rows, Q3).map((r) => r.id)).toEqual(["d"]);
  });

  it("an undated receipt is in no period", () => {
    expect(receiptsInPeriod(rows, Q2).some((r) => r.id === "e")).toBe(false);
  });

  it("no period selected returns everything", () => {
    expect(receiptsInPeriod(rows, null)).toHaveLength(5);
    expect(receiptsInPeriod(null, Q2)).toEqual([]);
  });
});

describe("receiptsForYear (exports)", () => {
  it("is every receipt of that year, plus the undated ones", () => {
    const rows = [
      { id: "old", expense_date: "2025-12-31" },
      { id: "jan", expense_date: "2026-01-01" },
      { id: "dec", expense_date: "2026-12-31" },
      { id: "next", expense_date: "2027-01-01" },
      { id: "none", expense_date: null },
    ];
    expect(receiptsForYear(rows, 2026).map((r) => r.id)).toEqual(["jan", "dec", "none"]);
  });

  it("does not stop at the on-screen page size", () => {
    const rows = Array.from({ length: 122 }, (_, i) => ({ id: String(i), expense_date: "2026-05-06" }));
    expect(receiptsForYear(rows, 2026)).toHaveLength(122);
    expect(RECEIPT_LIST_PAGE).toBeLessThan(122);
  });
});

describe("the list query", () => {
  it("covers this year and last, and undated receipts", () => {
    expect(receiptListDateFilter(2026)).toBe("expense_date.gte.2025-01-01,expense_date.is.null");
  });

  it("reads what the list and the edit dialog show, without the OCR payload", () => {
    const cols = RECEIPT_LIST_COLUMNS.split(",").map((c) => c.trim());
    for (const c of ["id", "vendor", "expense_date", "total_amount", "tax_amount", "category_key", "notes", "receipt_path"]) {
      expect(cols).toContain(c);
    }
    expect(cols).not.toContain("ocr_raw");
  });
});

describe("the GST34 summary counts every receipt in the period, however many came after it", () => {
  // The shape of the account that exposed it: one May invoice with a large
  // ITC, then more than 50 later receipts.
  const mayInvoice = { category_key: "prof_accounting", total_amount: 5316.75, tax_amount: 639.75, expense_date: "2026-05-06" };
  const later = Array.from({ length: 60 }, (_, i) => ({
    category_key: "office_software", total_amount: 10, tax_amount: 0, expense_date: `2026-07-${String((i % 28) + 1).padStart(2, "0")}`,
  }));
  const allRows = [...later, mayInvoice]; // newest first, as the list is ordered

  const summary = (rows: typeof allRows) =>
    computeGST34({
      province: "newBrunswick", period: Q2, frequency: "quarterly", periodTransactions: [], instalmentsPaid: 0,
      periodReceipts: receiptsInPeriod(rows, Q2).map((r) => ({ total_amount: r.total_amount, tax_amount: r.tax_amount, category_key: r.category_key })),
      vehicleBusinessUsePct: 0.8, homeOfficeBusinessUsePct: 0.15,
    });

  it("from all the year's rows, the May ITC is there", () => {
    expect(summary(allRows).line108).toBeCloseTo(639.75, 2);
  });

  it("from a 'last 50' list it silently was not", () => {
    expect(summary(allRows.slice(0, 50)).line108).toBe(0);
  });
});

describe("REGRESSION — the Expenses page does not compute from the on-screen list", () => {
  const content = read("apps/web/app/(app)/expenses/expenses-content.tsx");
  const page = read("apps/web/app/(app)/expenses/page.tsx");

  it("the GST34 summary is fed from receiptTotalRows", () => {
    expect(content).toMatch(/periodReceipts:\s*\[[\s\S]{0,200}\.\.\.receiptsInPeriod\(receiptTotalRows, activePeriod\)/);
    expect(content).not.toMatch(/\.\.\.filteredReceipts\.map\(/);
  });

  it("the totals rows carry expense_date everywhere they are loaded", () => {
    const selects = [...content.matchAll(/\.select\("category_key, total_amount, tax_amount([^"]*)"\)/g)].map((m) => m[1]);
    expect(selects.length).toBeGreaterThanOrEqual(2);
    for (const rest of selects) expect(rest).toContain("expense_date");
    expect(page).toContain('.select("category_key, total_amount, tax_amount, expense_date")');
  });

  it("the exports use the year's receipts, not the list as loaded", () => {
    expect(content).toContain("receiptsForYear(receipts, year)");
    expect(content).toContain("receipts={exportReceipts}");
    expect(content).toMatch(/\.\.\.exportReceipts\s*\n\s*\.slice\(\)/);
  });

  it("the list is loaded with the shared query on the server and after a save", () => {
    for (const src of [page, content]) {
      expect(src).toContain(".select(RECEIPT_LIST_COLUMNS)");
      expect(src).toContain(".or(receiptListDateFilter(year))");
    }
  });
});

describe("the receipt log's period headings (2026-10-19)", () => {
  const rows = [
    { id: "q4", expense_date: "2026-10-12", created_at: "2026-10-12T15:00:00Z" },
    { id: "q1", expense_date: "2026-03-31", created_at: "2026-10-19T15:00:00Z" },
    { id: "q2", expense_date: "2026-04-01", created_at: "2026-01-02T15:00:00Z" },
    { id: "none", expense_date: null, created_at: "2026-10-19T16:00:00Z" },
  ];

  it("quarterly: undated first, then the quarter and its months in receipt-date order", () => {
    const { sections } = receiptSections(rows, "quarterly");
    expect(sections.map(receiptSectionTitle)).toEqual([
      "No date",
      "Q4 2026 · Oct to Dec",
      "Q2 2026 · Apr to Jun",
      "Q1 2026 · Jan to Mar",
    ]);
    expect(sections.map(receiptSectionCount)).toEqual(["1 receipt", "1 receipt", "1 receipt", "1 receipt"]);
  });

  it("monthly: the month alone; annual: the year and Jan to Dec", () => {
    expect(receiptSections(rows, "monthly").sections.map(receiptSectionTitle)).toEqual([
      "No date", "Oct 2026", "Apr 2026", "Mar 2026",
    ]);
    expect(receiptSections(rows, "annual").sections.map(receiptSectionTitle)).toEqual(["No date", "2026 · Jan to Dec"]);
  });

  it("the count says when the page cap cuts a period short", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: String(i), expense_date: "2026-07-15", created_at: null }));
    const [section] = receiptSections(many, "quarterly", RECEIPT_LIST_PAGE).sections;
    expect(receiptSectionCount(section)).toBe(`${RECEIPT_LIST_PAGE} of 60 receipts`);
    expect(receiptSectionCount(receiptSections(many, "quarterly").sections[0])).toBe("60 receipts");
  });

  it("no heading has an em dash", () => {
    for (const freq of ["monthly", "quarterly", "annual"]) {
      for (const s of receiptSections(rows, freq).sections) {
        expect(receiptSectionTitle(s) + receiptSectionCount(s)).not.toMatch(/\u2014/);
      }
    }
  });
});

describe("REGRESSION: both receipt lists are in receipt-date order, cut by filing period", () => {
  const content = read("apps/web/app/(app)/expenses/expenses-content.tsx");
  const mobile = read("apps/mobile/components/money/ExpensesView.tsx");

  it("the web log renders receiptSections of the selected period, with the page cap", () => {
    expect(content).toMatch(/receiptSections\(filteredReceipts, filingFreq, showAllReceipts \? Infinity : RECEIPT_LIST_PAGE\)/);
    expect(content).toContain("receiptLog.sections.map(");
    // "Show all" appears when the cap hides dated receipts (undated ones always show).
    expect(content).toContain("receiptLog.datedTotal > RECEIPT_LIST_PAGE");
    expect(content).not.toMatch(/filteredReceipts\.slice\(0, RECEIPT_LIST_PAGE\)/);
  });

  it("the phone list renders receiptSections, not the store's upload order", () => {
    expect(mobile).toMatch(/receiptSections\(receipts, filingFrequency, RECENT_RECEIPTS_SHOWN\)/);
    expect(mobile).not.toMatch(/receipts\.slice\(0, RECENT_RECEIPTS_SHOWN\)/);
  });
});
