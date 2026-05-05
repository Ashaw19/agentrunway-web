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

export default function SnapshotPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-foreground font-mono text-2xl tracking-tight">Snapshot</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            Agent Runway Inc.&rsquo;s current state at a glance. Click any card to drill in.
          </p>
        </div>
        <p className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[11px]">
          <span className="bg-primary inline-block h-1.5 w-1.5 animate-pulse rounded-full" />
          Last refreshed just now
        </p>
      </div>

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

function Card({
  label,
  href,
  icon: Icon,
  children,
}: {
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  children: React.ReactNode;
}) {
  const inner = (
    <article className="border-border/60 bg-card/40 hover:border-border hover:bg-card/70 group relative flex h-full flex-col rounded-lg border p-4 transition-colors">
      <header className="flex items-center justify-between gap-2 pb-3">
        <div className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[11px] tracking-wider uppercase">
          <Icon className="h-3.5 w-3.5" aria-hidden />
          <span>{label}</span>
        </div>
        <span className="text-muted-foreground/70 border-border/50 inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[9px] tracking-wide uppercase">
          fake
        </span>
      </header>
      <div className="flex-1">{children}</div>
    </article>
  );
  if (!href) return inner;
  return (
    <a href={href} className="focus-visible:ring-ring rounded-lg focus-visible:ring-2 focus-visible:outline-none">
      {inner}
    </a>
  );
}

function Sparkline({ values, accent = "text-primary" }: { values: number[]; accent?: string }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const w = 100;
  const h = 28;
  const step = w / (values.length - 1);
  const points = values
    .map((v, i) => `${(i * step).toFixed(2)},${(h - ((v - min) / range) * h).toFixed(2)}`)
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={cn("h-7 w-full", accent)}
      aria-hidden
    >
      <polyline fill="none" stroke="currentColor" strokeWidth="1.4" points={points} />
    </svg>
  );
}

function CashCard() {
  return (
    <Card label="Cash" href="/cockpit/cash" icon={Wallet}>
      <div className="space-y-3">
        <div className="font-mono">
          <p className="text-foreground text-3xl tracking-tight tabular-nums">$24,180</p>
          <p className="text-muted-foreground mt-0.5 text-[11px] uppercase tracking-wider">
            Corporate operating · CAD
          </p>
        </div>
        <Sparkline values={[18, 19, 22, 21, 23, 22, 24, 24]} />
        <p className="text-primary inline-flex items-center gap-1 font-mono text-xs">
          <ArrowUpRight className="h-3 w-3" aria-hidden />
          +$2,340 · last 30 days
        </p>
      </div>
    </Card>
  );
}

function HstCard() {
  return (
    <Card label="HST · Q2" href="/cockpit/hst" icon={Receipt}>
      <div className="space-y-3">
        <div className="font-mono">
          <p className="text-foreground text-3xl tracking-tight tabular-nums">−$1,142</p>
          <p className="text-muted-foreground mt-0.5 text-[11px] uppercase tracking-wider">
            Refundable to AR Inc. · ITCs &gt; collected
          </p>
        </div>
        <Sparkline values={[6, 8, 10, 12, 11, 13, 14, 15]} accent="text-primary" />
        <p className="text-muted-foreground font-mono text-xs">Quarter ends in 47 days</p>
      </div>
    </Card>
  );
}

function SredCard() {
  return (
    <Card label="SR&ED · YTD" href="/cockpit/sred" icon={Sparkles}>
      <div className="space-y-3">
        <div className="font-mono">
          <p className="text-foreground text-3xl tracking-tight tabular-nums">$26,440</p>
          <p className="text-muted-foreground mt-0.5 text-[11px] uppercase tracking-wider">
            Refundable estimate · 50% rate
          </p>
        </div>
        <div className="bg-primary/10 h-1.5 w-full overflow-hidden rounded-full">
          <div className="bg-primary h-full" style={{ width: "34%" }} />
        </div>
        <p className="text-muted-foreground font-mono text-xs tabular-nums">
          ~417 eligible-likely hours · 34% of fiscal year
        </p>
      </div>
    </Card>
  );
}

function DeadlinesCard() {
  const items = [
    { label: "HST Q2 filing", days: 47, severity: "ok" as const },
    { label: "Cox & Palmer retainer", days: 27, severity: "ok" as const },
    { label: "T2 prep window opens", days: 184, severity: "muted" as const },
  ];
  return (
    <Card label="Deadlines" href="/cockpit/deadlines" icon={Calendar}>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.label} className="flex items-center justify-between gap-3">
            <span className="text-foreground/90 truncate text-sm">{item.label}</span>
            <span
              className={cn(
                "font-mono text-xs whitespace-nowrap tabular-nums",
                item.severity === "muted" ? "text-muted-foreground" : "text-foreground",
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
    { vendor: "Anthropic", amount: 200 },
    { vendor: "Vercel", amount: 84 },
    { vendor: "Cox & Palmer", amount: 550 },
    { vendor: "Supabase", amount: 25 },
    { vendor: "Mem0", amount: 49 },
  ];
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <Card label="This month · top expenses" href="/cockpit/expenses" icon={Banknote}>
      <ul className="divide-border/40 -mx-1 divide-y">
        {rows.map((row) => (
          <li
            key={row.vendor}
            className="flex items-center justify-between px-1 py-1.5 font-mono text-sm"
          >
            <span className="text-foreground/90">{row.vendor}</span>
            <span className="text-foreground tabular-nums">${row.amount.toLocaleString()}</span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground mt-3 inline-flex items-center gap-1 font-mono text-[11px]">
        <ArrowDownRight className="h-3 w-3" aria-hidden />
        Total ${total.toLocaleString()} · MTD
      </p>
    </Card>
  );
}

function AnomaliesCard() {
  const items = [
    { source: "Hugo", body: "3 personal-card corp expenses await reimbursement", severity: "warn" as const },
    { source: "Marcus", body: "Zero-commit day on 2026-05-02 — confirm rest day?", severity: "warn" as const },
    { source: "Vera", body: "Will fire 1 Jun (first monthly briefing)", severity: "muted" as const },
  ];
  return (
    <Card label="Anomalies · 3 fresh" href="/cockpit/documents" icon={FileWarning}>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span
              className={cn(
                "mt-1 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full",
                item.severity === "warn" ? "bg-primary" : "bg-muted-foreground/40",
              )}
              aria-hidden
            />
            <span className="text-foreground/90">
              <span className="text-muted-foreground font-mono text-[11px] uppercase tracking-wider">
                {item.source}{" "}
              </span>
              {item.body}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ChatPanel() {
  return (
    <section
      aria-label="Ask Claude"
      className="border-border/60 bg-card/40 rounded-lg border p-4"
    >
      <div className="flex items-center justify-between pb-3">
        <h2 className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[11px] tracking-wider uppercase">
          <span>Ask Claude · corporate-finance-champion</span>
        </h2>
        <span className="text-muted-foreground/70 border-border/50 inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[9px] tracking-wide uppercase">
          Phase 2
        </span>
      </div>
      <div className="border-border/50 bg-background/40 rounded-md border p-3 font-mono text-sm">
        <span className="text-muted-foreground">&gt; </span>
        <span className="text-muted-foreground/60">
          Embedded chat lands in Phase 2. For now, ask the corporate-finance-champion in your Claude
          Code session.
        </span>
      </div>
    </section>
  );
}
