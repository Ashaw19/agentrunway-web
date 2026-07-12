/**
 * Tests for the chunking-related surface of normalizeTextDocument:
 *   • it exposes cleaned_rows (the row array the route chunks), consistent with
 *     the joined cleaned_content;
 *   • its size cap is high enough that a report which the OLD 20K cap would have
 *     silently truncated now survives whole, so the chunker can process it all.
 */
import { describe, expect, it } from "vitest";
import { normalizeTextDocument } from "../normalizers/normalize-text";

describe("normalizeTextDocument — cleaned_rows", () => {
  it("returns cleaned_rows consistent with cleaned_content", () => {
    const csv = "Name,GCI\nAlice,100\nBob,200";
    const r = normalizeTextDocument(csv, true);
    expect(Array.isArray(r.cleaned_rows)).toBe(true);
    expect(r.cleaned_rows.join("\n")).toBe(r.cleaned_content);
    expect(r.cleaned_rows[0]).toBe("Name,GCI");
  });
});

describe("normalizeTextDocument — cap raised for chunked extraction", () => {
  it("does not truncate a ~30K-char report that the old 20K cap would have cut", () => {
    const header = "Name,Address,CloseDate,GCI,Net";
    // ~300 data rows × ~100 chars ≈ 30K chars — over the old 20_000 cap.
    const rows = Array.from({ length: 300 }, (_, i) =>
      `Client Number ${i},${i} Some Reasonably Long Street Name Avenue,2024-0${(i % 9) + 1}-15,${1000 + i},${800 + i}`,
    );
    const csv = [header, ...rows].join("\n");
    expect(csv.length).toBeGreaterThan(20_000);

    const r = normalizeTextDocument(csv, true);
    expect(r.stats.truncated).toBe(false);
    // Header + all 300 data rows preserved (no subtotal/blank rows to strip here).
    expect(r.cleaned_rows.length).toBe(301);
  });
});
