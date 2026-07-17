import { describe, it, expect } from "vitest";
import {
  activePipelineDeals,
  isActivePipelineDeal,
  computeWeightedGCI,
  computeProbability,
  PIPELINE_STAGE_DEFAULTS,
  type PipelineDeal,
} from "../../types/database";

/**
 * Regression suite for the terminal-stage pipeline leak.
 *
 * Closing a deal writes a `transactions` row AND updates the pipeline_deals row
 * to stage='closed' — the row is kept for history, never deleted. Marking a
 * buyer prospect lost (fn_mark_opportunity_lost) keeps the row at stage='lost'.
 *
 * So every surface that aggregates pipeline reads rows in terminal stages, and
 * 'closed' defaults to probability 1.0. Any surface that forgets to filter them
 * counts already-banked GCI a second time, at full value, forever.
 *
 * These tests pin the canonical filter so the drift can't come back.
 */

const deal = (stage: string, price = 400_000): PipelineDeal =>
  ({
    estimated_price: price,
    estimated_commission_pct: 0.025,
    probability_override: null,
    stage,
  }) as unknown as PipelineDeal;

describe("terminal pipeline stages", () => {
  it("closed weights at full value — which is exactly why it must be filtered", () => {
    // If this ever stops being 1.0, the double-count severity changes and the
    // rest of this suite's reasoning needs revisiting.
    expect(PIPELINE_STAGE_DEFAULTS.closed).toBe(1.0);
    expect(computeWeightedGCI(deal("closed"))).toBe(10_000);
  });

  it("lost weights at zero", () => {
    expect(PIPELINE_STAGE_DEFAULTS.lost).toBe(0);
    expect(computeWeightedGCI(deal("lost"))).toBe(0);
  });

  it("isActivePipelineDeal rejects both terminal stages and accepts the live ones", () => {
    expect(isActivePipelineDeal(deal("closed"))).toBe(false);
    expect(isActivePipelineDeal(deal("lost"))).toBe(false);
    for (const stage of ["lead", "showing", "offer", "conditional", "firm"]) {
      expect(isActivePipelineDeal(deal(stage))).toBe(true);
    }
  });

  it("activePipelineDeals strips terminal rows and preserves order of the rest", () => {
    const deals = [
      deal("lead", 100_000),
      deal("closed", 200_000),
      deal("offer", 300_000),
      deal("lost", 400_000),
      deal("firm", 500_000),
    ];
    expect(activePipelineDeals(deals).map((d) => d.estimated_price)).toEqual([
      100_000, 300_000, 500_000,
    ]);
  });

  it("returns every deal when none are terminal, and none when all are", () => {
    expect(activePipelineDeals([deal("lead"), deal("firm")])).toHaveLength(2);
    expect(activePipelineDeals([deal("closed"), deal("lost")])).toHaveLength(0);
    expect(activePipelineDeals([])).toHaveLength(0);
  });

  it("does not double-count a closed deal that is already banked in YTD GCI", () => {
    // The scenario: agent closes one $400k deal. It becomes a transaction worth
    // $10k GCI, and its pipeline_deals row stays behind at stage='closed'.
    const ytdGCI = 10_000; // the transaction the close created
    const pipelineRows = [deal("closed"), deal("offer")];

    const leaked = pipelineRows.reduce((s, d) => s + computeWeightedGCI(d), 0);
    const correct = activePipelineDeals(pipelineRows).reduce(
      (s, d) => s + computeWeightedGCI(d),
      0,
    );

    // Unfiltered, the closed deal's $10k rides along a second time...
    expect(leaked).toBe(15_000);
    expect(ytdGCI + leaked).toBe(25_000); // $10k counted twice

    // ...filtered, only the live $400k @ 50% offer contributes.
    expect(correct).toBe(5_000);
    expect(ytdGCI + correct).toBe(15_000);
  });

  it("an explicit 0 probability_override survives (not treated as missing)", () => {
    // Guards the classic `override || default` falsy bug — a deliberate 0%
    // must stay 0%, not fall back to the stage default.
    const zeroOverride = {
      ...deal("firm"),
      probability_override: 0,
    } as PipelineDeal;
    expect(computeProbability(zeroOverride)).toBe(0);
    expect(computeWeightedGCI(zeroOverride)).toBe(0);
    // ...and it is still an active deal — 0% odds is not a terminal stage.
    expect(isActivePipelineDeal(zeroOverride)).toBe(true);
  });

  it("an unknown stage falls back to lead odds, not a hardcoded 0.5", () => {
    // Several surfaces had drifted to `?? 0.5`. Canonical is the lead default.
    expect(computeProbability(deal("some_future_stage"))).toBe(
      PIPELINE_STAGE_DEFAULTS.lead,
    );
  });
});
