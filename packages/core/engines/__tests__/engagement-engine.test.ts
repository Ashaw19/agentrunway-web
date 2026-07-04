/**
 * Engagement Engine
 * =================
 * Tests for time-decayed engagement scoring: score math, tier bands,
 * trend classification, CRM activity-type mapping.
 *
 * Uses a fixed asOf date passed explicitly — no fake timers needed.
 */

import { describe, it, expect } from "vitest";
import {
  calculateEngagementScore,
  suggestReEngagement,
  tierFromScore,
  toEngagementActivities,
  CRM_ACTIVITY_TYPE_MAP,
  type EngagementActivity,
} from "../engagement-engine";

const AS_OF = new Date("2026-07-04T12:00:00Z");

// The engine evaluates as-of START of day (local): an activity stamped after
// local midnight of the asOf day is treated as future and ignored. Generate
// timestamps 1h BEFORE local start-of-day minus n days so "daysAgo(0)" is a
// scoreable, effectively-fresh activity in any timezone.
function daysAgo(n: number): string {
  const d = new Date(AS_OF);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  d.setHours(d.getHours() - 1);
  return d.toISOString();
}

describe("calculateEngagementScore", () => {
  it("returns fully dormant result for no activities", () => {
    const r = calculateEngagementScore([], AS_OF);
    expect(r.score).toBe(0);
    expect(r.tier).toBe("dormant");
    expect(r.trend).toBe("stable");
    expect(r.last_activity_date).toBeNull();
    expect(r.days_since_last_activity).toBeNull();
    expect(r.top_activity_type).toBeNull();
  });

  it("scores a same-day call at full weight (20)", () => {
    const r = calculateEngagementScore(
      [{ type: "call", occurred_at: daysAgo(0) }],
      AS_OF
    );
    expect(r.score).toBeCloseTo(20, 0);
    expect(r.tier).toBe(tierFromScore(r.score));
    expect(r.top_activity_type).toBe("call");
  });

  it("decays a call to half weight after one half-life (30 days)", () => {
    const r = calculateEngagementScore(
      [{ type: "call", occurred_at: daysAgo(30) }],
      AS_OF
    );
    expect(r.score).toBeGreaterThan(9);
    expect(r.score).toBeLessThan(11);
  });

  it("ignores future-dated activities", () => {
    const future = new Date(AS_OF);
    future.setDate(future.getDate() + 10);
    const r = calculateEngagementScore(
      [{ type: "call", occurred_at: future.toISOString() }],
      AS_OF
    );
    expect(r.score).toBe(0);
    expect(r.tier).toBe("dormant");
  });

  it("classifies recent burst of activity as rising", () => {
    // Nothing before the 14-day trend window, plenty inside it
    const acts: EngagementActivity[] = [
      { type: "call", occurred_at: daysAgo(2) },
      { type: "showing", occurred_at: daysAgo(4) },
    ];
    const r = calculateEngagementScore(acts, AS_OF);
    expect(r.trend).toBe("rising");
  });

  it("classifies decayed old-only activity as declining", () => {
    // All activity well before the trend window: score 14 days ago was
    // higher than today (pure decay) → declining
    const acts: EngagementActivity[] = [
      { type: "call", occurred_at: daysAgo(40) },
      { type: "showing", occurred_at: daysAgo(45) },
    ];
    const r = calculateEngagementScore(acts, AS_OF);
    expect(r.trend).toBe("declining");
  });

  it("reports days_since_last_activity from the most recent activity", () => {
    const acts: EngagementActivity[] = [
      { type: "note", occurred_at: daysAgo(20) },
      { type: "call", occurred_at: daysAgo(3) },
    ];
    const r = calculateEngagementScore(acts, AS_OF);
    expect(r.days_since_last_activity).toBe(3);
  });
});

describe("tierFromScore bands", () => {
  it.each([
    [0, "dormant"],
    [4.99, "dormant"],
    [5, "cooling"],
    [19.99, "cooling"],
    [20, "cruising"],
    [49.99, "cruising"],
    [50, "ascending"],
    [80, "ascending"],
    [80.01, "hot"],
    [200, "hot"],
  ] as const)("score %s → %s", (score, tier) => {
    expect(tierFromScore(score)).toBe(tier);
  });
});

describe("suggestReEngagement", () => {
  it("returns a non-empty suggestion for every tier", () => {
    for (const score of [0, 10, 30, 60, 90]) {
      const r = calculateEngagementScore(
        score === 0 ? [] : [{ type: "call", occurred_at: daysAgo(0) }],
        AS_OF
      );
      expect(suggestReEngagement(r).length).toBeGreaterThan(0);
    }
  });
});

describe("toEngagementActivities (CRM contact_activities mapping)", () => {
  it("maps every CRM vocabulary type to an engine type", () => {
    // Migration 00018 vocabulary
    for (const crmType of ["call", "email", "text", "showing", "meeting", "offer", "note"]) {
      expect(CRM_ACTIVITY_TYPE_MAP[crmType]).toBeDefined();
    }
  });

  it("maps email→email_sent and meeting/offer→appointment", () => {
    const acts = toEngagementActivities([
      { type: "email", activity_date: daysAgo(1) },
      { type: "meeting", activity_date: daysAgo(2) },
      { type: "offer", activity_date: daysAgo(3) },
    ]);
    expect(acts.map((a) => a.type)).toEqual([
      "email_sent",
      "appointment",
      "appointment",
    ]);
  });

  it("drops rows with null dates and defaults null type to note", () => {
    const acts = toEngagementActivities([
      { type: "call", activity_date: null },
      { type: null, activity_date: daysAgo(1) },
      { type: "CALL", activity_date: daysAgo(2) },
    ]);
    expect(acts).toHaveLength(2);
    expect(acts[0].type).toBe("note");
    expect(acts[1].type).toBe("call");
  });

  it("passes unknown types through for engine default weighting", () => {
    const acts = toEngagementActivities([
      { type: "smoke_signal", activity_date: daysAgo(1) },
    ]);
    expect(acts[0].type).toBe("smoke_signal");
    // Engine should still score it via defaults without throwing
    const r = calculateEngagementScore(acts, AS_OF);
    expect(r.score).toBeGreaterThan(0);
  });
});
