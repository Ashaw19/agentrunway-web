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
    const out = normalizeDateFormats(csv);
    // No labelled date column AND it is CSV-shaped, so the generic fallback
    // regex applies only to standalone cell-boundary serials. 45000 is inside
    // a CSV row adjacent to other cells, so it must stay money.
    expect(out).toContain("45000");
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
