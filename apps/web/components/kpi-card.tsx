"use client";

import { cn } from "@/lib/utils";

/* ── Color palette ──────────────────────────────────────────────────── */

const COLOR_MAP: Record<string, { border: string; bg: string; text: string; iconBg: string }> = {
  rose:    { border: "border-rose-200",    bg: "bg-rose-50/60",    text: "text-rose-600",    iconBg: "bg-rose-100" },
  amber:   { border: "border-amber-200",   bg: "bg-amber-50/60",   text: "text-amber-600",   iconBg: "bg-amber-100" },
  emerald: { border: "border-emerald-200", bg: "bg-emerald-50/60", text: "text-emerald-600", iconBg: "bg-emerald-100" },
  blue:    { border: "border-blue-200",    bg: "bg-blue-50/60",    text: "text-blue-600",    iconBg: "bg-blue-100" },
  violet:  { border: "border-violet-200",  bg: "bg-violet-50/60",  text: "text-violet-600",  iconBg: "bg-violet-100" },
  indigo:  { border: "border-indigo-200",  bg: "bg-indigo-50/60",  text: "text-indigo-600",  iconBg: "bg-indigo-100" },
  purple:  { border: "border-purple-200",  bg: "bg-purple-50/60",  text: "text-purple-600",  iconBg: "bg-purple-100" },
  slate:   { border: "border-slate-200",   bg: "bg-slate-50/60",   text: "text-slate-600",   iconBg: "bg-slate-100" },
  red:     { border: "border-red-200",     bg: "bg-red-50/60",     text: "text-red-600",     iconBg: "bg-red-100" },
};

const NEUTRAL = { border: "border-slate-200", bg: "bg-white", text: "text-slate-600", iconBg: "bg-slate-100" };

/* ── Props ──────────────────────────────────────────────────────────── */

export interface KpiCardProps {
  label: string;
  value: string | React.ReactNode;
  subtitle?: string | React.ReactNode;
  icon?: React.ReactNode;
  colorScheme?: string;
  layout?: "stacked" | "horizontal" | "icon-left";
  /** Optional extra value color override (e.g. "text-emerald-700") */
  valueClassName?: string;
  className?: string;
}

/* ── Component ──────────────────────────────────────────────────────── */

export function KpiCard({
  label,
  value,
  subtitle,
  icon,
  colorScheme,
  layout = "stacked",
  valueClassName,
  className,
}: KpiCardProps) {
  const colors = (colorScheme && COLOR_MAP[colorScheme]) || NEUTRAL;

  /* ── Layout B: Horizontal (label left, value right) ─────────────── */
  if (layout === "horizontal") {
    return (
      <div
        className={cn(
          "flex items-center justify-between rounded-xl border px-4 py-3",
          colors.border,
          colors.bg,
          className,
        )}
      >
        <span className={cn("text-[11px] font-semibold uppercase tracking-wider", colors.text)}>
          {label}
        </span>
        <span className={cn("text-lg font-bold text-slate-800", valueClassName)}>
          {value}
        </span>
      </div>
    );
  }

  /* ── Layout C: Icon-left (icon + label/value stacked to its right) ─ */
  if (layout === "icon-left") {
    return (
      <div
        className={cn(
          "flex items-start gap-3 rounded-xl border px-4 py-3",
          colors.border,
          colors.bg,
          className,
        )}
      >
        {icon && (
          <div className={cn("mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg", colors.iconBg)}>
            <span className={cn("h-3.5 w-3.5", colors.text)}>{icon}</span>
          </div>
        )}
        <div className="flex flex-col">
          <span className={cn("text-[11px] font-semibold uppercase tracking-wider", colors.text)}>
            {label}
          </span>
          <span className={cn("text-lg font-bold text-slate-800", valueClassName)}>
            {value}
          </span>
          {subtitle && (
            <span className="text-xs text-muted-foreground">{subtitle}</span>
          )}
        </div>
      </div>
    );
  }

  /* ── Layout A (default): Stacked (label top-left, icon top-right) ─ */
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-xl border px-4 py-3",
        colors.border,
        colors.bg,
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn("text-[11px] font-semibold uppercase tracking-wider", colors.text)}>
          {label}
        </span>
        {icon && (
          <div className={cn("flex h-6 w-6 items-center justify-center rounded-lg", colors.iconBg)}>
            <span className={cn("h-3.5 w-3.5", colors.text)}>{icon}</span>
          </div>
        )}
      </div>
      <span className={cn("text-lg font-bold text-slate-800", valueClassName)}>
        {value}
      </span>
      {subtitle && (
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      )}
    </div>
  );
}
