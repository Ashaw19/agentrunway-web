/**
 * REGRESSION — Captain's "[SEASONAL COMMISSION PATTERN]" tax-intel line
 * describes the quarter today is in (2026-10-13).
 *
 * projection-engine's `currentQuarter()` is 0-based (0 = Q1 .. 3 = Q4). The
 * chat route read it as 1-based in this one block:
 *
 *   engineSeasonalWeights[currentQ - 1]     index -1 in Q1 (never fired
 *                                           Jan-Mar), last quarter's weight
 *                                           the rest of the year
 *   Math.floor(m / 3) + 1 === currentQ      last quarter's deals
 *   `Q${currentQ}`                          last quarter's number
 *
 * So in August Captain was handed Q2's weight and Q2's deal count as "this
 * quarter", labelled Q2, and in Q1 the line never appeared. These tests pin
 * the quarter from a date so the index base can't drift again.
 */
import { describe, expect, it } from "vitest";
import { validateTaxCopy } from "@agent-runway/core/tax-copy";
import { seasonalCommissionPatternLine, seasonalQuarterStats } from "../seasonal-tax-intel";

/** Noon on a calendar day, the shape atlanticNoon() hands the chat route. */
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0, 0);
const tx = (...dates: string[]) => dates.map((date) => ({ date }));

// Distinct per quarter so a neighbouring quarter's weight is visible.
const WEIGHTS = [0.1, 0.2, 0.3, 0.4];

// One deal in Q1, two in Q2, three in Q3, four in Q4.
const DEALS_BY_QUARTER = tx(
  "2026-02-10",
  "2026-04-20", "2026-06-30",
  "2026-07-01", "2026-08-15", "2026-09-30",
  "2026-10-01", "2026-10-09", "2026-11-20", "2026-12-31",
);

describe("seasonalQuarterStats — the quarter today is in", () => {
  it.each([
    { label: "Q1", today: day(2026, 1, 1), quarter: 1, weight: 0.1, deals: 1 },
    { label: "Q1", today: day(2026, 3, 31), quarter: 1, weight: 0.1, deals: 1 },
    { label: "Q2", today: day(2026, 4, 1), quarter: 2, weight: 0.2, deals: 2 },
    { label: "Q2", today: day(2026, 6, 30), quarter: 2, weight: 0.2, deals: 2 },
    { label: "Q3", today: day(2026, 7, 1), quarter: 3, weight: 0.3, deals: 3 },
    { label: "Q3", today: day(2026, 9, 30), quarter: 3, weight: 0.3, deals: 3 },
    { label: "Q4", today: day(2026, 10, 1), quarter: 4, weight: 0.4, deals: 4 },
    { label: "Q4", today: day(2026, 12, 31), quarter: 4, weight: 0.4, deals: 4 },
  ])("$label on $today → its own weight and deals", ({ today, quarter, weight, deals }) => {
    expect(seasonalQuarterStats(today, WEIGHTS, DEALS_BY_QUARTER)).toEqual({ quarter, weight, deals });
  });

  it("a close on the first day of a quarter counts in that quarter, not the one before", () => {
    const stats = seasonalQuarterStats(day(2026, 10, 13), WEIGHTS, tx("2026-09-30", "2026-10-01"));
    expect(stats.deals).toBe(1);
  });
});

describe("seasonalCommissionPatternLine", () => {
  const base = { projectedGCI: 200_000, effectiveRate: 0.25, perDealSetAside: 4_000 };

  it("fires in a heavy Q1 (it never did: the weight was read at index -1)", () => {
    const line = seasonalCommissionPatternLine({
      ...base,
      today: day(2026, 2, 14),
      seasonalWeights: [0.4, 0.2, 0.2, 0.2],
      ytdTx: tx("2026-01-12", "2026-02-03"),
    });
    expect(line).toContain("Q1 seasonal weight: 40% of annual.");
    expect(line).toContain("Agent closed 2 deals in Q1.");
  });

  it("in August a heavy Q2 is not reported as this quarter", () => {
    // Q2 carries 45% and has three closes; Q3 (now) carries 20% and has none.
    const line = seasonalCommissionPatternLine({
      ...base,
      today: day(2026, 8, 15),
      seasonalWeights: [0.1, 0.45, 0.2, 0.25],
      ytdTx: tx("2026-04-10", "2026-05-20", "2026-06-25"),
    });
    expect(line).toBeNull();
  });

  it("in October reports Q4's weight and Q4's deals, labelled Q4", () => {
    const line = seasonalCommissionPatternLine({
      ...base,
      today: day(2026, 10, 13),
      seasonalWeights: [0.2, 0.2, 0.2, 0.4],
      // Five Q3 closes that must not be counted, two Q4 closes that must.
      ytdTx: tx("2026-07-02", "2026-07-20", "2026-08-05", "2026-08-28", "2026-09-30", "2026-10-01", "2026-10-09"),
    });
    expect(line).toBe(
      "[SEASONAL COMMISSION PATTERN] Q4 seasonal weight: 40% of annual. " +
      "Agent closed 2 deals in Q4. " +
      // 200,000 x 40% x 25%
      "Estimated tax liability on this quarter's projected GCI at marginal rate 25.0%: ~$20,000. " +
      "Per-deal equivalent: $4,000. " +
      "State the math only — describe no action.",
    );
  });

  it("stays quiet at exactly 30% or with a single close in the quarter", () => {
    const today = day(2026, 5, 15);
    expect(seasonalCommissionPatternLine({
      ...base, today, seasonalWeights: [0.2, 0.3, 0.3, 0.2], ytdTx: tx("2026-04-10", "2026-05-01"),
    })).toBeNull();
    expect(seasonalCommissionPatternLine({
      ...base, today, seasonalWeights: [0.1, 0.5, 0.2, 0.2], ytdTx: tx("2026-02-01", "2026-03-01", "2026-05-01"),
    })).toBeNull();
  });

  it("stays quiet when there are no weights for the quarter", () => {
    expect(seasonalCommissionPatternLine({
      ...base, today: day(2026, 2, 14), seasonalWeights: [], ytdTx: tx("2026-01-12", "2026-02-03"),
    })).toBeNull();
  });

  it("is tax information, not advice", () => {
    const line = seasonalCommissionPatternLine({
      ...base,
      today: day(2026, 10, 13),
      seasonalWeights: [0.2, 0.2, 0.2, 0.4],
      ytdTx: tx("2026-10-01", "2026-10-09"),
    });
    expect(line).not.toBeNull();
    expect(validateTaxCopy(line ?? "").filter((d) => d.level === "error")).toEqual([]);
  });
});
