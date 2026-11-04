import { describe, expect, it } from "vitest";
import { buildHealthReport } from "@agent-runway/core/engines/health-report";
import { captainReadQuestion, captainReadSentence, goalPaceOpportunityLine, goalPaceWhy, type GoalPaceWhyInput } from "../captain-read";
import { goalSetToZero } from "@/lib/income-goals";
import { paceStatement, type PaceState } from "../today-zone";

const NOT_BEHIND: PaceState[] = ["on-pace", "ahead", "goal-reached"];

describe("captainReadSentence: Goal Pace as the lowest bar", () => {
  it("calls it a drag when the page says behind", () => {
    expect(captainReadSentence("Goal Pace", false, "behind")).toBe(
      "Goal pace is your biggest drag right now. Closing one pipeline deal moves your score the most.",
    );
    expect(captainReadSentence("Goal Pace", true, "behind")).toContain("adding a prospect");
  });

  it("never calls it a drag, or claims a pace, when the page doesn't say behind", () => {
    for (const state of NOT_BEHIND) {
      for (const empty of [false, true]) {
        const line = captainReadSentence("Goal Pace", empty, state);
        expect(line).not.toMatch(/drag|behind|ahead|on pace/i);
        expect(line).toContain("Goal Pace is your lowest score bar");
      }
    }
  });

  it("doesn't offer an empty pipeline a deal to close", () => {
    for (const state of NOT_BEHIND) {
      const line = captainReadSentence("Goal Pace", true, state);
      expect(line).toContain("adding a prospect");
      expect(line).not.toMatch(/closing|deal you close/i);
    }
  });

  it("speaks to a reached goal", () => {
    expect(captainReadSentence("Goal Pace", false, "goal-reached")).toContain("past your goal");
  });

  it("agrees with the statement for the figures that showed the contradiction", () => {
    // Goal 200,000: 178,625 reads 103% of expected pace, 218,625 reads goal reached.
    const ahead = paceStatement({ goalGCI: 200_000, ytdGCI: 178_625, ytdDealCount: 9, pacePercent: 3 })!;
    const reached = paceStatement({ goalGCI: 200_000, ytdGCI: 218_625, ytdDealCount: 11, pacePercent: 26 })!;
    expect(ahead.state).toBe("ahead");
    expect(reached.state).toBe("goal-reached");
    for (const s of [ahead, reached]) expect(captainReadSentence("Goal Pace", false, s.state)).not.toMatch(/drag/);
  });
});

describe("captainReadSentence: Goal Pace with no goal set", () => {
  it("names the only lever, never a closing or a prospect", () => {
    for (const empty of [false, true]) {
      const line = captainReadSentence("Goal Pace", empty, null);
      expect(line).toContain("Goal Pace is your lowest score bar");
      expect(line).toContain("set an annual goal");
      expect(line).not.toMatch(/closing|deal|prospect|drag/i);
    }
  });

  it("is true of the engine: without a goal the bar doesn't move whatever closes", () => {
    const pace = (ytdGCI: number, goalGCI: number) => buildHealthReport(ytdGCI, goalGCI, 0.8, 0, 10_000).paceScore;
    expect(pace(240_000, 0)).toBe(pace(80_000, 0));
    expect(pace(240_000, 200_000)).not.toBe(pace(80_000, 200_000));
  });
});

describe("goalPaceOpportunityLine: the Reports page's line", () => {
  it("says behind only when behind", () => {
    expect(goalPaceOpportunityLine("behind")).toMatch(/behind/);
    for (const status of ["ahead", "no-goal"] as const) expect(goalPaceOpportunityLine(status)).not.toMatch(/behind/);
  });
  it("names setting a goal as the only lever without one", () => {
    expect(goalPaceOpportunityLine("no-goal")).toContain("set an annual goal");
    expect(goalPaceOpportunityLine("no-goal")).not.toMatch(/closing|deal/i);
  });
});

describe("captainReadSentence: the other bars don't depend on pace", () => {
  it("words them the same in every state", () => {
    for (const label of ["Pipeline", "Expenses", "Benchmark", "Survival"]) {
      const behind = captainReadSentence(label, false, "behind");
      expect(behind).toMatch(/biggest drag/);
      for (const state of [...NOT_BEHIND, null]) expect(captainReadSentence(label, false, state)).toBe(behind);
    }
  });
});

describe("captainReadQuestion", () => {
  const input = { weakestLabel: "Goal Pace", weakestScore: 53, pipelineEmpty: false };

  it("keeps the drag framing when behind", () => {
    expect(captainReadQuestion({ ...input, paceState: "behind" })).toContain("biggest drag is Goal Pace at 53");
  });

  it("states what the page shows when not behind", () => {
    expect(captainReadQuestion({ ...input, paceState: "ahead" })).toContain("I'm ahead of pace on my annual goal.");
    expect(captainReadQuestion({ ...input, paceState: "on-pace" })).toContain("I'm on pace for my annual goal.");
    expect(captainReadQuestion({ ...input, paceState: "goal-reached" })).toContain("I've already reached my annual goal.");
    for (const state of NOT_BEHIND) {
      const q = captainReadQuestion({ ...input, paceState: state });
      expect(q).not.toMatch(/drag/);
      expect(q).toContain("Goal Pace is my lowest Runway Score bar at 53 out of 100.");
    }
  });

  it("says no goal is set and asks about the goal, not a lever that can't move the bar", () => {
    for (const pipelineEmpty of [false, true]) {
      const q = captainReadQuestion({ ...input, weakestScore: 50, pipelineEmpty, paceState: null });
      expect(q).toContain("Goal Pace is my lowest Runway Score bar at 50 out of 100.");
      expect(q).toContain("I have no annual goal set");
      expect(q).toContain("how do I set it?");
      expect(q).not.toMatch(/drag|fastest lever/);
    }
  });

  it("still notes an empty pipeline", () => {
    expect(captainReadQuestion({ ...input, pipelineEmpty: true, paceState: "ahead" })).toContain("My pipeline is empty right now.");
  });

  it("keeps the drag framing for other bars and the plain question without a score", () => {
    expect(captainReadQuestion({ ...input, weakestLabel: "Pipeline", weakestScore: 40, paceState: "ahead" })).toContain("biggest drag is Pipeline at 40");
    expect(captainReadQuestion({ weakestLabel: null, weakestScore: null, pipelineEmpty: false, paceState: null })).toBe(
      "What is the single fastest lever I can pull this month to move my Runway Score?",
    );
  });
});

describe("a year deliberately set to $0", () => {
  it("is a row saying 0, not a year with no row", () => {
    expect(goalSetToZero([{ year: 2026, goal_gci: 0 }], 2026)).toBe(true);
    expect(goalSetToZero([{ year: 2026, goal_gci: "0" }], 2026)).toBe(true);
    expect(goalSetToZero([], 2026)).toBe(false);
    expect(goalSetToZero([{ year: 2027, goal_gci: 0 }], 2026)).toBe(false);
    expect(goalSetToZero([{ year: 2026, goal_gci: 150_000 }], 2026)).toBe(false);
  });

  it("states the fact and pushes no goal, in the line, the question and on Reports", () => {
    const line = captainReadSentence("Goal Pace", false, null, true);
    expect(line).toContain("set to $0");
    expect(line).not.toMatch(/set an annual goal|in Settings/i);
    const question = captainReadQuestion({ weakestLabel: "Goal Pace", weakestScore: 50, pipelineEmpty: false, paceState: null, goalIsZero: true });
    expect(question).toContain("on purpose");
    expect(question).not.toMatch(/what goal|how do i set/i);
    expect(goalPaceOpportunityLine("no-goal", true)).toContain("set to $0");
    expect(goalPaceOpportunityLine("no-goal", true)).not.toMatch(/set an annual goal/i);
  });

  it("leaves an unset year's nudge alone", () => {
    expect(captainReadSentence("Goal Pace", false, null)).toContain("set an annual goal");
    expect(captainReadQuestion({ weakestLabel: "Goal Pace", weakestScore: 50, pipelineEmpty: false, paceState: null })).toContain("What goal would fit");
  });
});

describe("goalPaceWhy: the Weekly Business Brief's reason", () => {
  const base: GoalPaceWhyInput = {
    paceState: "behind", goalIsZero: false, paceScore: 30, closedDeals: 5, avgDealSize: 16_400,
    projectedGCI: 90_000, goalGCI: 100_000,
  };

  it("calls it a drag only when the page says behind", () => {
    expect(goalPaceWhy(base)).toMatch(/primary drag/);
    for (const paceState of NOT_BEHIND) expect(goalPaceWhy({ ...base, paceState })).not.toMatch(/drag/);
  });

  it("is true of the figures that showed the contradiction: slightly ahead, projection above goal", () => {
    const line = goalPaceWhy({ ...base, paceState: "ahead", paceScore: 53, projectedGCI: 112_500 });
    expect(line).toContain("lowest score bar");
    expect(line).toContain("$12,500 above");
    expect(line).not.toMatch(/drag|trajectory/);
  });

  it("speaks to a reached goal without a projection", () => {
    const line = goalPaceWhy({ ...base, paceState: "goal-reached", paceScore: 80 });
    expect(line).toContain("already reached");
    expect(line).not.toMatch(/projected/);
  });

  it("doesn't invent an average for an agent with no closed deals", () => {
    const line = goalPaceWhy({ ...base, closedDeals: 0, avgDealSize: 0 });
    expect(line).not.toMatch(/closed deal|average/);
    expect(line).toContain("Projected year-end GCI");
  });

  it("tells a $0 year from an unset one", () => {
    expect(goalPaceWhy({ ...base, paceState: null, goalGCI: 0, goalIsZero: true })).toContain("set to $0");
    expect(goalPaceWhy({ ...base, paceState: null, goalGCI: 0 })).toContain("No annual goal is set");
  });
});
