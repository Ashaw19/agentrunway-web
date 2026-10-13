/**
 * AI layer for the colour of a Runway Score sub-score (2026-10-13).
 *
 * The mobile breakdown sheet, the business report PDF, the weekly digest
 * email and the Reports page each coloured the score or its components their
 * own way. They now all read the engine's bands, so some colours changed that
 * day with no change in any score (runway-sub-score-colour-canonical.test.ts).
 *
 * Flight Crew answers "why is this bar a different colour" from the Runway
 * Score playbook. This file holds the playbook to the engine's table, and
 * checks that the question reaches it.
 */
import { describe, expect, it } from "vitest";
import { RUNWAY_SCORE_BANDS } from "@agent-runway/core/engines/runway-score-engine";
import { getPlaybook } from "@/lib/troubleshooting-playbooks";
import { classifyTopicMulti } from "@/lib/troubleshooting-classifier";

/** The word an agent would use for each of the engine's four colours. */
const COLOUR_NAME: Record<string, string> = {
  "#10B981": "green",
  "#3B5EF6": "blue",
  "#F59E0B": "amber",
  "#EF4444": "red",
};

const playbook = getPlaybook("runway-score");

/** The one paragraph that states the colours. */
const colours = playbook.split("\n").find((line) => line.startsWith("**Colours**")) ?? "";

/** The one paragraph that says what changed. */
const changed = playbook.split("\n").find((line) => /^Changed 2026-10-13: until then four places coloured/.test(line)) ?? "";

describe("Runway Score playbook: the colour of the score and its components", () => {
  it("gives each band the colour the engine gives it", () => {
    expect(colours).not.toBe("");
    for (const band of RUNWAY_SCORE_BANDS.stateLabel) {
      expect(COLOUR_NAME[band.hex], band.hex).toBeDefined();
      expect(colours).toContain(`${band.label} is ${COLOUR_NAME[band.hex]}`);
    }
  });

  it("says a component is coloured by its own sub-score, on the same bands", () => {
    expect(colours).toMatch(/each of its five component sub-scores take the colour of the band the number is in/);
    expect(colours).toMatch(/coloured by its own sub-score, not by the overall score/);
  });

  it("names every surface that draws them", () => {
    for (const surface of ["dashboard", "Reports page", "business report PDF", "weekly digest email", "mobile app"]) {
      expect(colours, surface).toContain(surface);
    }
  });

  it("says gold is the overall score's and never a component's", () => {
    expect(colours).toMatch(/Gold is only the overall score's gauge when the score is Strong/);
    expect(colours).toMatch(/A component bar is never gold/);
  });

  it("types no band edge of its own beside the colours", () => {
    // The edges are in the label table above it, which the engine's tests pin.
    expect(colours).not.toMatch(/\d/);
  });
});

describe("Runway Score playbook: what changed on 2026-10-13", () => {
  it("names each surface's old cut-offs, so an agent's before and after can be explained", () => {
    expect(changed).not.toBe("");
    expect(changed).toMatch(/mobile breakdown sheet cut at 75 \/ 50 \/ 30/);
    expect(changed).toMatch(/business report PDF cut at 80 \/ 60 \/ 40/);
    expect(changed).toMatch(/weekly digest email coloured the overall score green from 80, amber from 60 and red below/);
    expect(changed).toMatch(/Reports page drew a component of 81 or more in gold/);
  });

  it("says no score moved, and that an old PDF or email keeps its colours", () => {
    expect(changed).toMatch(/No score moved, only its colour/);
    expect(changed).toMatch(/exported or an email received before that date shows the old colours/);
  });

  it("reads without em dashes", () => {
    expect(`${colours}\n${changed}`).not.toMatch(/—/);
  });
});

describe("a question about a score's colour reaches the Runway Score playbook", () => {
  it.each([
    "Why is my Runway Score blue in this week's email? It was amber last week",
    "My Pipeline score is green on my phone and blue on the dashboard",
    "why did the bars in my score breakdown change colour",
    "The Expenses bar in my score breakdown on Reports used to be gold",
    "is my survival score supposed to be red",
  ])("%s", (question) => {
    const topics = classifyTopicMulti(question).map((t) => t.topic);
    expect(topics.slice(0, 2)).toContain("runway-score");
  });
});
