import { describe, it, expect } from "vitest";
import {
  caretDirection,
  priorComponentScores,
  cashRunwayDelta,
  shouldWriteHistoryToday,
  type ScoreHistoryPoint,
} from "../trajectory";

const TODAY = "2026-06-28";

/** Minimal row factory — components/cash default to empty/null. */
function row(
  captured_on: string,
  score: number,
  opts: { components?: { label: string; score: number; weight: number }[]; cash?: number | null } = {},
): ScoreHistoryPoint {
  return {
    captured_on,
    score,
    components: opts.components ?? [],
    cash_runway_months: opts.cash ?? null,
  };
}

describe("caretDirection", () => {
  it.each([
    [50, null, "none"],
    [50, undefined, "none"],
    [50, 40, "up"],
    [40, 50, "down"],
    [50, 50, "flat"],
  ] as const)("(%s, %s) → %s", (current, prior, expected) => {
    expect(caretDirection(current, prior)).toBe(expected);
  });
});

describe("priorComponentScores", () => {
  const comps = (a: number, b: number) => [
    { label: "Goal Pace", score: a, weight: 0.35 },
    { label: "Pipeline", score: b, weight: 0.3 },
  ];

  it("empty history → null", () => {
    expect(priorComponentScores([], TODAY)).toBeNull();
  });

  it("only-today-row → null (today is not a prior)", () => {
    const hist = [row(TODAY, 45, { components: comps(50, 60) })];
    expect(priorComponentScores(hist, TODAY)).toBeNull();
  });

  it("[d1, today] → map from d1", () => {
    const hist = [
      row("2026-06-27", 40, { components: comps(50, 60) }),
      row(TODAY, 45, { components: comps(70, 80) }),
    ];
    const map = priorComponentScores(hist, TODAY);
    expect(map?.get("Goal Pace")).toBe(50);
    expect(map?.get("Pipeline")).toBe(60);
  });

  it("[d1, d2] both before today → map from d2 (latest prior)", () => {
    const hist = [
      row("2026-06-26", 30, { components: comps(11, 12) }),
      row("2026-06-27", 40, { components: comps(21, 22) }),
    ];
    const map = priorComponentScores(hist, TODAY);
    expect(map?.get("Goal Pace")).toBe(21);
    expect(map?.get("Pipeline")).toBe(22);
  });

  it("unsorted input → correct latest-before-today", () => {
    const hist = [
      row("2026-06-27", 40, { components: comps(21, 22) }),
      row("2026-06-26", 30, { components: comps(11, 12) }),
    ];
    const map = priorComponentScores(hist, TODAY);
    expect(map?.get("Goal Pace")).toBe(21);
    expect(map?.get("Pipeline")).toBe(22);
  });
});

describe("cashRunwayDelta", () => {
  it("currentMonths null → null", () => {
    const hist = [row("2026-06-27", 40, { cash: 4.0 })];
    expect(cashRunwayDelta(hist, null, TODAY)).toBeNull();
  });

  it("no prior row → null", () => {
    const hist = [row(TODAY, 45, { cash: 4.0 })];
    expect(cashRunwayDelta(hist, 4.4, TODAY)).toBeNull();
  });

  it("prior cash null → null", () => {
    const hist = [row("2026-06-27", 40, { cash: null })];
    expect(cashRunwayDelta(hist, 4.4, TODAY)).toBeNull();
  });

  it("prior 4.0, current 4.4 → 0.4", () => {
    const hist = [row("2026-06-27", 40, { cash: 4.0 })];
    expect(cashRunwayDelta(hist, 4.4, TODAY)).toBe(0.4);
  });

  it("prior 5.0, current 4.7 → -0.3", () => {
    const hist = [row("2026-06-27", 40, { cash: 5.0 })];
    expect(cashRunwayDelta(hist, 4.7, TODAY)).toBe(-0.3);
  });

  it("prior 4.0, current 4.0 → 0", () => {
    const hist = [row("2026-06-27", 40, { cash: 4.0 })];
    expect(cashRunwayDelta(hist, 4.0, TODAY)).toBe(0);
  });
});

describe("shouldWriteHistoryToday", () => {
  it.each([
    [null, "2026-06-28", true],
    ["2026-06-27", "2026-06-28", true],
    ["2026-06-28", "2026-06-28", false],
    ["2026-06-29", "2026-06-28", false],
  ] as const)("(%s, %s) → %s", (latest, today, expected) => {
    expect(shouldWriteHistoryToday(latest, today)).toBe(expected);
  });
});
