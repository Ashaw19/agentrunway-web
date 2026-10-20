/**
 * The Runway Score badge and sheet on the phone dashboard (Task 11): the
 * trend tag, "as of <day>", the five parts and the lowest one.
 *
 * Days are YYYY-MM-DD strings; none is made into a Date.
 */
import { describe, expect, it } from "vitest";
import { compute } from "../../engines/runway-score-engine";
import {
  PART_LABELS,
  SCORE_STALE_DAYS,
  SCORE_TREND_DAYS,
  SCORE_TREND_MAX_DAYS,
  lowestPart,
  scoreAsOf,
  scoreTrend,
} from "../next-up/score-badge";

describe("the constants", () => {
  it("compares with a week ago (up to two weeks back) and calls a score stale after 3 days", () => {
    expect(SCORE_TREND_DAYS).toBe(7);
    expect(SCORE_TREND_MAX_DAYS).toBe(14);
    expect(SCORE_STALE_DAYS).toBe(3);
  });
});

describe("scoreTrend", () => {
  const saved = { score: 34, savedOn: "2026-10-19" };

  it("gives the delta when the compare row is 7 days older than the save", () => {
    expect(scoreTrend(saved, { captured_on: "2026-10-12", score: 37 })).toEqual({ delta: 3, direction: "down" });
  });

  it("is null when the compare row is only 6 days older", () => {
    expect(scoreTrend(saved, { captured_on: "2026-10-13", score: 37 })).toBeNull();
  });

  it("takes a row 7 to 14 days older than the save: 'since last week' holds", () => {
    expect(scoreTrend(saved, { captured_on: "2026-10-09", score: 30 })).toEqual({ delta: 4, direction: "up" });
    expect(scoreTrend(saved, { captured_on: "2026-10-05", score: 30 })).toEqual({ delta: 4, direction: "up" });
  });

  it("is null when the compare row is more than 14 days older: no row in the 7 to 14 day window, no tag (fix 8)", () => {
    expect(scoreTrend(saved, { captured_on: "2026-10-04", score: 30 })).toBeNull();
    expect(scoreTrend(saved, { captured_on: "2026-09-01", score: 30 })).toBeNull();
  });

  it("is null when nothing changed", () => {
    expect(scoreTrend(saved, { captured_on: "2026-10-12", score: 34 })).toBeNull();
  });

  it("is null with no compare row", () => {
    expect(scoreTrend(saved, null)).toBeNull();
  });

  it("is null when the save day is unknown", () => {
    expect(scoreTrend({ score: 34, savedOn: null }, { captured_on: "2026-10-12", score: 37 })).toBeNull();
  });

  it("counts the 7 days on the calendar across a month and a year end", () => {
    expect(scoreTrend({ score: 50, savedOn: "2027-01-03" }, { captured_on: "2026-12-27", score: 48 }))
      .toEqual({ delta: 2, direction: "up" });
    expect(scoreTrend({ score: 50, savedOn: "2027-01-03" }, { captured_on: "2026-12-28", score: 48 })).toBeNull();
  });

  it("counts the 14 days on the calendar across a month end", () => {
    expect(scoreTrend({ score: 50, savedOn: "2026-11-03" }, { captured_on: "2026-10-20", score: 48 }))
      .toEqual({ delta: 2, direction: "up" });
    expect(scoreTrend({ score: 50, savedOn: "2026-11-03" }, { captured_on: "2026-10-19", score: 48 })).toBeNull();
  });

  it("gives the size of the change as a positive number either way", () => {
    expect(scoreTrend({ score: 80, savedOn: "2026-10-19" }, { captured_on: "2026-10-10", score: 62 }))
      .toEqual({ delta: 18, direction: "up" });
    expect(scoreTrend({ score: 62, savedOn: "2026-10-19" }, { captured_on: "2026-10-10", score: 80 }))
      .toEqual({ delta: 18, direction: "down" });
  });
});

describe("scoreAsOf", () => {
  it("names the save day when it is 4 days old", () => {
    expect(scoreAsOf("2026-10-15", "2026-10-19")).toBe("2026-10-15");
  });

  it("is null when it is 3 days old", () => {
    expect(scoreAsOf("2026-10-16", "2026-10-19")).toBeNull();
  });

  it("is null when it was saved today, or on a day still to come", () => {
    expect(scoreAsOf("2026-10-19", "2026-10-19")).toBeNull();
    expect(scoreAsOf("2026-10-25", "2026-10-19")).toBeNull();
  });

  it("is null when the save day is unknown", () => {
    expect(scoreAsOf(null, "2026-10-19")).toBeNull();
  });
});

describe("lowestPart", () => {
  const parts = [
    { label: "Goal Pace", score: 22 },
    { label: "Pipeline", score: 48 },
    { label: "Expenses", score: 61 },
    { label: "Benchmark", score: 6 },
    { label: "Survival", score: 12 },
  ];

  it("names Benchmark at 6", () => {
    expect(lowestPart(parts)).toEqual({ part: "Benchmark", score: 6 });
  });

  it("gives a tie to the part that comes first in the engine's order", () => {
    expect(lowestPart([
      { label: "Goal Pace", score: 40 },
      { label: "Pipeline", score: 10 },
      { label: "Expenses", score: 10 },
    ])).toEqual({ part: "Pipeline", score: 10 });
  });

  it("is null with no parts", () => {
    expect(lowestPart([])).toBeNull();
  });

  it("passes over a part whose score can't be read", () => {
    expect(lowestPart([
      { label: "Goal Pace", score: Number.NaN },
      { label: "Pipeline", score: 48 },
    ])).toEqual({ part: "Pipeline", score: 48 });
    expect(lowestPart([{ label: "Goal Pace", score: Number.NaN }])).toBeNull();
  });
});

describe("PART_LABELS", () => {
  it("maps each of the engine's five component labels, in the engine's order", () => {
    const report = {
      score: 50, grade: "D", paceScore: 50, pipelineScore: 50, expenseScore: 50, readinessScore: 50,
      weakestLabel: "", hasEnoughData: true,
    };
    const labels = compute(report, 50, 6).components.map((c) => c.label);
    expect(labels).toEqual(Object.keys(PART_LABELS));
  });

  it("uses the keys of the phone's scoreBar strings", () => {
    expect(PART_LABELS).toEqual({
      "Goal Pace": "pace",
      Pipeline: "pipeline",
      Expenses: "expenses",
      Benchmark: "bench",
      Survival: "survival",
    });
  });
});
