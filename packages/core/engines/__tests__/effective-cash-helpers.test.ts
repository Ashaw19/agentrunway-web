/**
 * Layer 2: Effective Cash — Helper Exports
 * =========================================
 * Covers the two helpers exported from effective-cash.ts as part of the D-1 +
 * D-2 fix (Audit 1, 2026-04-22):
 *
 *   - computePipelineMonthlyIncome(pipelineWeightedGCI, fraction)
 *   - computeProjectedNetForTax({ projectedGCI, expensesYTD, expensesRemaining,
 *                                 settings, now })
 *
 * These were introduced to eliminate 6 + 3 divergent open-coded copies across
 * the app. Tests here guard the formulas against regression.
 *
 * `expensesRemaining` is what is still to come this year
 * (`remainingYearExpenses` in expense-totals-engine): the helper adds it to
 * the year to date and does no month counting of its own.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  computePipelineMonthlyIncome,
  computeProjectedNetForTax,
} from "../effective-cash";
import { ytdExpenseTotals } from "../expense-totals-engine";
import { createTestSettings } from "./test-data";
import type { RecurringExpense } from "../../types/database";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── computePipelineMonthlyIncome ─────────────────────────────────────────────

describe("computePipelineMonthlyIncome", () => {
  it("returns 0 when fraction is 0 (start of year / no season elapsed)", () => {
    expect(computePipelineMonthlyIncome(100_000, 0)).toBe(0);
  });

  it("returns 0 when fraction is negative", () => {
    expect(computePipelineMonthlyIncome(100_000, -0.1)).toBe(0);
  });

  it("returns 0 when pipeline is 0", () => {
    expect(computePipelineMonthlyIncome(0, 0.5)).toBe(0);
  });

  it("early year (fraction 0.1): divides by 11 remaining months", () => {
    // remainingMonths = max(1, 12 - floor(0.1 * 12)) = max(1, 12 - 1) = 11
    // 110_000 / 11 = 10_000
    expect(computePipelineMonthlyIncome(110_000, 0.1)).toBeCloseTo(10_000, 4);
  });

  it("mid year (fraction 0.5): divides by 6 remaining months", () => {
    // remainingMonths = max(1, 12 - 6) = 6
    // 120_000 / 6 = 20_000
    expect(computePipelineMonthlyIncome(120_000, 0.5)).toBe(20_000);
  });

  it("late year (fraction 0.9): divides by 2 remaining months", () => {
    // remainingMonths = max(1, 12 - 10) = 2
    // 50_000 / 2 = 25_000
    expect(computePipelineMonthlyIncome(50_000, 0.9)).toBe(25_000);
  });

  it("floors at 1 remaining month when fraction is effectively 1", () => {
    // remainingMonths = max(1, 12 - 12) = 1
    // 12_000 / 1 = 12_000
    expect(computePipelineMonthlyIncome(12_000, 1.0)).toBe(12_000);
  });

  it("regression: produces the DIFFERENT answer from the old (pipeline * 0.5) / 12 heuristic at mid-year", () => {
    // Old formula at fraction=0.5: (100_000 * 0.5) / 12 ≈ 4_166.67
    // New canonical formula:      100_000 / 6           ≈ 16_666.67
    // This spread — ~4× at mid-year, ~12× late year — is exactly the D-1 drift.
    const oldFormula = (100_000 * 0.5) / 12;
    const newFormula = computePipelineMonthlyIncome(100_000, 0.5);
    expect(newFormula).toBeGreaterThan(oldFormula * 3);
  });
});

// ── computeProjectedNetForTax ───────────────────────────────────────────────

describe("computeProjectedNetForTax", () => {
  // All tests use settings for a typical 80/20 split agent with standard fees:
  //   split: 80/20 (agent gets 80% of GCI below cap)
  //   cap:   post-cap threshold $100K, agent 95% above
  //   txFee: 2% of GCI, cap $3_000
  //   brokerageFee: $500/month → $6_000/year
  const baseSettings = createTestSettings({
    split_preset: "p80_20",
    post_cap_threshold_gci: 100_000,
    post_cap_agent_pct: 0.95,
    post_cap_brokerage_pct: 0.05,
    tx_fee_rate_pct: 0.02,
    tx_fee_annual_cap: 3_000,
    monthly_brokerage_fee: 500,
  });

  it("mid year (June), typical agent: matches dashboard formula", () => {
    // Pin to June 15 so getMonth()+1 = 6, remaining = 6 months.
    vi.setSystemTime(new Date(2026, 5, 15));

    // Projected GCI = $200_000, so pre-cap: $100K × 0.8 = $80K,
    //                            post-cap: $100K × 0.95 = $95K
    //                            agentGross = $175_000
    // txFees: min($200K × 0.02, $3_000) = $3_000
    // brokerageFeeAnnual: $500 × 12 = $6_000
    // projectedNet = $175_000 - $3_000 - $6_000 = $166_000
    //
    // expensesYTD = $20_000, still to come = $6_000
    // annualExpenses = $20_000 + $6_000 = $26_000
    // netForTax = max(0, $166_000 - $26_000) = $140_000
    const result = computeProjectedNetForTax({
      projectedGCI: 200_000,
      expensesYTD: 20_000,
      expensesRemaining: 6_000,
      settings: baseSettings,
    });
    expect(result).toBe(140_000);
  });

  it("early year (Feb): more still to come, annualExpenses larger", () => {
    vi.setSystemTime(new Date(2026, 1, 15)); // Feb 15, getMonth()+1 = 2

    // Same $200K projected GCI → projectedNet = $166_000
    // expensesYTD = $5_000, still to come = $10_000
    // annualExpenses = $5_000 + $10_000 = $15_000
    // netForTax = $166_000 - $15_000 = $151_000
    const result = computeProjectedNetForTax({
      projectedGCI: 200_000,
      expensesYTD: 5_000,
      expensesRemaining: 10_000,
      settings: baseSettings,
    });
    expect(result).toBe(151_000);
  });

  it("late year (Nov): little still to come, most expenses already YTD", () => {
    vi.setSystemTime(new Date(2026, 10, 15)); // Nov 15, getMonth()+1 = 11

    // projectedNet = $166_000
    // expensesYTD = $60_000, still to come = $1_000
    // annualExpenses = $60_000 + $1_000 = $61_000
    // netForTax = $166_000 - $61_000 = $105_000
    const result = computeProjectedNetForTax({
      projectedGCI: 200_000,
      expensesYTD: 60_000,
      expensesRemaining: 1_000,
      settings: baseSettings,
    });
    expect(result).toBe(105_000);
  });

  it("zero pipeline / zero projected GCI: projectedNet is negative, result floors at 0", () => {
    vi.setSystemTime(new Date(2026, 5, 15));

    // projectedGCI = $0 → agentGross = 0, txFees = 0, brokerage = $6_000 → projectedNet = -$6_000
    // expensesYTD = $2_000, still to come = $3_000
    // annualExpenses = $2_000 + $3_000 = $5_000
    // netForTax = max(0, -$6_000 - $5_000) = 0
    const result = computeProjectedNetForTax({
      projectedGCI: 0,
      expensesYTD: 2_000,
      expensesRemaining: 3_000,
      settings: baseSettings,
    });
    expect(result).toBe(0);
  });

  it("zero expenses, none still to come: result equals projectedNet", () => {
    vi.setSystemTime(new Date(2026, 5, 15));

    // projectedGCI = $120_000 → pre-cap $100K × 0.8 = $80_000, post-cap $20K × 0.95 = $19_000
    //                            agentGross = $99_000
    // txFees: min($120K × 0.02, $3_000) = min($2_400, $3_000) = $2_400
    // brokerageFeeAnnual = $6_000
    // projectedNet = $99_000 - $2_400 - $6_000 = $90_600
    // annualExpenses = 0, so netForTax = $90_600
    const result = computeProjectedNetForTax({
      projectedGCI: 120_000,
      expensesYTD: 0,
      expensesRemaining: 0,
      settings: baseSettings,
    });
    expect(result).toBe(90_600);
  });

  it("split < 100% (70/30): result reflects lower agent gross", () => {
    vi.setSystemTime(new Date(2026, 5, 15));

    const s = createTestSettings({
      split_preset: "p70_30",
      post_cap_threshold_gci: 100_000,
      post_cap_agent_pct: 0.95,
      post_cap_brokerage_pct: 0.05,
      tx_fee_rate_pct: 0.02,
      tx_fee_annual_cap: 3_000,
      monthly_brokerage_fee: 500,
    });

    // projectedGCI = $100_000 (exactly at cap) → $100_000 × 0.7 = $70_000
    // txFees: min($2_000, $3_000) = $2_000
    // brokerageFeeAnnual = $6_000
    // projectedNet = $70_000 - $2_000 - $6_000 = $62_000
    // annualExpenses = 0
    const result = computeProjectedNetForTax({
      projectedGCI: 100_000,
      expensesYTD: 0,
      expensesRemaining: 0,
      settings: s,
    });
    expect(result).toBe(62_000);
  });

  it("split = 100% (100/0, no brokerage): agent keeps everything above fees", () => {
    vi.setSystemTime(new Date(2026, 5, 15));

    const s = createTestSettings({
      split_preset: "p100_0",
      post_cap_threshold_gci: 0, // no cap when fully 100/0
      post_cap_agent_pct: 1,
      post_cap_brokerage_pct: 0,
      tx_fee_rate_pct: 0.02,
      tx_fee_annual_cap: 3_000,
      monthly_brokerage_fee: 0,
    });

    // projectedGCI = $100_000 → agentGross = $100_000
    // txFees: min($2_000, $3_000) = $2_000
    // brokerageFeeAnnual = 0
    // projectedNet = $100_000 - $2_000 = $98_000
    // annualExpenses = 0
    const result = computeProjectedNetForTax({
      projectedGCI: 100_000,
      expensesYTD: 0,
      expensesRemaining: 0,
      settings: s,
    });
    expect(result).toBe(98_000);
  });

  it("Dec 31: nothing still to come, annualExpenses = expensesYTD", () => {
    const decEnd = new Date(2026, 11, 31);

    // projectedGCI = $200_000 → projectedNet = $166_000 (same as mid-year case)
    // annualExpenses = $50_000 + $0 = $50_000
    // netForTax = $166_000 - $50_000 = $116_000
    const result = computeProjectedNetForTax({
      projectedGCI: 200_000,
      expensesYTD: 50_000,
      expensesRemaining: 0,
      settings: baseSettings,
      now: decEnd,
    });
    expect(result).toBe(116_000);
  });

  it("a monthly expense charged on the 20th is in the year once, before and after its day", () => {
    // $1,000 a month on the 20th, no GST/HST. The year holds twelve charges
    // whichever side of the 20th today is. Counting year to date by charge
    // date while projecting "monthly figure × whole months left" dropped
    // October's charge from the year until the 20th.
    const lease: RecurringExpense = {
      id: "lease", user_id: "u1", name: "Lease", amount: 1_000, category_key: "vehicle_payment",
      frequency: "monthly", day_of_month: 20, month_of_year: null, hst_included: false, hst_amount: 0,
      vehicle_pct_applicable: false, notes: "", start_date: "2025-01-01", end_date: null, is_active: true,
      created_at: "2025-01-01T12:00:00Z", updated_at: "2025-01-01T12:00:00Z",
    };
    const ctx = { gstHstRegistered: false, vehicleBusinessUsePct: 0.8, homeOfficeBusinessUsePct: 0 };
    const netForTaxOn = (now: Date) => {
      const t = ytdExpenseTotals({ receipts: [], recurring: [lease], legacyItems: [], ctx, now });
      return computeProjectedNetForTax({
        projectedGCI: 200_000,
        expensesYTD: t.expensesYTD,
        expensesRemaining: t.expensesRemaining,
        settings: baseSettings,
        now,
      });
    };
    // projectedNet $166_000 less twelve charges.
    expect(netForTaxOn(new Date(2026, 9, 13, 12))).toBe(154_000);
    expect(netForTaxOn(new Date(2026, 9, 20, 12))).toBe(154_000);
    expect(netForTaxOn(new Date(2026, 0, 5, 12))).toBe(154_000);
  });

  it("regression: canonical formula != pre-fix chat formula for split agents", () => {
    // Old chat-route formula at mid-year: projGCI * agentPct - (expensesYTD / engineFraction)
    //   projGCI = $200K, agentPct = 0.8, expensesYTD = $20K, fraction = 0.5
    //   = $200K × 0.8 - ($20K / 0.5) = $160_000 - $40_000 = $120_000
    // Canonical formula (this helper) at same inputs (June):
    //   = $140_000 (from mid-year test above)
    // The gap ($20K of tx fees + brokerage + proper expense projection)
    // is exactly the D-2 drift the audit surfaced.
    vi.setSystemTime(new Date(2026, 5, 15));
    const canonical = computeProjectedNetForTax({
      projectedGCI: 200_000,
      expensesYTD: 20_000,
      expensesRemaining: 6_000,
      settings: baseSettings,
    });
    const oldChatFormula = 200_000 * 0.8 - 20_000 / 0.5;
    expect(canonical).not.toBe(oldChatFormula);
    expect(Math.abs(canonical - oldChatFormula)).toBeGreaterThan(10_000);
  });
});
