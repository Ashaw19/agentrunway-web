/**
 * The weekly digest email colours the Runway Score with the engine's bands
 * (2026-10-13).
 *
 * The badge used a ladder of its own, 80 / 60 with no blue: emerald from 80,
 * amber from 60, red below. The dashboard draws the same score on the
 * engine's bands (81 / 61 / 41), so a 70 was amber in Monday's email and blue
 * on the dashboard, and a 50 was red in the email and amber on the dashboard.
 */
import { describe, expect, it } from "vitest";
import {
  RUNWAY_SCORE_BANDS,
  bandColorHexForScore,
  stateLabel,
} from "@agent-runway/core/engines/runway-score-engine";
import { weeklyDigestEmail, type WeeklyDigestData } from "@/lib/emails/weekly-digest";

function digest(runwayScore: number): WeeklyDigestData {
  return {
    firstName: null,
    weekLabel: "Oct 5 – Oct 11, 2026",
    ytdGCI: 120_000,
    goalGCI: 200_000,
    paceVsGoalPct: 80,
    dealsClosedThisWeek: 1,
    ytdDealsClosed: 12,
    pipelineValue: 40_000,
    pipelineCount: 4,
    outreachReady: 2,
    upcomingTaskCount: 3,
    monthlyExpenses: 2_000,
    runwayGrade: RUNWAY_SCORE_BANDS.grade.find((band) => runwayScore >= band.min)!.glyph,
    runwayStateLabel: stateLabel(runwayScore),
    runwayScore,
  };
}

/** The colour of the badge's glyph: the one thing in the email set at 36px. */
function badgeColour(runwayScore: number): string {
  const { html } = weeklyDigestEmail(digest(runwayScore));
  const glyphs = [...html.matchAll(/font-size:36px;[^"]*?color:(#[0-9A-Fa-f]{6})/g)];
  expect(glyphs).toHaveLength(1);
  return glyphs[0][1];
}

describe("weekly digest email: the Runway Score badge", () => {
  it.each([
    [100, "#10B981"],
    [81, "#10B981"],
    [80, "#3B5EF6"],
    [70, "#3B5EF6"],
    [61, "#3B5EF6"],
    [60, "#F59E0B"],
    [50, "#F59E0B"],
    [41, "#F59E0B"],
    [40, "#EF4444"],
    [0, "#EF4444"],
  ])("a score of %i is %s", (score, hex) => {
    expect(badgeColour(score)).toBe(hex);
  });

  it("is the colour the dashboard gives the same score, at every score", () => {
    for (let score = 0; score <= 100; score++) {
      expect(badgeColour(score), `score ${score}`).toBe(bandColorHexForScore(score));
    }
  });
});
