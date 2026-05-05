import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Calendar,
  FileWarning,
  Receipt,
  Sparkles,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

// PHASE 1: every number on this page is hardcoded. The visible "fake" pill on
// each card is intentional — Eleanor Konik's rule: never show fake numbers
// without flagging them, or you'll make wrong decisions. Real wiring lands in
// Phase 2 once Hugo / Vera / Quinn / Tessa have produced findings to read.
//
// Typography rule for this surface: mono is reserved for tabular numerical
// data only (currency, percentages, day counts, T-Nd values). Everything
// else — labels, prose, headings, anomaly bodies, navigation — uses the
// default sans (Geist Sans). Mono everywhere makes the page feel like a
// terminal log; restricting it to numbers makes it feel like a financial
// dashboard.

type Accent = "income" | "tax" | "rd" | "health" | "expenses" | "warn";

const ACCENT: Record<
  Accent,
  { ring: string; bar: string; text: string; glow: string; sparkStart: string; sparkStop: string }
> = {
  income:   { ring: "ring-emerald-500/15", bar: "bg-emerald-400",  text: "text-emerald-300",  glow: "shadow-emerald-500/10",  sparkStart: "rgb(52 211 153 / 0.55)", sparkStop: "rgb(52 211 153 / 0.00)" },
  tax:      { ring: "ring-cyan-500/15",    bar: "bg-cyan-400",     text: "text-cyan-300",     glow: "shadow-cyan-500/10",     sparkStart: "rgb(34 211 238 / 0.55)", sparkStop: "rgb(34 211 238 / 0.00)" },
  rd:       { ring: "ring-violet-500/15",  bar: "bg-violet-400",   text: "text-violet-300",   glow: "shadow-violet-500/10",   sparkStart: "rgb(167 139 250 / 0.55)", sparkStop: "rgb(167 139 250 / 0.00)" },
  health:   { ring: "ring-teal-500/15",    bar: "bg-teal-400",     text: "text-teal-300",     glow: "shadow-teal-500/10",     sparkStart: "rgb(45 212 191 / 0.55)", sparkStop: "rgb(45 212 191 / 0.00)" },
  expenses: { ring: "ring-amber-500/15",   bar: "bg-amber-400",    text: "text-amber-300",    glow: "shadow-amber-500/10",    sparkStart: "rgb(251 191 36 / 0.55)", sparkStop: "rgb(251 191 36 / 0.00)" },
  warn:     { ring: "ring-rose-500/15",    bar: "bg-rose-400",     text: "text-rose-300",     glow: "shadow-rose-500/10",     sparkStart: "rgb(251 113 133 / 0.55)", sparkStop: "rgb(251 113 133 / 0.00)" },
};

export default function SnapshotPage() {
  return (
    <div className="space-y-8">
      <PageHeader />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <CashCard />
        <HstCard />
        <SredCard />
        <DeadlinesCard />
        <ExpensesCard />
        <AnomaliesCard />
      </div>

      <ChatPanel />
    </div>
  );
}

function PageHeader() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-foreground text-2xl font-semibold tracking-tight">Snapshot</h1>
        <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm leading-relaxed">
          Agent Runway Inc.&rsquo;s current state at a glance. Click any card to drill in.
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground/80 inline-flex items-center gap-1.5 rounded-full border border-white/5 bg-white/[0.02] px-2.5 py-1">
          <span className="bg-emerald-400 inline-block h-1.5 w-1.5 animate-pulse rounded-full" />
          Live
        </span>
        <span className="text-muted-foreground/60 hidden sm:inline">refreshed just now</span>
      </div>
    </div>
  );
}

function Card({
  label,
  href,
  icon: Icon,
  accent,
  fake = true,
  children,
}: {
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  accent: Accent;
  fake?: boolean;
  children: React.ReactNode;
}) {
  const a = ACCENT[accent];
  const inner = (
    <article
      className={cn(
        "group relative isolate flex h-full flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent p-5 ring-1 ring-inset transition-all duration-300",
        a.ring,
        "hover:border-white/[0.12] hover:from-white/[0.06] hover:shadow-lg",
        a.glow,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-4 bottom-4 left-0 w-[2px] rounded-r-full opacity-60 transition-opacity duration-300 group-hover:opacity-100",
          a.bar,
        )}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-30",
          a.bar,
        )}
      />

      <header className="flex items-center justify-between gap-2 pb-4">
        <div className="text-muted-foreground/90 inline-flex items-center gap-2 text-[11px] font-medium tracking-[0.08em] uppercase">
          <Icon className={cn("h-3.5 w-3.5", a.text)} aria-hidden />
          <span>{label}</span>
        </div>
        {fake ? (
          <span
            title="Phase 1 placeholder — wired in Phase 2"
            className="text-muted-foreground/50 inline-flex items-center gap-1 text-[10px] tracking-wider uppercase"
          >
            <span className="bg-muted-foreground/40 inline-block h-1 w-1 rounded-full" aria-hidden />
            fake
          </span>
        ) : null}
      </header>
      <div className="flex-1">{children}</div>
    </article>
  );
  if (!href) return inner;
  return (
    <a
      href={href}
      className="focus-visible:ring-ring focus-visible:ring-offset-background rounded-xl focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      {inner}
    </a>
  );
}

function Sparkline({
  values,
  accent,
  height = 44,
}: {
  values: number[];
  accent: Accent;
  height?: number;
}) {
  const a = ACCENT[accent];
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const w = 100;
  const h = height;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => ({
    x: i * step,
    y: h - ((v - min) / range) * (h - 4) - 2,
  }));
  const linePoints = pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const areaPoints = `0,${h} ${linePoints} ${w},${h}`;
  const last = pts[pts.length - 1]!;
  const gradId = `spark-${accent}`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="h-11 w-full"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={a.sparkStart} />
          <stop offset="100%" stopColor={a.sparkStop} />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradId})`} />
      <polyline
        points={linePoints}
        fill="none"
        stroke={a.sparkStart.replace(" / 0.55", " / 0.95")}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={last.x}
        cy={last.y}
        r="1.8"
        fill={a.sparkStart.replace(" / 0.55", " / 1")}
      />
    </svg>
  );
}

function CashCard() {
  return (
    <Card label="Cash" href="/cockpit/cash" icon={Wallet} accent="income">
      <div className="space-y-4">
        <div>
          <p className="text-foreground font-mono text-[2.25rem] leading-none tracking-tight tabular-nums">
            $24,180
          </p>
          <p className="text-muted-foreground/80 mt-1.5 text-[11px] tracking-[0.08em] uppercase">
            Corporate operating · CAD
          </p>
        </div>
        <Sparkline values={[18, 19, 22, 21, 23, 22, 24, 24]} accent="income" />
        <p className="inline-flex items-center gap-1 text-xs">
          <ArrowUpRight className="text-emerald-300 h-3 w-3" aria-hidden />
          <span className="text-emerald-300 font-mono tabular-nums">+$2,340</span>
          <span className="text-muted-foreground/70">last 30 days</span>
        </p>
      </div>
    </Card>
  );
}

function HstCard() {
  return (
    <Card label="HST · Q2" href="/cockpit/hst" icon={Receipt} accent="tax">
      <div className="space-y-4">
        <div>
          <p className="text-foreground font-mono text-[2.25rem] leading-none tracking-tight tabular-nums">
            −$1,142
          </p>
          <p className="text-muted-foreground/80 mt-1.5 text-[11px] tracking-[0.08em] uppercase">
            Refundable to AR Inc. · ITCs &gt; collected
          </p>
        </div>
        <Sparkline values={[6, 8, 10, 12, 11, 13, 14, 15]} accent="tax" />
        <p className="text-muted-foreground/80 text-xs">
          Quarter ends in{" "}
          <span className="text-foreground font-mono tabular-nums">47 days</span>
        </p>
      </div>
    </Card>
  );
}

function SredCard() {
  const pct = 34;
  return (
    <Card label="SR&ED · YTD" href="/cockpit/sred" icon={Sparkles} accent="rd">
      <div className="space-y-4">
        <div>
          <p className="text-foreground font-mono text-[2.25rem] leading-none tracking-tight tabular-nums">
            $26,440
          </p>
          <p className="text-muted-foreground/80 mt-1.5 text-[11px] tracking-[0.08em] uppercase">
            Refundable estimate · 50% rate
          </p>
        </div>
        <div className="space-y-1.5">
          <div className="bg-white/[0.05] h-1.5 w-full overflow-hidden rounded-full ring-1 ring-inset ring-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground/80">
              <span className="font-mono tabular-nums">~417</span> eligible-likely hours
            </span>
            <span className="text-violet-300 font-mono tabular-nums">{pct}% of FY</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function DeadlinesCard() {
  const items = [
    { label: "HST Q2 filing",         days: 47,  severity: "soon" as const },
    { label: "Cox & Palmer retainer", days: 27,  severity: "soon" as const },
    { label: "T2 prep window opens",  days: 184, severity: "far"  as const },
  ];
  return (
    <Card label="Deadlines" href="/cockpit/deadlines" icon={Calendar} accent="health">
      <ul className="space-y-2.5">
        {items.map((item) => (
          <li
            key={item.label}
            className="flex items-center justify-between gap-3 border-b border-white/[0.04] pb-2 last:border-0 last:pb-0"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span
                aria-hidden
                className={cn(
                  "inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full",
                  item.severity === "soon" ? "bg-teal-400" : "bg-muted-foreground/30",
                )}
              />
              <span className="text-foreground/90 truncate text-sm">{item.label}</span>
            </span>
            <span
              className={cn(
                "font-mono text-[11px] whitespace-nowrap tabular-nums",
                item.severity === "soon" ? "text-foreground/80" : "text-muted-foreground/60",
              )}
            >
              T−{item.days}d
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ExpensesCard() {
  const rows = [
    { vendor: "Cox & Palmer", amount: 550 },
    { vendor: "Anthropic",    amount: 200 },
    { vendor: "Vercel",       amount: 84 },
    { vendor: "Mem0",         amount: 49 },
    { vendor: "Supabase",     amount: 25 },
  ];
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <Card label="This month · top expenses" href="/cockpit/expenses" icon={Banknote} accent="expenses">
      <ul className="space-y-1">
        {rows.map((row) => (
          <li
            key={row.vendor}
            className="flex items-center justify-between text-[13px]"
          >
            <span className="text-foreground/85">{row.vendor}</span>
            <span className="text-foreground font-mono tabular-nums">
              ${row.amount.toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2.5 text-[11px]">
        <span className="text-muted-foreground/80 inline-flex items-center gap-1">
          <ArrowDownRight className="h-3 w-3" aria-hidden />
          MTD
        </span>
        <span className="text-amber-300 font-mono tabular-nums">
          ${total.toLocaleString()}
        </span>
      </div>
    </Card>
  );
}

const PERSON_ACCENT: Record<string, { chip: string; dot: string }> = {
  Hugo:   { chip: "bg-amber-500/10  text-amber-300  ring-amber-500/15",   dot: "bg-amber-400" },
  Marcus: { chip: "bg-violet-500/10 text-violet-300 ring-violet-500/15",  dot: "bg-violet-400" },
  Vera:   { chip: "bg-teal-500/10   text-teal-300   ring-teal-500/15",    dot: "bg-teal-400" },
  Quinn:  { chip: "bg-rose-500/10   text-rose-300   ring-rose-500/15",    dot: "bg-rose-400" },
  Tessa:  { chip: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/15", dot: "bg-emerald-400" },
};

function AnomaliesCard() {
  const items = [
    { source: "Hugo",   body: "3 personal-card corp expenses await reimbursement", severity: "warn"  as const },
    { source: "Marcus", body: "Zero-commit day on 2026-05-02 — confirm rest day?", severity: "warn"  as const },
    { source: "Vera",   body: "Will fire 1 Jun (first monthly briefing)",           severity: "muted" as const },
  ];
  return (
    <Card
      label="Anomalies · 3 fresh"
      href="/cockpit/documents"
      icon={FileWarning}
      accent="warn"
    >
      <ul className="space-y-2.5">
        {items.map((item, i) => {
          const tone = PERSON_ACCENT[item.source] ?? PERSON_ACCENT.Hugo!;
          return (
            <li key={i} className="flex items-start gap-2.5 text-sm">
              <span
                aria-hidden
                className={cn(
                  "mt-1.5 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full",
                  item.severity === "warn" ? tone.dot : "bg-muted-foreground/30",
                )}
              />
              <div className="flex-1 leading-snug">
                <span
                  className={cn(
                    "mr-2 inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium tracking-[0.08em] uppercase ring-1 ring-inset",
                    tone.chip,
                  )}
                >
                  {item.source}
                </span>
                <span className="text-foreground/85">{item.body}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ChatPanel() {
  return (
    <section
      aria-label="Ask Claude"
      className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br from-violet-500/[0.04] via-white/[0.02] to-blue-500/[0.04] p-5 ring-1 ring-inset ring-white/[0.04]"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-12 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl"
      />
      <div className="relative flex items-center justify-between pb-3">
        <h2 className="text-muted-foreground/90 inline-flex items-center gap-2 text-[11px] font-medium tracking-[0.08em] uppercase">
          <Sparkles className="h-3.5 w-3.5 text-violet-300" aria-hidden />
          Ask Claude · corporate-finance-champion
        </h2>
        <span className="text-muted-foreground/70 inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] tracking-wider uppercase ring-1 ring-inset ring-white/[0.06]">
          Phase 2
        </span>
      </div>
      <div className="relative rounded-lg border border-white/[0.05] bg-black/30 p-3.5 text-sm">
        <span className="text-violet-300 font-mono">&gt;_ </span>
        <span className="text-muted-foreground/70">
          Embedded chat lands in Phase 2. For now, ask the corporate-finance-champion in your
          Claude Code session.
        </span>
      </div>
    </section>
  );
}
