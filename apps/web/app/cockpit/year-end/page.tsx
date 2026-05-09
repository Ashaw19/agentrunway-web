/**
 * /cockpit/year-end
 *
 * Guided year-end close workflow for AR Inc. Surfaces a checklist with live
 * green/amber/red status pulled from existing reporting views, then ties off
 * with a one-click year-end accountant bundle download (.zip).
 *
 * Read-only display + a single download trigger — no schema, no new API.
 * All data sources are pre-existing reporting views or corp_* tables.
 *
 * Allowlisted to andrew@andrewdshaw.ca.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, XCircle, ArrowRight } from "lucide-react";
import { YearEndExportButton } from "./year-end-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED_EMAILS = new Set(["andrew@andrewdshaw.ca"]);

type ChecklistStatus = "green" | "amber" | "red" | "neutral";

interface ChecklistItem {
  title: string;
  detail: string;
  status: ChecklistStatus;
  next?: { label: string; href: string };
}

export default async function YearEndPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email || !ALLOWED_EMAILS.has(user.email.toLowerCase())) {
    redirect("/dashboard");
  }

  const fiscalYear = params.year ? Number(params.year) : new Date().getFullYear();
  const yearStart = `${fiscalYear}-01-01`;
  const yearEnd = `${fiscalYear}-12-31`;

  // ── Parallel data pulls ──────────────────────────────────────────────────
  const [
    txnsRes,
    txnsUnclassifiedRes,
    bankRecsRes,
    preIncorpRes,
    loanLatestRes,
    sredRes,
    hstRes,
    overdueRes,
    resolutionsRes,
    cashRes,
  ] = await Promise.all([
    // Total transactions in FY
    supabase
      .from("corp_transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("date", yearStart)
      .lte("date", yearEnd),

    // Unclassified (no account_code) transactions in FY
    supabase
      .from("corp_transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("account_code", null)
      .gte("date", yearStart)
      .lte("date", yearEnd),

    // Bank reconciliation summary across all uploaded statements
    supabase
      .from("v_corp_bank_reconciliation_summary")
      .select("statement_id, row_count, matched_count, manual_count, unmatched_count, match_rate_pct, period_start, period_end")
      .eq("user_id", user.id),

    // Pre-incorp register
    supabase
      .from("v_corp_pre_incorp_register")
      .select("amount_total")
      .eq("user_id", user.id),

    // Latest shareholder loan running balance
    supabase
      .from("v_corp_shareholder_loan_balance")
      .select("running_balance, date")
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),

    // SR&ED summary for FY
    supabase
      .from("v_corp_sred_annual_summary")
      .select("entry_count, total_hours, eligible_hours")
      .eq("user_id", user.id)
      .eq("fiscal_year", fiscalYear)
      .maybeSingle(),

    // HST summary — most recent quarter end with data
    supabase
      .from("v_corp_gst_hst_summary")
      .select("quarter_start, quarter_end, hst_collected, hst_itc, net_remittance, txn_count")
      .eq("user_id", user.id)
      .order("quarter_start", { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Overdue compliance events
    supabase
      .from("v_corp_upcoming_compliance")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("urgency", "overdue"),

    // Passed resolutions for FY
    supabase
      .from("corp_resolutions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "passed")
      .eq("fiscal_year", fiscalYear),

    // Most recent cash snapshot
    supabase
      .from("corp_cash_snapshots")
      .select("as_of_date, amount_cad")
      .eq("user_id", user.id)
      .order("as_of_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const txnTotal = txnsRes.count ?? 0;
  const txnUnclassified = txnsUnclassifiedRes.count ?? 0;
  const txnClassifiedPct =
    txnTotal === 0 ? null : Math.round(((txnTotal - txnUnclassified) / txnTotal) * 1000) / 10;

  const bankStatements = (bankRecsRes.data ?? []) as Array<{
    statement_id: string;
    row_count: number;
    matched_count: number;
    manual_count: number;
    unmatched_count: number;
    match_rate_pct: number | null;
    period_start: string;
    period_end: string;
  }>;
  const bankRowsTotal = bankStatements.reduce((acc, s) => acc + s.row_count, 0);
  const bankMatchedTotal = bankStatements.reduce(
    (acc, s) => acc + s.matched_count + s.manual_count,
    0,
  );
  const bankMatchPct =
    bankRowsTotal === 0 ? null : Math.round((bankMatchedTotal / bankRowsTotal) * 1000) / 10;

  const preIncorpTotal = (preIncorpRes.data ?? []).reduce(
    (acc, row: { amount_total: number | null }) => acc + Number(row.amount_total ?? 0),
    0,
  );

  const loan = loanLatestRes.data as { running_balance: number; date: string } | null;
  const loanBalance = loan ? Number(loan.running_balance) : 0;

  const sred = sredRes.data as
    | { entry_count: number; total_hours: number; eligible_hours: number }
    | null;
  const sredEntries = sred?.entry_count ?? 0;
  const sredHours = Number(sred?.total_hours ?? 0);
  const sredEligible = Number(sred?.eligible_hours ?? 0);

  const hst = hstRes.data as
    | {
        quarter_start: string;
        quarter_end: string;
        hst_collected: number;
        hst_itc: number;
        net_remittance: number;
        txn_count: number;
      }
    | null;

  const overdueCount = overdueRes.count ?? 0;
  const passedResolutionsCount = resolutionsRes.count ?? 0;

  const cash = cashRes.data as { as_of_date: string; amount_cad: number } | null;
  const cashAgeDays = cash
    ? Math.floor((Date.now() - new Date(cash.as_of_date + "T00:00:00").getTime()) / 86_400_000)
    : null;

  // ── Build the checklist ──────────────────────────────────────────────────

  const operational: ChecklistItem[] = [
    {
      title: "Transactions classified",
      detail:
        txnTotal === 0
          ? "No transactions logged for this fiscal year yet."
          : txnUnclassified === 0
            ? `All ${txnTotal} transactions have a chart-of-accounts code.`
            : `${txnUnclassified} of ${txnTotal} transactions still missing an account_code (${txnClassifiedPct}% classified).`,
      status:
        txnTotal === 0
          ? "neutral"
          : txnUnclassified === 0
            ? "green"
            : txnClassifiedPct !== null && txnClassifiedPct >= 95
              ? "amber"
              : "red",
      next: txnUnclassified > 0 ? { label: "Open Expenses", href: "/cockpit/expenses" } : undefined,
    },
    {
      title: "Bank reconciliation",
      detail:
        bankStatements.length === 0
          ? "No bank statements uploaded yet."
          : `${bankMatchedTotal} of ${bankRowsTotal} bank lines matched (${bankMatchPct}% across ${bankStatements.length} statement${bankStatements.length === 1 ? "" : "s"}).`,
      status:
        bankStatements.length === 0
          ? "neutral"
          : bankMatchPct !== null && bankMatchPct >= 95
            ? "green"
            : bankMatchPct !== null && bankMatchPct >= 80
              ? "amber"
              : "red",
      next:
        bankStatements.length === 0 || (bankMatchPct !== null && bankMatchPct < 95)
          ? { label: "Open Reconciliation", href: "/cockpit/reconciliation" }
          : undefined,
    },
    {
      title: "Pre-incorp register reviewed",
      detail:
        preIncorpTotal === 0
          ? "No pre-incorporation expenses captured."
          : `Pre-incorp running total: $${preIncorpTotal.toFixed(2)}.${
              preIncorpTotal > 3000
                ? " Over the s.20(1)(b) $3,000 limit — accountant review required."
                : ""
            }`,
      status:
        preIncorpTotal === 0
          ? "neutral"
          : preIncorpTotal > 3000
            ? "amber"
            : "green",
      next:
        preIncorpTotal > 0 ? { label: "Open Pre-incorp", href: "/cockpit/pre-incorp" } : undefined,
    },
    {
      title: "Founder comp / shareholder loan",
      detail: loan
        ? loanBalance === 0
          ? "Shareholder loan balance is zero."
          : loanBalance > 0
            ? `Shareholder loan owes Andrew $${loanBalance.toFixed(2)} (corp owes director — fine).`
            : `Andrew owes the corp $${Math.abs(loanBalance).toFixed(2)} — flag for s.15(2): repay within 1 year of fiscal year-end or face income inclusion.`
        : "No founder-comp transactions logged yet.",
      status: !loan ? "neutral" : loanBalance >= 0 ? "green" : "amber",
      next: { label: "Open Comp", href: "/cockpit/founder-comp" },
    },
    {
      title: "SR&ED log entries",
      detail:
        sredEntries === 0
          ? "No SR&ED entries logged for this fiscal year."
          : `${sredEntries} entries logged · ${sredHours.toFixed(1)} total hours · ${sredEligible.toFixed(1)} weight-adjusted eligible hours. ITC estimate: $${(sredEligible * 80 * 0.35).toFixed(0)}.`,
      status: sredEntries === 0 ? "amber" : "green",
      next: { label: "Open SR&ED", href: "/cockpit/sred" },
    },
    {
      title: "Cash snapshot recent",
      detail: cash
        ? `Latest snapshot: $${Number(cash.amount_cad).toFixed(2)} on ${cash.as_of_date}${
            cashAgeDays !== null ? ` (${cashAgeDays} day${cashAgeDays === 1 ? "" : "s"} old)` : ""
          }.`
        : "No cash snapshot logged yet.",
      status:
        cash === null
          ? "amber"
          : cashAgeDays !== null && cashAgeDays > 7
            ? "amber"
            : "green",
      next: { label: "Open Cash", href: "/cockpit/cash" },
    },
  ];

  const compliance: ChecklistItem[] = [
    {
      title: "HST summary current",
      detail: hst
        ? `Most recent quarter ending ${hst.quarter_end}: collected $${Number(hst.hst_collected).toFixed(2)}, ITCs $${Number(hst.hst_itc).toFixed(2)}, net remittance $${Number(hst.net_remittance).toFixed(2)} (${hst.txn_count} txns).`
        : "No HST data — no transactions classified to revenue/cogs/opex yet.",
      status: hst ? "green" : "neutral",
      next: { label: "Open HST", href: "/cockpit/hst" },
    },
    {
      title: "Compliance calendar — overdue events",
      detail:
        overdueCount === 0
          ? "Nothing overdue."
          : `${overdueCount} overdue event${overdueCount === 1 ? "" : "s"} need attention.`,
      status: overdueCount === 0 ? "green" : overdueCount <= 2 ? "amber" : "red",
      next: overdueCount > 0 ? { label: "Open Compliance", href: "/cockpit/compliance" } : undefined,
    },
    {
      title: "Minute book current",
      detail:
        passedResolutionsCount === 0
          ? "No passed resolutions on file for this fiscal year. AGM waiver and banking authority should be in place."
          : `${passedResolutionsCount} passed resolution${passedResolutionsCount === 1 ? "" : "s"} on file for FY${fiscalYear}.`,
      status:
        passedResolutionsCount === 0
          ? "amber"
          : passedResolutionsCount >= 2
            ? "green"
            : "amber",
      next: { label: "Open Resolutions", href: "/cockpit/resolutions" },
    },
  ];

  // Aggregate readiness — green if all green, amber if any amber, red if any red.
  const allItems = [...operational, ...compliance];
  const aggregate: ChecklistStatus = allItems.some((i) => i.status === "red")
    ? "red"
    : allItems.some((i) => i.status === "amber")
      ? "amber"
      : allItems.every((i) => i.status === "green" || i.status === "neutral")
        ? "green"
        : "neutral";

  return (
    <div className="space-y-8">
      <header className="min-w-0">
        <h1 className="text-foreground font-[var(--font-cockpit-display)] text-4xl font-normal leading-none tracking-tight">
          Year-end close · FY{fiscalYear}
        </h1>
        <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm leading-relaxed">
          Guided pre-handoff checklist before the accountant builds the T2. Each row pulls live
          status from the cockpit. When everything is green (or amber with documented context),
          download the year-end accountant bundle.
        </p>
        <p className="text-muted-foreground/70 mt-3 max-w-2xl text-xs italic">
          Filing decisions sit with your accountant — this is the operator-side framing.
        </p>
      </header>

      <AggregateBanner status={aggregate} />

      <Section title="Operational close" subtitle="Ledger + bank + records.">
        {operational.map((item, i) => (
          <ChecklistRow key={i} item={item} />
        ))}
      </Section>

      <Section title="Compliance close" subtitle="Filings + governance.">
        {compliance.map((item, i) => (
          <ChecklistRow key={i} item={item} />
        ))}
      </Section>

      <section className="border-border/40 rounded-xl border bg-white/[0.02] p-5">
        <h2 className="text-foreground text-base font-medium tracking-tight">
          Generate the accountant bundle
        </h2>
        <p className="text-muted-foreground/85 mt-1 mb-4 text-sm leading-relaxed">
          Builds a single .zip with: P&amp;L by account, HST/GST summary, SR&amp;ED working paper,
          shareholder-loan ledger, pre-incorp register, transaction CSV, all receipts, governance
          documents, passed resolutions, and a README mapping each file to the T2 line it supports.
        </p>
        <YearEndExportButton fiscalYear={fiscalYear} />
        <p className="text-muted-foreground/60 mt-3 text-xs leading-relaxed">
          Send the .zip to Cox &amp; Palmer (or whoever signs the T2). The accountant return-files;
          the cockpit is the working-paper source.
        </p>
      </section>
    </div>
  );
}

// ── Display helpers ──────────────────────────────────────────────────────────

function AggregateBanner({ status }: { status: ChecklistStatus }) {
  if (status === "green") {
    return (
      <div className="border-emerald-500/30 bg-emerald-500/[0.06] flex items-center gap-3 rounded-xl border px-4 py-3">
        <CheckCircle2 className="text-emerald-400" size={18} />
        <p className="text-emerald-200 text-sm font-medium">
          All checks green. Year-end bundle ready to generate.
        </p>
      </div>
    );
  }
  if (status === "amber") {
    return (
      <div className="border-amber-500/30 bg-amber-500/[0.06] flex items-center gap-3 rounded-xl border px-4 py-3">
        <AlertTriangle className="text-amber-400" size={18} />
        <p className="text-amber-200 text-sm font-medium">
          Some items need attention before handoff. Bundle is still generatable — flag the open
          items in the README so the accountant knows what&apos;s pending.
        </p>
      </div>
    );
  }
  if (status === "red") {
    return (
      <div className="border-red-500/30 bg-red-500/[0.06] flex items-center gap-3 rounded-xl border px-4 py-3">
        <XCircle className="text-red-400" size={18} />
        <p className="text-red-200 text-sm font-medium">
          Material gaps. Resolve red rows before handoff — bundle will be incomplete.
        </p>
      </div>
    );
  }
  return null;
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-foreground text-base font-medium tracking-tight">{title}</h2>
        <p className="text-muted-foreground/70 text-xs">{subtitle}</p>
      </div>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}

const STATUS_BORDER: Record<ChecklistStatus, string> = {
  green: "border-emerald-500/25",
  amber: "border-amber-500/25",
  red: "border-red-500/30",
  neutral: "border-border/30",
};

const STATUS_DOT: Record<ChecklistStatus, string> = {
  green: "bg-emerald-400",
  amber: "bg-amber-400",
  red: "bg-red-400",
  neutral: "bg-muted-foreground/40",
};

function ChecklistRow({ item }: { item: ChecklistItem }) {
  return (
    <li
      className={cn(
        "rounded-xl border bg-white/[0.02] px-4 py-3.5",
        STATUS_BORDER[item.status],
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn("inline-block h-2 w-2 rounded-full", STATUS_DOT[item.status])}
              aria-hidden
            />
            <h3 className="text-foreground text-[14px] font-medium leading-snug">{item.title}</h3>
          </div>
          <p className="text-muted-foreground/85 mt-1.5 text-[12px] leading-relaxed">
            {item.detail}
          </p>
        </div>
        {item.next && (
          <Link
            href={item.next.href}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 whitespace-nowrap text-[12px] transition-colors"
          >
            {item.next.label}
            <ArrowRight size={12} />
          </Link>
        )}
      </div>
    </li>
  );
}
