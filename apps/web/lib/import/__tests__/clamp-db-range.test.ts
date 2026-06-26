/**
 * Regression suite for the DB-CHECK-range clamp — the 779ab9d crash class.
 *
 * A single out-of-range transaction row (30% commission, a column-swapped
 * >$100M sale price, an Infinity from a divide-by-zero, a NaN from a garbage
 * cell) used to make Postgres abort the ENTIRE `.upsert()` batch on the first
 * CHECK violation, with no user recovery — the literal
 * "onboarding import causes headaches" failure mode. These tests pin the
 * clamp ranges to the DB constraints in migration 00079 so the bound can
 * never silently drift back out of range on any of the four write sites.
 *
 * Constraints mirrored (00079_data_integrity_checks.sql):
 *   chk_tx_sale_price_non_negative   sale_price >= 0
 *   chk_tx_sale_price_reasonable     sale_price <= 100000000
 *   chk_tx_commission_pct_range      commission_pct BETWEEN 0 AND 0.25
 */
import { describe, expect, it } from "vitest";
import {
  clampSalePrice,
  clampCommissionPct,
  SALE_PRICE_MAX,
  COMMISSION_PCT_MAX,
} from "../clamp-db-range";

describe("clampSalePrice — passes valid, redirects everything the DB would reject", () => {
  it("passes a normal sale price through unchanged", () => {
    expect(clampSalePrice(450_000, null)).toBe(450_000);
  });

  it("passes 0 (a valid, non-negative value)", () => {
    expect(clampSalePrice(0, null)).toBe(0);
  });

  it("passes the exact upper bound (100M is allowed by <= 100000000)", () => {
    expect(clampSalePrice(SALE_PRICE_MAX, null)).toBe(100_000_000);
  });

  it("CRASH CASE: a column-swapped price above 100M falls back, not crashes", () => {
    expect(clampSalePrice(250_000_000, null)).toBe(null);
    expect(clampSalePrice(250_000_000, 0)).toBe(0);
  });

  it("CRASH CASE: a negative price (parse artefact) falls back", () => {
    expect(clampSalePrice(-1, null)).toBe(null);
  });

  it("CRASH CASE: NaN falls back (garbage cell parsed to NaN)", () => {
    expect(clampSalePrice(NaN, null)).toBe(null);
    expect(clampSalePrice(NaN, 0)).toBe(0);
  });

  it("CRASH CASE: Infinity falls back (divide-by-zero artefact)", () => {
    expect(clampSalePrice(Infinity, null)).toBe(null);
    expect(clampSalePrice(-Infinity, null)).toBe(null);
  });

  it("null / undefined fall back to the caller default", () => {
    expect(clampSalePrice(null, null)).toBe(null);
    expect(clampSalePrice(undefined, 0)).toBe(0);
  });

  it("respects each write site's distinct fallback (history-content uses 0)", () => {
    expect(clampSalePrice(999_999_999, 0)).toBe(0);
  });
});

describe("clampCommissionPct — passes valid, redirects everything the DB would reject", () => {
  it("passes a normal decimal rate (0.025 = 2.5%) through unchanged", () => {
    expect(clampCommissionPct(0.025, null)).toBe(0.025);
  });

  it("passes 0 and the exact upper bound 0.25 (25%)", () => {
    expect(clampCommissionPct(0, null)).toBe(0);
    expect(clampCommissionPct(COMMISSION_PCT_MAX, null)).toBe(0.25);
  });

  it("CRASH CASE: a 30% rate (0.30) above the 0.25 cap falls back", () => {
    expect(clampCommissionPct(0.3, null)).toBe(null);
    expect(clampCommissionPct(0.3, 0.025)).toBe(0.025);
  });

  it("CRASH CASE: a percentage entered as a whole number (3 = '3%') falls back", () => {
    // 3 is well above 0.25, so it cannot poison the batch.
    expect(clampCommissionPct(3, 0.025)).toBe(0.025);
  });

  it("CRASH CASE: a negative rate falls back", () => {
    expect(clampCommissionPct(-0.05, null)).toBe(null);
  });

  it("CRASH CASE: NaN and Infinity fall back", () => {
    expect(clampCommissionPct(NaN, 0.025)).toBe(0.025);
    expect(clampCommissionPct(Infinity, null)).toBe(null);
  });

  it("null / undefined fall back to the caller default", () => {
    expect(clampCommissionPct(null, 0.025)).toBe(0.025);
    expect(clampCommissionPct(undefined, null)).toBe(null);
  });
});

describe("clamp ranges stay locked to the migration 00079 constants", () => {
  it("SALE_PRICE_MAX equals the chk_tx_sale_price_reasonable bound", () => {
    expect(SALE_PRICE_MAX).toBe(100_000_000);
  });

  it("COMMISSION_PCT_MAX equals the chk_tx_commission_pct_range upper bound", () => {
    expect(COMMISSION_PCT_MAX).toBe(0.25);
  });
});
