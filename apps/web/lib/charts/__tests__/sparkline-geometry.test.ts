import { describe, it, expect } from "vitest";
import {
  sparklinePoints,
  pointsToPath,
  areaPath,
  pathLength,
  smoothPath,
  smoothAreaPath,
} from "../sparkline-geometry";

describe("sparklinePoints", () => {
  it("returns [] for an empty series", () => {
    expect(sparklinePoints([], 100, 28)).toEqual([]);
  });

  it("spreads points evenly across the inner width", () => {
    const pts = sparklinePoints([0, 1, 2], 100, 28, 2);
    expect(pts).toHaveLength(3);
    expect(pts[0].x).toBeCloseTo(2, 5); // first at left pad
    expect(pts[2].x).toBeCloseTo(98, 5); // last at width - pad
    expect(pts[1].x).toBeCloseTo(50, 5); // middle centred
  });

  it("inverts y so larger values sit higher (smaller y)", () => {
    const pts = sparklinePoints([0, 10], 100, 28, 2);
    // value 0 → bottom (max y); value 10 → top (min y)
    expect(pts[0].y).toBeGreaterThan(pts[1].y);
    expect(pts[1].y).toBeCloseTo(2, 5); // top = pad
    expect(pts[0].y).toBeCloseTo(26, 5); // bottom = height - pad
  });

  it("centres a flat series vertically (zero range)", () => {
    const pts = sparklinePoints([5, 5, 5], 100, 28, 2);
    for (const p of pts) expect(p.y).toBeCloseTo(14, 5); // mid of 0..28
  });

  it("centres a single point horizontally", () => {
    const pts = sparklinePoints([7], 100, 28, 2);
    expect(pts).toHaveLength(1);
    expect(pts[0].x).toBeCloseTo(50, 5);
  });
});

describe("pointsToPath", () => {
  it("builds a moveto + linetos polyline", () => {
    const d = pointsToPath([
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 2 },
    ]);
    expect(d).toBe("M0.00,0.00 L10.00,5.00 L20.00,2.00");
  });

  it("is empty for no points", () => {
    expect(pointsToPath([])).toBe("");
  });
});

describe("areaPath", () => {
  it("closes the line down to the baseline and back", () => {
    const d = areaPath(
      [
        { x: 0, y: 4 },
        { x: 10, y: 2 },
      ],
      28,
    );
    expect(d).toContain("M0.00,4.00 L10.00,2.00");
    expect(d).toContain("L10.00,28"); // down to baseline at last x
    expect(d).toContain("L0.00,28"); // back along baseline to first x
    expect(d.endsWith("Z")).toBe(true);
  });
});

describe("pathLength", () => {
  it("sums segment distances", () => {
    // 3-4-5 triangle then a horizontal run of 10
    const len = pathLength([
      { x: 0, y: 0 },
      { x: 3, y: 4 },
      { x: 13, y: 4 },
    ]);
    expect(len).toBeCloseTo(15, 5); // 5 + 10
  });

  it("is 0 for a single point", () => {
    expect(pathLength([{ x: 1, y: 1 }])).toBe(0);
  });
});

describe("sparklinePoints headroom", () => {
  it("defaults to no headroom (full-range, back-compatible)", () => {
    const pts = sparklinePoints([0, 10], 100, 28, 2);
    expect(pts[0].y).toBeCloseTo(26, 5); // min pinned to floor
    expect(pts[1].y).toBeCloseTo(2, 5); // max pinned to ceiling
  });

  it("compresses the series into [headroom, 1-headroom] of the inner height", () => {
    // innerH = 24, pad = 2. headroom 0.25 → norms map 0→0.25, 1→0.75.
    const pts = sparklinePoints([0, 10], 100, 28, 2, 0.25);
    expect(pts[0].y).toBeCloseTo(20, 5); // 2 + 24 - 0.25*24
    expect(pts[1].y).toBeCloseTo(8, 5); // 2 + 24 - 0.75*24
  });

  it("keeps a flat series centred regardless of headroom", () => {
    const pts = sparklinePoints([5, 5, 5], 100, 28, 2, 0.3);
    pts.forEach((p) => expect(p.y).toBeCloseTo(14, 5)); // vertical centre
  });

  it("never lets a value touch the very edge when headroom > 0", () => {
    const pts = sparklinePoints([1, 2, 3, 100], 100, 28, 2, 0.2);
    const ys = pts.map((p) => p.y);
    expect(Math.max(...ys)).toBeLessThan(26); // floor untouched
    expect(Math.min(...ys)).toBeGreaterThan(2); // ceiling untouched
  });
});

describe("smoothPath", () => {
  it("returns '' for an empty series", () => {
    expect(smoothPath([])).toBe("");
  });

  it("returns a bare move for a single point", () => {
    expect(smoothPath([{ x: 5, y: 6 }])).toBe("M5.00,6.00");
  });

  it("starts at the first point and uses cubic segments", () => {
    const d = smoothPath([
      { x: 0, y: 10 },
      { x: 50, y: 4 },
      { x: 100, y: 0 },
    ]);
    expect(d.startsWith("M0.00,10.00")).toBe(true);
    expect(d).toContain("C"); // cubic, not straight L segments
    expect(d).toContain("100.00,0.00"); // ends at the last point
  });

  it("does not overshoot a monotonic series (no values beyond the data range)", () => {
    const pts = [
      { x: 0, y: 26 },
      { x: 25, y: 24 },
      { x: 50, y: 23 },
      { x: 75, y: 10 },
      { x: 100, y: 2 },
    ];
    const d = smoothPath(pts);
    // Every numeric y coordinate emitted (anchors + control points) must stay
    // within the data's [min,max] y — monotone-cubic guarantees no overshoot.
    const ys = [...d.matchAll(/[ML,C]?-?\d+\.\d+,(-?\d+\.\d+)/g)].map((m) =>
      parseFloat(m[1]),
    );
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(2 - 1e-6);
    expect(Math.max(...ys)).toBeLessThanOrEqual(26 + 1e-6);
  });
});

describe("smoothAreaPath", () => {
  it("returns '' for an empty series", () => {
    expect(smoothAreaPath([], 28)).toBe("");
  });

  it("closes the smooth line down to the baseline", () => {
    const pts = [
      { x: 0, y: 10 },
      { x: 50, y: 6 },
      { x: 100, y: 2 },
    ];
    const d = smoothAreaPath(pts, 28);
    expect(d.startsWith("M0.00,10.00")).toBe(true);
    expect(d).toContain("L100.00,28"); // down to baseline at last x
    expect(d).toContain("L0.00,28"); // back along baseline to first x
    expect(d.endsWith("Z")).toBe(true);
  });
});
