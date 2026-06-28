import { describe, it, expect } from "vitest";
import {
  sparklinePoints,
  pointsToPath,
  areaPath,
  pathLength,
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
