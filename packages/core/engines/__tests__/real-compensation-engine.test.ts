// RealCompensationEngine tests — the per-deal REAL waterfall.
//
// Fixture economics used throughout (solo full-cap defaults):
//   company dollar = 15% of GCI, cap $15,000 → cap crossed at $100,000 GCI
//   pre-cap agent 85%, post-cap agent 100%
//   post-cap fee $375 → $175 after $9,000 cumulative (Elite)
//   CBR $40/deal · BEOP $1,200 over first 3 deals · sign-up $249 (year 1)

import { describe, expect, it } from "vitest";
import {
  aggregateRealComp,
  anniversaryWindow,
  computeRealCompensation,
  simulateRealCompensation,
  type RealCompSettings,
} from "../real-compensation-engine";
import { createTestSettings } from "./test-data";

/** Solo full-cap REAL agent, joined 2026-07-10 (mirrors a mid-year switcher). */
function realSettings(overrides: Partial<RealCompSettings> = {}): RealCompSettings {
  return {
    ...createTestSettings({
      comp_plan: "real",
      real_join_date: "2026-07-10",
    }),
    ...overrides,
  };
}

function deal(date: string, gci: number, id?: string) {
  return { date, gci, id };
}

describe("anniversaryWindow", () => {
  it("anchors the window on the join date", () => {
    expect(anniversaryWindow("2026-07-10", "2026-07-13")).toEqual({
      start: "2026-07-10",
      end: "2027-07-10",
      yearIndex: 0,
    });
  });

  it("rolls to the next anniversary year", () => {
    expect(anniversaryWindow("2026-07-10", "2027-08-01")).toEqual({
      start: "2027-07-10",
      end: "2028-07-10",
      yearIndex: 1,
    });
  });

  it("treats the anniversary day itself as the new year", () => {
    expect(anniversaryWindow("2026-07-10", "2027-07-10").yearIndex).toBe(1);
  });

  it("clamps asOf before join to year 0", () => {
    expect(anniversaryWindow("2026-07-10", "2026-01-01").yearIndex).toBe(0);
  });

  it("falls back to the calendar year without a join date", () => {
    expect(anniversaryWindow(null, "2026-07-13")).toEqual({
      start: "2026-01-01",
      end: "2027-01-01",
      yearIndex: 0,
    });
  });

  it("clamps a Feb-29 join date on non-leap anniversaries", () => {
    expect(anniversaryWindow("2024-02-29", "2025-03-01").start).toBe("2025-02-28");
  });
});

describe("computeRealCompensation — pre-cap basics", () => {
  it("splits a single pre-cap deal at the pre-cap rate and charges CBR + BEOP + sign-up", () => {
    const res = computeRealCompensation(realSettings(), [deal("2026-08-01", 10_000)], "2026-09-01");
    const d = res.deals[0];
    expect(d.preCapGci).toBeCloseTo(10_000, 6);
    expect(d.postCapGci).toBe(0);
    expect(d.companyDollar).toBeCloseTo(1_500, 6);
    expect(d.agentShare).toBeCloseTo(8_500, 6);
    expect(d.fees.cbr).toBe(40);
    expect(d.fees.beop).toBeCloseTo(400, 6); // 1200 / 3
    expect(d.fees.signup).toBe(249); // first deal, anniversary year 1
    expect(d.fees.postCap).toBe(0);
    expect(d.agentNet).toBeCloseTo(8_500 - 40 - 400 - 249, 6);
  });

  it("charges BEOP on only the first 3 deals of the anniversary year", () => {
    const deals = [1, 2, 3, 4].map((i) => deal(`2026-08-0${i}`, 10_000));
    const res = computeRealCompensation(realSettings(), deals, "2026-09-01");
    expect(res.deals.map((d) => d.fees.beop)).toEqual([400, 400, 400, 0]);
  });

  it("charges the sign-up fee once, and only in anniversary year 1", () => {
    // First in-app deal lands in year 2 → never charged.
    const res = computeRealCompensation(
      realSettings(),
      [deal("2027-08-01", 10_000)],
      "2027-09-01",
    );
    expect(res.deals[0].fees.signup).toBe(0);
  });

  it("tracks cap state without any deals (seed only)", () => {
    const res = computeRealCompensation(
      realSettings({ real_cap_paid_seed: 6_000 }),
      [],
      "2026-09-01",
    );
    expect(res.capState.capPaid).toBe(6_000);
    expect(res.capState.capRemaining).toBe(9_000);
    expect(res.capState.capped).toBe(false);
    expect(res.capState.anniversaryStart).toBe("2026-07-10");
  });
});

describe("computeRealCompensation — cap flip and straddle", () => {
  it("prorates the deal that straddles the cap", () => {
    // Seed cap to $14,000 → $1,000 room. Deal GCI $10,000 wants $1,500.
    // Pre-cap portion = 1000 / 0.15 = $6,666.67; post-cap = $3,333.33.
    const res = computeRealCompensation(
      realSettings({ real_cap_paid_seed: 14_000 }),
      [deal("2026-08-01", 10_000)],
      "2026-09-01",
    );
    const d = res.deals[0];
    expect(d.companyDollar).toBeCloseTo(1_000, 6);
    expect(d.preCapGci).toBeCloseTo(6_666.6667, 3);
    expect(d.postCapGci).toBeCloseTo(3_333.3333, 3);
    expect(d.agentShare).toBeCloseTo(6_666.6667 * 0.85 + 3_333.3333 * 1.0, 2);
    expect(d.fees.postCap).toBe(375); // any post-cap portion pays the full flat fee
    expect(res.capState.capped).toBe(true);
    expect(res.capState.cappedOnDate).toBe("2026-08-01");
  });

  it("pays fully-post-cap deals at the post-cap split with the flat fee and no company dollar", () => {
    const res = computeRealCompensation(
      realSettings({ real_cap_paid_seed: 15_000 }),
      [deal("2026-08-01", 10_000)],
      "2026-09-01",
    );
    const d = res.deals[0];
    expect(d.preCapGci).toBe(0);
    expect(d.postCapGci).toBe(10_000);
    expect(d.companyDollar).toBe(0);
    expect(d.agentShare).toBeCloseTo(10_000, 6); // solo keeps 100% post-cap
    expect(d.fees.postCap).toBe(375);
  });

  it("caps exactly at $100k GCI across sequential deals", () => {
    // 10 deals × $10,000 GCI = $100,000 → company dollar exactly $15,000.
    const deals = Array.from({ length: 10 }, (_, i) =>
      deal(`2026-0${8 + Math.floor(i / 5)}-${String((i % 5) * 5 + 1).padStart(2, "0")}`, 10_000),
    );
    const res = computeRealCompensation(realSettings(), deals, "2027-01-01");
    expect(res.capState.capPaid).toBeCloseTo(15_000, 6);
    expect(res.capState.capped).toBe(true);
    expect(res.deals.every((d) => d.postCapGci === 0)).toBe(true); // 10th deal exactly fills the cap
  });
});

describe("computeRealCompensation — Elite threshold", () => {
  it("drops to the elite fee only AFTER cumulative post-cap fees reach the threshold", () => {
    // Capped from the start; 24 deals × $375 = $9,000 → deal 25 pays $175.
    const deals = Array.from({ length: 25 }, (_, i) => {
      const month = String(8 + Math.floor(i / 28)).padStart(2, "0");
      const day = String((i % 28) + 1).padStart(2, "0");
      return deal(`2026-${month}-${day}`, 5_000);
    });
    const res = computeRealCompensation(
      realSettings({ real_cap_paid_seed: 15_000 }),
      deals,
      "2026-12-01",
    );
    const fees = res.deals.map((d) => d.fees.postCap);
    expect(fees.slice(0, 24).every((f) => f === 375)).toBe(true);
    expect(fees[24]).toBe(175);
    expect(res.capState.eliteActive).toBe(true);
  });

  it("honours the post-cap-fees seed for Elite state", () => {
    const res = computeRealCompensation(
      realSettings({ real_cap_paid_seed: 15_000, real_post_cap_fees_paid_seed: 9_000 }),
      [deal("2026-08-01", 5_000)],
      "2026-09-01",
    );
    expect(res.deals[0].fees.postCap).toBe(175);
  });
});

describe("computeRealCompensation — mixed year and anniversary reset", () => {
  it("pays pre-join deals at the legacy split with no fees", () => {
    // split_preset p80_20 in the fixture → 80%.
    const res = computeRealCompensation(
      realSettings(),
      [deal("2026-03-01", 10_000), deal("2026-08-01", 10_000)],
      "2026-09-01",
    );
    const [legacy, real] = res.deals;
    expect(legacy.preJoin).toBe(true);
    expect(legacy.agentShare).toBeCloseTo(8_000, 6);
    expect(legacy.agentNet).toBeCloseTo(8_000, 6);
    expect(legacy.companyDollar).toBe(0);
    expect(real.preJoin).toBe(false);
    expect(real.agentShare).toBeCloseTo(8_500, 6);
  });

  it("resets cap, BEOP, and Elite at the anniversary boundary — sign-up is not recharged", () => {
    const res = computeRealCompensation(
      realSettings(),
      [deal("2026-08-01", 400_000), deal("2027-08-01", 10_000)],
      "2027-09-01",
    );
    const [y1, y2] = res.deals;
    // Year 1 deal blows through the cap ($60k wanted vs $15k cap).
    expect(y1.companyDollar).toBeCloseTo(15_000, 6);
    expect(y1.postCapGci).toBeGreaterThan(0);
    expect(y1.fees.signup).toBe(249);
    // Year 2 deal starts a fresh cap: fully pre-cap again, BEOP recharged, no sign-up.
    expect(y2.preCapGci).toBeCloseTo(10_000, 6);
    expect(y2.fees.beop).toBeCloseTo(400, 6);
    expect(y2.fees.signup).toBe(0);
    // Cap state reflects the CURRENT anniversary year (year 2).
    expect(res.capState.anniversaryStart).toBe("2027-07-10");
    expect(res.capState.capPaid).toBeCloseTo(1_500, 6);
    expect(res.capState.capped).toBe(false);
  });

  it("applies seeds only to the anniversary year containing asOf", () => {
    // Seed belongs to year 2 (asOf 2027-09); the year-1 deal must not see it.
    const res = computeRealCompensation(
      realSettings({ real_cap_paid_seed: 14_000 }),
      [deal("2026-08-01", 10_000)],
      "2027-09-01",
    );
    expect(res.deals[0].postCapGci).toBe(0); // year 1 unseeded → fully pre-cap
    expect(res.capState.anniversaryStart).toBe("2027-07-10");
    expect(res.capState.capPaid).toBe(14_000); // current year = seed only
  });

  it("reports current-window cap state when deals exist only in the current window (no join date)", () => {
    const settings = realSettings({ real_join_date: null });
    const res = computeRealCompensation(settings, [deal("2026-08-01", 10_000)], "2026-09-01");
    expect(res.capState.anniversaryStart).toBe("2026-01-01");
    expect(res.capState.capPaid).toBeCloseTo(1_500, 6);
  });
});

describe("aggregateRealComp", () => {
  it("filters by window and derives the effective split", () => {
    const settings = realSettings();
    const res = computeRealCompensation(
      settings,
      [deal("2026-03-01", 10_000), deal("2026-08-01", 10_000)],
      "2026-09-01",
    );
    // Calendar-2026 window includes both; effective pct blends legacy + REAL − fees.
    const all = aggregateRealComp(settings, res, "2026-01-01", "2027-01-01");
    expect(all.dealCount).toBe(2);
    expect(all.gci).toBe(20_000);
    const expectedNet = 8_000 + (8_500 - 40 - 400 - 249);
    expect(all.agentNet).toBeCloseTo(expectedNet, 6);
    expect(all.effectiveAgentPct).toBeCloseTo(expectedNet / 20_000, 6);

    // Window that excludes the legacy deal.
    const realOnly = aggregateRealComp(settings, res, "2026-07-01", "2027-01-01");
    expect(realOnly.dealCount).toBe(1);
    expect(realOnly.gci).toBe(10_000);
  });

  it("falls back to the pre-cap split on an empty window", () => {
    const settings = realSettings();
    const res = computeRealCompensation(settings, [], "2026-09-01");
    const agg = aggregateRealComp(settings, res);
    expect(agg.effectiveAgentPct).toBe(0.85);
    expect(agg.agentNet).toBe(0);
  });
});

describe("simulateRealCompensation", () => {
  it("matches the per-deal engine on a uniform pre-cap year", () => {
    const settings = realSettings();
    // 5 uniform deals of $10k in year 1, sign-up charged.
    const sim = simulateRealCompensation(settings, {
      annualGci: 50_000,
      dealCount: 5,
      isYearOne: true,
    });
    const perDeal = computeRealCompensation(
      settings,
      Array.from({ length: 5 }, (_, i) => deal(`2026-08-0${i + 1}`, 10_000)),
      "2026-12-01",
    );
    const agg = aggregateRealComp(settings, perDeal, "2026-07-10", "2027-07-10");
    expect(sim.agentNet).toBeCloseTo(agg.agentNet, 4);
    expect(sim.effectiveAgentPct).toBeCloseTo(agg.effectiveAgentPct, 6);
  });

  it("models the cap flip analytically", () => {
    const settings = realSettings();
    const sim = simulateRealCompensation(settings, { annualGci: 200_000, dealCount: 20 });
    // Company dollar capped at 15k → pre-cap GCI 100k @85% + post-cap 100k @100%.
    expect(sim.agentShare).toBeCloseTo(100_000 * 0.85 + 100_000, 2);
    // Post-cap deals ≈ 10 → 10 × $375 (below Elite threshold) + CBR 20×40 + BEOP 1200.
    expect(sim.fees).toBeCloseTo(10 * 375 + 800 + 1_200, 2);
  });

  it("returns the pre-cap split as effective pct for empty input", () => {
    const sim = simulateRealCompensation(realSettings(), { annualGci: 0, dealCount: 0 });
    expect(sim.effectiveAgentPct).toBe(0.85);
    expect(sim.agentNet).toBe(0);
  });
});
