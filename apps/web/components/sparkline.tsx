"use client";

import { cn } from "@/lib/utils";
import {
  sparklinePoints,
  pointsToPath,
  areaPath,
  pathLength,
  type SparkPoint,
} from "@/lib/charts/sparkline-geometry";

export type { SparkPoint };

/* ── Component ─────────────────────────────────────────────────────────────── */

interface SparklineProps {
  data: SparkPoint[];
  /** Stroke colour for the actuals line (hex). Defaults to a neutral slate. */
  color?: string;
  /** Colour for the dashed projected tail. Defaults to the §9.1 no-data slate. */
  projectedColor?: string;
  className?: string;
  /** Draw-in animation on mount (collapses to fully-drawn under reduced-motion). */
  animate?: boolean;
  /** Animation delay seconds (sync with the hero boot when desired). */
  delay?: number;
  ariaLabel?: string;
}

const VIEW_W = 100;
const VIEW_H = 28;

/**
 * Compact inline trajectory chart: a number's recent shape. Actuals draw as a
 * solid band-coloured line with a soft area fill; any projected tail continues
 * as a dashed slate line. Stroke uses non-scaling-stroke so it stays crisp at
 * any rendered width. The draw-in rests fully-drawn, so prefers-reduced-motion
 * users see the complete line with no motion.
 */
export function Sparkline({
  data,
  color = "#6B7280",
  projectedColor = "#94A3B8",
  className,
  animate = true,
  delay = 0,
  ariaLabel,
}: SparklineProps) {
  if (data.length < 2) return null;

  const values = data.map((d) => d.value);
  const pts = sparklinePoints(values, VIEW_W, VIEW_H);

  // Split into the actual run and the projected continuation. The projected
  // segment includes the last actual point so the dashed line joins the solid.
  const firstProjected = data.findIndex((d) => d.projected);
  const hasProjected = firstProjected > 0;
  const actualPts = hasProjected ? pts.slice(0, firstProjected) : pts;
  const projectedPts = hasProjected ? pts.slice(firstProjected - 1) : [];

  const len = pathLength(actualPts);
  const lastActual = actualPts[actualPts.length - 1];
  const gradId = `spark-fill-${color.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <svg
      className={cn("block w-full", className)}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      height={24}
      role="img"
      aria-label={ariaLabel ?? "trend sparkline"}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Soft area fill under the actuals. */}
      <path
        d={areaPath(actualPts, VIEW_H)}
        fill={`url(#${gradId})`}
        stroke="none"
        className={animate ? "spark-fade" : undefined}
        style={animate ? { animationDelay: `${delay}s` } : undefined}
      />

      {/* Projected dashed continuation (drawn first, sits under the actuals). */}
      {projectedPts.length >= 2 && (
        <path
          d={pointsToPath(projectedPts)}
          fill="none"
          stroke={projectedColor}
          strokeWidth={1.5}
          strokeDasharray="3 2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          className={animate ? "spark-fade" : undefined}
          style={animate ? { animationDelay: `${delay + 0.5}s` } : undefined}
        />
      )}

      {/* Actuals line with a draw-in sweep that rests fully-drawn. */}
      <path
        d={pointsToPath(actualPts)}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className={animate ? "spark-draw" : undefined}
        style={
          animate
            ? ({ ["--spark-len"]: len, animationDelay: `${delay}s` } as React.CSSProperties)
            : undefined
        }
      />

      {/* Current-value dot at the last actual point. */}
      {lastActual && (
        <circle
          cx={lastActual.x}
          cy={lastActual.y}
          r={2}
          fill={color}
          vectorEffect="non-scaling-stroke"
          className={animate ? "spark-fade" : undefined}
          style={animate ? { animationDelay: `${delay + 0.6}s` } : undefined}
        />
      )}
    </svg>
  );
}
