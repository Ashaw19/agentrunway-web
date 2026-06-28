/**
 * Pure SVG-sparkline geometry. No DOM, no React — deterministic and unit-tested.
 * Consumed by components/sparkline.tsx.
 */

export interface SparkPoint {
  value: number;
  /** Future/forecast point — rendered as a dashed continuation. */
  projected: boolean;
}

export interface XY {
  x: number;
  y: number;
}

/**
 * Map a series of values into SVG coordinates within a [width × height] box.
 * A flat series (zero range) sits on the vertical centre; a single point is
 * centred horizontally. y is inverted so larger values sit higher.
 */
export function sparklinePoints(
  values: number[],
  width: number,
  height: number,
  pad = 2,
): XY[] {
  const n = values.length;
  if (n === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const innerW = Math.max(0, width - pad * 2);
  const innerH = Math.max(0, height - pad * 2);
  return values.map((v, i) => {
    const x = pad + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const norm = range === 0 ? 0.5 : (v - min) / range;
    const y = pad + innerH - norm * innerH;
    return { x, y };
  });
}

/** Polyline `d` attribute from points. */
export function pointsToPath(points: XY[]): string {
  if (points.length === 0) return "";
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
}

/** Closed area `d` (line + down to baseline + back) for a subtle fill. */
export function areaPath(points: XY[], height: number): string {
  if (points.length === 0) return "";
  const line = pointsToPath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L${last.x.toFixed(2)},${height} L${first.x.toFixed(2)},${height} Z`;
}

/** Total polyline length (sum of segment distances) — drives the draw-in dash. */
export function pathLength(points: XY[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return len;
}
