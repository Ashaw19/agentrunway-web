import { describe, expect, it } from "vitest";
import { normalizeEmail, normalizePhone, toNameSearch } from "../client-identity";

describe("toNameSearch", () => {
  it("lowercases and trims", () => {
    expect(toNameSearch("  John Smith  ")).toBe("john smith");
  });

  it("collapses internal whitespace", () => {
    expect(toNameSearch("John   Smith")).toBe("john smith");
  });

  it("strips diacritics", () => {
    expect(toNameSearch("François Élise")).toBe("francois elise");
  });

  it("normalizes the modifier letter apostrophe (U+02BC) to ASCII", () => {
    expect(toNameSearch("OʼBrien")).toBe("o'brien");
  });

  it("leaves an already-plain ASCII apostrophe unchanged", () => {
    expect(toNameSearch("O'Brien")).toBe("o'brien");
  });

  it("does NOT fold the curly right-single-quote (U+2019) — matches the live production behavior exactly; documented gap, not fixed here", () => {
    // This function must stay byte-identical to clients-content.tsx's
    // toNameSearch, which existing clients.name_search values in the DB were
    // computed with. Widening this normalization would change import-time
    // matching for new rows without a backfill of existing data — a
    // separate, larger change. The new duplicate-detection clustering tool
    // (which never persists or auto-writes) applies an EXTRA fold on top of
    // this function specifically to catch this case — see
    // duplicate-detection.ts's clusterNameKey().
    expect(toNameSearch("O’Brien")).toBe("o’brien");
  });

  it("produces the same key for names that differ only in case/whitespace/diacritics", () => {
    expect(toNameSearch("Bob Smith")).toBe(toNameSearch("  bob   SMITH  "));
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Jane.Doe@Example.COM ")).toBe("jane.doe@example.com");
  });

  it("returns null for empty or whitespace-only input", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });
});

describe("normalizePhone", () => {
  it("strips formatting punctuation", () => {
    expect(normalizePhone("(506) 645-1559")).toBe("5066451559");
  });

  it("strips a leading NANP country code", () => {
    expect(normalizePhone("+1 506 645 1559")).toBe("5066451559");
    expect(normalizePhone("15066451559")).toBe("5066451559");
  });

  it("treats formatted and unformatted equivalents as the same key", () => {
    expect(normalizePhone("506-645-1559")).toBe(normalizePhone("+1 (506) 645-1559"));
  });

  it("returns null for too-short input (avoids false-positive clustering)", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });

  it("does not strip a leading 1 when the total digit count isn't 11 (would be a real area code)", () => {
    // A 10-digit number starting with 1 is not NANP-country-code-prefixed —
    // stripping would corrupt it. (Edge case; NANP area codes can't start
    // with 1, so a 10-digit "1XXXXXXXXX" is malformed input either way —
    // just confirm we don't crash and don't produce a 9-digit result.)
    expect(normalizePhone("1234567890")).toBe("1234567890");
  });
});
