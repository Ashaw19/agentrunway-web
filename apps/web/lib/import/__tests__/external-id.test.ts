/**
 * Regression suite for the import data-loss-prevention key.
 *
 * `import_external_id` is the natural key the import flow UPSERTs on
 * (onConflict: "user_id,import_external_id", enforced by the partial unique
 * indexes in migration 00121). These tests pin the two integrity guarantees
 * the key exists to provide — see project_import_data_loss_resolved.md:
 *
 *   Bug A (multi-file same year): a second CSV with NEW deals must produce
 *     NEW ids so it MERGES alongside the first import instead of wiping it.
 *   Bug B (manual edits wiped): the SAME deal re-imported must produce the
 *     SAME id so the upsert overwrites in place / is skippable, never
 *     duplicated — and the edit-protection layer keys off this same id.
 *
 * `dedupeByImportExternalId` is the batch-crash guard: Postgres aborts a whole
 * `.upsert()` if two payload rows share the conflict key, so the array is
 * collapsed last-wins before the write.
 */
import { describe, expect, it } from "vitest";
import {
  computeImportExternalId,
  dedupeByImportExternalId,
  type ExternalIdInput,
} from "../external-id";

const baseDeal: ExternalIdInput = {
  year: 2024,
  date: "2024-03-15",
  address: "123 Main St, Saint John NB",
  party_a: "Jane Buyer",
  party_b: "John Seller",
  gci: 12_000,
};

describe("computeImportExternalId — determinism (Bug B: no duplicate on re-import)", () => {
  it("produces the identical id for the identical deal on re-import", () => {
    expect(computeImportExternalId(baseDeal)).toBe(
      computeImportExternalId({ ...baseDeal }),
    );
  });

  it("ignores GCI changes so a corrected re-upload upserts in place, not alongside", () => {
    // User re-uploads the same report with a fixed GCI. Same row must be hit.
    const corrected = { ...baseDeal, gci: 13_000 };
    expect(computeImportExternalId(corrected)).toBe(
      computeImportExternalId(baseDeal),
    );
  });

  it("is stable across trivial whitespace and case differences in address", () => {
    const noisy = { ...baseDeal, address: "  123   MAIN St,  Saint John NB " };
    expect(computeImportExternalId(noisy)).toBe(
      computeImportExternalId(baseDeal),
    );
  });

  it("is stable across trivial whitespace and case differences in names", () => {
    const noisy = {
      ...baseDeal,
      party_a: " JANE  Buyer ",
      party_b: "JOHN   seller",
    };
    expect(computeImportExternalId(noisy)).toBe(
      computeImportExternalId(baseDeal),
    );
  });

  it("is stable when only the date's time portion differs", () => {
    const withTime = { ...baseDeal, date: "2024-03-15T00:00:00Z" };
    expect(computeImportExternalId(withTime)).toBe(
      computeImportExternalId(baseDeal),
    );
  });
});

describe("computeImportExternalId — content addressing (Bug A: distinct deals merge, never collide)", () => {
  it("gives a different id for a different date", () => {
    expect(computeImportExternalId({ ...baseDeal, date: "2024-09-01" })).not.toBe(
      computeImportExternalId(baseDeal),
    );
  });

  it("gives a different id for a different address", () => {
    expect(
      computeImportExternalId({ ...baseDeal, address: "456 King St" }),
    ).not.toBe(computeImportExternalId(baseDeal));
  });

  it("gives a different id for different parties", () => {
    expect(
      computeImportExternalId({ ...baseDeal, party_a: "Someone Else" }),
    ).not.toBe(computeImportExternalId(baseDeal));
  });

  it("gives a different id across years (multi-file by-year imports stay separate)", () => {
    expect(computeImportExternalId({ ...baseDeal, year: 2023 })).not.toBe(
      computeImportExternalId(baseDeal),
    );
  });

  it("MULTI-FILE SAME YEAR: 5 Q1-Q2 deals + 5 Q3-Q4 deals = 10 distinct ids (no wipe)", () => {
    // The exact Scenario 1 data-loss case. Two CSVs, same year, different deals.
    const mm = (m: number) => String(m).padStart(2, "0");
    const q1q2 = [1, 2, 3, 4, 5].map((month, i) => ({
      ...baseDeal,
      date: `2024-${mm(month)}-10`,
      address: `${100 + i} First Ave`,
      party_a: `Buyer ${i}`,
    }));
    const q3q4 = [8, 9, 10, 11, 12].map((month, i) => ({
      ...baseDeal,
      date: `2024-${mm(month)}-10`,
      address: `${200 + i} Second Ave`,
      party_a: `Buyer Q3 ${i}`,
    }));
    const ids = [...q1q2, ...q3q4].map(computeImportExternalId);
    expect(new Set(ids).size).toBe(10);
  });
});

describe("computeImportExternalId — graceful on missing/garbage fields (no crash)", () => {
  it("does not throw on all-null fields", () => {
    expect(() =>
      computeImportExternalId({
        year: 2024,
        date: null,
        address: null,
        party_a: null,
        party_b: null,
      }),
    ).not.toThrow();
  });

  it("does not throw on undefined fields", () => {
    expect(() =>
      computeImportExternalId({
        year: 2024,
        date: undefined,
        address: undefined,
        party_a: undefined,
        party_b: undefined,
      }),
    ).not.toThrow();
  });

  it("always carries the v1 version prefix and the year", () => {
    const id = computeImportExternalId(baseDeal);
    expect(id.startsWith("v1|2024|")).toBe(true);
  });

  it("empty parties still produce a deterministic stable id", () => {
    const a = computeImportExternalId({ ...baseDeal, party_a: "", party_b: "" });
    const b = computeImportExternalId({ ...baseDeal, party_a: "", party_b: "" });
    expect(a).toBe(b);
  });
});

describe("dedupeByImportExternalId — batch-crash guard (Postgres aborts on dup conflict key)", () => {
  it("collapses two rows sharing an id to one, last-wins", () => {
    const id = computeImportExternalId(baseDeal);
    const rows = [
      { import_external_id: id, gci_override: 12_000 },
      { import_external_id: id, gci_override: 13_000 }, // later wins
    ];
    const out = dedupeByImportExternalId(rows);
    expect(out).toHaveLength(1);
    expect(out[0].gci_override).toBe(13_000);
  });

  it("REAL-WORLD COLLISION: two same-client same-day deals with a blank address collapse to 1", () => {
    // The header's documented failure case: blank address + same parties + same
    // date → same id. Without the dedupe the whole year's upsert fails.
    const blank: ExternalIdInput = {
      year: 2024,
      date: "2024-05-01",
      address: "",
      party_a: "Repeat Client",
      party_b: "",
    };
    const id = computeImportExternalId(blank);
    const rows = [
      { import_external_id: id, deal: "first" },
      { import_external_id: id, deal: "second" },
    ];
    expect(dedupeByImportExternalId(rows)).toHaveLength(1);
  });

  it("preserves all rows when every id is distinct", () => {
    const rows = [
      { import_external_id: "a" },
      { import_external_id: "b" },
      { import_external_id: "c" },
    ];
    expect(dedupeByImportExternalId(rows)).toHaveLength(3);
  });

  it("handles an empty array without throwing", () => {
    expect(dedupeByImportExternalId([])).toEqual([]);
  });

  it("a deduped payload contains no duplicate conflict keys (the property Postgres requires)", () => {
    const rows = [
      { import_external_id: "x" },
      { import_external_id: "x" },
      { import_external_id: "y" },
      { import_external_id: "x" },
      { import_external_id: "y" },
    ];
    const out = dedupeByImportExternalId(rows);
    const ids = out.map((r) => r.import_external_id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
