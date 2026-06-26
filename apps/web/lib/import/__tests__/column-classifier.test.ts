/**
 * Regression suite for the column classifier.
 *
 * The classifier maps real-world header rows to target field indices. It must:
 *   • Recognize the two dominant Canadian-agent shapes (tracker, brokerage).
 *   • Return null (never throw) when no header row is found, so the caller can
 *     fall back to unassisted LLM extraction.
 *   • Tolerate extra / missing / reordered columns and garbage headers.
 */
import { describe, expect, it } from "vitest";
import { classifyColumns, buildProvenance } from "../heuristics/column-classifier";

describe("classifyColumns — tracker shape (agent's own deal log)", () => {
  const rows = [
    ["Client Name", "Address", "Close Date", "Buy | Sell", "Lead Source", "GCI", "Net Commission"],
    ["Jane Buyer", "123 Main St", "2024-03-15", "Buy", "SOI", "12000", "9000"],
  ];

  it("detects the header row at index 0", () => {
    const c = classifyColumns(rows)!;
    expect(c.header_row_index).toBe(0);
  });

  it("maps the core columns to the right indices", () => {
    const c = classifyColumns(rows)!;
    expect(c.name).toBe(0);
    expect(c.address).toBe(1);
    expect(c.date).toBe(2);
    expect(c.side).toBe(3);
    expect(c.source).toBe(4);
    expect(c.gci).toBe(5);
    expect(c.net_income).toBe(6);
  });

  it("classifies the document subtype as tracker", () => {
    expect(classifyColumns(rows)!.document_subtype).toBe("tracker");
  });

  it("does not assign two fields to the same column", () => {
    const c = classifyColumns(rows)!;
    const claimed = [c.name, c.address, c.date, c.side, c.source, c.gci, c.net_income]
      .filter((i) => i !== -1);
    expect(new Set(claimed).size).toBe(claimed.length);
  });
});

describe("classifyColumns — brokerage shape (commission report)", () => {
  const rows = [
    ["Address", "Closing Date", "Gross Commission", "Net Commission (Taxable)"],
    ["456 King St", "2024-06-01", "15000", "11250"],
  ];

  it("maps gross to GCI and net to net_income", () => {
    const c = classifyColumns(rows)!;
    expect(c.gci).toBe(2);
    expect(c.net_income).toBe(3);
  });

  it("classifies as brokerage (gci + net_income, no side column)", () => {
    expect(classifyColumns(rows)!.document_subtype).toBe("brokerage");
  });
});

describe("classifyColumns — header detection robustness", () => {
  it("finds the header row even when preceded by title / blank-ish rows", () => {
    const rows = [
      ["My 2024 Deal Tracker"],
      ["Name", "Date", "GCI", "Buy | Sell"],
      ["Jane", "2024-01-01", "10000", "Buy"],
    ];
    expect(classifyColumns(rows)!.header_row_index).toBe(1);
  });

  it("returns null when no row has >= 2 recognizable columns", () => {
    const rows = [
      ["foo", "bar", "baz"],
      ["1", "2", "3"],
    ];
    expect(classifyColumns(rows)).toBeNull();
  });

  it("returns null (never throws) on an empty input", () => {
    expect(() => classifyColumns([])).not.toThrow();
    expect(classifyColumns([])).toBeNull();
  });

  it("tolerates extra unrelated trailing columns", () => {
    const rows = [
      ["Name", "Date", "GCI", "Notes", "Internal ID", "Color Tag"],
      ["Jane", "2024-01-01", "10000", "nice client", "X99", "blue"],
    ];
    const c = classifyColumns(rows)!;
    expect(c.name).toBe(0);
    expect(c.date).toBe(1);
    expect(c.gci).toBe(2);
  });

  it("tolerates reordered columns", () => {
    const rows = [
      ["GCI", "Client", "Closing Date"],
      ["10000", "Jane", "2024-01-01"],
    ];
    const c = classifyColumns(rows)!;
    expect(c.gci).toBe(0);
    expect(c.name).toBe(1);
    expect(c.date).toBe(2);
  });
});

describe("classifyColumns — ambiguous single-money-column remap heuristic", () => {
  it("remaps a lone 'Amount' column to GCI when no GCI/% column exists", () => {
    const rows = [
      ["Client", "Address", "Amount"],
      ["Jane", "123 Main St", "12000"],
    ];
    const c = classifyColumns(rows)!;
    expect(c.gci).toBe(2);
    expect(c.sale_price).toBe(-1);
  });
});

describe("buildProvenance — readable column provenance", () => {
  it("produces a human-readable string for found columns and null for missing", () => {
    const rows = [
      ["Name", "Date", "GCI"],
      ["Jane", "2024-01-01", "10000"],
    ];
    const c = classifyColumns(rows)!;
    const prov = buildProvenance(c, rows[0], 1);
    expect(prov.gci).toMatch(/Parsed from row 1, column: GCI/);
    expect(prov.sale_price).toBeNull(); // not present in this file
  });
});
