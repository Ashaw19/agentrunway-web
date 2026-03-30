/**
 * DeviationEngine Tests (web app mirror)
 * =====================
 * Tests for the 4-part experience-aware intelligence system.
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
} from "@/lib/engines/deviation-engine";
import type { Transaction, ContactActivity } from "@/lib/types/database";

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
  it("null → early", () => expect(experienceTier(null)).toBe("early"));
  it("undefined → early", () => expect(experienceTier(undefined)).toBe("early"));
  it("2 years → early", () => expect(experienceTier(2)).toBe("early"));
  it("3 years → mid", () => expect(experienceTier(3)).toBe("mid"));
  it("7 years → mid", () => expect(experienceTier(7)).toBe("mid"));
  it("8 years → established", () => expect(experienceTier(8)).toBe("established"));
  it("20 years → established", () => expect(experienceTier(20)).toBe("established"));
});

// ── 2. Personal Baselines ───────────────────────────────────────────────────

describe("Personal Baselines", () => {
  it("returns null baselines with < 3 months data", () => {
    const txs = [makeTx(1, 400000), makeTx(2, 500000)];
    const result = computeBaselines(txs, [], 3000, 10000);
    expect(result.monthlyGCI).toBeNull();
    expect(result.monthsOfData).toBe(2);
  });

  it("computes baselines with 3+ months data", () => {
    const txs = [makeTx(1, 400000), makeTx(2, 500000), makeTx(3, 300000), makeTx(4, 600000)];
    const result = computeBaselines(txs, [], 3000, 10000);
    expect(result.monthlyGCI).not.toBeNull();
    expect(result.monthlyDeals).toBe(1);
    expect(result.monthsOfData).toBe(4);
  });

  it("excludes current month", () => {
    const txs = [makeTx(0, 400000), makeTx(1, 400000), makeTx(2, 400000), makeTx(3, 400000)];
    const result = computeBaselines(txs, [], 0, 0);
    expect(result.monthsOfData).toBe(3);
  });
});

// ── 3. Deviation Detection ──────────────────────────────────────────────────

describe("Deviation Detection", () => {
  it("returns null when baseline is null", () => {
    expect(detectDeviation(5000, null, "monthlyGCI")).toBeNull();
  });

  it("returns null when deviation < 20%", () => {
    expect(detectDeviation(9000, 10000, "monthlyGCI")).toBeNull();
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

  it("suppresses when baseline below minimum", () => {
    expect(detectDeviation(100, 500, "monthlyGCI")).toBeNull();
  });
});

// ── 4. Experience-Based Tone ────────────────────────────────────────────────

describe("Deviation Insights — Tone", () => {
  const belowDev: Deviation = {
    metric: "monthlyGCI", current: 6000, baseline: 10000, pctChange: -40, direction: "below",
  };

  it("early: normalizes", () => {
    const msg = deviationInsight(belowDev, "early");
    expect(msg).toContain("40% below");
    expect(msg).toContain("common");
  });

  it("mid: direct", () => {
    const msg = deviationInsight(belowDev, "mid");
    expect(msg).toContain("40% below");
    expect(msg).toContain("usual level");
  });

  it("established: flags as unusual", () => {
    const msg = deviationInsight(belowDev, "established");
    expect(msg).toContain("40% below");
    expect(msg).toContain("unusual");
  });
});

describe("Prompt Fragment", () => {
  it("returns empty string with no deviations", () => {
    expect(deviationPromptFragment([], "mid")).toBe("");
  });

  it("includes tier and deviations", () => {
    const deviations: Deviation[] = [
      { metric: "monthlyGCI", current: 6000, baseline: 10000, pctChange: -40, direction: "below" },
    ];
    const fragment = deviationPromptFragment(deviations, "established");
    expect(fragment).toContain("established");
    expect(fragment).toContain("monthly GCI: 40% below");
  });
});
