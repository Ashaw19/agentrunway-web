import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Calendar,
  Flame,
  Gauge,
  ListTodo,
  Receipt,
  Sparkles,
  Wallet,
} from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

// Phase 1 v0: HST, SR&ED, Deadlines, Expenses cards now read live data from
// the views in migration 00133 + corp_transactions. Cash + Anomalies stay
// pinned to the "fake" placeholder until their data sources exist (cash =
// future bank-feed sync; anomalies = scheduled-routine findings).
//
// Phase 1 (2026-05-06): operating health row added at the top — Cash,
// Monthly Burn, SaaS Runway. Cash reads the latest manual snapshot from
// corp_cash_snapshots (migration 00135) and is flagged "manual"; Burn is
// the trailing-90-day cogs+opex (corp portion) divided by 3; Runway is
// Cash ÷ Burn in months.
//
// Eleanor Konik's rule preserved: never show a fake number without flagging
// it. Real cards drop the "fake" pill; placeholder cards keep it.
//
// Typography rule for this surface: mono is reserved for tabular numerical
// data only (currency, percentages, day counts, T-Nd values). Everything
// else — labels, prose, headings — uses default sans (Geist Sans).

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

type ExpenseRow = {
  vendor_name_raw: string | null;
  amount_total: number | null;
  date: string;
};

type CashSnapshotRow = {
  as_of_date: string;
  amount_cad: number;
  source_label: string | null;
};

// Trailing-90 burn input. corp_pct applied in JS to match the
// total_corp_portion convention used by v_corp_pl_by_account.
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
  const startOfMonth = ymd(new Date(today.getFullYear(), today.getMonth(), 1));
  const startOfFY = ymd(new Date(today.getFullYear(), 0, 1));

  // Trailing 90 days for burn calc. Inclusive of today.
  const burnWindowStart = ymd(
    new Date(today.getFullYear(), today.getMonth(), today.getDate() - 89),
  );

  const [
    hstRes,
    sredRes,
    monthExpRes,
    ytdRes,
    lastReviewRes,
    cashSnapshotRes,
    burnRowsRes,
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
      .from("corp_transactions")
      .select("vendor_name_raw, amount_total, date")
      .eq("user_id", user.id)
      .gte("date", startOfMonth)
      .order("amount_total", { ascending: false })
      .limit(5),
    supabase
      .from("v_corp_pl_by_account")
      .select("account_type, total_corp_portion")
      .eq("user_id", user.id)
      .eq("fiscal_year", today.getFullYear()),
    supabase
      .from("corp_transactions")
      .select("ingested_at")
      .eq("user_id", user.id)
      .order("ingested_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Cash position: latest manual snapshot. corp_cash_snapshots from
    // migration 00135 — no bank-feed integration in Phase 1.
    supabase
      .from("corp_cash_snapshots")
      .select("as_of_date, amount_cad, source_label")
      .eq("user_id", user.id)
      .order("as_of_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Trailing-90 burn: cogs + opex rows in window. corp_pct applied below
    // to match v_corp_pl_by_account total_corp_portion convention.
    supabase
      .from("corp_transactions")
      .select("amount_total, corp_pct, account_type")
      .eq("user_id", user.id)
      .gte("date", burnWindowStart)
      .lte("date", ymd(today))
      .in("account_type", ["cogs", "opex"]),
  ]);

  const hst = (hstRes.data ?? null) as HstSummary | null;
  const sredRows = (sredRes.data ?? []) as SredRow[];
  const monthTopExpenses = (monthExpRes.data ?? []) as ExpenseRow[];
  const ytdRows = (ytdRes.data ?? []) as { account_type: string; total_corp_portion: number }[];
  const cashSnapshot = (cashSnapshotRes.data ?? null) as CashSnapshotRow | null;
  const burnRows = (burnRowsRes.data ?? []) as BurnRow[];
  const lastReview = lastReviewRes.data?.ingested_at
    ? {
        ingestedAt: lastReviewRes.data.ingested_at as string,
        daysAgo: Math.max(
          0,
          Math.floor(
            (today.getTime() - new Date(lastReviewRes.data.ingested_at as string).getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        ),
      }
    : null;

  // Operating health row computations
  const cashAmount = cashSnapshot ? Number(cashSnapshot.amount_cad ?? 0) : null;
  const cashAsOf = cashSnapshot?.as_of_date ?? null;
  const cashSource = cashSnapshot?.source_label ?? null;
  const cashStaleDays = cashAsOf
    ? Math.max(
        0,
        Math.floor(
          (today.getTime() - new Date(cashAsOf).getTime()) / (1000 * 60 * 60 * 24),
        ),
      )
    : null;

  // Trailing-90 burn = sum(amount_total * corp_pct/100) for cogs+opex ÷ 3.
  // Matches the total_corp_portion convention used by v_corp_pl_by_account so
  // burn aligns with YTD expenses. Negative burn is implausible (would mean
  // refunds > spend) — treat <=0 as "no signal" and let runway show "--".
  const burn90Total = burnRows.reduce((sum, r) => {
    const amount = Number(r.amount_total ?? 0);
    const pct = Number(r.corp_pct ?? 100);
    return sum + (amount * pct) / 100;
  }, 0);
  const monthlyBurn = burn90Total > 0 ? burn90Total / 3 : null;

  const runwayMonths =
    cashAmount !== null && cashAmount > 0 && monthlyBurn !== null && monthlyBurn > 0
      ? cashAmount / monthlyBurn
      : null;

  const sredTotal = sredRows.reduce((s, r) => s + Number(r.total_corp_portion ?? 0), 0);
  const sredRefundEstimate = sredTotal * 0.5; // CCPC NB refundable rate
  const ytdRevenue = ytdRows
    .filter((r) => r.account_type === "revenue")
    .reduce((s, r) => s + Number(r.total_corp_portion ?? 0), 0);
  const ytdExpenses = ytdRows
    .filter((r) => r.account_type === "cogs" || r.account_type === "opex")
    .reduce((s, r) => s + Number(r.total_corp_portion ?? 0), 0);
  const ytdNet = ytdRevenue - ytdExpenses;

  const deadlines = computeDeadlines(today);

  // Fiscal year progress (calendar Dec 31 year-end per Andrew 2026-05-05).
  const startOfFYDate = new Date(today.getFullYear(), 0, 1);
  const endOfFYDate = new Date(today.getFullYear(), 11, 31);
  const fyTotalDays = Math.round(
    (endOfFYDate.getTime() - startOfFYDate.getTime()) / (1000 * 60 * 60 * 24),
  );
  const fyElapsedDays = Math.round(
    (today.getTime() - startOfFYDate.getTime()) / (1000 * 60 * 60 * 24),
  );
  const fyPct = Math.max(0, Math.min(100, Math.round((fyElapsedDays / fyTotalDays) * 100)));

  return (
    <div className="space-y-8">
      <PageHeader />

      {/* Operating health row — Cash, Burn, Runway. Top of page so the
          first thing on screen is the question "are we still solvent?" */}
      <section aria-label="Operating health" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-foreground/90 font-[var(--font-cockpit-display)] text-xl font-normal tracking-tight">
            Operating health
          </h2>
          <span className="text-muted-foreground/60 hidden text-[11px] tracking-[0.08em] uppercase sm:inline">
            Cash · Burn · Runway
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <WeeklyReviewCard lastReview={lastReview} obligations={RECURRING_OBLIGATIONS} />
        <YtdNetCard ytdNet={ytdNet} ytdRevenue={ytdRevenue} ytdExpenses={ytdExpenses} />
        <HstCard hst={hst} />
        <SredCard refundEstimate={sredRefundEstimate} totalCorpPortion={sredTotal} fyPct={fyPct} />
        <DeadlinesCard items={deadlines} />
        <ExpensesCard rows={monthTopExpenses} />
      </div>

      <ChatPanel />
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
  fake = false,
  pill,
  children,
}: {
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  accent: Accent;
  fake?: boolean;
  // Optional provenance/state pill in the card header. `fake` is kept as a
  // shorthand that resolves to a "fake" pill so existing call sites stay put.
  pill?: { label: string; tooltip?: string };
  children: React.ReactNode;
}) {
  const a = ACCENT[accent];
  const headerPill = pill ?? (fake ? { label: "fake", tooltip: "Phase 1 placeholder — wired in Phase 2" } : null);
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
        {headerPill ? (
          <span
            title={headerPill.tooltip}
            className="text-muted-foreground/50 inline-flex items-center gap-1 text-[10px] tracking-wider uppercase"
          >
            <span className="bg-muted-foreground/40 inline-block h-1 w-1 rounded-full" aria-hidden />
            {headerPill.label}
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

// ── Operating health row ────────────────────────────────────────────────────
//
// Rules of the road (re-stated from feedback_tax_information_not_advice.md):
// these cards surface the numbers and the engine-derived runway estimate.
// They never tell Andrew what to DO with the numbers. No "should set aside",
// no "critical zone", no "top up". Severity coloring is informational —
// short / medium / long runway — not directive.

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
  // No snapshot ever → CTA into the cash route to log the first observation.
  if (amount === null || asOf === null) {
    return (
      <Card label="Cash position" href="/cockpit/cash" icon={Wallet} accent="income" pill={{ label: "manual", tooltip: "Manual snapshot — no bank-feed integration in Phase 1" }}>
        <div className="space-y-3">
          <div>
            <p className="text-foreground/80 font-mono text-[2.25rem] leading-none tracking-tight tabular-nums">
              —
            </p>
            <p className="text-muted-foreground/80 mt-1.5 text-[11px] tracking-[0.08em] uppercase">
              No snapshot logged yet
            </p>
          </div>
          <p className="text-muted-foreground/70 text-xs">
            AR Inc. has no bank feed connected. Log a balance snapshot to anchor cash
            position and runway.
          </p>
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
      : { label: "manual", tooltip: "Manual snapshot — no bank-feed integration in Phase 1" };
  return (
    <Card label="Cash position" href="/cockpit/cash" icon={Wallet} accent="income" pill={stalePill}>
      <div className="space-y-3">
        <div>
          <p className="text-foreground font-mono text-[2.25rem] leading-none tracking-tight tabular-nums">
            {fmtCAD(amount)}
          </p>
          <p className="text-muted-foreground/80 mt-1.5 text-[11px] tracking-[0.08em] uppercase">
            As of <span className="font-mono tabular-nums">{asOf}</span>
            {staleDays !== null && staleDays > 0 ? (
              <>
                {" "}
                · <span className="font-mono tabular-nums">{staleDays}d</span> ago
              </>
            ) : null}
          </p>
        </div>
        {sourceLabel ? (
          <p className="text-muted-foreground/70 truncate text-xs">{sourceLabel}</p>
        ) : null}
        <p className="text-muted-foreground/60 text-[11px]">
          Click to log a fresh snapshot or update the source.
        </p>
      </div>
    </Card>
  );
}

function MonthlyBurnCard({
  monthlyBurn,
  txnCount,
}: {
  monthlyBurn: number | null;
  txnCount: number;
}) {
  if (monthlyBurn === null) {
    return (
      <Card label="Monthly burn" href="/cockpit/expenses" icon={Flame} accent="expenses">
        <div className="space-y-3">
          <div>
            <p className="text-foreground/80 font-mono text-[2.25rem] leading-none tracking-tight tabular-nums">
              —
            </p>
            <p className="text-muted-foreground/80 mt-1.5 text-[11px] tracking-[0.08em] uppercase">
              No spend in trailing 90 days
            </p>
          </div>
          <p className="text-muted-foreground/70 text-xs">
            Add cogs / opex transactions to populate. Burn excludes revenue, equity,
            tax, and shareholder-loan rows.
          </p>
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
  // Missing-input copy spells out which side is unwired so the operator
  // knows where to act. No "should" / "must" — this is just signposting.
  if (runwayMonths === null) {
    const reason = !hasCash && !hasBurn
      ? "Needs cash snapshot + spend history."
      : !hasCash
        ? "Needs a cash-balance snapshot to compute."
        : "Needs trailing-90 cogs/opex to compute.";
    return (
      <Card label="SaaS runway" href="/cockpit/cash" icon={Gauge} accent="health">
        <div className="space-y-3">
          <div>
            <p className="text-foreground/80 font-mono text-[2.25rem] leading-none tracking-tight tabular-nums">
              —
            </p>
            <p className="text-muted-foreground/80 mt-1.5 text-[11px] tracking-[0.08em] uppercase">
              Insufficient inputs
            </p>
          </div>
          <p className="text-muted-foreground/70 text-xs">{reason}</p>
        </div>
      </Card>
    );
  }
  // Severity coloring: visual indicator only. Not advice.
  // <6 mo → rose; 6–12 mo → amber; >12 mo → teal.
  const severity: Accent = runwayMonths < 6 ? "warn" : runwayMonths < 12 ? "expenses" : "health";
  // Cap the visual gauge at 24 months so the bar stays meaningful.
  const gaugePctRaw = Math.min(runwayMonths, 24) / 24;
  const gaugePct = Math.max(0, Math.min(100, Math.round(gaugePctRaw * 100)));
  const monthsLabel =
    runwayMonths >= 100 ? `${runwayMonths.toFixed(0)}` : runwayMonths.toFixed(1);
  const severityCopy =
    runwayMonths < 6
      ? "Short horizon"
      : runwayMonths < 12
        ? "Medium horizon"
        : "Long horizon";
  return (
    <Card label="SaaS runway" href="/cockpit/cash" icon={Gauge} accent={severity}>
      <div className="space-y-4">
        <div>
          <p className="text-foreground font-mono text-[2.25rem] leading-none tracking-tight tabular-nums">
            {monthsLabel}
            <span className="text-muted-foreground/70 ml-2 text-base">months</span>
          </p>
          <p className="text-muted-foreground/80 mt-1.5 text-[11px] tracking-[0.08em] uppercase">
            Cash ÷ monthly burn
          </p>
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
          {positive ? (
            <ArrowUpRight className="text-emerald-300 h-3 w-3" aria-hidden />
          ) : (
            <ArrowDownRight className="text-rose-300 h-3 w-3" aria-hidden />
          )}
          <span className="text-muted-foreground/70">
            Cash position lands once a bank feed connects.
          </span>
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
            <p className="text-foreground font-mono text-[2.25rem] leading-none tracking-tight tabular-nums">
              $0
            </p>
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
          Quarter ends{" "}
          <span className="text-foreground font-mono tabular-nums">{hst.quarter_end}</span>
        </p>
      </div>
    </Card>
  );
}

function SredCard({
  refundEstimate,
  totalCorpPortion,
  fyPct,
}: {
  refundEstimate: number;
  totalCorpPortion: number;
  fyPct: number;
}) {
  return (
    <Card label="SR&ED · YTD" href="/cockpit/sred" icon={Sparkles} accent="rd">
      <div className="space-y-4">
        <div>
          <p className="text-foreground font-mono text-[2.25rem] leading-none tracking-tight tabular-nums">
            {fmtCAD(refundEstimate)}
          </p>
          <p className="text-muted-foreground/80 mt-1.5 text-[11px] tracking-[0.08em] uppercase">
            Refundable estimate · 50% rate (CCPC NB)
          </p>
        </div>
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

type Deadline = {
  label: string;
  days: number;
  severity: "soon" | "far";
  date: string;
};

function computeDeadlines(today: Date): Deadline[] {
  const yyyy = today.getFullYear();
  const dayMs = 1000 * 60 * 60 * 24;
  const daysUntil = (target: Date) => Math.max(0, Math.ceil((target.getTime() - today.getTime()) / dayMs));
  const ymd = (d: Date) => d.toISOString().slice(0, 10);

  // Calendar fiscal year (Dec 31). T2 due 6 months after FY end.
  const t2Due = new Date(yyyy + 1, 5, 30); // June 30 of FY+1

  // SR&ED claim window = 18 months after FY end. AR Inc. uses calendar FY, so
  // the deadline for the FY currently in progress (FY = yyyy) is Jun 30 of
  // yyyy+2. Show the SOONEST upcoming claim deadline so we don't bury an
  // open prior-FY window if today falls in Jan–Jun (window for FY yyyy-1
  // closes Jun 30 of yyyy+1; window for FY yyyy closes Jun 30 of yyyy+2).
  const sredCandidates = [
    new Date(yyyy + 1, 5, 30), // FY yyyy-1 — only relevant if not yet expired
    new Date(yyyy + 2, 5, 30), // FY yyyy — current in-progress fiscal year
  ];
  const sredClaimWindowEnd =
    sredCandidates.find((d) => d.getTime() > today.getTime())
    ?? sredCandidates[sredCandidates.length - 1]!;

  // HST quarterly remittance — quarterly filers must remit "no later than one
  // month after the end of the reporting period" (Excise Tax Act s.245). We
  // adopt the conservative "last day of the month following the reporting
  // period" reading used by CRA's published filing calendar, so Q2 (ends
  // Jun 30) is due Jul 31 and Q3 (ends Sep 30) is due Oct 31. Strict
  // calendar-arithmetic readers would land Jul 30 / Oct 30 — the day-late
  // CRA-calendar reading is the safer of the two for cash-flow planning.
  // Q1 (Jan-Mar) due Apr 30; Q2 (Apr-Jun) due Jul 31; Q3 (Jul-Sep) due Oct 31; Q4 (Oct-Dec) due Jan 31.
  const hstDeadlines: { date: Date; quarter: string }[] = [
    { date: new Date(yyyy, 3, 30), quarter: "Q1" }, // Apr 30
    { date: new Date(yyyy, 6, 31), quarter: "Q2" }, // Jul 31
    { date: new Date(yyyy, 9, 31), quarter: "Q3" }, // Oct 31
    { date: new Date(yyyy + 1, 0, 31), quarter: "Q4" }, // Jan 31 of FY+1
  ];
  const nextHst = hstDeadlines.find((d) => d.date.getTime() > today.getTime()) ?? hstDeadlines[0]!;

  // Annual return (Corporations Canada) due within 60 days of incorporation anniversary.
  // AR Inc. incorporated 2026-04-16. Next anniversary + 60d.
  const incorpDate = new Date(2026, 3, 16);
  const nextAnniv = new Date(yyyy, incorpDate.getMonth(), incorpDate.getDate());
  if (nextAnniv.getTime() < today.getTime()) {
    nextAnniv.setFullYear(yyyy + 1);
  }
  const annualReturnDue = new Date(nextAnniv.getTime() + 60 * dayMs);

  const items: Deadline[] = [
    { label: `HST ${nextHst.quarter} filing`, days: daysUntil(nextHst.date), severity: "soon", date: ymd(nextHst.date) },
    { label: "T2 filing due", days: daysUntil(t2Due), severity: daysUntil(t2Due) < 90 ? "soon" : "far", date: ymd(t2Due) },
    { label: "Annual return (federal)", days: daysUntil(annualReturnDue), severity: daysUntil(annualReturnDue) < 60 ? "soon" : "far", date: ymd(annualReturnDue) },
    { label: "SR&ED claim window closes", days: daysUntil(sredClaimWindowEnd), severity: "far", date: ymd(sredClaimWindowEnd) },
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

function ExpensesCard({ rows }: { rows: ExpenseRow[] }) {
  if (!rows.length) {
    return (
      <Card label="This month · top expenses" href="/cockpit/expenses" icon={Banknote} accent="expenses">
        <p className="text-muted-foreground/70 py-2 text-sm">
          No transactions yet this month. Add a manual entry or upload a receipt to populate.
        </p>
      </Card>
    );
  }
  const total = rows.reduce((s, r) => s + Number(r.amount_total ?? 0), 0);
  return (
    <Card label="This month · top expenses" href="/cockpit/expenses" icon={Banknote} accent="expenses">
      <ul className="space-y-1">
        {rows.map((row, i) => (
          <li key={i} className="flex items-center justify-between text-[13px]">
            <span className="text-foreground/85 truncate">{row.vendor_name_raw ?? "—"}</span>
            <span className="text-foreground font-mono tabular-nums">
              {fmtCAD(Number(row.amount_total ?? 0))}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2.5 text-[11px]">
        <span className="text-muted-foreground/80 inline-flex items-center gap-1">
          <ArrowDownRight className="h-3 w-3" aria-hidden />
          MTD
        </span>
        <span className="text-amber-300 font-mono tabular-nums">{fmtCAD(total)}</span>
      </div>
    </Card>
  );
}

// v0: hardcoded recurring obligations. v1 promotes to a corp_recurring_schedules
// table + cron that auto-creates needs_review=true stubs on each cycle.
const RECURRING_OBLIGATIONS: { name: string; frequency: string; hint: string }[] = [
  { name: "Cox & Palmer retainer", frequency: "monthly",   hint: "$550" },
  { name: "Anthropic Pro · usage", frequency: "monthly",   hint: "—" },
  { name: "Bell × 2 (mobile + internet)", frequency: "monthly", hint: "—" },
  { name: "NB Power",              frequency: "monthly",   hint: "—" },
  { name: "NB Property Tax",       frequency: "quarterly", hint: "—" },
  { name: "Vercel · Supabase · Mem0", frequency: "monthly", hint: "usage" },
];

function WeeklyReviewCard({
  lastReview,
  obligations,
}: {
  lastReview: { ingestedAt: string; daysAgo: number } | null;
  obligations: { name: string; frequency: string; hint: string }[];
}) {
  return (
    <Card label="Weekly review" href="/cockpit/expenses" icon={ListTodo} accent="health">
      <div className="space-y-4">
        <div>
          {lastReview ? (
            <>
              <p className="text-foreground font-mono text-[2.25rem] leading-none tracking-tight tabular-nums">
                {lastReview.daysAgo}d
              </p>
              <p className="text-muted-foreground/80 mt-1.5 text-[11px] tracking-[0.08em] uppercase">
                Since last entry
              </p>
            </>
          ) : (
            <>
              <p className="text-foreground text-[1.5rem] leading-none font-medium">Never</p>
              <p className="text-muted-foreground/80 mt-1.5 text-[11px] tracking-[0.08em] uppercase">
                No entries yet — start with one
              </p>
            </>
          )}
        </div>
        <div>
          <p className="text-muted-foreground/70 mb-2 text-[10px] tracking-[0.08em] uppercase">
            Recurring · log each cycle
          </p>
          <ul className="space-y-1.5">
            {obligations.map((item) => (
              <li key={item.name} className="flex items-center justify-between gap-2 text-[12px]">
                <span className="text-foreground/85 truncate">{item.name}</span>
                <span className="text-muted-foreground/60 font-mono tabular-nums whitespace-nowrap">
                  {item.frequency}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
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
