"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClientStatus, TaskPriority } from "@/lib/types/database";
import { CLIENT_STATUS_LABELS, CLIENT_STATUS_COLORS } from "@/lib/types/database";

// ── Summary Card ────────────────────────────────────────────────────────────

export function SummaryCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accent: "blue" | "violet" | "emerald" | "amber" | "red" | "slate";
}) {
  const accentMap: Record<string, string> = {
    blue:    "from-blue-50 border-blue-200",
    violet:  "from-violet-50 border-violet-200",
    emerald: "from-emerald-50 border-emerald-200",
    amber:   "from-amber-50 border-amber-200",
    red:     "from-red-50 border-red-200",
    slate:   "from-slate-50 border-slate-200",
  };
  return (
    <Card
      className={cn(
        "rounded-2xl border shadow-sm bg-gradient-to-br to-card",
        accentMap[accent],
      )}
    >
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center gap-1.5 mb-1">
          {icon}
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
        </div>
        <p className="text-2xl font-bold text-foreground tabular-nums">
          {value}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  );
}

// ── Inline Edit ─────────────────────────────────────────────────────────────

export function InlineEdit({
  label,
  value,
  onSave,
  placeholder = "—",
  type = "text",
}: {
  label?: string;
  value: string;
  onSave: (value: string) => void;
  placeholder?: string;
  type?: "text" | "date";
}) {
  const [editing, setEditing] = useState(false);
  const [localVal, setLocalVal] = useState(value);

  function commit() {
    setEditing(false);
    if (localVal !== value) onSave(localVal);
  }

  if (editing) {
    return (
      <div>
        {label && <span className="text-[10px] text-muted-foreground block mb-0.5">{label}</span>}
        <Input
          autoFocus
          type={type}
          value={localVal}
          onChange={(e) => setLocalVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setLocalVal(value); setEditing(false); } }}
          className="h-7 text-xs"
        />
      </div>
    );
  }

  return (
    <div
      className="cursor-pointer group"
      onClick={() => { setLocalVal(value); setEditing(true); }}
    >
      {label && <span className="text-[10px] text-muted-foreground block mb-0.5">{label}</span>}
      <span className={cn(
        "text-xs inline-flex items-center gap-1 group-hover:text-primary transition-colors",
        value ? "text-foreground" : "text-muted-foreground/50",
      )}>
        {value || placeholder}
        <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-50 transition-opacity" />
      </span>
    </div>
  );
}

// ── Flight Status Strip ─────────────────────────────────────────────────────

export const FLIGHT_STAGES: ClientStatus[] = [
  "boarding",
  "taxiing",
  "in_flight",
  "landed",
  "cruising",
];

export function FlightStatusStrip({ current }: { current: ClientStatus }) {
  const currentIdx = FLIGHT_STAGES.indexOf(current);
  return (
    <div className="flex items-center gap-0 mt-4">
      {FLIGHT_STAGES.map((stage, i) => {
        const colors = CLIENT_STATUS_COLORS[stage];
        const isActive = i === currentIdx;
        const isPast = i < currentIdx;
        return (
          <div key={stage} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div
                className={cn(
                  "h-2 w-full rounded-full transition-colors",
                  isActive ? colors.dot : isPast ? "bg-primary/30" : "bg-muted",
                )}
              />
              <span
                className={cn(
                  "text-[9px] mt-1 font-medium transition-colors",
                  isActive ? colors.text : isPast ? "text-muted-foreground" : "text-muted-foreground/50",
                )}
              >
                {CLIENT_STATUS_LABELS[stage]}
              </span>
            </div>
            {i < FLIGHT_STAGES.length - 1 && (
              <div className={cn("h-0.5 w-2 shrink-0", isPast ? "bg-primary/30" : "bg-muted")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Date Helpers ────────────────────────────────────────────────────────────

export function relativeDate(isoStr: string): string {
  const d = new Date(isoStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

export function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
  });
}

export function fmtMonthYear(iso: string): string {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("en-CA", {
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nowIso(): string {
  return new Date().toISOString().slice(0, 16);
}

// ── Style Constants ─────────────────────────────────────────────────────────

export const PRIORITY_STYLES: Record<TaskPriority, string> = {
  high:   "bg-red-50 text-red-700 border-red-200",
  normal: "bg-blue-50 text-blue-700 border-blue-200",
  low:    "bg-gray-50 text-gray-600 border-gray-200",
};

export const SIDE_STYLES: Record<string, { label: string; cls: string }> = {
  buyer:  { label: "Buyer",  cls: "bg-blue-50 text-blue-700 border-blue-200" },
  seller: { label: "Seller", cls: "bg-purple-50 text-purple-700 border-purple-200" },
  both:   { label: "Both",   cls: "bg-teal-50 text-teal-700 border-teal-200" },
};

// ── Format response time ────────────────────────────────────────────────────

export function fmtResponseTime(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)}min`;
  if (hours < 24) return `${Math.round(hours * 10) / 10}hr`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}
