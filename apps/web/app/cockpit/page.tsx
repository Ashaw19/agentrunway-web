import {
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Circle,
  Flame,
  Gauge,
  Inbox,
  Receipt,
  Sparkles,
  Wallet,
} from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

// Snapshot — the 8 cards that belong on a glance view.
//
// Operating health (3): Cash · Burn · Runway
// Filing health    (5): Inbox · YTD Net · HST · SR&ED · Deadlines
//
// Every other card (Founder Loan, Minute Book, Compliance Calendar,
// Bank Recon, Export Bundle, Top Expenses, Weekly Review) was cut.
// Each has its own tab in the nav; the Snapshot is not a nav menu.
//
// Eleanor Konik rule: never show a fake number without flagging it.

type Accent = "income" | "tax" | "rd" | "health" | "expenses" | "warn";

const ACCENT: Record<
  Accent,
  { ring: string; bar: string; text: string; glow: string }
> = {
  income:   { ring: "ring-emerald-500/15", bar: "bg-emerald-400",  text: "text-emerald-300",  glow: "shadow-emerald-500/10"  },
  tax:      { ring: "ring-cyan-500/15",    bar: "bg-cyan-400",     text: "text-cyan-300",     glow: "shadow-cyan-500/10"     },
  rd:       { ring: "ring-violet-500/15",  bar: "bg-violet-400",   text: "text-violet-300",   glow: "shadow-violet-500/10"   },
  health:   { ring: "ring-teal-500/15",    bar: "bg-teal-400",     text: "text-teal-300",     glow: "shadow-teal-500/10"     },
  expenses: { ring: "ring-amber-500/15",   bar: "bg-amber-400",    text: "text-amber-300",    glow: "shadow-amber-500/10"    },
  warn:     { ring: "ring-rose-500/15",    bar: "bg-rose-400",     text: "text-rose-300",     glow: "shadow-rose-500/10"     },
};

const fmtCAD = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

const fmtSigned = (n: number) =>
  (n >= 0 ? "" : "−") + fmtCAD(Math.abs(n));

type HstSummary = {
  quarter_start: string;
  quarter_end: string;
  hst_collected: number;
  hst_itc: number;
  net_remittance: number;
  txn_count: number;
};

type SredRow = {
  fiscal_year: number;
  sred_category: string | null;
  txn_count: number;
  total_corp_portion: number;
};

type CashSnapshotRow = {
  as_of_date: string;
  amount_cad: number;
  source_label: string | null;
};

type InboxRow = {
  id: string;
  title: string;
  severity: "low" | "medium" | "high";
  source: string;
  created_at: string;
};

type BurnRow = {
  amount_total: number | null;
  corp_pct: number | null;
  account_type: string | null;
};

export default async function SnapshotPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/cockpit");

  const today = new Date();
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const _startOfFY = ymd(new Date(today.getFullYear(), 0, 1));

  const burnWindowStart = ymd(
    new Date(today.getFullYear(), today.getMonth(), today.getDate() - 89),
  );

  const [
    hstRes,
    sredRes,
    ytdRes,
    cashSnapshotRes,
    burnRowsRes,
    inboxRes,
    sredLabourRes,
  ] = await Promise.all([
    supabase
      .from("v_corp_gst_hst_summary")
      .select("quarter_start, quarter_end, hst_collected, hst_itc, net_remittance, txn_count")
      .eq("user_id", user.id)
      .order("quarter_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("v_corp_sred_eligible_totals")
      .select("fiscal_year, sred_category, txn_count, total_corp_portion")
      .eq("user_id", user.id)
      .eq("fiscal_year", today.getFullYear()),
    supabase
      .from("v_corp_pl_by_account")
      .select("account_type, total_corp_portion")
      .eq("user_id", user.id)
      .eq("fiscal_year", today.getFullYear()),
    supabase
      .from("corp_cash_snapshots")
      .select("as_of_date, amount_cad, source_label")
      .eq("user_id", user.id)
      .order("as_of_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("corp_transactions")
      .select("amount_total, corp_pct, account_type")
      .eq("user_id", user.id)
      .gte("date", burnWindowStart)
      .lte("date", ymd(today))
      .in("account_type", ["cogs", "opex"]),
    supabase
      .from("corp_inbox_items")
      .select("id, title, severity, source, created_at")
      .eq("user_id", user.id)
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("v_corp_sred_annual_summary")
      .select("entry_count, total_hours, eligible_hours, high_hours, medium_hours, low_hours, none_hours")
      .eq("user_id", user.id)
      .eq("fiscal_year", today.getFullYear())
      .maybeSingle(),
  ]);

  const hst = (hstRes.data ?? null) as HstSummary | null;
  const sredRows = (sredRes.data ?? []) as SredRow[];
  const ytdRows = (ytdRes.data ?? []) as { account_type: string; total_corp_portion: number }[];
  const cashSnapshot = (cashSnapshotRes.data ?? null) as CashSnapshotRow | null;
  const burnRows = (burnRowsRes.data ?? []) as BurnRow[];
  const inboxItems = (inboxRes.data ?? []) as InboxRow[];
  const sredLabour = (sredLabourRes.data ?? null) as {
    entry_count: number;
    total_hours: number;
    eligible_hours: number;
  } | null;

  // Cash
  const cashAmount = cashSnapshot ? Number(cashSnapshot.amount_cad ?? 0) : null;
  const cashAsOf = cashSnapshot?.as_of_date ?? null;
  const cashSource = cashSnapshot?.source_label ?? null;
  const cashStaleDays = cashAsOf
    ? Math.max(0, Math.floor((today.getTime() - new Date(cashAsOf).getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  // Burn — trailing 90 days cogs+opex corp portion ÷ 3
  const burn90Total = burnRows.reduce((sum, r) => {
    const amount = Number(r.amount_total ?? 0);
    const pct = Number(r.corp_pct ?? 100);
    return sum + (amount * pct) / 100;
  }, 0);
  const monthlyBurn = burn90Total > 0 ? burn90Total / 3 : null;

  // Runway — $0 cash is valid (shows 0 months), null cash means no snapshot
  const runwayMonths =
    cashAmount !== null && monthlyBurn !== null && monthlyBurn > 0
      ? cashAmount / monthlyBurn
      : null;

  // SR&ED
  const sredTotal = sredRows.reduce((s, r) => s + Number(r.total_corp_portion ?? 0), 0);
  const sredRefundEstimate = sredTotal * 0.5;

  // YTD
  const ytdRevenue = ytdRows
    .filter((r) => r.account_type === "revenue")
    .reduce((s, r) => s + Number(r.total_corp_portion ?? 0), 0);
  const ytdExpenses = ytdRows
    .filter((r) => r.account_type === "cogs" || r.account_type === "opex")
    .reduce((s, r) => s + Number(r.total_corp_portion ?? 0), 0);
  const ytdNet = ytdRevenue - ytdExpenses;

  // Fiscal year progress
  const startOfFYDate = new Date(today.getFullYear(), 0, 1);
  const endOfFYDate = new Date(today.getFullYear(), 11, 31);
  const fyTotalDays = Math.round((endOfFYDate.getTime() - startOfFYDate.getTime()) / (1000 * 60 * 60 * 24));
  const fyElapsedDays = Math.round((today.getTime() - startOfFYDate.getTime()) / (1000 * 60 * 60 * 24));
  const fyPct = Math.max(0, Math.min(100, Math.round((fyElapsedDays / fyTotalDays) * 100)));

  const deadlines = computeDeadlines(today);

  return (
    <div className="space-y-8">
      <PageHeader />

      {/* Operating health — Cash, Burn, Runway */}
      <section aria-label="Operating health" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-foreground/90 font-[var(--font-cockpit-display)] text-xl font-normal tracking-tight">
            Operating health
          </h2>
          <span className="text-muted-foreground/60 hidden text-[11px] tracking-[0.08em] uppercase sm:inline">
            Cash · Burn · Runway
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <CashPositionCard
            amount={cashAmount}
            asOf={cashAsOf}
            staleDays={cashStaleDays}
            sourceLabel={cashSource}
          />
          <MonthlyBurnCard monthlyBurn={monthlyBurn} txnCount={burnRows.length} />
          <RunwayCard runwayMonths={runwayMonths} hasCash={cashAmount !== null} hasBurn={monthlyBurn !== null} />
        </div>
      </section>

      {/* Filing health — Inbox, YTD, HST, SR&ED, Deadlines */}
      <section aria-label="Filing health" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-foreground/90 font-[var(--font-cockpit-display)] text-xl font-normal tracking-tight">
            Filing health
          </h2>
          <span className="text-muted-foreground/60 hidden text-[11px] tracking-[0.08em] uppercase sm:inline">
            Inbox · YTD · HST · SR&amp;ED · Deadlines
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InboxCard items={inboxItems} />
          <YtdNetCard ytdNet={ytdNet} ytdRevenue={ytdRevenue} ytdExpenses={ytdExpenses} />
          <HstCard hst={hst} />
          <SredCard refundEstimate={sredRefundEstimate} totalCorpPortion={sredTotal} fyPct={fyPct} labour={sredLabour} />
          <DeadlinesCard items={deadlines} />
        </div>
      </section>
    </div>
  );
}

function PageHeader() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-foreground font-[var(--font-cockpit-display)] text-4xl font-normal leading-none tracking-tight">
          Snapshot
        </h1>
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
  pill,
  children,
}: {
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  accent: Accent;
  pill?: { label: string; tooltip?: string };
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
        {pill ? (
          <span
            title={pill.tooltip}
            className="text-muted-foreground/50 inline-flex items-center gap-1 text-[10px] tracking-wider uppercase"
          >
            <span className="bg-muted-foreground/40 inline-block h-1 w-1 rounded-full" aria-hidden />
            {pill.label}
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

// ── Operating health ────────────────────────────────────────────────────────

function CashPositionCard({
  amount,
  asOf,
  staleDays,
  sourceLabel,
}: {
  amount: number | null;
  asOf: string | null;
  staleDays: number | null;
  sourceLabel: string | null;
}) {
  if (amount === null || asOf === null) {
    return (
      <Card label="Cash position" href="/cockpit/cash" icon={Wallet} accent="income" pill={{ label: "manual", tooltip: "Manual snapshot — no bank-feed integration yet" }}>
        <div className="space-y-3">
          <div>
            <p className="text-foreground/80 font-mono text-[2.25rem] leading-none tracking-tight tabular-nums">—</p>
            <p className="text-muted-foreground/80 mt-1.5 text-[11px] tracking-[0.08em] uppercase">No snapshot logged yet</p>
          </div>
          <p className="text-muted-foreground/70 text-xs">Log a balance snapshot to anchor cash position and runway.</p>
          <p className="text-emerald-300 inline-flex items-center gap-1 text-xs font-medium">
            Log balance
            <ArrowUpRight className="h-3 w-3" aria-hidden />
          </p>
        </div>
      </Card>
    );
  }
  const stalePill =
    staleDays !== null && staleDays >= 14
      ? { label: `manual · ${staleDays}d old`, tooltip: `Last snapshot is ${staleDays} days old. Click to log a fresh balance.` }
      : { label: "manual", tooltip: "Manual snapshot — no bank-feed integration yet" };
  return (
    <Card label="Cash position" href="/cockpit/cash" icon={Wallet} accent="income" pill={stalePill}>
      <div className="space-y-3">
        <div>
          <p className="text-foreground font-mono text-[2.25rem] leading-none tracking-tight tabular-nums">
            {fmtCAD(amount)}
          </p>
          <p className="text-muted-foreground/80 mt-1.5 text-[11px] tracking-[0.08em] uppercase">
            As of <span className="font-mono tabular-nums">{asOf}</span>
            {staleDays !== null && staleDays > 0 && (
              <> · <span className="font-mono tabular-nums">{staleDays}d</span> ago</>
            )}
          </p>
        </div>
        {sourceLabel && <p className="text-muted-foreground/70 truncate text-xs">{sourceLabel}</p>}
        <p className="text-muted-foreground/60 text-[11px]">Click to log a fresh snapshot or update the source.</p>
      </div>
    </Card>
  );
}

function MonthlyBurnCard({ monthlyBurn, txnCount }: { monthlyBurn: number | null; txnCount: number }) {
  if (monthlyBurn === null) {
    return (
      <Card label="Monthly burn" href="/cockpit/expenses" icon={Flame} accent="expenses">
        <div className="space-y-3">
          <div>
            <p className="text-foreground/80 font-mono text-[2.25rem] leading-none tracking-tight tabular-nums">—</p>
            <p className="text-muted-foreground/80 mt-1.5 text-[11px] tracking-[0.08em] uppercase">No spend in trailing 90 days</p>
          </div>
          <p className="text-muted-foreground/70 text-xs">Add cogs / opex transactions to populate.</p>
        </div>
      </Card>
    );
  }
  return (
    <Card label="Monthly burn" href="/cockpit/expenses" icon={Flame} accent="expenses">
      <div className="space-y-3">
        <div>
          <p className="text-foreground font-mono text-[2.25rem] leading-none tracking-tight tabular-nums">
            {fmtCAD(monthlyBurn)}
          </p>
          <p className="text-muted-foreground/80 mt-1.5 text-[11px] tracking-[0.08em] uppercase">
            Trailing 90 days · ÷ 3 · corp portion
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground/70 text-[10px] tracking-[0.08em] uppercase">90-day total</p>
            <p className="text-foreground font-mono mt-0.5 tabular-nums">{fmtCAD(monthlyBurn * 3)}</p>
          </div>
          <div>
            <p className="text-muted-foreground/70 text-[10px] tracking-[0.08em] uppercase">Txns</p>
            <p className="text-foreground font-mono mt-0.5 tabular-nums">{txnCount}</p>
          </div>
        </div>
        <p className="text-muted-foreground/70 inline-flex items-center gap-1 text-xs">
          <ArrowDownRight className="h-3 w-3" aria-hidden />
          cogs + opex only
        </p>
      </div>
    </Card>
  );
}

function RunwayCard({
  runwayMonths,
  hasCash,
  hasBurn,
}: {
  runwayMonths: number | null;
  hasCash: boolean;
  hasBurn: boolean;
}) {
  if (runwayMonths === null) {
    const reason = !hasCash && !hasBurn
      ? "Needs cash snapshot + spend history."
      : !hasCash
        ? "Needs a cash-balance snapshot."
        : "Needs trailing-90 cogs/opex.";
    return (
      <Card label="SaaS runway" href="/cockpit/cash" icon={Gauge} accent="health">
        <div className="space-y-3">
          <div>
            <p className="text-foreground/80 font-mono text-[2.25rem] leading-none tracking-tight tabular-nums">—</p>
            <p className="text-muted-foreground/80 mt-1.5 text-[11px] tracking-[0.08em] uppercase">Insufficient inputs</p>
          </div>
          <p className="text-muted-foreground/70 text-xs">{reason}</p>
        </div>
      </Card>
    );
  }
  const severity: Accent = runwayMonths < 6 ? "warn" : runwayMonths < 12 ? "expenses" : "health";
  const gaugePct = Math.max(0, Math.min(100, Math.round((Math.min(runwayMonths, 24) / 24) * 100)));
  const monthsLabel = runwayMonths >= 100 ? `${runwayMonths.toFixed(0)}` : runwayMonths.toFixed(1);
  const severityCopy = runwayMonths < 6 ? "Short horizon" : runwayMonths < 12 ? "Medium horizon" : "Long horizon";
  return (
    <Card label="SaaS runway" href="/cockpit/cash" icon={Gauge} accent={severity}>
      <div className="space-y-4">
        <div>
          <p className="text-foreground font-mono text-[2.25rem] leading-none tracking-tight tabular-nums">
            {monthsLabel}
            <span className="text-muted-foreground/70 ml-2 text-base">months</span>
          </p>
          <p className="text-muted-foreground/80 mt-1.5 text-[11px] tracking-[0.08em] uppercase">Cash ÷ monthly burn</p>
        </div>
        <div className="space-y-1.5">
          <div className="bg-white/[0.05] h-1.5 w-full overflow-hidden rounded-full ring-1 ring-inset ring-white/5">
            <div
              className={cn(
                "h-full rounded-full bg-gradient-to-r",
                severity === "warn" && "from-rose-500 to-rose-300",
                severity === "expenses" && "from-amber-500 to-amber-300",
                severity === "health" && "from-teal-500 to-teal-300",
              )}
              style={{ width: `${gaugePct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground/80">{severityCopy}</span>
            <span className={cn("font-mono tabular-nums", ACCENT[severity].text)}>
              {gaugePct}% of 24mo
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── Filing health ───────────────────────────────────────────────────────────

const SEVERITY_DOT: Record<string, string> = {
  high:   "bg-rose-400",
  medium: "bg-amber-400",
  low:    "bg-white/30",
};

function InboxCard({ items }: { items: InboxRow[] }) {
  const count = items.length;
  if (count === 0) {
    return (
      <Card label="Inbox" href="/cockpit/inbox" icon={Inbox} accent="health">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-teal-400/70" aria-hidden />
            <p className="text-foreground/80 text-sm">All clear</p>
          </div>
          <p className="text-muted-foreground/70 text-xs">
            No open items. Automated surfaces will post here when they need your input.
          </p>
        </div>
      </Card>
    );
  }
  return (
    <Card label="Inbox" href="/cockpit/inbox" icon={Inbox} accent="warn">
      <div className="space-y-3">
        <div>
          <p className="text-foreground font-mono text-[2.25rem] leading-none tracking-tight tabular-nums">{count}</p>
          <p className="text-muted-foreground/80 mt-1.5 text-[11px] tracking-[0.08em] uppercase">
            Open item{count !== 1 ? "s" : ""} · needs your input
          </p>
        </div>
        <ul className="space-y-1.5">
          {items.slice(0, 4).map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-[12px]">
              <span
                aria-hidden
                className={cn("inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full", SEVERITY_DOT[item.severity] ?? SEVERITY_DOT.medium)}
              />
              <span className="text-foreground/85 truncate">{item.title}</span>
            </li>
          ))}
          {count > 4 && <li className="text-muted-foreground/50 pl-3.5 text-[11px]">+{count - 4} more</li>}
        </ul>
        <p className="text-rose-300 inline-flex items-center gap-1 text-xs font-medium">
          <Circle className="h-3 w-3" aria-hidden />
          Review open items
        </p>
      </div>
    </Card>
  );
}

function YtdNetCard({
  ytdNet,
  ytdRevenue,
  ytdExpenses,
}: {
  ytdNet: number;
  ytdRevenue: number;
  ytdExpenses: number;
}) {
  const positive = ytdNet >= 0;
  return (
    <Card label="YTD net · corp portion" href="/cockpit/expenses" icon={Wallet} accent="income">
      <div className="space-y-4">
        <div>
          <p className="text-foreground font-mono text-[2.25rem] leading-none tracking-tight tabular-nums">
            {fmtSigned(ytdNet)}
          </p>
          <p className="text-muted-foreground/80 mt-1.5 text-[11px] tracking-[0.08em] uppercase">
            Revenue − cogs − opex · YTD
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground/70 text-[10px] tracking-[0.08em] uppercase">Revenue</p>
            <p className="text-foreground font-mono mt-0.5 tabular-nums">{fmtCAD(ytdRevenue)}</p>
          </div>
          <div>
            <p className="text-muted-foreground/70 text-[10px] tracking-[0.08em] uppercase">Expenses</p>
            <p className="text-foreground font-mono mt-0.5 tabular-nums">{fmtCAD(ytdExpenses)}</p>
          </div>
        </div>
        <p className="inline-flex items-center gap-1 text-xs">
          {positive
            ? <ArrowUpRight className="text-emerald-300 h-3 w-3" aria-hidden />
            : <ArrowDownRight className="text-rose-300 h-3 w-3" aria-hidden />}
          <span className="text-muted-foreground/70">Cash position lands once a bank feed connects.</span>
        </p>
      </div>
    </Card>
  );
}

function HstCard({ hst }: { hst: HstSummary | null }) {
  if (!hst) {
    return (
      <Card label="HST · current quarter" href="/cockpit/hst" icon={Receipt} accent="tax">
        <div className="space-y-4">
          <div>
            <p className="text-foreground font-mono text-[2.25rem] leading-none tracking-tight tabular-nums">$0</p>
            <p className="text-muted-foreground/80 mt-1.5 text-[11px] tracking-[0.08em] uppercase">
              No transactions in the current quarter
            </p>
          </div>
          <p className="text-muted-foreground/70 text-xs">
            Add revenue or expense rows to see collected, ITC, and net remittance.
          </p>
        </div>
      </Card>
    );
  }
  const refund = hst.net_remittance < 0;
  const qLabel = `Q${Math.floor(new Date(hst.quarter_start).getMonth() / 3) + 1}`;
  return (
    <Card label={`HST · ${qLabel}`} href="/cockpit/hst" icon={Receipt} accent="tax">
      <div className="space-y-4">
        <div>
          <p className="text-foreground font-mono text-[2.25rem] leading-none tracking-tight tabular-nums">
            {fmtSigned(hst.net_remittance)}
          </p>
          <p className="text-muted-foreground/80 mt-1.5 text-[11px] tracking-[0.08em] uppercase">
            {refund ? "Refundable to AR Inc. · ITCs > collected" : "Owing to CRA · collected > ITCs"}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground/70 text-[10px] tracking-[0.08em] uppercase">Collected</p>
            <p className="text-foreground font-mono mt-0.5 tabular-nums">{fmtCAD(hst.hst_collected)}</p>
          </div>
          <div>
            <p className="text-muted-foreground/70 text-[10px] tracking-[0.08em] uppercase">ITC</p>
            <p className="text-foreground font-mono mt-0.5 tabular-nums">{fmtCAD(hst.hst_itc)}</p>
          </div>
        </div>
        <p className="text-muted-foreground/80 text-xs">
          Quarter ends <span className="text-foreground font-mono tabular-nums">{hst.quarter_end}</span>
        </p>
      </div>
    </Card>
  );
}

function SredCard({
  refundEstimate,
  totalCorpPortion,
  fyPct,
  labour,
}: {
  refundEstimate: number;
  totalCorpPortion: number;
  fyPct: number;
  labour: { entry_count: number; total_hours: number; eligible_hours: number } | null;
}) {
  const labourItc = labour ? labour.eligible_hours * 80 * 0.35 : null;
  return (
    <Card label="SR&ED · YTD" href="/cockpit/sred" icon={Sparkles} accent="rd">
      <div className="space-y-4">
        <div>
          <p className="text-foreground font-mono text-[2.25rem] leading-none tracking-tight tabular-nums">
            {fmtCAD(refundEstimate)}
          </p>
          <p className="text-muted-foreground/80 mt-1.5 text-[11px] tracking-[0.08em] uppercase">
            Eligible spend · 50% rate (CCPC NB)
          </p>
        </div>
        {labour && labour.total_hours > 0 && (
          <div className="border-t border-white/5 pt-3">
            <p className="text-muted-foreground/80 mb-1 text-[10px] uppercase tracking-[0.08em]">
              Labour log ({labour.entry_count} sessions)
            </p>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-sm tabular-nums text-white">
                {Number(labour.eligible_hours.toFixed(1))} eligible hrs
              </span>
              {labourItc !== null && (
                <span className="font-mono text-[11px] tabular-nums text-violet-300">
                  ~{fmtCAD(labourItc)} ITC est.
                </span>
              )}
            </div>
            <p className="text-muted-foreground/60 mt-0.5 text-[10px]">
              {Number(labour.total_hours.toFixed(1))} hrs total · $80/hr · 35% federal rate
            </p>
          </div>
        )}
        <div className="space-y-1.5">
          <div className="bg-white/[0.05] h-1.5 w-full overflow-hidden rounded-full ring-1 ring-inset ring-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-300"
              style={{ width: `${fyPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground/80">
              <span className="font-mono tabular-nums">{fmtCAD(totalCorpPortion)}</span> eligible spend
            </span>
            <span className="text-violet-300 font-mono tabular-nums">{fyPct}% of FY</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

type Deadline = { label: string; days: number; severity: "soon" | "far"; date: string };

function computeDeadlines(today: Date): Deadline[] {
  const yyyy = today.getFullYear();
  const dayMs = 1000 * 60 * 60 * 24;
  const daysUntil = (target: Date) => Math.max(0, Math.ceil((target.getTime() - today.getTime()) / dayMs));
  const ymd = (d: Date) => d.toISOString().slice(0, 10);

  const t2Due = new Date(yyyy + 1, 5, 30);

  const sredCandidates = [new Date(yyyy + 1, 5, 30), new Date(yyyy + 2, 5, 30)];
  const sredClaimWindowEnd =
    sredCandidates.find((d) => d.getTime() > today.getTime()) ?? sredCandidates[sredCandidates.length - 1]!;

  const hstDeadlines: { date: Date; quarter: string }[] = [
    { date: new Date(yyyy, 3, 30),  quarter: "Q1" },
    { date: new Date(yyyy, 6, 31),  quarter: "Q2" },
    { date: new Date(yyyy, 9, 31),  quarter: "Q3" },
    { date: new Date(yyyy + 1, 0, 31), quarter: "Q4" },
  ];
  const nextHst = hstDeadlines.find((d) => d.date.getTime() > today.getTime()) ?? hstDeadlines[0]!;

  const incorpDate = new Date(2026, 3, 16);
  const nextAnniv = new Date(yyyy, incorpDate.getMonth(), incorpDate.getDate());
  if (nextAnniv.getTime() < today.getTime()) nextAnniv.setFullYear(yyyy + 1);
  const annualReturnDue = new Date(nextAnniv.getTime() + 60 * dayMs);

  const items: Deadline[] = [
    { label: `HST ${nextHst.quarter} filing`,    days: daysUntil(nextHst.date),       severity: "soon", date: ymd(nextHst.date) },
    { label: "Annual return (federal)",          days: daysUntil(annualReturnDue),    severity: daysUntil(annualReturnDue) < 60 ? "soon" : "far", date: ymd(annualReturnDue) },
    { label: "T2 filing due",                   days: daysUntil(t2Due),              severity: daysUntil(t2Due) < 90 ? "soon" : "far",           date: ymd(t2Due) },
    { label: "SR&ED claim window closes",        days: daysUntil(sredClaimWindowEnd), severity: "far",  date: ymd(sredClaimWindowEnd) },
  ];
  return items.sort((a, b) => a.days - b.days);
}

function DeadlinesCard({ items }: { items: Deadline[] }) {
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
