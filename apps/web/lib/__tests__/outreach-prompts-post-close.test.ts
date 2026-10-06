/**
 * Review-request and referral-ask prompts: time since closing.
 *
 * Flight Control drafts these on a fixed cadence (21 and 45 days after
 * close), so the prompts say "about 3 weeks" / "about 6 weeks". The CRM
 * client panel can now draft them on demand for any closed deal, so the
 * on-demand path passes the real number of days and the prompt has to say
 * it. Called without it (the cron path), the text is unchanged.
 */

import { describe, expect, it } from "vitest";
import {
  buildReferralAskPrompt,
  buildReviewRequestPrompt,
  timeSinceClosingLabel,
} from "@/lib/outreach-prompts";

describe("timeSinceClosingLabel", () => {
  it.each([
    [3, "a few days"],
    [7, "about a week"],
    [16, "about 2 weeks"],
    [57, "about 8 weeks"],
    [60, "about 2 months"],
    [584, "about 19 months"],
    [900, "about 2 years"],
  ])("%i days → %s", (days, label) => {
    expect(timeSinceClosingLabel(days)).toBe(label);
  });
});

describe("buildReviewRequestPrompt", () => {
  it("keeps the Flight Control cadence wording when no gap is passed", () => {
    expect(buildReviewRequestPrompt("Andrew", "Sam", "12 Elm St"))
      .toContain("It's been about 3 weeks since closing — experience is still fresh");
  });

  it("states the real gap for an older deal and drops 'still fresh'", () => {
    const p = buildReviewRequestPrompt("Andrew", "Sam", "12 Elm St", "friendly", "buyer", 400);
    expect(p).toContain("It's been about 13 months since closing");
    expect(p).not.toContain("3 weeks");
    expect(p).not.toContain("still fresh");
  });
});

describe("buildReferralAskPrompt", () => {
  it("keeps the Flight Control cadence wording when no gap is passed", () => {
    const p = buildReferralAskPrompt("Andrew", "Sam", "12 Elm St", "friendly", "seller");
    expect(p).toContain("about 6 weeks after closing");
    expect(p).toContain("Client sold their property 6 weeks ago");
  });

  it("states the real gap for an older deal", () => {
    const p = buildReferralAskPrompt("Andrew", "Sam", "12 Elm St", "friendly", "seller", 900);
    expect(p).toContain("about 2 years after closing");
    expect(p).toContain("Client sold their property about 2 years ago");
    expect(p).not.toContain("6 weeks");
  });
});
