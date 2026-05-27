/**
 * Layer 1: GCI Computation Helpers
 * =================================
 * Tests for computeGCI, computeAgentGross, computeTxFees,
 * computeProbability, computeEstimatedGCI, computeWeightedGCI.
 *
 * Every expected value is hand-calculated and annotated.
 */

import { describe, it, expect } from "vitest";
import {
  computeGCI,
  computeAgentGross,
  computeTxFees,
  computeProbability,
  computeEstimatedGCI,
  computeWeightedGCI,
  getAgentPct,
  getBrokeragePct,
  PIPELINE_STAGE_DEFAULTS,
} from "../../types/database";
import type { Transaction, PipelineDeal, SplitPreset } from "../../types/database";
import {
  TEST_TRANSACTIONS,
  TEST_PIPELINE,
  EXPECTED_GCI,
  EXPECTED_PIPELINE,
} from "./test-data";

// ── computeGCI ───────────────────────────────────────────────────────────────

describe("computeGCI", () => {
  it("computes basic GCI: sale_price × commission_pct", () => {
    // Tx1: $450,000 × 2.5% = $11,250
    expect(computeGCI(TEST_TRANSACTIONS[0])).toBe(EXPECTED_GCI.tx1);
  });

  it("computes GCI for a different sale price", () => {
    // Tx2: $380,000 × 2.5% = $9,500
    expect(computeGCI(TEST_TRANSACTIONS[1])).toBe(EXPECTED_GCI.tx2);
  });

  it("applies team_split_pct when set", () => {
    // Tx4: $600,000 × 2.5% × 0.5 = $7,500
    expect(computeGCI(TEST_TRANSACTIONS[3])).toBe(EXPECTED_GCI.tx4);
  });

  it("uses gci_override when set (bypasses sale_price × commission)", () => {
    // Tx5: gci_override = $15,000 (sale_price $720,000 is ignored)
    const tx = TEST_TRANSACTIONS[4];
    expect(tx.gci_override).toBe(15_000);
    expect(computeGCI(tx)).toBe(EXPECTED_GCI.tx5);
  });

  it("ignores team_split_pct when gci_override is set", () => {
    // If both override and team split exist, override wins
    const tx = {
      ...TEST_TRANSACTIONS[4],
      team_split_pct: 0.5,
    } as Transaction;
    expect(computeGCI(tx)).toBe(15_000); // override, not 15000 × 0.5
  });

  it("treats null team_split_pct as 100%", () => {
    // Tx1 has no team split → full GCI
    expect(TEST_TRANSACTIONS[0].team_split_pct).toBeNull();
    expect(computeGCI(TEST_TRANSACTIONS[0])).toBe(11_250);
  });

  it("treats team_split_pct = 0 as 100% (no split)", () => {
    const tx = { ...TEST_TRANSACTIONS[0], team_split_pct: 0 } as Transaction;
    // Code: team_split_pct > 0 → false, so returns raw
    expect(computeGCI(tx)).toBe(11_250);
  });

  it("sums all 6 transactions to expected YTD total", () => {
    const total = TEST_TRANSACTIONS.reduce(
      (sum, tx) => sum + computeGCI(tx),
      0,
    );
    expect(total).toBe(EXPECTED_GCI.total); // $66,375
  });

  it("returns 0 for zero sale price and no override", () => {
    const tx = { ...TEST_TRANSACTIONS[0], sale_price: 0, gci_override: null } as Transaction;
    expect(computeGCI(tx)).toBe(0);
  });
});

// ── Split Presets ────────────────────────────────────────────────────────────

describe("Split Presets", () => {
  it("maps all 7 presets to correct agent percentages", () => {
    const expected: Record<SplitPreset, number> = {
      p70_30: 0.7,
      p75_25: 0.75,
      p80_20: 0.8,
      p85_15: 0.85,
      p90_10: 0.9,
      p95_5: 0.95,
      p100_0: 1.0,
    };
    for (const [preset, pct] of Object.entries(expected)) {
      expect(getAgentPct(preset as SplitPreset)).toBe(pct);
    }
  });

  it("agent + brokerage percentages sum to 1.0 for all presets", () => {
    const presets: SplitPreset[] = [
      "p70_30", "p75_25", "p80_20", "p85_15", "p90_10", "p95_5", "p100_0",
    ];
    for (const preset of presets) {
      expect(getAgentPct(preset) + getBrokeragePct(preset)).toBeCloseTo(1.0, 10);
    }
  });
});

// ── computeAgentGross ────────────────────────────────────────────────────────

describe("computeAgentGross", () => {
  it("applies basic 80/20 split below cap threshold", () => {
    // $66,375 GCI with p80_20, cap at $100k
    // Below cap: agent = 66375 × 0.8 = $53,100
    const result = computeAgentGross(66_375, "p80_20", 100_000, 0.95);
    expect(result.agentGross).toBe(53_100);
    expect(result.brokerageTake).toBeCloseTo(13_275, 2); // 66375 × 0.2
  });

  it("applies post-cap split when GCI exceeds cap threshold", () => {
    // $120,000 GCI, p80_20, $100k cap, 95% post-cap
    // Pre-cap: $100,000 × 0.8 = $80,000
    // Post-cap: ($120,000 - $100,000) × 0.95 = $19,000
    // Agent gross: $80,000 + $19,000 = $99,000
    const result = computeAgentGross(120_000, "p80_20", 100_000, 0.95);
    expect(result.agentGross).toBe(99_000);
    expect(result.brokerageTake).toBe(120_000 - 99_000); // $21,000
  });

  it("ignores cap when threshold is 0", () => {
    // No cap configured — pure split
    const result = computeAgentGross(120_000, "p80_20", 0, 0.95);
    expect(result.agentGross).toBeCloseTo(96_000, 2);
    expect(result.brokerageTake).toBeCloseTo(24_000, 2);
  });

  it("100% split means agent keeps everything", () => {
    const result = computeAgentGross(50_000, "p100_0", 0, 1.0);
    expect(result.agentGross).toBe(50_000);
    expect(result.brokerageTake).toBe(0);
  });

  it("handles GCI exactly at cap threshold", () => {
    // At exactly the cap: pre-cap only
    const result = computeAgentGross(100_000, "p80_20", 100_000, 0.95);
    // totalGCI > postCapThreshold is false (100k is NOT > 100k), so basic split
    expect(result.agentGross).toBeCloseTo(80_000, 2);
    expect(result.brokerageTake).toBeCloseTo(20_000, 2);
  });

  it("handles GCI just above cap threshold", () => {
    const result = computeAgentGross(100_001, "p80_20", 100_000, 0.95);
    // Pre-cap: 100,000 × 0.8 = 80,000
    // Post-cap: 1 × 0.95 = 0.95
    expect(result.agentGross).toBeCloseTo(80_000.95, 2);
  });

  it("agent gross + brokerage take always equals total GCI", () => {
    const scenarios = [
      { gci: 50_000, preset: "p70_30" as SplitPreset, cap: 0, postPct: 0.9 },
      { gci: 120_000, preset: "p80_20" as SplitPreset, cap: 100_000, postPct: 0.95 },
      { gci: 200_000, preset: "p85_15" as SplitPreset, cap: 150_000, postPct: 1.0 },
      { gci: 0, preset: "p80_20" as SplitPreset, cap: 100_000, postPct: 0.95 },
    ];
    for (const s of scenarios) {
      const result = computeAgentGross(s.gci, s.preset, s.cap, s.postPct);
      expect(result.agentGross + result.brokerageTake).toBeCloseTo(s.gci, 10);
    }
  });
});

// ── computeTxFees ────────────────────────────────────────────────────────────

describe("computeTxFees", () => {
  it("computes basic tx fee: GCI × rate", () => {
    // $66,375 × 2% = $1,327.50
    expect(computeTxFees(66_375, 0.02, 3_000)).toBe(1_327.50);
  });

  it("caps tx fee at annual maximum", () => {
    // $200,000 × 2% = $4,000, but cap is $3,000
    expect(computeTxFees(200_000, 0.02, 3_000)).toBe(3_000);
  });

  it("does not cap when cap is 0 (disabled)", () => {
    // $200,000 × 2% = $4,000, cap = 0 → no cap
    expect(computeTxFees(200_000, 0.02, 0)).toBe(4_000);
  });

  it("returns 0 for zero GCI", () => {
    expect(computeTxFees(0, 0.02, 3_000)).toBe(0);
  });

  it("returns exact cap when fee equals cap", () => {
    // $150,000 × 2% = $3,000 = cap → $3,000
    expect(computeTxFees(150_000, 0.02, 3_000)).toBe(3_000);
  });
});

// ── Pipeline Deal Helpers ────────────────────────────────────────────────────

describe("Pipeline Deal Computations", () => {
  describe("computeProbability", () => {
    it("returns stage default when no override", () => {
      expect(computeProbability(TEST_PIPELINE[0])).toBe(0.10); // lead
      expect(computeProbability(TEST_PIPELINE[1])).toBe(0.75); // conditional
      expect(computeProbability(TEST_PIPELINE[2])).toBe(0.90); // firm
    });

    it("uses probability_override when set", () => {
      const deal = { ...TEST_PIPELINE[0], probability_override: 0.42 } as PipelineDeal;
      expect(computeProbability(deal)).toBe(0.42);
    });

    it("clamps override to [0, 1]", () => {
      const high = { ...TEST_PIPELINE[0], probability_override: 1.5 } as PipelineDeal;
      expect(computeProbability(high)).toBe(1.0);

      const low = { ...TEST_PIPELINE[0], probability_override: -0.2 } as PipelineDeal;
      expect(computeProbability(low)).toBe(0);
    });

    it("covers all 6 pipeline stage defaults", () => {
      // Canonical default-probability map — shared between web engine,
      // pipeline-forecast engine, and mobile `apps/mobile/app/(app)/deals.tsx`
      // + `apps/mobile/app/(app)/profile/forecast.tsx`. If you change any
      // value here, every surface picks it up automatically. See audit
      // red flag #4 (memory/project_mobile_parity_audit_2026-05-26.md).
      expect(PIPELINE_STAGE_DEFAULTS.lead).toBe(0.1);
      expect(PIPELINE_STAGE_DEFAULTS.showing).toBe(0.25);
      expect(PIPELINE_STAGE_DEFAULTS.offer).toBe(0.5);
      expect(PIPELINE_STAGE_DEFAULTS.conditional).toBe(0.75);
      expect(PIPELINE_STAGE_DEFAULTS.firm).toBe(0.9);
      expect(PIPELINE_STAGE_DEFAULTS.closed).toBe(1.0);
    });

    it("has a probability for every PipelineStage (shape completeness)", () => {
      const allStages: Array<keyof typeof PIPELINE_STAGE_DEFAULTS> = [
        "lead",
        "showing",
        "offer",
        "conditional",
        "firm",
        "closed",
      ];
      for (const stage of allStages) {
        const prob = PIPELINE_STAGE_DEFAULTS[stage];
        expect(typeof prob).toBe("number");
        expect(prob).toBeGreaterThanOrEqual(0);
        expect(prob).toBeLessThanOrEqual(1);
      }
      expect(Object.keys(PIPELINE_STAGE_DEFAULTS).length).toBe(allStages.length);
    });
  });

  describe("computeEstimatedGCI", () => {
    it("computes estimated_price × estimated_commission_pct", () => {
      expect(computeEstimatedGCI(TEST_PIPELINE[0])).toBe(12_500); // 500k × 2.5%
      expect(computeEstimatedGCI(TEST_PIPELINE[1])).toBe(16_250); // 650k × 2.5%
      expect(computeEstimatedGCI(TEST_PIPELINE[2])).toBe(10_500); // 420k × 2.5%
    });
  });

  describe("computeWeightedGCI", () => {
    it("computes estimated GCI × probability for each deal", () => {
      expect(computeWeightedGCI(TEST_PIPELINE[0])).toBe(EXPECTED_PIPELINE.deal1.weighted); // $1,250
      expect(computeWeightedGCI(TEST_PIPELINE[1])).toBe(EXPECTED_PIPELINE.deal2.weighted); // $12,187.50
      expect(computeWeightedGCI(TEST_PIPELINE[2])).toBe(EXPECTED_PIPELINE.deal3.weighted); // $9,450
    });

    it("sums to expected total weighted GCI", () => {
      const total = TEST_PIPELINE.reduce(
        (sum, deal) => sum + computeWeightedGCI(deal),
        0,
      );
      expect(total).toBe(EXPECTED_PIPELINE.totalWeighted); // $22,887.50
    });
  });
});
