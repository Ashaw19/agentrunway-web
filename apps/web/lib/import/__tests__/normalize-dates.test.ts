/**
 * Regression suite for the date normalizers.
 *
 * Pass 1 — Excel serial numbers → ISO (the silent killer: a $45,000 commission
 *          looks exactly like an Excel date serial, so the conversion must only
 *          fire on a labelled Date column when one exists).
 * Pass 2 — Slash-date DD/MM vs MM/DD disambiguation.
 *
 * Garbage content must pass through untouched, never throw.
 */
import { describe, expect, it } from "vitest";
import {
  excelSerialToISO,
  normalizeDateFormats,
} from "../normalizers/normalize-dates";
import { splitCsvRow } from "../normalizers/normalize-text";

describe("excelSerialToISO — anchored conversion", () => {
  it("converts the documented anchor serial (44927 = 2023-01-01)", () => {
    expect(excelSerialToISO(44927)).toBe("2023-01-01");
  });

  it("converts a 2024 serial", () => {
    expect(excelSerialToISO(45292)).toBe("2024-01-01");
  });

  it("converts a 2025 serial", () => {
    expect(excelSerialToISO(45658)).toBe("2025-01-01");
  });
});

describe("normalizeDateFormats — Pass 1: Excel serials in a labelled Date column", () => {
  it("converts a serial in the Date column but leaves a same-magnitude GCI alone", () => {
    // 45292 in the Date column → 2024-01-01; 45000 in the GCI column is money,
    // NOT a date, and must survive unconverted. This is the precise trap the
    // column-aware Pass 1 exists to avoid.
    const csv = "Name,Close Date,GCI\nJane Buyer,45292,45000";
    const out = normalizeDateFormats(csv);
    expect(out).toContain("2024-01-01");
    expect(out).toContain("45000"); // GCI untouched
    expect(out).not.toContain("45292");
  });

  it("does not convert any serial when there is no Date column (avoids false positives)", () => {
    const csv = "Name,GCI,SalePrice\nJane,45000,450000";
    // CSV-shaped content with no date-classified column: Pass 1 must not run
    // at all. Exact equality — toContain("45000") would pass via "450000".
    expect(normalizeDateFormats(csv)).toBe(csv);
  });

  it("converts serials in a date column the classifier recognizes beyond the bare regex (Paid)", () => {
    // "Paid" is a date keyword in the column classifier but does not match the
    // legacy /date|closing|settlement/ header regex. The serial in that column
    // converts; the same-magnitude GCI in the next column survives.
    const csv = "Name,Paid,GCI\nJane Buyer,45292,45000";
    expect(normalizeDateFormats(csv)).toBe("Name,Paid,GCI\nJane Buyer,2024-01-01,45000");
  });

  it("preserves quoting on a quoted-comma field when converting a serial in the same row", () => {
    // Regression: the serial-conversion re-join must re-escape. A "Last, First"
    // name in a row whose Date cell is a serial previously came back as
    //   Buyer, Jane,2024-01-01,45000
    // (quotes dropped) → re-parsed as 4 columns, shifting GCI out and losing it.
    const csv = 'Name,Close Date,GCI\n"Buyer, Jane",45292,45000';
    const out = normalizeDateFormats(csv);
    expect(out).toBe('Name,Close Date,GCI\n"Buyer, Jane",2024-01-01,45000');
    // The re-parsed row must still be exactly 3 cells with GCI intact.
    const lastRow = splitCsvRow(out.split("\n")[1]);
    expect(lastRow).toEqual(["Buyer, Jane", "2024-01-01", "45000"]);
  });

  it("preserves an embedded quote in a quoted field across serial conversion", () => {
    const csv = 'Name,Close Date,GCI\n"O""Brien, Pat",45292,45000';
    const out = normalizeDateFormats(csv);
    const lastRow = splitCsvRow(out.split("\n")[1]);
    expect(lastRow).toEqual(['O"Brien, Pat', "2024-01-01", "45000"]);
  });
});

describe("normalizeDateFormats — CRM contact imports (no date-labelled header)", () => {
  // Regression for the 2026-07-02 Daily QA finding: contact CSVs routinely have
  // no date-classified column, and the old whole-document fallback rewrote any
  // bare 5-digit cell in 42000–48399 (a $45,000 Budget) into an ISO date —
  // silent money loss on the Ellis onboarding critical path.

  it("leaves a 5-digit Budget cell untouched on a contact import", () => {
    const csv =
      "Name,Email,Phone,Budget,Source\n" +
      "Jane Buyer,jane@example.ca,506-555-0100,45000,Referral";
    expect(normalizeDateFormats(csv)).toBe(csv);
  });

  it("leaves multiple serial-range money cells untouched across columns and rows", () => {
    const csv =
      "Name,Budget,Max Price,Source\n" +
      "Jane Buyer,45000,47500,Referral\n" +
      "Sam Seller,42005,46000,Open House";
    expect(normalizeDateFormats(csv)).toBe(csv);
  });

  it("still leaves money alone when headers are non-keyword-y (Created, Last Activity)", () => {
    const csv =
      "Name,Created,Last Activity,Budget,Source\n" +
      "Jane Buyer,2026-01-05,2026-06-30,45000,Referral";
    expect(normalizeDateFormats(csv)).toBe(csv);
  });
});

describe("normalizeDateFormats — unstructured content keeps the generic serial fallback", () => {
  it("converts a standalone cell-boundary serial in non-tabular prose", () => {
    const text = "Deal record\n45292\nCommission paid in full";
    const out = normalizeDateFormats(text);
    expect(out).toContain("2024-01-01");
    expect(out).not.toContain("45292");
  });
});

describe("normalizeDateFormats — Pass 2: slash-date disambiguation", () => {
  it("reads DD/MM/YYYY when a day value exceeds 12", () => {
    expect(normalizeDateFormats("15/03/2024")).toBe("2024-03-15");
  });

  it("reads MM/DD/YYYY when a month-position value exceeds 12", () => {
    expect(normalizeDateFormats("03/15/2024")).toBe("2024-03-15");
  });

  it("leaves a fully ambiguous slash date as-is for the LLM", () => {
    expect(normalizeDateFormats("03/04/2024")).toBe("03/04/2024");
  });

  it("applies the DD/MM verdict consistently across a batch", () => {
    const out = normalizeDateFormats("13/01/2024 then 05/06/2024");
    expect(out).toContain("2024-01-13");
    expect(out).toContain("2024-06-05");
  });
});

describe("normalizeDateFormats — garbage / edge content (never throws)", () => {
  it("returns empty content unchanged", () => {
    expect(normalizeDateFormats("")).toBe("");
  });

  it("passes prose with no dates through untouched", () => {
    const text = "Closed three deals in the spring market.";
    expect(normalizeDateFormats(text)).toBe(text);
  });

  it("does not throw on malformed slash fragments", () => {
    expect(() => normalizeDateFormats("99/99/9999 / / //")).not.toThrow();
  });

  it("does not throw on a header-only CSV with no data rows", () => {
    expect(() => normalizeDateFormats("Name,Date,GCI")).not.toThrow();
  });
});
