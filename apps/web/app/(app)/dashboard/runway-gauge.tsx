"use client";

import { cn } from "@/lib/utils";
import { CountUp } from "@/components/count-up";
import { Sparkline, type SparkPoint } from "@/components/sparkline";
import type { RunwayStateLabel } from "@/lib/engines/runway-score-engine";

/**
 * RunwayGauge — the cockpit hero instrument.
 *
 * ONE radial arc gauge: the numeric score centered (large), ONE band word
 * beneath it. No A+..F letter grade (spec §9.2 — grade is glyph-only Scheme B
 * and lives only in the explainer dialog now).
 *
 * Color follows the single semantic contract (spec §9.1): the caller passes
 * the engine's `bandColorHexForScore(score)` as `bandHex` — this component
 * NEVER re-derives a band from the score. Gold + glow are reserved STRICTLY
 * for Strong (≥81): the caller passes `isStrong` keyed off
 * `stateLabel === "Strong"`, so a 43 renders amber with no gold and no glow.
 *
 * Engine stays source of truth. This is presentation only — it draws an arc
 * proportional to `score`, it does not compute or interpret the score.
 */

// Commission Gold — reserved for the genuine Strong celebration only.
const GOLD = "#F0A800";

interface RunwayGaugeProps {
  /** The composite Runway Score, 0–100. Drives the arc length only. */
  score: number;
  /** Engine prose band (drives the word beneath the number). */
  stateLabel: RunwayStateLabel;
  /** Engine band color hex — caller passes bandColorHexForScore(score). */
  bandHex: string;
  /** True only when stateLabel === "Strong" (≥81). Gates gold + glow. */
  isStrong: boolean;
  /** Skip boot motion (e.g. zero-data placeholder). */
  animate?: boolean;
  /**
   * Score trajectory series (all actuals — no projected tail). Rendered as a
   * thin sparkline beneath the radial when it has ≥2 points. The caller passes
   * the engine-derived series; this component never computes it.
   */
  trajectory?: SparkPoint[];
  /** Sparkline stroke (§9.1 band color via bandColorHexForScore). */
  trajectoryColor?: string;
}

export function RunwayGauge({
  score,
  stateLabel,
  bandHex,
  isStrong,
  animate = true,
  trajectory,
  trajectoryColor,
}: RunwayGaugeProps) {
  // Geometry. A 270° sweep arc (gauge-style, gap at the bottom) reads more
  // like an instrument than a full ring.
  const size = 132;
  const stroke = 11;
  const radius = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;

  // 270° arc (3/4 of the circle). The track + fill share this same path.
  const sweepFraction = 0.75;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * sweepFraction;
  // Rotate so the gap sits centered at the bottom: start at 135°.
  const rotation = 135;

  const clamped = Math.max(0, Math.min(100, isFinite(score) ? score : 0));
  // Length of the colored portion of the arc.
  const fillLength = arcLength * (clamped / 100);
  // stroke-dasharray draws `arcLength` then a long gap; the fill uses
  // dashoffset to reveal only the score fraction.
  const fillOffset = arcLength - fillLength;

  // Strong gets a soft gold outer glow; every other band is flat (no glow).
  const fillColor = isStrong ? GOLD : bandHex;
  const glowFilter = isStrong ? "url(#gauge-gold-glow)" : undefined;

  return (
    <div className="flex flex-col items-center gap-1.5 shrink-0">
    <div
      className="relative"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Runway Score ${Math.round(clamped)} out of 100, ${stateLabel}`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="block"
      >
        <defs>
          <filter id="gauge-gold-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Track — the unfilled arc. */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="#334155" /* slate-700 — reads on the dark cockpit card */
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
          transform={`rotate(${rotation} ${cx} ${cy})`}
        />

        {/* Fill — the score arc. Sweeps from empty to `fillOffset` on boot
            via the .boot-arc keyframe (custom props supply the offsets). The
            global reduced-motion guard collapses the sweep to the resting
            state instantly. */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={fillColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={fillOffset}
          filter={glowFilter}
          transform={`rotate(${rotation} ${cx} ${cy})`}
          className={animate ? "boot-arc" : undefined}
          style={
            animate
              ? ({
                  // The keyframe sweeps dashoffset from empty (--arc-empty =
                  // the full visible arc length, so nothing shows) to the
                  // target fill offset.
                  ["--arc-empty" as string]: `${arcLength}`,
                  ["--arc-offset" as string]: `${fillOffset}`,
                } as React.CSSProperties)
              : undefined
          }
        />
      </svg>

      {/* Centered number + band word. */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={cn(
            "text-[40px] font-extrabold leading-none tabular-nums",
            isStrong && "drop-shadow-[0_0_10px_rgba(240,168,0,0.35)]",
          )}
          style={{ color: isStrong ? GOLD : "#FFFFFF" }}
        >
          {animate ? <CountUp end={Math.round(clamped)} duration={1200} /> : Math.round(clamped)}
        </span>
        <span
          className="mt-1 text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: fillColor }}
        >
          {stateLabel}
        </span>
      </div>
    </div>
      {/* Thin score-trajectory strip beneath the radial. All actuals (no
          projected tail). Sparkline returns null for <2 points; the length
          guard just avoids an empty wrapper. Stroke = the current band color
          (§9.1) — never gold (gold stays Strong-only and gauge-only). */}
      {trajectory && trajectory.length >= 2 && (
        <div style={{ width: size }}>
          <Sparkline
            data={trajectory}
            color={trajectoryColor ?? bandHex}
            animate={animate}
            ariaLabel={`Runway Score trend, last ${trajectory.length} points`}
          />
        </div>
      )}
    </div>
  );
}
