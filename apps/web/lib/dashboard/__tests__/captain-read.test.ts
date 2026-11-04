import { describe, expect, it } from "vitest";
import { buildHealthReport } from "@agent-runway/core/engines/health-report";
import { captainReadQuestion, captainReadSentence, goalPaceOpportunityLine } from "../captain-read";
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
