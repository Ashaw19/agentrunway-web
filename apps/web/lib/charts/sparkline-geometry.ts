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
  /**
   * Fraction of the inner height (0–0.5) to reserve as empty margin at the top
   * and bottom. With headroom > 0 the series is compressed into the middle
   * band, so a metric that barely moved reads as a gentle drift instead of a
   * full-height zigzag pinned to both edges. Defaults to 0 (full range).
   */
  headroom = 0,
): XY[] {
  const n = values.length;
  if (n === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const innerW = Math.max(0, width - pad * 2);
  const innerH = Math.max(0, height - pad * 2);
  const h = Math.max(0, Math.min(0.5, headroom));
  return values.map((v, i) => {
    const x = pad + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const norm0 = range === 0 ? 0.5 : (v - min) / range;
    // Compress [0,1] into [h, 1-h]. A flat series (norm0 = 0.5) stays centred.
    const norm = h > 0 ? h + norm0 * (1 - 2 * h) : norm0;
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

/**
 * Smooth `d` attribute via monotone cubic Hermite interpolation
 * (Fritsch–Carlson). Unlike Catmull-Rom, this never overshoots: a monotonic
 * input yields a monotonic curve, so cumulative trajectories read as clean
 * growth arcs with no spurious dips. Emits cubic Bézier (`C`) segments.
 */
export function smoothPath(points: XY[]): string {
  const n = points.length;
  if (n === 0) return "";
  const p0 = points[0];
  if (n === 1) return `M${p0.x.toFixed(2)},${p0.y.toFixed(2)}`;
  if (n === 2) return pointsToPath(points); // a single straight segment

  // Secant slopes between consecutive points.
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = points[i + 1].x - points[i].x;
    dx.push(h);
    slope.push(h === 0 ? 0 : (points[i + 1].y - points[i].y) / h);
  }

  // Tangents, clamped for monotonicity.
  const m: number[] = new Array(n);
  m[0] = slope[0];
  m[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) {
      m[i] = 0; // local extremum → flat tangent, no overshoot
    } else {
      m[i] = (slope[i - 1] + slope[i]) / 2;
      const limit = 3 * Math.min(Math.abs(slope[i - 1]), Math.abs(slope[i]));
      if (Math.abs(m[i]) > limit) m[i] = Math.sign(m[i]) * limit;
    }
  }

  let d = `M${p0.x.toFixed(2)},${p0.y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const cp1x = a.x + dx[i] / 3;
    const cp1y = a.y + (m[i] * dx[i]) / 3;
    const cp2x = b.x - dx[i] / 3;
    const cp2y = b.y - (m[i + 1] * dx[i]) / 3;
    d +=
      ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ` +
      `${cp2x.toFixed(2)},${cp2y.toFixed(2)} ` +
      `${b.x.toFixed(2)},${b.y.toFixed(2)}`;
  }
  return d;
}

/** Closed area under a smoothed line, down to the baseline. */
export function smoothAreaPath(points: XY[], height: number): string {
  if (points.length === 0) return "";
  const line = smoothPath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L${last.x.toFixed(2)},${height} L${first.x.toFixed(2)},${height} Z`;
}
