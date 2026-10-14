/**
 * Layer 3: Survival Engine
 * =========================
 * Tests for cash runway calculation and risk classification.
 *
 * Formula: runwayMonths = cashReserve / (monthlyBurn - monthlyIncome)
 * Risk levels: critical (<2), warning (<4), healthy (<6), strong (≥6)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  runwayMonths,
  survivalResult,
  riskLevelFromMonths,
  riskColorBand,
  riskBandPhrase,
  nextRiskBand,
  isFlaggedRiskLevel,
  netMonthlyBurn,
  runwayBasisSentence,
  runwayFlag,
  nextRiskBandSentence,
  RISK_BAND_FLOOR_MONTHS,
  RISK_BAND_LEVELS,
  RISK_BAND_RANGE,
  RISK_BAND_LADDER,
  RISK_LEVEL_LABEL,
  type RiskColorBand,
  type RiskLevel,
} from "../survival-engine";
import { generateAdvisory, ADVISOR_CATEGORY_LABELS, type AdvisorInput } from "../advisor-engine";
import {
  bandColorHexForScore,
  compute as computeRunwayScore,
  stateLabel,
  RUNWAY_SCORE_BANDS,
  type RunwayStateLabel,
} from "../runway-score-engine";
import { buildHealthReport } from "../health-report";
import { TEST_DATE, TEST_TRANSACTIONS } from "./test-data";

// ── runwayMonths ─────────────────────────────────────────────────────────────

describe("runwayMonths", () => {
  it("basic calculation: cash / burn", () => {
    // $15,000 reserve / $1,300 monthly burn = 11.54 months
    expect(runwayMonths(1_300, 15_000, 0)).toBeCloseTo(11.54, 1);
  });

  it("subtracts monthly income from burn", () => {
    // Net burn = 1300 - 500 = 800
    // $15,000 / $800 = 18.75 months
    expect(runwayMonths(1_300, 15_000, 500)).toBeCloseTo(18.75, 2);
  });

  it("caps at 24 months", () => {
    // $100,000 / $100 = 1000 → capped to 24
    expect(runwayMonths(100, 100_000, 0)).toBe(24);
  });

  it("returns 24 when income exceeds burn (net burn ≤ 0)", () => {
    // Income > burn → indefinite runway → 24
    expect(runwayMonths(1_000, 10_000, 2_000)).toBe(24);
  });

  it("returns 0 when burn = income and no cash reserve", () => {
    expect(runwayMonths(1_000, 0, 1_000)).toBe(0);
  });

  it("returns 24 when burn = income but cash > 0", () => {
    // Net burn = 0, cash > 0 → 24
    expect(runwayMonths(1_000, 5_000, 1_000)).toBe(24);
  });

  it("returns 0 when no cash and positive net burn", () => {
    expect(runwayMonths(1_000, 0, 0)).toBe(0);
  });

  it("handles zero burn with cash reserve", () => {
    // burn = 0, income = 0 → net burn = 0, cash > 0 → 24
    expect(runwayMonths(0, 10_000, 0)).toBe(24);
  });
});

// ── riskLevelFromMonths ──────────────────────────────────────────────────────

describe("riskLevelFromMonths", () => {
  it("critical when < 2 months", () => {
    expect(riskLevelFromMonths(0)).toBe("critical");
    expect(riskLevelFromMonths(1)).toBe("critical");
    expect(riskLevelFromMonths(1.9)).toBe("critical");
  });

  it("warning when 2–3.9 months", () => {
    expect(riskLevelFromMonths(2)).toBe("warning");
    expect(riskLevelFromMonths(3)).toBe("warning");
    expect(riskLevelFromMonths(3.9)).toBe("warning");
  });

  it("healthy when 4–5.9 months", () => {
    expect(riskLevelFromMonths(4)).toBe("healthy");
    expect(riskLevelFromMonths(5)).toBe("healthy");
    expect(riskLevelFromMonths(5.9)).toBe("healthy");
  });

  it("strong when ≥ 6 months", () => {
    expect(riskLevelFromMonths(6)).toBe("strong");
    expect(riskLevelFromMonths(12)).toBe("strong");
    expect(riskLevelFromMonths(24)).toBe("strong");
  });
});

// ── Band wording ─────────────────────────────────────────────────────────────
// What a surface prints about a band comes from here, so a sentence cannot
// name an edge the classification does not use (the business report PDF once
// called both healthy and strong "the recommended 4–6+ month safety buffer").

describe("band wording", () => {
  it("names the edges riskLevelFromMonths classifies on", () => {
    // The first month, in steps of 0.01, at which each level is returned.
    const firstMonthAt = (level: string) => {
      for (let hundredths = 0; hundredths <= 2400; hundredths++) {
        if (riskLevelFromMonths(hundredths / 100) === level) return hundredths / 100;
      }
      return null;
    };
    expect(firstMonthAt("critical")).toBe(0);
    expect(firstMonthAt("warning")).toBe(RISK_BAND_FLOOR_MONTHS.warning);
    expect(firstMonthAt("healthy")).toBe(RISK_BAND_FLOOR_MONTHS.healthy);
    expect(firstMonthAt("strong")).toBe(RISK_BAND_FLOOR_MONTHS.strong);
  });

  it("gives each level its range in months", () => {
    expect(RISK_BAND_RANGE).toEqual({
      critical: "under 2 months",
      warning: "2–4 months",
      healthy: "4–6 months",
      strong: "6+ months",
    });
  });

  it("states the four bands in one sentence", () => {
    expect(RISK_BAND_LADDER).toBe("Under 2 months is critical, 2–4 is warning, 4–6 is healthy, 6+ is strong.");
  });

  it("has one word for each level", () => {
    expect(RISK_LEVEL_LABEL).toEqual({
      critical: "Critical",
      warning: "Warning",
      healthy: "Healthy",
      strong: "Strong",
      notConfigured: "Not Set",
    });
  });
});

// ── One runway, placed in its band ───────────────────────────────────────────
// Until 2026-10-13 the dashboard alert, the advisor card, the Scenarios note,
// the Reports card and the public metric page each typed their own edges (1,
// 3, 4 and 5 months), so a 2.5-month runway was badged Warning and alerted as
// "critically low". These are the sentences those surfaces print now.

describe("where one runway sits", () => {
  it("lists the four bands lowest first", () => {
    expect(RISK_BAND_LEVELS).toEqual(["critical", "warning", "healthy", "strong"]);
    // Lowest first means each band classifies below the one after it.
    const floors = [0, RISK_BAND_FLOOR_MONTHS.warning, RISK_BAND_FLOOR_MONTHS.healthy, RISK_BAND_FLOOR_MONTHS.strong];
    expect(floors.map(riskLevelFromMonths)).toEqual([...RISK_BAND_LEVELS]);
  });

  it("says which range a level is, in the engine's label and range", () => {
    expect(riskBandPhrase("critical")).toBe("in the Critical range (under 2 months)");
    expect(riskBandPhrase("warning")).toBe("in the Warning range (2–4 months)");
    expect(riskBandPhrase("healthy")).toBe("in the Healthy range (4–6 months)");
    expect(riskBandPhrase("strong")).toBe("in the Strong range (6+ months)");
    for (const level of RISK_BAND_LEVELS) {
      expect(riskBandPhrase(level)).toBe(`in the ${RISK_LEVEL_LABEL[level]} range (${RISK_BAND_RANGE[level]})`);
    }
  });

  it("names the band above and the month it starts at", () => {
    expect(nextRiskBand("critical")).toEqual({ level: "warning", fromMonths: RISK_BAND_FLOOR_MONTHS.warning });
    expect(nextRiskBand("warning")).toEqual({ level: "healthy", fromMonths: RISK_BAND_FLOOR_MONTHS.healthy });
    expect(nextRiskBand("healthy")).toEqual({ level: "strong", fromMonths: RISK_BAND_FLOOR_MONTHS.strong });
    expect(nextRiskBand("strong")).toBeNull();
    expect(nextRiskBand("notConfigured")).toBeNull();
  });

  it("the band above starts exactly where the classification changes", () => {
    for (const level of RISK_BAND_LEVELS) {
      const next = nextRiskBand(level);
      if (!next) continue;
      expect(riskLevelFromMonths(next.fromMonths)).toBe(next.level);
      expect(riskLevelFromMonths(next.fromMonths - 0.01)).toBe(level);
    }
  });
});

// ── Which runways a surface flags ────────────────────────────────────────────

describe("flagged runways", () => {
  it("flags the bands under Healthy and no others", () => {
    const levels: RiskLevel[] = ["critical", "warning", "healthy", "strong", "notConfigured"];
    expect(levels.filter(isFlaggedRiskLevel)).toEqual(["critical", "warning"]);
  });

  // Brokerage fee 500 + recurring 2,000 = 2,500 a month.
  const at = (cash: number, pipelineIncome = 0) => survivalResult(500, 2_000, cash, pipelineIncome);

  it("a 2.5-month runway is flagged as Warning, the word on its badge", () => {
    const flag = runwayFlag(at(6_250));
    expect(flag?.level).toBe("warning");
    expect(flag?.title).toBe("Cash runway is in the Warning range (2–4 months)");
    expect(flag?.body).toBe(`Your cash covers 2.5 months of monthly costs. ${RISK_BAND_LADDER}`);
  });

  it("a runway under the Warning floor is flagged as Critical", () => {
    const flag = runwayFlag(at(3_000));
    expect(flag?.level).toBe("critical");
    expect(flag?.title).toBe("Cash runway is in the Critical range (under 2 months)");
    expect(flag?.body).toBe(`Your cash covers 1.2 months of monthly costs. ${RISK_BAND_LADDER}`);
  });

  it("the flag's level is always the engine's level for that runway", () => {
    for (let cash = 0; cash <= 20_000; cash += 250) {
      const result = at(cash);
      const flag = runwayFlag(result);
      if (result.months < RISK_BAND_FLOOR_MONTHS.healthy) {
        expect(flag?.level, `${result.label}`).toBe(result.riskLevel);
        expect(flag?.title).toContain(RISK_LEVEL_LABEL[result.riskLevel]);
      } else {
        expect(flag, `${result.label}`).toBeNull();
      }
    }
  });

  it("a Healthy or Strong runway is not flagged (4.5 months used to be 'getting thin')", () => {
    expect(runwayFlag(at(10_000))).toBeNull(); // exactly 4.0
    expect(runwayFlag(at(11_250))).toBeNull(); // 4.5
    expect(runwayFlag(at(30_000))).toBeNull(); // 12.0
  });

  it("nothing is flagged before a reserve or costs are entered", () => {
    expect(runwayFlag(survivalResult(0, 0, 0, 0))).toBeNull();
    expect(runwayFlag(survivalResult(0, 0, 0, 1_000))).toBeNull();
  });

  it("under one month reads 'less than 1 month', not a decimal", () => {
    expect(runwayFlag(at(1_000))?.body).toBe(`Your cash covers less than 1 month of monthly costs. ${RISK_BAND_LADDER}`);
    expect(runwayFlag(at(0))?.body).toBe(`Your cash covers less than 1 month of monthly costs. ${RISK_BAND_LADDER}`);
  });

  it("says so when the months are after pipeline income", () => {
    // 4,500 ÷ (2,500 − 1,000) = 3.0 months; 4,500 ÷ 2,500 would be 1.8.
    const flag = runwayFlag(at(4_500, 1_000));
    expect(flag?.level).toBe("warning");
    expect(flag?.body).toBe(
      `Your cash covers 3.0 months of monthly costs, after the income estimated from your pipeline. ${RISK_BAND_LADDER}`,
    );
  });

  it("gives no instruction and uses no em dash", () => {
    for (const result of [at(0), at(1_000), at(3_000), at(6_250), at(4_500, 1_000)]) {
      const flag = runwayFlag(result);
      const text = `${flag?.title} ${flag?.body}`;
      expect(text).not.toMatch(/critically|getting thin|time to|close some|should|must|need to|consider/i);
      expect(text).not.toContain("—");
    }
  });
});

// ── What the month count is made of ──────────────────────────────────────────
// The months are cash ÷ (burn − pipeline income). A sentence that gives only
// the cash and the burn describes a different division whenever there is
// pipeline.

describe("what the figure is worked out from", () => {
  const at = (cash: number, pipelineIncome = 0) => survivalResult(500, 2_000, cash, pipelineIncome);

  it("net burn is the burn less pipeline income, never below zero", () => {
    expect(netMonthlyBurn(at(7_500))).toBe(2_500);
    expect(netMonthlyBurn(at(7_500, 1_000))).toBe(1_500);
    expect(netMonthlyBurn(at(7_500, 4_000))).toBe(0);
  });

  it("the months are the cash over the net burn", () => {
    for (const result of [at(7_500), at(7_500, 1_000), at(3_000, 500)]) {
      expect(result.months).toBeCloseTo(result.cashReserve / netMonthlyBurn(result), 10);
    }
  });

  it("with no pipeline income, names the cash and the burn", () => {
    expect(runwayBasisSentence(at(7_500))).toBe("Based on your cash reserve of $7,500 and a monthly burn rate of $2,500.");
  });

  it("with pipeline income, names it too", () => {
    const result = at(7_500, 1_000);
    expect(result.label).toBe("5.0 months"); // not 7,500 ÷ 2,500 = 3.0
    expect(runwayBasisSentence(result)).toBe(
      "Based on your cash reserve of $7,500 and a monthly burn rate of $2,500, less an estimated $1,000 a month of pipeline income.",
    );
  });

  it("before anything is entered, names no pipeline income", () => {
    expect(runwayBasisSentence(survivalResult(0, 0, 0, 1_000))).toBe(
      "Based on your cash reserve of $0 and a monthly burn rate of $0.",
    );
  });

  it("what the band above takes, at this burn", () => {
    expect(nextRiskBandSentence(at(3_000))).toBe(
      "The Warning range starts at 2 months: $5,000 of cash at your burn of $2,500 a month.",
    );
    expect(nextRiskBandSentence(at(6_250))).toBe(
      "The Healthy range starts at 4 months: $10,000 of cash at your burn of $2,500 a month.",
    );
    expect(nextRiskBandSentence(at(11_250))).toBe(
      "The Strong range starts at 6 months: $15,000 of cash at your burn of $2,500 a month.",
    );
  });

  it("what the band above takes is measured on the net burn when there is pipeline income", () => {
    expect(nextRiskBandSentence(at(4_500, 1_000))).toBe(
      "The Healthy range starts at 4 months: $6,000 of cash at your net burn of $1,500 a month.",
    );
  });

  it("says nothing about a band above at the top, with nothing entered, or with no net burn", () => {
    expect(nextRiskBandSentence(at(30_000))).toBeNull();
    expect(nextRiskBandSentence(survivalResult(0, 0, 0, 0))).toBeNull();
    expect(nextRiskBandSentence(at(7_500, 4_000))).toBeNull();
  });
});

// ── Advisor card ─────────────────────────────────────────────────────────────

describe("advisor card: low cash runway", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TEST_DATE);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function cardAt(survivalMonths: number) {
    const input: AdvisorInput = {
      transactions: TEST_TRANSACTIONS,
      pipelineDeals: [],
      goalGCI: 0,
      splitPreset: "p100_0",
      seasonalWeights: [0.25, 0.25, 0.25, 0.25],
      expensesYTD: 0,
      expensesRemaining: 0,
      projectedYearEndGCI: 200_000,
      marketYoYGrowth: 0,
      benchmarkPercentile: 50,
      survivalMonths,
      capIsConfigured: false,
      hasHitCap: false,
      gciRemainingToCap: 0,
      postCapAgentPct: 0,
    };
    return generateAdvisory(input, 50).find((c) => c.category === "survivalWarning");
  }

  it("appears for exactly the runways the engine flags", () => {
    for (let tenths = 0; tenths <= 80; tenths++) {
      const months = tenths / 10;
      const expected = isFlaggedRiskLevel(riskLevelFromMonths(months));
      expect(Boolean(cardAt(months)), `${months} months`).toBe(expected);
    }
  });

  it("a 3.5-month runway is Warning on its badge, so it gets the card (it did not under the old 3-month cut-off)", () => {
    expect(cardAt(3.5)).toBeDefined();
    expect(cardAt(4)).toBeUndefined();
  });

  it("gives the runway, its band and where the next one starts, from the engine", () => {
    expect(cardAt(2.5)?.evidence).toEqual([
      "Current runway: 2.5 months",
      "Warning range: 2–4 months",
      "Healthy starts at 4 months",
    ]);
    expect(cardAt(1)?.evidence).toEqual([
      "Current runway: 1.0 months",
      "Critical range: under 2 months",
      "Warning starts at 2 months",
    ]);
  });

  it("states no recommended minimum of its own", () => {
    for (const months of [0, 1, 2.5, 3.9]) {
      expect(cardAt(months)?.evidence.join(" ")).not.toMatch(/recommended|3–6/i);
    }
  });

  it("is not shown before a reserve or costs are entered", () => {
    expect(cardAt(-1)).toBeUndefined();
    expect(cardAt(Number.NaN)).toBeUndefined();
  });

  it("its category is not named after one band", () => {
    // The card covers Critical and Warning runways alike.
    expect(ADVISOR_CATEGORY_LABELS.survivalWarning).toBe("Cash Runway");
  });
});

// ── Runway Score: the Survival sub-score follows these bands ─────────────────
// The Survival bar is drawn beside the Cash Runway number (dashboard, Reports,
// the report PDF, the phone). The bar is coloured by its 0–100 score on the
// Runway Score's bands; the number by riskColorBand. One runway, one colour:
// until 2026-10-13 a runway from 2 to under 3 months was a red bar (30, At
// Risk) beside an amber Warning number.

describe("Runway Score Survival sub-score", () => {
  const report = buildHealthReport(120_000, 200_000, 0.75, 40_000, 39_600);
  const survivalScoreAt = (months: number) =>
    computeRunwayScore(report, 50, months).components.find((c) => c.label === "Survival")!.score;

  /** The Runway Score band drawn in each of the cash runway's colours. */
  const SCORE_BAND_IN_COLOUR: Record<RiskColorBand, RunwayStateLabel | null> = {
    red: "At Risk",
    amber: "Building",
    emerald: "Strong",
    slate: null, // not configured: no runway to colour
  };

  /** Every hundredth of a month from 0 to the 24-month cap. */
  const EVERY_HUNDREDTH = Array.from({ length: 2401 }, (_, i) => i / 100);

  it("the two colour tables use the same red, amber and green", () => {
    // What makes "the same band" mean "the same colour": Tailwind's red-500,
    // amber-500 and emerald-500, the shades the runway number is drawn in.
    const hexOf = (label: RunwayStateLabel) => RUNWAY_SCORE_BANDS.stateLabel.find((b) => b.label === label)?.hex;
    expect(hexOf("At Risk")).toBe("#EF4444");
    expect(hexOf("Building")).toBe("#F59E0B");
    expect(hexOf("Strong")).toBe("#10B981");
  });

  it.each(RISK_BAND_LEVELS)("a %s runway's Survival score is in the score band of the runway's own colour", (level) => {
    const expected = SCORE_BAND_IN_COLOUR[riskColorBand(level)];
    const months = EVERY_HUNDREDTH.filter((m) => riskLevelFromMonths(m) === level);
    expect(months.length).toBeGreaterThan(0);
    const wrong = months
      .filter((m) => stateLabel(survivalScoreAt(m)) !== expected)
      .map((m) => `${m} months scores ${survivalScoreAt(m)} (${stateLabel(survivalScoreAt(m))}), expected ${expected}`);
    expect(wrong.slice(0, 3)).toEqual([]);
  });

  it("the score steps up at each band's floor", () => {
    for (const floor of Object.values(RISK_BAND_FLOOR_MONTHS)) {
      expect(survivalScoreAt(floor), `${floor} months`).toBeGreaterThan(survivalScoreAt(floor - 0.01));
    }
  });

  it("its top step starts where the Strong band does, so 'Strong scores highest on Survival' is true", () => {
    const top = survivalScoreAt(24);
    expect(survivalScoreAt(RISK_BAND_FLOOR_MONTHS.strong)).toBe(top);
    expect(survivalScoreAt(RISK_BAND_FLOOR_MONTHS.strong - 0.01)).toBeLessThan(top);
  });

  it("no cash reserve or costs entered scores a missing-data penalty, not a band", () => {
    // survivalResult's sentinel. The number beside the bar reads "Not set".
    const notSet = survivalResult(0, 0, 0);
    expect(notSet.riskLevel).toBe("notConfigured");
    expect(survivalScoreAt(notSet.months)).toBe(35);
    expect(bandColorHexForScore(survivalScoreAt(notSet.months))).toBe("#EF4444");
  });
});

// ── riskColorBand (single semantic color contract, spec §9.1/§9.5) ───────────

describe("riskColorBand", () => {
  it("critical → red (concern)", () => {
    expect(riskColorBand("critical")).toBe("red");
  });

  it("warning → amber (watch)", () => {
    expect(riskColorBand("warning")).toBe("amber");
  });

  it("healthy → amber (watch, NOT emerald — 4–<6mo is not yet strong)", () => {
    // The reconciliation: 4–<6mo cash runway is a watch band, not top-tier.
    expect(riskColorBand("healthy")).toBe("amber");
  });

  it("strong → emerald (genuine strength, 6mo+)", () => {
    expect(riskColorBand("strong")).toBe("emerald");
  });

  it("notConfigured → slate (no data)", () => {
    expect(riskColorBand("notConfigured")).toBe("slate");
  });

  it("agrees with riskLevelFromMonths across the month ladder", () => {
    // <2mo critical → red, 2–<4mo warning → amber, 4–<6mo healthy → amber,
    // 6mo+ strong → emerald. The whole 2–<6mo span is amber (watch).
    expect(riskColorBand(riskLevelFromMonths(1))).toBe("red");
    expect(riskColorBand(riskLevelFromMonths(3))).toBe("amber");
    expect(riskColorBand(riskLevelFromMonths(4.2))).toBe("amber");
    expect(riskColorBand(riskLevelFromMonths(5.9))).toBe("amber");
    expect(riskColorBand(riskLevelFromMonths(6))).toBe("emerald");
  });
});

// ── survivalResult (full result with test agent data) ────────────────────────

describe("survivalResult", () => {
  it("computes test agent survival (monthly brokerage $500, recurring $800, cash $15,000)", () => {
    // burn = 500 + 800 = 1300
    // months = 15000 / 1300 = 11.538...
    const result = survivalResult(500, 800, 15_000, 0);
    expect(result.monthlyBurn).toBe(1_300);
    expect(result.monthlyIncome).toBe(0);
    expect(result.cashReserve).toBe(15_000);
    expect(result.months).toBeCloseTo(11.54, 1);
    expect(result.riskLevel).toBe("strong"); // 11.54 ≥ 6
    expect(result.label).toContain("months");
  });

  it("with pipeline monthly income reduces net burn", () => {
    // burn = 1300, income = 500
    // net burn = 800, months = 15000/800 = 18.75
    const result = survivalResult(500, 800, 15_000, 500);
    expect(result.months).toBeCloseTo(18.75, 2);
    expect(result.riskLevel).toBe("strong");
  });

  it("returns critical for very low cash", () => {
    // cash = $1,000, burn = $1,300 → 0.77 months
    const result = survivalResult(500, 800, 1_000, 0);
    expect(result.months).toBeCloseTo(0.77, 1);
    expect(result.riskLevel).toBe("critical");
  });

  it("returns 24+ label for capped result", () => {
    const result = survivalResult(10, 0, 100_000, 0);
    expect(result.months).toBe(24);
    expect(result.label).toBe("24+ months");
  });
});
