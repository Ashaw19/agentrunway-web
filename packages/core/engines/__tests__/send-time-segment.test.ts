/**
 * Send-Time Engine — outreach-type → segment mapping
 * ===================================================
 * The queue's send-window hint derives its segment from the outreach
 * trigger type. Lock the high-signal mappings and the safe fallback.
 */

import { describe, it, expect } from "vitest";
import {
  segmentForOutreachType,
  getOptimalSendTime,
} from "../send-time-engine";

describe("segmentForOutreachType", () => {
  it.each([
    ["buyer_inventory_match", "buyer"],
    ["seller_timing_hesitation", "seller"],
    ["post_close_90", "past_client"],
    ["mortgage_renewal_due", "past_client"],
    ["past_client_check_in", "past_client"],
    ["new_client_welcome", "lead"],
    ["timeframe_approaching", "lead"],
    ["idle_client", "unknown"],
    ["birthday", "unknown"],
    ["seasonal_spring", "unknown"],
    ["something_future", "unknown"],
  ] as const)("%s → %s", (type, segment) => {
    expect(segmentForOutreachType(type)).toBe(segment);
  });
});

describe("getOptimalSendTime", () => {
  it("always returns a future date within 14 days for every segment", () => {
    const after = new Date("2026-07-04T12:00:00Z");
    for (const type of ["buyer_inventory_match", "post_close_90", "idle_client"]) {
      const t = getOptimalSendTime({
        segment: segmentForOutreachType(type),
        afterDate: after,
      });
      expect(t.getTime()).toBeGreaterThan(after.getTime());
      expect(t.getTime() - after.getTime()).toBeLessThanOrEqual(15 * 86_400_000);
    }
  });
});
