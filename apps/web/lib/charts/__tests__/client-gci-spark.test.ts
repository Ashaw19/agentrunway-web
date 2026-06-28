import { describe, it, expect } from "vitest";
import { buildClientGciSpark, type GciSparkDeal } from "../client-gci-spark";

// Minimal deal factory — only the three fields the spark builder reads.
function deal(p: Partial<GciSparkDeal>): GciSparkDeal {
  return {
    close_date: "2026-01-15",
    gci: 1000,
    condition_status: "firmed",
    ...p,
  };
}

describe("buildClientGciSpark", () => {
  it("returns [] when there are no deals", () => {
    expect(buildClientGciSpark([])).toEqual([]);
  });

  it("returns [] when no deal has a close_date (unclosed pipeline only)", () => {
    expect(
      buildClientGciSpark([deal({ close_date: null }), deal({ close_date: null })]),
    ).toEqual([]);
  });

  it("excludes collapsed deals", () => {
    expect(
      buildClientGciSpark([deal({ condition_status: "collapsed", gci: 5000 })]),
    ).toEqual([]);
  });

  it("returns a single cumulative point for one closed month (caller treats <2 as no history)", () => {
    expect(
      buildClientGciSpark([deal({ close_date: "2026-01-10", gci: 4200 })]),
    ).toEqual([{ value: 4200, projected: false }]);
  });

  it("accumulates GCI month-over-month into a monotonic series", () => {
    const pts = buildClientGciSpark([
      deal({ close_date: "2025-03-01", gci: 1000 }),
      deal({ close_date: "2025-07-01", gci: 2500 }),
      deal({ close_date: "2025-11-01", gci: 1500 }),
    ]);
    expect(pts).toEqual([
      { value: 1000, projected: false },
      { value: 3500, projected: false },
      { value: 5000, projected: false },
    ]);
  });

  it("buckets multiple deals in the same close-month into one cumulative point", () => {
    const pts = buildClientGciSpark([
      deal({ close_date: "2025-05-04", gci: 1000 }),
      deal({ close_date: "2025-05-20", gci: 2000 }),
      deal({ close_date: "2025-09-09", gci: 500 }),
    ]);
    expect(pts).toEqual([
      { value: 3000, projected: false },
      { value: 3500, projected: false },
    ]);
  });

  it("treats a null GCI as zero", () => {
    const pts = buildClientGciSpark([
      deal({ close_date: "2025-02-01", gci: null }),
      deal({ close_date: "2025-06-01", gci: 800 }),
    ]);
    expect(pts).toEqual([
      { value: 0, projected: false },
      { value: 800, projected: false },
    ]);
  });

  it("rounds each cumulative point to a whole number", () => {
    const pts = buildClientGciSpark([
      deal({ close_date: "2025-02-01", gci: 1000.4 }),
      deal({ close_date: "2025-04-01", gci: 2000.4 }),
    ]);
    expect(pts).toEqual([
      { value: 1000, projected: false },
      { value: 3001, projected: false },
    ]);
  });

  it("shows only the last 12 active months but carries earlier cumulative totals", () => {
    // 13 distinct months, each adding 100 → the first shown point already
    // includes the off-window first month's total (200, not 100).
    const months = [
      "2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06",
      "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12",
      "2026-01",
    ];
    const pts = buildClientGciSpark(
      months.map((m) => deal({ close_date: `${m}-15`, gci: 100 })),
    );
    expect(pts).toHaveLength(12);
    expect(pts[0].value).toBe(200);
    expect(pts[pts.length - 1].value).toBe(1300);
  });
});
