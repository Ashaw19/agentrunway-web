import { describe, it, expect } from "vitest";
import {
  buildScoreTrajectory,
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

describe("buildScoreTrajectory", () => {
  it("empty history + no seed + live → 1 point (no line)", () => {
    const pts = buildScoreTrajectory([], 50, TODAY, null);
    expect(pts).toEqual([{ value: 50, projected: false }]);
  });

  it("empty history + distinct seed + live → 2 points [seed, live]", () => {
    const pts = buildScoreTrajectory([], 50, TODAY, 40);
    expect(pts).toEqual([
      { value: 40, projected: false },
      { value: 50, projected: false },
    ]);
  });

  it("two prior days (both before today) + live → [30,40,50], all actual", () => {
    const hist = [row("2026-06-26", 30), row("2026-06-27", 40)];
    const pts = buildScoreTrajectory(hist, 50, TODAY, null);
    expect(pts).toEqual([
      { value: 30, projected: false },
      { value: 40, projected: false },
      { value: 50, projected: false },
    ]);
    expect(pts.every((p) => p.projected === false)).toBe(true);
  });

  it("history containing today's row → live OVERRIDES today's value", () => {
    const hist = [row("2026-06-27", 30), row(TODAY, 45)];
    const pts = buildScoreTrajectory(hist, 50, TODAY, null);
    expect(pts).toEqual([
      { value: 30, projected: false },
      { value: 50, projected: false },
    ]);
  });

  it("single today-row + live + seed → [seed, live] (today overridden, then seeded to 2)", () => {
    const hist = [row(TODAY, 45)];
    const pts = buildScoreTrajectory(hist, 50, TODAY, 40);
    expect(pts).toEqual([
      { value: 40, projected: false },
      { value: 50, projected: false },
    ]);
  });

  it("single today-row + live + null seed → [live] (1 point)", () => {
    const hist = [row(TODAY, 45)];
    const pts = buildScoreTrajectory(hist, 50, TODAY, null);
    expect(pts).toEqual([{ value: 50, projected: false }]);
  });

  it("15 distinct prior days + live → exactly 12 points (tail kept)", () => {
    const hist: ScoreHistoryPoint[] = [];
    for (let d = 1; d <= 15; d++) {
      hist.push(row(`2026-06-${String(d).padStart(2, "0")}`, d)); // all < TODAY (28th), distinct
    }
    const pts = buildScoreTrajectory(hist, 99, TODAY, null);
    expect(pts).toHaveLength(12);
    // 15 history + 1 live = 16 → tail of 12 = scores [5..15, 99]
    expect(pts[0].value).toBe(5);
    expect(pts[10].value).toBe(15);
    expect(pts[11].value).toBe(99);
  });

  it("UNSORTED input still yields ascending output", () => {
    const hist = [row("2026-06-27", 40), row("2026-06-25", 20), row("2026-06-26", 30)];
    const pts = buildScoreTrajectory(hist, 50, TODAY, null);
    expect(pts.map((p) => p.value)).toEqual([20, 30, 40, 50]);
  });
});

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
