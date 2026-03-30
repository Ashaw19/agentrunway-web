/**
 * DeviationEngine Tests
 * =====================
 * Tests for the 4-part experience-aware intelligence system:
 * 1. Experience tier classification
 * 2. Personal baseline computation
 * 3. Deviation detection with guards
 * 4. Experience-based tone adjustment
 */

import { describe, it, expect } from "vitest";
import {
  experienceTier,
  computeBaselines,
  detectDeviation,
  detectAllDeviations,
  deviationInsight,
  generateDeviationInsights,
  deviationPromptFragment,
  type Deviation,
} from "../deviation-engine";
import type { Transaction, ContactActivity } from "../../types/database";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeTx(monthsAgo: number, salePrice: number, overrides: Partial<Transaction> = {}): Transaction {
  const d = new Date();
  d.setDate(1); // avoid month-rollover issues (e.g. Mar 31 - 1 month = Mar 3)
  d.setMonth(d.getMonth() - monthsAgo);
  return {
    id: `tx-${Math.random()}`,
    user_id: "u1",
    date: d.toISOString().slice(0, 10),
    address: "123 Test St",
    sale_price: salePrice,
    commission_pct: 0.025,
    gci_override: null,
    side: "buyer",
    status: "closed",
    client_name: "Test Client",
    notes: "",
    created_at: d.toISOString(),
    updated_at: d.toISOString(),
    ...overrides,
  } as Transaction;
}

function makeActivity(monthsAgo: number): ContactActivity {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsAgo);
  return {
    id: `act-${Math.random()}`,
    user_id: "u1",
    client_id: "c1",
    type: "call",
    description: "Follow up",
    activity_date: d.toISOString(),
    created_at: d.toISOString(),
  };
}

// ── 1. Experience Tier ──────────────────────────────────────────────────────

describe("Experience Tier", () => {
  it("null → early", () => {
    expect(experienceTier(null)).toBe("early");
  });

  it("undefined → early", () => {
    expect(experienceTier(undefined)).toBe("early");
  });

  it("0 years → early", () => {
    expect(experienceTier(0)).toBe("early");
  });

  it("2 years → early", () => {
    expect(experienceTier(2)).toBe("early");
  });

  it("3 years → mid", () => {
    expect(experienceTier(3)).toBe("mid");
  });

  it("7 years → mid", () => {
    expect(experienceTier(7)).toBe("mid");
  });

  it("8 years → established", () => {
    expect(experienceTier(8)).toBe("established");
  });

  it("20 years → established", () => {
    expect(experienceTier(20)).toBe("established");
  });

  it("negative → early", () => {
    expect(experienceTier(-1)).toBe("early");
  });
});

// ── 2. Personal Baselines ───────────────────────────────────────────────────

describe("Personal Baselines", () => {
  it("returns null baselines with < 3 months data", () => {
    // Only 2 months of transactions
    const txs = [makeTx(1, 400000), makeTx(2, 500000)];
    const result = computeBaselines(txs, [], 3000, 10000);
    expect(result.monthlyGCI).toBeNull();
    expect(result.monthlyDeals).toBeNull();
    expect(result.monthsOfData).toBe(2);
  });

  it("computes baselines with 3+ months data", () => {
    // 4 months of transactions: $400k, $500k, $300k, $600k @ 2.5% = $10k, $12.5k, $7.5k, $15k
    const txs = [
      makeTx(1, 400000),
      makeTx(2, 500000),
      makeTx(3, 300000),
      makeTx(4, 600000),
    ];
    const result = computeBaselines(txs, [], 3000, 10000);
    expect(result.monthlyGCI).not.toBeNull();
    expect(result.monthlyDeals).not.toBeNull();
    expect(result.monthlyDeals).toBe(1); // 4 deals / 4 months
    expect(result.monthsOfData).toBe(4);
  });

  it("excludes current month from baselines", () => {
    // Transaction in current month should NOT be in baseline
    const txs = [
      makeTx(0, 400000), // current month — excluded
      makeTx(1, 400000),
      makeTx(2, 400000),
      makeTx(3, 400000),
    ];
    const result = computeBaselines(txs, [], 0, 0);
    // Only 3 months should count (months 1, 2, 3)
    expect(result.monthsOfData).toBe(3);
  });

  it("excludes transactions older than 12 months", () => {
    const txs = [
      makeTx(1, 400000),
      makeTx(2, 400000),
      makeTx(3, 400000),
      makeTx(13, 400000), // too old — excluded
    ];
    const result = computeBaselines(txs, [], 0, 0);
    expect(result.monthsOfData).toBe(3);
  });

  it("excludes non-closed transactions", () => {
    const txs = [
      makeTx(1, 400000),
      makeTx(2, 400000),
      makeTx(3, 400000, { status: "pending" }), // not closed
    ];
    const result = computeBaselines(txs, [], 0, 0);
    // Only 2 months with closed transactions
    expect(result.monthlyGCI).toBeNull(); // < 3 months
  });

  it("computes activity baselines independently", () => {
    // No transactions, but 4 months of activities
    const activities = [
      ...Array.from({ length: 10 }, () => makeActivity(1)),
      ...Array.from({ length: 8 }, () => makeActivity(2)),
      ...Array.from({ length: 12 }, () => makeActivity(3)),
      ...Array.from({ length: 6 }, () => makeActivity(4)),
    ];
    const result = computeBaselines([], activities, 0, 0);
    expect(result.monthlyGCI).toBeNull(); // no transactions
    expect(result.monthlyTouchpoints).not.toBeNull();
    expect(result.monthlyTouchpoints).toBe(9); // 36 / 4 months
    expect(result.monthsOfData).toBe(4);
  });

  it("returns null expense ratio when GCI is 0", () => {
    const txs = [makeTx(1, 400000), makeTx(2, 400000), makeTx(3, 400000)];
    const result = computeBaselines(txs, [], 3000, 0); // monthlyGCIForRatio = 0
    expect(result.expenseRatio).toBeNull();
  });
});

// ── 3. Deviation Detection ──────────────────────────────────────────────────

describe("Deviation Detection", () => {
  it("returns null when baseline is null", () => {
    expect(detectDeviation(5000, null, "monthlyGCI")).toBeNull();
  });

  it("returns null when deviation < 20%", () => {
    expect(detectDeviation(9000, 10000, "monthlyGCI")).toBeNull(); // -10%
    expect(detectDeviation(11000, 10000, "monthlyGCI")).toBeNull(); // +10%
  });

  it("detects downward deviation ≥ 20%", () => {
    const d = detectDeviation(7000, 10000, "monthlyGCI");
    expect(d).not.toBeNull();
    expect(d!.pctChange).toBe(-30);
    expect(d!.direction).toBe("below");
  });

  it("detects upward deviation ≥ 20%", () => {
    const d = detectDeviation(13000, 10000, "monthlyGCI");
    expect(d).not.toBeNull();
    expect(d!.pctChange).toBe(30);
    expect(d!.direction).toBe("above");
  });

  it("suppresses when baseline below minimum threshold", () => {
    // monthlyGCI baseline of $500 is below $1000 minimum
    expect(detectDeviation(100, 500, "monthlyGCI")).toBeNull();
  });

  it("suppresses when deal count baseline below minimum", () => {
    // monthlyDeals baseline of 0.3 is below 0.5 minimum
    expect(detectDeviation(0, 0.3, "monthlyDeals")).toBeNull();
  });

  it("returns null when baseline is 0", () => {
    expect(detectDeviation(5000, 0, "monthlyGCI")).toBeNull();
  });

  it("suppresses deal count when absolute difference < 0.75", () => {
    // 1.0 vs 1.5 = -33% but only 0.5 deals/month gap — noise
    expect(detectDeviation(1.0, 1.5, "monthlyDeals")).toBeNull();
  });

  it("fires deal count when absolute difference ≥ 0.75", () => {
    // 0.5 vs 1.5 = -67% and 1.0 deals/month gap — real signal
    const d = detectDeviation(0.5, 1.5, "monthlyDeals");
    expect(d).not.toBeNull();
    expect(d!.pctChange).toBe(-67);
  });
});

describe("Detect All Deviations", () => {
  it("returns empty array when no deviations", () => {
    const baselines = {
      monthlyGCI: 10000,
      monthlyDeals: 2,
      expenseRatio: 0.30,
      monthlyTouchpoints: 20,
      monthsOfData: 6,
    };
    // All current values within 20% of baseline
    const result = detectAllDeviations(baselines, 10000, 2, 0.30, 20);
    expect(result).toHaveLength(0);
  });

  it("detects multiple independent deviations", () => {
    const baselines = {
      monthlyGCI: 10000,
      monthlyDeals: 2,
      expenseRatio: 0.25,
      monthlyTouchpoints: 20,
      monthsOfData: 6,
    };
    // GCI down 40%, touchpoints down 50%
    const result = detectAllDeviations(baselines, 6000, 2, 0.25, 10);
    expect(result).toHaveLength(2);
    expect(result[0].metric).toBe("monthlyGCI");
    expect(result[1].metric).toBe("monthlyTouchpoints");
  });

  it("skips metrics with null baselines", () => {
    const baselines = {
      monthlyGCI: null,
      monthlyDeals: null,
      expenseRatio: null,
      monthlyTouchpoints: null,
      monthsOfData: 1,
    };
    const result = detectAllDeviations(baselines, 0, 0, 0, 0);
    expect(result).toHaveLength(0);
  });
});

// ── 4. Experience-Based Tone ────────────────────────────────────────────────

describe("Deviation Insights — Tone", () => {
  const mildDrop: Deviation = {
    metric: "monthlyGCI", current: 7500, baseline: 10000, pctChange: -25, direction: "below",
  };
  const severeDrop: Deviation = {
    metric: "monthlyGCI", current: 4000, baseline: 10000, pctChange: -60, direction: "below",
  };
  const moderateDrop: Deviation = {
    metric: "monthlyGCI", current: 6000, baseline: 10000, pctChange: -40, direction: "below",
  };
  const aboveDeviation: Deviation = {
    metric: "monthlyGCI", current: 14000, baseline: 10000, pctChange: 40, direction: "above",
  };

  // ── Early tier: severity split at 50% ──
  it("early + mild below: normalizes", () => {
    const msg = deviationInsight(mildDrop, "early");
    expect(msg).toContain("25% below");
    expect(msg).toContain("common");
    expect(msg).toContain("consistency");
  });

  it("early + severe below ≥ 50%: acknowledges gap", () => {
    const msg = deviationInsight(severeDrop, "early");
    expect(msg).toContain("60% below");
    expect(msg).toContain("meaningful gap");
    expect(msg).not.toContain("common");
  });

  // ── Mid tier: unchanged ──
  it("mid + below: direct", () => {
    const msg = deviationInsight(moderateDrop, "mid");
    expect(msg).toContain("40% below");
    expect(msg).toContain("usual level");
  });

  // ── Established tier: severity split at 40% ──
  it("established + mild below < 40%: soft framing", () => {
    const msg = deviationInsight(mildDrop, "established");
    expect(msg).toContain("25% below");
    expect(msg).toContain("timing difference");
    expect(msg).not.toContain("unusual");
  });

  it("established + below ≥ 40%: flags as unusual", () => {
    const msg = deviationInsight(moderateDrop, "established");
    expect(msg).toContain("40% below");
    expect(msg).toContain("unusual");
  });

  // ── Above deviations: unchanged ──
  it("early + above: encouraging", () => {
    const msg = deviationInsight(aboveDeviation, "early");
    expect(msg).toContain("40% above");
    expect(msg).toContain("momentum");
  });

  it("established + above: acknowledges strength", () => {
    const msg = deviationInsight(aboveDeviation, "established");
    expect(msg).toContain("40% above");
    expect(msg).toContain("exceptionally strong");
  });
});

describe("Generate All Insights", () => {
  it("returns one insight per deviation", () => {
    const deviations: Deviation[] = [
      { metric: "monthlyGCI", current: 6000, baseline: 10000, pctChange: -40, direction: "below" },
      { metric: "monthlyTouchpoints", current: 8, baseline: 20, pctChange: -60, direction: "below" },
    ];
    const insights = generateDeviationInsights(deviations, "mid");
    expect(insights).toHaveLength(2);
    expect(insights[0]).toContain("monthly GCI");
    expect(insights[1]).toContain("contact activity");
  });

  it("returns empty array with no deviations", () => {
    expect(generateDeviationInsights([], "early")).toHaveLength(0);
  });
});

// ── Prompt Fragment ─────────────────────────────────────────────────────────

describe("Prompt Fragment", () => {
  it("returns empty string with no deviations", () => {
    expect(deviationPromptFragment([], "mid")).toBe("");
  });

  it("includes tier and deviations", () => {
    const deviations: Deviation[] = [
      { metric: "monthlyGCI", current: 6000, baseline: 10000, pctChange: -40, direction: "below" },
    ];
    const fragment = deviationPromptFragment(deviations, "established");
    expect(fragment).toContain("Agent experience tier: established");
    expect(fragment).toContain("monthly GCI: 40% below");
    expect(fragment).toContain("unusual");
  });

  it("adjusts tone guidance per tier", () => {
    const deviations: Deviation[] = [
      { metric: "monthlyGCI", current: 6000, baseline: 10000, pctChange: -40, direction: "below" },
    ];
    expect(deviationPromptFragment(deviations, "early")).toContain("Normalize");
    expect(deviationPromptFragment(deviations, "mid")).toContain("direct");
    expect(deviationPromptFragment(deviations, "established")).toContain("unusual");
  });
});
