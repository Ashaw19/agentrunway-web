import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownLeft } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TxRow = {
  id: string;
  date: string;
  amount_total: number;
  description: string | null;
  notes: string | null;
};

const fmtCAD = (n: number) =>
  n.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtDate = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const currentYear = new Date().getFullYear();

export default async function FounderCompPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/cockpit/founder-comp");

  // Salary (6010), shareholder loan (3010), dividends (no account yet — returns empty)
  const [salaryRes, loanRes, dividendRes] = await Promise.all([
    supabase
      .from("corp_transactions")
      .select("id, date, amount_total, description, notes")
      .eq("user_id", user.id)
      .eq("account_code", "6010")
      .order("date", { ascending: false }),
    supabase
      .from("corp_transactions")
      .select("id, date, amount_total, description, notes")
      .eq("user_id", user.id)
      .eq("account_code", "3010")
      .order("date", { ascending: false }),
    // Dividends have no dedicated account code yet — query placeholder
    supabase
      .from("corp_transactions")
      .select("id, date, amount_total, description, notes")
      .eq("user_id", user.id)
      .in("account_code", ["3030", "3040"]) // reserved equity distribution codes
      .order("date", { ascending: false }),
  ]);

  const salaryRows   = (salaryRes.data   ?? []) as TxRow[];
  const loanRows     = (loanRes.data     ?? []) as TxRow[];
  const dividendRows = (dividendRes.data ?? []) as TxRow[];

  // YTD salary: sum of 6010 rows in the current calendar year
  const ytdSalary = salaryRows
    .filter((r) => new Date(r.date).getFullYear() === currentYear)
    .reduce((s, r) => s + Number(r.amount_total), 0);

  // Shareholder loan balance: sum of all signed 3010 amounts
  const loanBalance = loanRows.reduce((s, r) => s + Number(r.amount_total), 0);

  // Running balance for loan rows (newest first → compute cumulative from oldest)
  const loanWithBalance: (TxRow & { runningBalance: number })[] = [];
  let runningTotal = loanBalance;
  for (const row of loanRows) {
    loanWithBalance.push({ ...row, runningBalance: runningTotal });
    runningTotal -= Number(row.amount_total);
  }

  return (
    <div className="space-y-8">
      <header className="min-w-0">
        <h1 className="text-foreground font-[var(--font-cockpit-display)] text-4xl font-normal leading-none tracking-tight">
          Founder comp
        </h1>
        <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm leading-relaxed">
          Salary, shareholder loan, and dividend activity for Andrew Shaw. Informational
          only — log salary entries via Expenses · Manual Entry, loan events via{" "}
          <Link href="/cockpit/cash" className="text-violet-300/80 hover:text-violet-200 underline underline-offset-2">
            Cash
          </Link>
          .
        </p>
      </header>

      {/* ── Summary strip ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SummaryCard
          label={`Salary YTD ${currentYear}`}
          value={fmtCAD(ytdSalary)}
          accent="emerald"
          note="Account 6010"
        />
        <SummaryCard
          label="Shareholder loan"
          value={fmtCAD(loanBalance)}
          accent="violet"
          note="Account 3010 · corp owes Andrew"
        />
        <SummaryCard
          label="Dividends YTD"
          value={dividendRows.length > 0 ? fmtCAD(dividendRows.reduce((s, r) => s + Number(r.amount_total), 0)) : "—"}
          accent="amber"
          note="Not yet designated"
          dim={dividendRows.length === 0}
        />
      </div>

      {/* ── Salary ledger ───────────────────────────────────────────────── */}
      <Section
        title="Salary withdrawals"
        subtitle="Account 6010 · Salaries &amp; Wages"
        empty={salaryRows.length === 0}
        emptyMsg="No salary transactions recorded. Log them via Expenses · Manual Entry using account 6010."
      >
        <TxTable rows={salaryRows} showRunningBalance={false} />
      </Section>

      {/* ── Shareholder loan ledger (read-only) ─────────────────────────── */}
      <Section
        title="Shareholder loans"
        subtitle="Account 3010 · running balance"
        empty={loanRows.length === 0}
        emptyMsg="No shareholder loan events recorded. Log them via the Cash page."
      >
        <TxTable rows={loanWithBalance} showRunningBalance />
      </Section>

      {/* ── Dividends placeholder ────────────────────────────────────────── */}
      <Section
        title="Dividends"
        subtitle="Not yet designated"
        empty
        emptyMsg="No dividend accounts (3030 / 3040) are seeded yet. Designate a year-end dividend with your accountant before adding entries."
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
  note,
  dim,
}: {
  label: string;
  value: string;
  accent: "emerald" | "violet" | "amber";
  note?: string;
  dim?: boolean;
}) {
  const accentMap = {
    emerald: "text-emerald-300",
    violet:  "text-violet-300",
    amber:   "text-amber-300",
  };
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <p className="text-muted-foreground/60 text-[11px] tracking-[0.08em] uppercase">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-mono text-base tabular-nums",
          dim ? "text-foreground/30" : accentMap[accent],
        )}
      >
        {value}
      </p>
      {note && <p className="text-muted-foreground/40 mt-0.5 text-[10px]">{note}</p>}
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
  empty,
  emptyMsg,
}: {
  title: string;
  subtitle: string;
  children?: React.ReactNode;
  empty: boolean;
  emptyMsg: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-foreground/90 font-[var(--font-cockpit-display)] text-xl font-normal tracking-tight">
          {title}
        </h2>
        <span
          className="text-muted-foreground/60 hidden text-[11px] tracking-[0.08em] uppercase sm:inline"
          dangerouslySetInnerHTML={{ __html: subtitle }}
        />
      </div>
      {empty ? (
        <p className="text-muted-foreground/60 rounded-xl border border-white/[0.04] bg-white/[0.01] px-4 py-6 text-center text-sm">
          {emptyMsg}
        </p>
      ) : (
        children
      )}
    </section>
  );
}

function TxTable({
  rows,
  showRunningBalance,
}: {
  rows: (TxRow & { runningBalance?: number })[];
  showRunningBalance: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06]">
            <Th>Date</Th>
            <Th>Description</Th>
            <Th right>Amount</Th>
            {showRunningBalance && <Th right>Balance</Th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const amt = Number(row.amount_total);
            const isInflow = amt >= 0;
            return (
              <tr
                key={row.id}
                className="border-b border-white/[0.04] last:border-0 transition-colors hover:bg-white/[0.02]"
              >
                <td className="px-4 py-2.5">
                  <span className="text-foreground/80 font-mono text-xs tabular-nums">
                    {fmtDate(row.date)}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    {showRunningBalance && (
                      isInflow
                        ? <ArrowUpRight className="text-violet-300/70 h-3 w-3 flex-shrink-0" aria-hidden />
                        : <ArrowDownLeft className="text-muted-foreground/50 h-3 w-3 flex-shrink-0" aria-hidden />
                    )}
                    <span className="text-foreground/70 text-xs">
                      {row.description ?? <span className="text-muted-foreground/40 italic">—</span>}
                    </span>
                  </div>
                  {row.notes && (
                    <p className="text-muted-foreground/50 mt-0.5 max-w-[240px] truncate text-[11px] italic">
                      {row.notes}
                    </p>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <span
                    className={cn(
                      "font-mono text-xs tabular-nums",
                      showRunningBalance
                        ? isInflow ? "text-violet-300" : "text-muted-foreground/70"
                        : "text-foreground/80",
                    )}
                  >
                    {isInflow ? "+" : ""}{fmtCAD(amt)}
                  </span>
                </td>
                {showRunningBalance && (
                  <td className="px-4 py-2.5 text-right">
                    <span className="text-foreground/60 font-mono text-xs tabular-nums">
                      {fmtCAD(row.runningBalance ?? 0)}
                    </span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={cn(
        "text-muted-foreground/60 px-4 py-2.5 text-[11px] font-medium tracking-[0.08em] uppercase",
        right ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}
