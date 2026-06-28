"use client";

/**
 * Cockpit UI — shared instrument primitives for the CRM tab.
 *
 * The dashboard taught a visual language (dark instrument hero, radial gauge,
 * trajectory sparkline, the §9.1 semantic palette, commission-gold-for-the-best).
 * These primitives carry that language across the CRM so the section reads as the
 * same cockpit, not a separate light-SaaS app.
 *
 * Design contract:
 *  - Two colour AXES, never mixed. AXIS 1 = §9.1 HEALTH/magnitude (SEMANTIC +
 *    GOLD) for value/score/recency. AXIS 2 = lifecycle STAGE, sourced ONLY from
 *    CLIENT_STATUS_COLORS (boarding/scheduled/in_flight/cruising). Never hand-map
 *    a stage to a §9.1 hex.
 *  - GOLD is reserved for the single top / Strong item on whatever axis a surface
 *    ranks by. Never a generic accent.
 *  - ScoreDial.isStrong is ALWAYS supplied by the caller from that score's own
 *    engine band — never re-derived from a magic >= threshold here.
 *  - Motion reuses the reduced-motion-guarded boot-* / spark-* classes only;
 *    everything rests at its final state.
 */

import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sparkline, type SparkPoint } from "@/components/sparkline";
import { flightPathSegments } from "@/lib/charts/flight-path-geometry";
import {
  CLIENT_STATUS_COLORS,
  CLIENT_STATUS_LABELS,
  type ClientStatus,
} from "@/lib/types/database";

/* ── §9.1 semantic palette (health / magnitude axis) ───────────────────── */

export const SEMANTIC = {
  strong: "#10B981", // emerald — healthy / income / top
  onTrack: "#3B5EF6", // blue — acceptable / on track
  watch: "#F59E0B", // amber — building / watch
  risk: "#EF4444", // red — at risk / overdue
  none: "#94A3B8", // slate — no data / neutral
} as const;

/** Commission gold — the genuine celebration. Strong / single-top item ONLY. */
export const GOLD = "#F0A800";

/**
 * Magnitude bar width as a percent, sqrt-scaled so mid values stay legible next
 * to a single outlier (a linear scale flattens everyone but the whale).
 */
export function magnitudePct(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.min(100, Math.sqrt(value / max) * 100);
}

/* ── CockpitStrip — the dark instrument header ─────────────────────────── */

/**
 * Reuses the dashboard hero's exact shell (gradient + two-layer pooling shadow +
 * top progress hairline + boot-hero) so every CRM surface header reads as the
 * same instrument family as the flagship. Always render it — even at zero data —
 * so a sparse account never looks broken.
 */
export function CockpitStrip({
  children,
  className,
  progress,
  animate = true,
}: {
  children: React.ReactNode;
  className?: string;
  /** 0–100 fill of the top hairline; omit for a flat hairline. */
  progress?: number;
  animate?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900",
        "shadow-[0_10px_24px_-14px_rgba(2,6,23,0.45),0_34px_60px_-30px_rgba(2,6,23,0.55)]",
        animate && "boot-hero",
        className,
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-slate-700/60">
        {progress != null && (
          <div
            className="h-full bg-blue-500/80"
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        )}
      </div>
      {children}
    </div>
  );
}

/* ── CockpitStat — a headline number inside the strip ──────────────────── */

export function CockpitStat({
  label,
  value,
  color = "#F8FAFC",
  spark,
  sparkColor,
  icon,
  sub,
  animate = true,
}: {
  label: string;
  value: React.ReactNode;
  /** Value colour — a §9.1 hex, or white for a neutral count. */
  color?: string;
  spark?: SparkPoint[];
  sparkColor?: string;
  icon?: React.ReactNode;
  sub?: React.ReactNode;
  animate?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-slate-500 shrink-0">{icon}</span>}
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 truncate">
          {label}
        </span>
      </div>
      <div
        className="mt-0.5 text-2xl font-bold tabular-nums leading-none"
        style={{ color }}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-[11px] text-slate-500 tabular-nums">{sub}</div>}
      {spark && spark.length >= 2 && (
        <div className="mt-1.5">
          <Sparkline data={spark} color={sparkColor ?? color} animate={animate} />
        </div>
      )}
    </div>
  );
}

/* ── ScoreDial — small static radial echoing the Runway gauge ──────────── */

/**
 * A compact, static (no count-up, no glow) version of the hero gauge geometry —
 * a 270° sweep. The caller passes both the band `hex` AND `isStrong` (derived
 * from that score's OWN engine band), so the dial never mints gold on a
 * non-Runway 0–100 scale.
 */
export function ScoreDial({
  score,
  size = 44,
  hex,
  isStrong = false,
  numberColor = "#0f172a",
}: {
  score: number;
  size?: number;
  hex: string;
  isStrong?: boolean;
  /** Centre number colour — dark on light cards, light on dark strips. */
  numberColor?: string;
}) {
  const stroke = Math.max(3, Math.round(size * 0.1));
  const radius = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * radius;
  const arc = circ * 0.75; // 270° visible sweep
  const clamped = Math.max(0, Math.min(100, isFinite(score) ? score : 0));
  const fillOffset = arc - arc * (clamped / 100);
  const color = isStrong ? GOLD : hex;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Score ${Math.round(clamped)} out of 100`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="#E2E8F0"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${circ}`}
          transform={`rotate(135 ${cx} ${cy})`}
        />
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${circ}`}
          strokeDashoffset={fillOffset}
          transform={`rotate(135 ${cx} ${cy})`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="text-[12px] font-bold tabular-nums leading-none"
          style={{ color: isStrong ? GOLD : numberColor }}
        >
          {Math.round(clamped)}
        </span>
      </div>
    </div>
  );
}

/* ── StatusChip — lifecycle stage pill with an LED dot ─────────────────── */

/**
 * The flight-status indicator. Colour comes ONLY from CLIENT_STATUS_COLORS
 * (lifecycle axis) — including the previously-unused `.dot` field as a leading
 * LED so status reads identically everywhere.
 */
export function StatusChip({
  status,
  className,
}: {
  status: ClientStatus;
  className?: string;
}) {
  const sc = CLIENT_STATUS_COLORS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        sc.bg,
        sc.text,
        sc.border,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", sc.dot)} />
      {CLIENT_STATUS_LABELS[status]}
    </span>
  );
}

/** Just the LED dot, for placing beside an inline-editable status control. */
export function StatusLed({ status, className }: { status: ClientStatus; className?: string }) {
  const sc = CLIENT_STATUS_COLORS[status];
  return <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", sc.dot, className)} />;
}

/* ── FlightPath — an automation sequence as a horizontal runway ─────────── */

/** One landing along the runway: a step at `day` carrying an action icon. */
export interface FlightPathStop {
  /** delay_days — drives the connector length leading INTO this stop. */
  day: number;
  /** The action glyph (a lucide icon node). Colour comes from the rail, not here. */
  icon: React.ReactNode;
  /** Accessible label for the stop, e.g. "Email". */
  label?: string;
}

/**
 * A Flight Plan rendered as a runway instrument: an origin gate (the trigger
 * flight-status, in its lifecycle colour) followed by one node per step,
 * spaced by `delay_days` (sqrt-compressed gaps — see flight-path-geometry).
 *
 * The path ALWAYS renders. With zero stops it shows the origin gate and a
 * dashed "add first touch" terminus, so a seeded Default campaign reads as a
 * runway awaiting its first touch rather than an empty card.
 *
 * Two-axis contract: ONLY the origin gate carries colour, and only the
 * lifecycle colour of its trigger status (CLIENT_STATUS_COLORS). Step nodes are
 * neutral instrument chrome — the action is conveyed by its icon, never a hue.
 */
export function FlightPath({
  status,
  originLabel,
  stops,
  emptyHint = "Add first touch",
  className,
}: {
  /** Trigger flight-status; null = manual-only, rendered as a neutral gate. */
  status: ClientStatus | null;
  /** Label under the origin gate, e.g. the status label or "Manual". */
  originLabel: string;
  stops: FlightPathStop[];
  emptyHint?: string;
  className?: string;
}) {
  const sc = status ? CLIENT_STATUS_COLORS[status] : null;
  // Connector weights: origin (day 0) followed by each stop's day.
  const weights = flightPathSegments([0, ...stops.map((s) => s.day)]);
  const isEmpty = stops.length === 0;

  return (
    <div
      className={cn("flex items-start overflow-x-auto pb-1", className)}
      role="img"
      aria-label={
        isEmpty
          ? `Runway from ${originLabel}, no steps yet`
          : `Runway from ${originLabel}, ${stops.length} step${stops.length !== 1 ? "s" : ""}`
      }
    >
      {/* Origin gate — the only coloured node, carrying lifecycle stage. */}
      <div className="flex flex-col items-center shrink-0">
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full border shadow-sm",
            sc ? cn(sc.bg, sc.border) : "bg-slate-100 border-slate-200",
          )}
        >
          <span className={cn("h-2 w-2 rounded-full", sc ? sc.dot : "bg-slate-400")} />
        </span>
        <span className="mt-1 max-w-[68px] truncate text-[10px] font-medium text-slate-500">
          {originLabel}
        </span>
      </div>

      {isEmpty ? (
        /* No steps: dashed taxi to an "add first touch" terminus. */
        <>
          <span className="mt-3.5 min-w-[28px] flex-1 border-t-2 border-dashed border-slate-300" />
          <div className="flex flex-col items-center shrink-0">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-dashed border-slate-300 bg-slate-50">
              <Plus className="h-3.5 w-3.5 text-slate-400" />
            </span>
            <span className="mt-1 max-w-[80px] truncate text-[10px] font-medium text-slate-400">
              {emptyHint}
            </span>
          </div>
        </>
      ) : (
        stops.map((stop, i) => (
          <div key={i} className="flex items-start" style={{ flexGrow: weights[i], flexBasis: 0 }}>
            {/* Connector spine into this stop, length ∝ the wait before it. */}
            <span className="mt-3.5 min-w-[20px] flex-1 border-t-2 border-slate-200" />
            <div className="flex flex-col items-center shrink-0">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm"
                title={stop.label}
              >
                {stop.icon}
              </span>
              <span className="mt-1 text-[10px] font-medium tabular-nums text-slate-500">
                Day {stop.day}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
