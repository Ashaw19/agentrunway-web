import { describe, expect, it } from "vitest";
import {
  OPPORTUNITY_LOSS_REASONS,
  OpportunityLossReason,
  isOpportunityLossReason,
  lossReasonLabel,
} from "../opportunity-loss-reasons";

describe("opportunity-loss-reasons", () => {
  it("exposes exactly 8 vocabulary values", () => {
    expect(OPPORTUNITY_LOSS_REASONS.length).toBe(8);
  });

  it("includes 'other' last for UI ordering", () => {
    expect(OPPORTUNITY_LOSS_REASONS[OPPORTUNITY_LOSS_REASONS.length - 1]).toBe("other");
  });

  it("isOpportunityLossReason accepts valid values", () => {
    expect(isOpportunityLossReason("chose_other_agent")).toBe(true);
    expect(isOpportunityLossReason("other")).toBe(true);
  });

  it("isOpportunityLossReason rejects invalid values", () => {
    expect(isOpportunityLossReason("bogus")).toBe(false);
    expect(isOpportunityLossReason(null)).toBe(false);
    expect(isOpportunityLossReason(undefined)).toBe(false);
  });

  it("lossReasonLabel returns human label for known reason", () => {
    expect(lossReasonLabel("chose_other_agent")).toBe("Went with another agent");
    expect(lossReasonLabel("other")).toBe("Other");
  });

  it("lossReasonLabel falls back to humanized form for unknown (defensive)", () => {
    expect(lossReasonLabel("unknown_value" as OpportunityLossReason)).toBe("Unknown value");
  });
});
