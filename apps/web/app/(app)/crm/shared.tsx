"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, X, Check, Plus, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClientStatus, TaskPriority } from "@/lib/types/database";
import { CLIENT_STATUS_LABELS, CLIENT_STATUS_COLORS, PREDEFINED_TAGS } from "@/lib/types/database";

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
  const localValRef = useRef(localVal);

  // Keep ref in sync so blur handler always reads the latest value
  useEffect(() => { localValRef.current = localVal; }, [localVal]);

  function commit() {
    const current = localValRef.current;
    setEditing(false);
    if (current !== value) onSave(current);
  }

  if (editing) {
    return (
      <div>
        {label && <span className="text-[10px] text-muted-foreground block mb-0.5">{label}</span>}
        <Input
          autoFocus
          type={type}
          value={localVal}
          onChange={(e) => { setLocalVal(e.target.value); localValRef.current = e.target.value; }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") { e.preventDefault(); setLocalVal(value); localValRef.current = value; setEditing(false); }
            // Tab: onBlur handles saving; browser naturally moves to next focusable field
          }}
          className="h-7 text-xs"
        />
      </div>
    );
  }

  return (
    <div
      className="cursor-pointer group"
      tabIndex={0}
      role="button"
      aria-label={label ? `Edit ${label}` : "Edit field"}
      onClick={() => { setLocalVal(value); setEditing(true); }}
      onFocus={() => { setLocalVal(value); setEditing(true); }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLocalVal(value); setEditing(true); }
      }}
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
// Rendered as un-ordered chips, NOT a linear progress bar — Scheduled is a
// future-intent parking slot that often comes before Boarding, and Cruising
// is a post-close state. Treating these as a left-to-right sequence misled
// users about what "Scheduled" means.

export const FLIGHT_STAGES: ClientStatus[] = [
  "boarding",
  "scheduled",
  "in_flight",
  "cruising",
];

export function FlightStatusStrip({ current }: { current: ClientStatus }) {
  return (
    <div className="flex items-center gap-1.5 mt-4 flex-wrap">
      {FLIGHT_STAGES.map((stage) => {
        const colors = CLIENT_STATUS_COLORS[stage];
        const isActive = stage === current;
        return (
          <span
            key={stage}
            className={cn(
              "text-[10px] font-medium px-2 py-1 rounded-full border transition-colors",
              isActive
                ? cn(colors.bg, colors.text, colors.border)
                : "bg-muted/30 text-muted-foreground/60 border-transparent",
            )}
          >
            {CLIENT_STATUS_LABELS[stage]}
          </span>
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

// ── Country-Aware Address Labels ─────────────────────────────────────────────

export interface CountryAddressLabels {
  provinceLabel:     string;   // "Province / Region", "State", "County", "Region"
  postalLabel:       string;   // "Postal Code", "ZIP Code", "Post Code"
  postalPlaceholder: string;   // "A1A 1A1", "12345", "SW1A 1AA"
}

const EU_COUNTRIES = new Set([
  "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czech Republic",
  "Denmark", "Estonia", "Finland", "France", "Germany", "Greece", "Hungary",
  "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg", "Malta", "Netherlands",
  "Poland", "Portugal", "Romania", "Slovakia", "Slovenia", "Spain", "Sweden",
]);

export function getCountryLabels(country: string): CountryAddressLabels {
  const c = (country ?? "").trim();
  if (c === "United States" || c === "USA" || c === "US")
    return { provinceLabel: "State", postalLabel: "ZIP Code", postalPlaceholder: "12345" };
  if (c === "United Kingdom" || c === "UK" || c === "England" || c === "Scotland" || c === "Wales" || c === "Northern Ireland")
    return { provinceLabel: "County", postalLabel: "Post Code", postalPlaceholder: "SW1A 1AA" };
  if (EU_COUNTRIES.has(c))
    return { provinceLabel: "Region", postalLabel: "Postal Code", postalPlaceholder: "" };
  // Default: Canada
  return { provinceLabel: "Province / Region", postalLabel: "Postal Code", postalPlaceholder: "A1A 1A1" };
}

// ── Format response time ────────────────────────────────────────────────────

export function fmtResponseTime(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)}min`;
  if (hours < 24) return `${Math.round(hours * 10) / 10}hr`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

// ── Tag Picker ───────────────────────────────────────────────────────────────

export function TagPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function removeTag(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  function togglePredefined(tag: string) {
    if (value.includes(tag)) {
      onChange(value.filter((t) => t !== tag));
    } else {
      onChange([...value, tag]);
    }
  }

  function addCustom() {
    const trimmed = customInput.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setCustomInput("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <div className="space-y-2">
      {/* Current tag chips */}
      <div className="flex flex-wrap gap-1 min-h-[20px]">
        {value.length === 0 && !open && (
          <span className="text-[11px] text-muted-foreground/50 italic">No tags</span>
        )}
        {value.map((tag) => (
          <Badge
            key={tag}
            variant="outline"
            className="text-[10px] bg-violet-50 text-violet-700 border-violet-200 pr-1 gap-1 cursor-default"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="rounded-full hover:bg-violet-200 transition-colors p-0.5"
              aria-label={`Remove ${tag}`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </Badge>
        ))}
      </div>

      {/* Toggle picker */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-[11px] gap-1.5 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
      >
        <Plus className="h-3 w-3" />
        {open ? "Done" : "Add tag"}
      </Button>

      {/* Expanded picker panel */}
      {open && (
        <div className="rounded-xl border border-border/60 bg-muted/20 p-2 space-y-2">
          {/* Custom tag input */}
          <div className="flex gap-1.5 items-center">
            <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Input
              ref={inputRef}
              autoFocus
              placeholder="Custom tag…"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); addCustom(); }
                if (e.key === "Escape") setOpen(false);
              }}
              className="h-7 text-xs flex-1"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 px-2 text-[11px] shrink-0"
              onClick={addCustom}
              disabled={!customInput.trim()}
            >
              Add
            </Button>
          </div>

          {/* Predefined tags grouped by category */}
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {PREDEFINED_TAGS.map(({ category, tags }) => (
              <div key={category}>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  {category}
                </p>
                <div className="flex flex-wrap gap-1">
                  {tags.map((tag) => {
                    const selected = value.includes(tag);
                    return (
                      <button
                        type="button"
                        key={tag}
                        onClick={() => togglePredefined(tag)}
                        className={cn(
                          "inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                          selected
                            ? "bg-violet-100 text-violet-700 border-violet-300"
                            : "bg-background text-muted-foreground border-border hover:border-violet-300 hover:text-violet-700",
                        )}
                      >
                        {selected && <Check className="h-2.5 w-2.5" />}
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
