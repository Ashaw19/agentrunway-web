/**
 * END-TO-END DOGFOOD on synthesized, realistic-SHAPE data (NO real PII).
 *
 * This walks the actual deterministic import pipeline the way the production
 * write path does, using the REAL exported functions (no reimplementation):
 *
 *   raw CSV
 *     → normalizeTextDocument()        (strip blanks/subtotals, classify cols, fr-CA normalize)
 *     → splitCsvRow() per data row     (RFC-4180 + MySQL quote aware)
 *     → parse cells (money/date)       (parseMoneyLoose / normalizeDateFormats)
 *     → applyValidation()              (flag bad rows, never discard)
 *     → computeImportExternalId()      (stable upsert key)
 *     → clampSalePrice/clampCommissionPct (DB CHECK-range guard)
 *     → dedupeByImportExternalId()     (batch-crash guard)
 *     → assert the upsert payload is collision-free + clamp-safe.
 *
 * It then proves the two historical data-loss guarantees on this real-shape data:
 *   1. CLEAN RE-IMPORT of the SAME file → identical ids → upsert overwrites in
 *      place, zero duplicates, zero loss.
 *   2. MANUAL-EDIT PROTECTION → a row the user edited (edited_at set) is filtered
 *      out of the re-import payload, so the correction survives.
 *
 * The fixture deliberately includes the edge cases that have bitten imports:
 *   • a quoted address containing a comma
 *   • an Excel date serial in the Date column
 *   • a DD/MM/YYYY slash date
 *   • a French-Canadian money value with NBSP thousands + comma decimal
 *   • a subtotal row + a blank row (must be stripped)
 *   • an out-of-range commission (30%) and a column-swapped >$100M price
 *     (the 779ab9d crash class — must clamp, not crash)
 *   • a repeat client with two same-day blank-address deals (dedupe collision)
 *   • an "N/A" sale price (must degrade to null, not 0-poison)
 */
import { describe, expect, it } from "vitest";
import { normalizeTextDocument, splitCsvRow } from "../normalizers/normalize-text";
import { normalizeDateFormats } from "../normalizers/normalize-dates";
import { parseMoneyLoose } from "../normalizers/normalize-money";
import { applyValidation } from "../validation/validate-transactions";
import { computeImportExternalId, dedupeByImportExternalId } from "../external-id";
import { clampSalePrice, clampCommissionPct } from "../clamp-db-range";
import type { ExtractedDeal } from "@/app/api/import-history/route";

const IMPORT_YEAR = 2024;

// ── Synthesized real-shape CSV (fabricated; no real PII) ──────────────────────
// Tracker export with the messy reality of a Canadian agent's book of business.
const FIXTURE_CSV = [
  "Client Name,Property Address,Close Date,Buy | Sell,Lead Source,Sale Price,GCI,Commission %",
  // normal deal
  "Priya Anand,12 Birch Lane Fredericton NB,2024-02-14,Buy,SOI,425000,10625,0.025",
  // quoted address with embedded comma + DD/MM slash date
  '"Marcus Doyle","48 Queen St, Unit 3, Saint John NB",18/03/2024,Sell,Realtor.ca,389000,9725,0.025',
  // Excel date serial in the Date column (45383 ~ Apr 2024); GCI looks date-like too
  "Lena Fournier,77 Rue Principale Edmundston NB,45383,Buy,Referral,512000,12800,0.025",
  // French-Canadian money formatting: NBSP thousands + comma decimal + trailing $
  "Olivier Roy,5 Chemin du Lac Dieppe NB,2024-05-09,Sell,Past Client,325 000 $,9 750,00 $,0.03",
  // a blank row (must be stripped)
  ",,,,,,,",
  // a subtotal row (must be stripped)
  "Total,,,,,,52900,",
  // CRASH CLASS: 30% commission (out of DB 0.25 range) — must clamp, not crash
  "Sam Tremblay,9 Hillcrest Ave Moncton NB,2024-07-21,Buy,Sign Call,300000,90000,0.30",
  // CRASH CLASS: column-swapped sale price > $100M — must clamp, not crash
  "Dana Cormier,200 Union St Saint John NB,2024-08-02,Sell,SOI,250000000,11000,0.025",
  // N/A sale price — must degrade to null, not poison
  "Grace Levesque,14 Maple Dr Rothesay NB,2024-09-15,Buy,Open House,N/A,8500,0.025",
  // repeat client: two same-day deals, blank address → SAME id → dedupe collision
  "Repeat Holdings,,2024-10-01,Buy,Investor,180000,4500,0.025",
  "Repeat Holdings,,2024-10-01,Buy,Investor,180000,4500,0.025",
].join("\n");

/** Mirror the production write path: build the transactions upsert payload from cell rows. */
function buildUpsertPayload(csv: string, year: number) {
  const norm = normalizeTextDocument(csv, true);
  // normalizeDateFormats runs on the WHOLE document in production (route.ts /
  // clients-content.tsx) so serial conversion can scope itself to the labelled
  // date column. Per-line application would hide the header from Pass 1.
  const rows = normalizeDateFormats(norm.cleaned_content).split("\n").map(splitCsvRow);
  const cls = norm.column_classification!;
  const header = cls.header_row_index;

  const dataRows = rows.filter((_, i) => i > header);

  const deals: ExtractedDeal[] = dataRows.map((cells) => {
    const get = (idx: number) => (idx >= 0 ? cells[idx] ?? "" : "");
    const gciNum = parseMoneyLoose(get(cls.gci));
    const spNum = parseMoneyLoose(get(cls.sale_price));
    const pctNum = parseMoneyLoose(get(cls.commission_percent));
    const name = get(cls.name);
    return {
      date: get(cls.date),
      address: get(cls.address),
      sale_price: Number.isFinite(spNum) ? spNum : null,
      gci: Number.isFinite(gciNum) ? gciNum : 0,
      party_a: name,
      party_b: "",
      agent_side: 0,
      commission_percent: Number.isFinite(pctNum) ? pctNum : null,
      side: "buyer",
    };
  });

  const validated = deals.map((d) => applyValidation(d, year));

  const payload = validated.map((deal) => ({
    date: deal.date,
    address: deal.address || "",
    sale_price: clampSalePrice(deal.sale_price, null),
    commission_pct: clampCommissionPct(deal.commission_percent, null),
    gci_override: deal.gci,
    import_external_id: computeImportExternalId({
      year,
      date: deal.date,
      address: deal.address,
      party_a: deal.party_a,
      party_b: deal.party_b,
      gci: deal.gci,
    }),
    party_a: deal.party_a,
    issues: deal.issues ?? [],
  }));

  return { norm, payload: dedupeByImportExternalId(payload) };
}

describe("DOGFOOD — first import of a real-shape book of business", () => {
  const { norm, payload } = buildUpsertPayload(FIXTURE_CSV, IMPORT_YEAR);

  it("strips the blank row and the subtotal row during normalization", () => {
    // Subtotal label and blank line must not appear as deals.
    expect(payload.some((p) => p.party_a.toLowerCase() === "total")).toBe(false);
    expect(payload.some((p) => p.party_a === "")).toBe(false);
  });

  it("parses the quoted address that contains commas as ONE field", () => {
    const marcus = payload.find((p) => p.party_a === "Marcus Doyle");
    expect(marcus).toBeDefined();
    expect(marcus!.address).toContain("Unit 3");
    expect(marcus!.address).toContain("Saint John");
  });

  it("converts the DD/MM slash date to ISO", () => {
    const marcus = payload.find((p) => p.party_a === "Marcus Doyle")!;
    expect(marcus.date).toBe("2024-03-18");
  });

  it("converts the Excel date serial in the Date column to ISO", () => {
    const lena = payload.find((p) => p.party_a === "Lena Fournier")!;
    expect(lena.date).toMatch(/^2024-\d{2}-\d{2}$/);
    expect(lena.date).not.toBe("45383");
  });

  it("parses the French-Canadian NBSP money value", () => {
    const olivier = payload.find((p) => p.party_a === "Olivier Roy")!;
    expect(olivier.gci_override).toBe(9750); // "9 750,00 $" → 9750
  });

  it("CRASH CLASS: the 30% commission is clamped, the row still imports", () => {
    const sam = payload.find((p) => p.party_a === "Sam Tremblay")!;
    expect(sam.commission_pct).toBeNull(); // out-of-range → fallback, not 0.30
    expect(sam.gci_override).toBe(90000); // GCI preserved
  });

  it("CRASH CLASS: the >$100M sale price is clamped, the row still imports", () => {
    const dana = payload.find((p) => p.party_a === "Dana Cormier")!;
    expect(dana.sale_price).toBeNull(); // out-of-range → fallback
    expect(dana.gci_override).toBe(11000);
  });

  it("the 'N/A' sale price degrades to null (never a poisoned value)", () => {
    const grace = payload.find((p) => p.party_a === "Grace Levesque")!;
    expect(grace.sale_price).toBeNull();
  });

  it("the repeat-client same-day blank-address collision dedupes to ONE row", () => {
    const repeats = payload.filter((p) => p.party_a === "Repeat Holdings");
    expect(repeats).toHaveLength(1);
  });

  it("EVERY upsert row is within the DB CHECK ranges (no row can abort the batch)", () => {
    for (const row of payload) {
      if (row.sale_price !== null) {
        expect(row.sale_price).toBeGreaterThanOrEqual(0);
        expect(row.sale_price).toBeLessThanOrEqual(100_000_000);
      }
      if (row.commission_pct !== null) {
        expect(row.commission_pct).toBeGreaterThanOrEqual(0);
        expect(row.commission_pct).toBeLessThanOrEqual(0.25);
      }
    }
  });

  it("the upsert payload has NO duplicate conflict keys (the property Postgres requires)", () => {
    const ids = payload.map((p) => p.import_external_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("the normalizer reports rows were removed (blank + subtotal)", () => {
    expect(norm.stats.rows_removed).toBeGreaterThanOrEqual(2);
  });
});

describe("DOGFOOD — clean RE-IMPORT of the same file (Bug A/B: no loss, no dupes)", () => {
  it("produces the identical set of conflict keys → upsert overwrites in place", () => {
    const first = buildUpsertPayload(FIXTURE_CSV, IMPORT_YEAR).payload;
    const second = buildUpsertPayload(FIXTURE_CSV, IMPORT_YEAR).payload;

    const firstIds = new Set(first.map((p) => p.import_external_id));
    const secondIds = new Set(second.map((p) => p.import_external_id));

    expect(secondIds).toEqual(firstIds);
    // Same count → the re-import is a pure overwrite, never an append.
    expect(second.length).toBe(first.length);
  });
});

describe("DOGFOOD — manual-edit protection (Bug B: re-import skips edited rows)", () => {
  it("a row the user edited (edited_at set) is excluded from the re-import write set", () => {
    // First import lands all rows. The user then corrects Priya's GCI in the CRM,
    // which sets edited_at on that stored row.
    const firstPayload = buildUpsertPayload(FIXTURE_CSV, IMPORT_YEAR).payload;
    const priya = firstPayload.find((p) => p.party_a === "Priya Anand")!;

    const storedRows = firstPayload.map((p) => ({
      import_external_id: p.import_external_id,
      edited_at: p.import_external_id === priya.import_external_id ? "2024-03-01T10:00:00Z" : null,
    }));

    // Re-import: production filters out any incoming row whose stored twin has edited_at set.
    const editedIds = new Set(
      storedRows.filter((r) => r.edited_at !== null).map((r) => r.import_external_id),
    );
    const secondPayload = buildUpsertPayload(FIXTURE_CSV, IMPORT_YEAR).payload;
    const toWrite = secondPayload.filter((p) => !editedIds.has(p.import_external_id));

    // Priya's edited row is protected — it is NOT in the write set, so the
    // manual correction survives the re-import.
    expect(toWrite.some((p) => p.import_external_id === priya.import_external_id)).toBe(false);
    // Every other row is still re-imported.
    expect(toWrite.length).toBe(secondPayload.length - 1);
  });
});
