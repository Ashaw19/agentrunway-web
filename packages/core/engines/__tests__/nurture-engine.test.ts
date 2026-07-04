import { describe, expect, it } from "vitest";
import {
  POST_CLOSE_OPPORTUNITY_CONFIGS,
  POST_CLOSE_TEMPLATE,
} from "../nurture-engine";

describe("POST_CLOSE_OPPORTUNITY_CONFIGS", () => {
  it("locks the production-tuned cadence from PR #117", () => {
    expect(POST_CLOSE_OPPORTUNITY_CONFIGS).toEqual([
      { type: "post_close_3", days: 3, lookback: 5 },
      { type: "post_close_14", days: 14, lookback: 7 },
      { type: "post_close_90", days: 90, lookback: 30 },
      { type: "review_request", days: 21, lookback: 10 },
      { type: "referral_ask", days: 45, lookback: 21 },
    ]);
  });

  it("stays within the 35-day stale-row expiry floor used by detect runs", () => {
    // detect-opportunities deletes draft/ready rows with trigger_date older
    // than 35 days; every lookback must fit inside that floor or valid
    // opportunities would be pruned while still surfaceable.
    for (const cfg of POST_CLOSE_OPPORTUNITY_CONFIGS) {
      expect(cfg.lookback).toBeLessThanOrEqual(35);
    }
  });

  it("is a distinct cadence from the 12-month POST_CLOSE_TEMPLATE (deliberate)", () => {
    const templateDays = POST_CLOSE_TEMPLATE.steps.map((s) => s.days_after_trigger);
    const configDays = POST_CLOSE_OPPORTUNITY_CONFIGS.map((c) => c.days);
    expect(templateDays).not.toEqual(configDays);
  });
});
