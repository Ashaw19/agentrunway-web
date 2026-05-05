import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type CockpitAccent = "income" | "tax" | "rd" | "health" | "expenses" | "warn";

const ACCENT: Record<
  CockpitAccent,
  { ring: string; bar: string; text: string; iconBg: string; chip: string }
> = {
  income:   { ring: "ring-emerald-500/15", bar: "bg-emerald-400",  text: "text-emerald-300",  iconBg: "bg-emerald-500/10", chip: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/15" },
  tax:      { ring: "ring-cyan-500/15",    bar: "bg-cyan-400",     text: "text-cyan-300",     iconBg: "bg-cyan-500/10",    chip: "bg-cyan-500/10 text-cyan-300 ring-cyan-500/15" },
  rd:       { ring: "ring-violet-500/15",  bar: "bg-violet-400",   text: "text-violet-300",   iconBg: "bg-violet-500/10",  chip: "bg-violet-500/10 text-violet-300 ring-violet-500/15" },
  health:   { ring: "ring-teal-500/15",    bar: "bg-teal-400",     text: "text-teal-300",     iconBg: "bg-teal-500/10",    chip: "bg-teal-500/10 text-teal-300 ring-teal-500/15" },
  expenses: { ring: "ring-amber-500/15",   bar: "bg-amber-400",    text: "text-amber-300",    iconBg: "bg-amber-500/10",   chip: "bg-amber-500/10 text-amber-300 ring-amber-500/15" },
  warn:     { ring: "ring-rose-500/15",    bar: "bg-rose-400",     text: "text-rose-300",     iconBg: "bg-rose-500/10",    chip: "bg-rose-500/10 text-rose-300 ring-rose-500/15" },
};

export function PlaceholderPage({
  title,
  blurb,
  icon: Icon,
  upcoming,
  accent = "health",
}: {
  title: string;
  blurb: string;
  icon: LucideIcon;
  upcoming: string[];
  accent?: CockpitAccent;
}) {
  const a = ACCENT[accent];
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start gap-4">
        <span
          aria-hidden
          className={cn(
            "inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
            a.iconBg,
            a.ring,
          )}
        >
          <Icon className={cn("h-5 w-5", a.text)} aria-hidden />
        </span>
        <div className="flex-1 min-w-0">
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm leading-relaxed">{blurb}</p>
        </div>
      </header>

      <section
        aria-label="Coming in Phase 2"
        className={cn(
          "relative overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent p-6 ring-1 ring-inset",
          a.ring,
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-4 bottom-4 left-0 w-[2px] rounded-r-full opacity-60",
            a.bar,
          )}
        />
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute -top-16 -right-12 h-48 w-48 rounded-full opacity-[0.06] blur-3xl",
            a.bar,
          )}
        />

        <div className="relative">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] ring-1 ring-inset",
                a.chip,
              )}
            >
              <span className={cn("inline-block h-1 w-1 rounded-full", a.bar)} aria-hidden />
              Phase 2
            </span>
            <span className="text-muted-foreground/70 text-[11px] uppercase tracking-[0.08em]">
              planned content
            </span>
          </div>
          <ul className="mt-4 space-y-2">
            {upcoming.map((item) => (
              <li key={item} className="text-foreground/80 flex items-start gap-2.5 text-sm leading-relaxed">
                <span
                  aria-hidden
                  className={cn(
                    "mt-1.5 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full opacity-70",
                    a.bar,
                  )}
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground/70 mt-6 text-[11px] leading-relaxed">
            Wired once Hugo / Vera / Quinn / Tessa start producing findings (after QuickBooks MCP
            authenticates).
          </p>
        </div>
      </section>
    </div>
  );
}
