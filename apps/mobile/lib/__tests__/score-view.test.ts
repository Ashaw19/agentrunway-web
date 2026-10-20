/**
 * What the score badge and the score sheet show (lib/score-view.ts), worked
 * out from the saved snapshot, the history row it is compared with, and
 * today. Days are YYYY-MM-DD strings; the snapshot's save time is built from
 * the phone's own clock (new Date(y, m, d, h)) so every run reads the same
 * local day.
 */
import { describe, expect, it } from "vitest";
import { scoreView } from "../score-view";

// The phone's clock is Atlantic (a late evening save is already the next UTC
// day there); each test file runs in its own worker, so this stays here.
process.env.TZ = "America/Halifax";

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

const COMPONENTS = [
  { label: "Goal Pace", score: 22, weight: 0.35 },
  { label: "Pipeline", score: 48, weight: 0.3 },
  { label: "Expenses", score: 61, weight: 0.15 },
  { label: "Benchmark", score: 6, weight: 0.05 },
  { label: "Survival", score: 12, weight: 0.15 },
];

const snapshot = (over: Record<string, unknown> = {}) => ({
  score: 34,
  grade: "F",
  stateLabel: "At Risk" as const,
  month: "2026-10",
  components: COMPONENTS,
  updated_at: at(2026, 10, 19),
  ...over,
});

describe("scoreView", () => {
  it("is null with no snapshot, or a score that can't be read", () => {
    expect(scoreView(null, null, "2026-10-19")).toBeNull();
    expect(scoreView(undefined, null, "2026-10-19")).toBeNull();
    expect(scoreView(snapshot({ score: Number.NaN }), null, "2026-10-19")).toBeNull();
  });

  it("reads the saved score: the band colour, the grade, the label, the five parts and the lowest", () => {
    const view = scoreView(snapshot(), { captured_on: "2026-10-12", score: 37 }, "2026-10-19");
    expect(view).toMatchObject({
      score: 34,
      color: "#EF4444",
      grade: "F",
      stateLabel: "At Risk",
      trend: { delta: 3, direction: "down" },
      asOf: null,
    });
    expect(view?.components.map((c) => [c.label, c.part, c.score])).toEqual([
      ["Goal Pace", "pace", 22],
      ["Pipeline", "pipeline", 48],
      ["Expenses", "expenses", 61],
      ["Benchmark", "bench", 6],
      ["Survival", "survival", 12],
    ]);
    expect(view?.lowest).toMatchObject({ label: "Benchmark", part: "bench", score: 6 });
  });

  it("takes the grade and label from the engine when the snapshot predates them", () => {
    const view = scoreView(
      { score: 76, month: "2026-10" } as Parameters<typeof scoreView>[0],
      null,
      "2026-10-19",
    );
    expect(view).toMatchObject({ score: 76, grade: "B", stateLabel: "On Track", color: "#3B5EF6", trend: null, asOf: null });
    expect(view?.components).toEqual([]);
    expect(view?.lowest).toBeNull();
  });

  it("keeps a part the phone has no name for, by the engine's label", () => {
    const view = scoreView(snapshot({ components: [{ label: "Cash Flow", score: 40, weight: 0.1 }] }), null, "2026-10-19");
    expect(view?.components).toEqual([{ label: "Cash Flow", part: null, score: 40 }]);
    expect(view?.lowest).toEqual({ label: "Cash Flow", part: null, score: 40 });
  });

  describe("the trend", () => {
    it("compares a row 7 days older than the day the score was saved, and not a row 6 days older", () => {
      expect(scoreView(snapshot(), { captured_on: "2026-10-12", score: 30 }, "2026-10-19")?.trend)
        .toEqual({ delta: 4, direction: "up" });
      expect(scoreView(snapshot(), { captured_on: "2026-10-13", score: 30 }, "2026-10-19")?.trend).toBeNull();
    });

    it("counts the save day as the phone's calendar day, the one the store looked the row up by", () => {
      // 10:30 pm on the phone is already the next UTC day behind UTC. By the
      // UTC date the save is Oct 20 and a row from Oct 13 would be 7 days older.
      const lateSave = snapshot({ updated_at: at(2026, 10, 19, 22, 30) });
      expect(scoreView(lateSave, { captured_on: "2026-10-13", score: 30 }, "2026-10-19")?.trend).toBeNull();
      expect(scoreView(lateSave, { captured_on: "2026-10-12", score: 30 }, "2026-10-19")?.trend)
        .toEqual({ delta: 4, direction: "up" });
    });

    it("is null when the snapshot has no save time", () => {
      expect(scoreView(snapshot({ updated_at: undefined }), { captured_on: "2026-10-01", score: 30 }, "2026-10-19")?.trend)
        .toBeNull();
    });

    it("is null with no compare row, or when nothing changed", () => {
      expect(scoreView(snapshot(), null, "2026-10-19")?.trend).toBeNull();
      expect(scoreView(snapshot(), { captured_on: "2026-10-01", score: 34 }, "2026-10-19")?.trend).toBeNull();
    });
  });

  describe("as of", () => {
    it("names the save day once it is 4 days old", () => {
      expect(scoreView(snapshot({ updated_at: at(2026, 10, 15) }), null, "2026-10-19")?.asOf).toBe("2026-10-15");
    });

    it("says nothing at 3 days, or with no save time", () => {
      expect(scoreView(snapshot({ updated_at: at(2026, 10, 16) }), null, "2026-10-19")?.asOf).toBeNull();
      expect(scoreView(snapshot({ updated_at: undefined }), null, "2026-10-19")?.asOf).toBeNull();
    });
  });
});
