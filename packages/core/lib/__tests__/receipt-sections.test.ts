/**
 * The receipt list reads in receipt-date order with a break at each filing
 * period (2026-10-19). Made-up rows only.
 */
import { describe, expect, it } from "vitest";
import {
  compareReceiptsByDate,
  receiptSections,
  sortReceiptsByDate,
  toFilingFrequency,
  type ReceiptListRow,
} from "../receipt-sections";

type Row = ReceiptListRow & { id: string };

const row = (id: string, expense_date: string | null, created_at = "2026-10-01T12:00:00+00:00"): Row => ({
  id,
  expense_date,
  created_at,
});

const ids = (rows: readonly { id?: string | null }[]) => rows.map((r) => r.id);

describe("sortReceiptsByDate", () => {
  it("orders by receipt date, newest first, not by upload", () => {
    const rows = [
      row("uploaded-last", "2026-02-03", "2026-10-19T10:00:00+00:00"),
      row("uploaded-first", "2026-09-30", "2026-01-05T10:00:00+00:00"),
      row("middle", "2026-05-06", "2026-06-01T10:00:00+00:00"),
    ];
    expect(ids(sortReceiptsByDate(rows))).toEqual(["uploaded-first", "middle", "uploaded-last"]);
  });

  it("puts undated receipts first, newest upload first among them", () => {
    const rows = [
      row("none-old", null, "2026-03-01T10:00:00+00:00"),
      row("dated", "2026-12-31"),
      row("none-new", null, "2026-09-01T10:00:00+00:00"),
    ];
    expect(ids(sortReceiptsByDate(rows))).toEqual(["none-new", "none-old", "dated"]);
  });

  it("same receipt date: newest upload first, then id, whatever order the rows came in", () => {
    const a = row("a", "2026-07-14", "2026-07-14T15:00:00+00:00");
    const b = row("b", "2026-07-14", "2026-07-15T09:00:00+00:00");
    const c = row("c", "2026-07-14", "2026-07-14T15:00:00+00:00");
    expect(ids(sortReceiptsByDate([a, b, c]))).toEqual(["b", "a", "c"]);
    expect(ids(sortReceiptsByDate([c, a, b]))).toEqual(["b", "a", "c"]);
  });

  it("compares upload times as instants, not strings ('Z' against '+00:00')", () => {
    const later = row("later", "2026-07-14", "2026-07-14T15:00:01Z");
    const earlier = row("earlier", "2026-07-14", "2026-07-14T15:00:00.5+00:00");
    expect(ids(sortReceiptsByDate([earlier, later]))).toEqual(["later", "earlier"]);
  });

  it("a row with no upload time goes after the others of its day", () => {
    const rows = [{ id: "no-time", expense_date: "2026-07-14" }, row("timed", "2026-07-14")];
    expect(ids(sortReceiptsByDate(rows))).toEqual(["timed", "no-time"]);
  });

  it("does not change the rows it was given", () => {
    const rows = [row("old", "2026-01-01"), row("new", "2026-12-01")];
    sortReceiptsByDate(rows);
    expect(ids(rows)).toEqual(["old", "new"]);
    expect(sortReceiptsByDate(null)).toEqual([]);
  });

  it("a value that is not a calendar day sorts with the undated ones", () => {
    expect(compareReceiptsByDate(row("bad", "2026-13-01"), row("ok", "2027-01-01"))).toBe(-1);
  });
});

describe("receiptSections, quarterly", () => {
  it("breaks at Mar 31 / Apr 1 and Dec 31 / Jan 1, and names each quarter", () => {
    const rows = [
      row("apr1", "2026-04-01"),
      row("mar31", "2026-03-31"),
      row("jan1", "2026-01-01"),
      row("dec31", "2025-12-31"),
    ];
    const { sections } = receiptSections(rows, "quarterly");
    expect(sections.map((s) => s.period?.label)).toEqual(["Q2 2026", "Q1 2026", "Q4 2025"]);
    expect(sections.map((s) => ids(s.rows))).toEqual([["apr1"], ["mar31", "jan1"], ["dec31"]]);
    expect(sections.map((s) => s.months)).toEqual([
      { from: "Apr", to: "Jun" },
      { from: "Jan", to: "Mar" },
      { from: "Oct", to: "Dec" },
    ]);
  });

  it("keeps last year's receipts in last year's quarters, after this year's", () => {
    const rows = [row("q3-2025", "2025-08-01"), row("q3-2026", "2026-08-01"), row("q1-2026", "2026-02-01")];
    const { sections } = receiptSections(rows, "quarterly");
    expect(sections.map((s) => s.key)).toEqual(["2026-07-01", "2026-01-01", "2025-07-01"]);
    expect(sections.map((s) => s.period?.label)).toEqual(["Q3 2026", "Q1 2026", "Q3 2025"]);
  });

  it("undated receipts are their own section, first", () => {
    const rows = [row("dated", "2026-10-12"), row("none", null), row("blank", "")];
    const { sections } = receiptSections(rows, "quarterly");
    expect(sections.map((s) => s.key)).toEqual(["undated", "2026-10-01"]);
    const undated = sections[0];
    expect(undated.period).toBeNull();
    expect(undated.months).toBeNull();
    expect(undated.count).toBe(2);
  });

  it("empty list: no sections", () => {
    expect(receiptSections([], "quarterly")).toEqual({ sections: [], shown: 0, total: 0, datedTotal: 0 });
    expect(receiptSections(undefined, "quarterly").total).toBe(0);
  });
});

describe("receiptSections, other frequencies", () => {
  const rows = [
    row("oct12", "2026-10-12"),
    row("oct1", "2026-10-01"),
    row("sep30", "2026-09-30"),
    row("jan5", "2026-01-05"),
    row("dec31", "2025-12-31"),
  ];

  it("monthly: one section per month, named by the month, no month range", () => {
    const { sections } = receiptSections(rows, "monthly");
    expect(sections.map((s) => s.period?.label)).toEqual(["Oct 2026", "Sep 2026", "Jan 2026", "Dec 2025"]);
    expect(sections.every((s) => s.months === null)).toBe(true);
    expect(ids(sections[0].rows)).toEqual(["oct12", "oct1"]);
  });

  it("annual: one section per year, Jan to Dec", () => {
    const { sections } = receiptSections(rows, "annual");
    expect(sections.map((s) => s.period?.label)).toEqual(["2026", "2025"]);
    expect(sections[0].months).toEqual({ from: "Jan", to: "Dec" });
    expect(sections.map((s) => s.count)).toEqual([4, 1]);
  });

  it("a missing or unknown frequency is read as quarterly", () => {
    expect(toFilingFrequency(null)).toBe("quarterly");
    expect(toFilingFrequency("weekly")).toBe("quarterly");
    expect(toFilingFrequency("monthly")).toBe("monthly");
    expect(receiptSections(rows, undefined).sections.map((s) => s.period?.label)).toEqual(["Q4 2026", "Q3 2026", "Q1 2026", "Q4 2025"]);
  });
});

describe("receiptSections with the screen's cap", () => {
  // 60 receipts in Q3, uploaded in reverse date order, then 5 in Q2, then 1 undated.
  const q3 = Array.from({ length: 60 }, (_, i) =>
    row(`q3-${String(i).padStart(2, "0")}`, `2026-07-${String((i % 28) + 1).padStart(2, "0")}`, `2026-01-01T00:${String(i).padStart(2, "0")}:00Z`),
  );
  const q2 = Array.from({ length: 5 }, (_, i) => row(`q2-${i}`, `2026-05-0${i + 1}`, "2026-10-19T00:00:00Z"));
  const rows = [...q2, row("none", null, "2026-10-19T12:00:00Z"), ...q3];

  it("shows the undated receipt and the newest `limit` dated ones by receipt date, not the newest uploads", () => {
    const { sections, shown, total, datedTotal } = receiptSections(rows, "quarterly", 50);
    expect(shown).toBe(51);
    expect(total).toBe(66);
    expect(datedTotal).toBe(65);
    expect(sections.map((s) => [s.key, s.rows.length, s.count])).toEqual([
      ["undated", 1, 1],
      ["2026-07-01", 50, 60],
    ]);
  });

  it("a section past the cap is left out; one cut by it keeps its full count", () => {
    const { sections } = receiptSections(rows, "quarterly", 62);
    expect(sections.map((s) => [s.key, s.rows.length, s.count])).toEqual([
      ["undated", 1, 1],
      ["2026-07-01", 60, 60],
      ["2026-04-01", 2, 5],
    ]);
  });

  it("the undated section is always shown in full, whatever the cap", () => {
    const undated = Array.from({ length: 4 }, (_, i) => row(`none-${i}`, null, `2026-10-0${i + 1}T00:00:00Z`));
    for (const cap of [0, 1, 50]) {
      const { sections } = receiptSections([...q3, ...undated], "quarterly", cap);
      expect(sections[0].key).toBe("undated");
      expect(ids(sections[0].rows)).toEqual(["none-3", "none-2", "none-1", "none-0"]);
      expect(sections.slice(1).reduce((n, s) => n + s.rows.length, 0)).toBe(cap);
    }
  });

  it("no cap: every row, the undated first", () => {
    const { sections, shown } = receiptSections(rows, "quarterly");
    expect(shown).toBe(66);
    expect(sections.map((s) => s.key)).toEqual(["undated", "2026-07-01", "2026-04-01"]);
    expect(sections.reduce((n, s) => n + s.rows.length, 0)).toBe(66);
  });

  it("the list order inside the sections is the sorted order", () => {
    const { sections } = receiptSections(rows, "quarterly");
    expect(sections.flatMap((s) => ids(s.rows))).toEqual(ids(sortReceiptsByDate(rows)));
  });
});
