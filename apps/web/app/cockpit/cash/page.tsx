import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Phase 1 cash surface: manual snapshot logger + shareholder loan tracker.
// AR Inc. has no bank-feed (Plaid Growth deferred, QuickBooks skipped) so
// every cash-position observation and shareholder loan event lands here by hand.
//
// Shareholder loan account: 3010 "Due to Shareholder — Andrew Shaw" (liability,
// migration 00137). Sign convention: positive = Andrew loans money to corp
// (corp owes more), negative = repayment (corp owes less).

export const dynamic = "force-dynamic";

type SnapshotRow = {
  id: string;
  as_of_date: string;
  amount_cad: number;
  source_label: string | null;
  notes: string | null;
};

type LoanRow = {
  id: string;
  date: string;
  amount_total: number;
  description: string | null;
  notes: string | null;
};

const fmtCAD = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

const fmtCAD2 = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Server actions ──────────────────────────────────────────────────────────

async function logCashSnapshot(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/cockpit/cash");

  const asOfDateRaw = String(formData.get("as_of_date") ?? "").trim();
  const amountRaw   = String(formData.get("amount_cad") ?? "").trim();
  const sourceLabel = String(formData.get("source_label") ?? "").trim();
  const notes       = String(formData.get("notes") ?? "").trim();

  if (!asOfDateRaw || !amountRaw) redirect("/cockpit/cash?error=missing_fields");

  const amount = Number(amountRaw.replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount < 0) redirect("/cockpit/cash?error=invalid_amount");

  const { error } = await supabase.from("corp_cash_snapshots").insert({
    user_id:      user.id,
    as_of_date:   asOfDateRaw,
    amount_cad:   amount,
    source_label: sourceLabel || null,
    notes:        notes || null,
  });
  if (error) {
    redirect(`/cockpit/cash?error=insert_failed&detail=${encodeURIComponent(error.message).slice(0, 200)}`);
  }

  revalidatePath("/cockpit");
  revalidatePath("/cockpit/cash");
  redirect("/cockpit/cash?logged=1");
}

async function logShareholderLoan(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/cockpit/cash");

  const dateRaw    = String(formData.get("loan_date") ?? "").trim();
  const amountRaw  = String(formData.get("loan_amount") ?? "").trim();
  const direction  = String(formData.get("direction") ?? "in").trim(); // "in" | "out"
  const notes      = String(formData.get("loan_notes") ?? "").trim();

  if (!dateRaw || !amountRaw) redirect("/cockpit/cash?loan_error=missing_fields");

  const absAmount = Number(amountRaw.replace(/,/g, ""));
  if (!Number.isFinite(absAmount) || absAmount <= 0) redirect("/cockpit/cash?loan_error=invalid_amount");

  // Positive = loan inflow (corp owes Andrew more).
  // Negative = repayment (corp owes Andrew less).
  const signedAmount = direction === "out" ? -absAmount : absAmount;
  const description  = direction === "out"
    ? "Repayment to shareholder — Andrew Shaw"
    : "Shareholder loan — Andrew Shaw";

  const { error } = await supabase.from("corp_transactions").insert({
    user_id:          user.id,
    date:             dateRaw,
    amount_pretax:    signedAmount,
    gst_hst:          0,
    amount_total:     signedAmount,
    currency:         "CAD",
    account_code:     "3010",
    account_type:     "liability",
    description,
    notes:            notes || null,
    source_channel:   "manual",
    corp_pct:         100,
    needs_review:     false,
  });
  if (error) {
    redirect(`/cockpit/cash?loan_error=insert_failed&detail=${encodeURIComponent(error.message).slice(0, 200)}`);
  }

  revalidatePath("/cockpit");
  revalidatePath("/cockpit/cash");
  redirect("/cockpit/cash?loan_logged=1");
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function CashPage({
  searchParams,
}: {
  searchParams: Promise<{
    logged?: string;
    error?: string;
    detail?: string;
    loan_logged?: string;
    loan_error?: string;
  }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/cockpit/cash");

  const sp = await searchParams;
  const justLogged     = sp.logged === "1";
  const loanLogged     = sp.loan_logged === "1";
  const errorCode      = sp.error ?? null;
  const loanErrorCode  = sp.loan_error ?? null;

  const [snapshotRes, loanRes] = await Promise.all([
    supabase
      .from("corp_cash_snapshots")
      .select("id, as_of_date, amount_cad, source_label, notes")
      .eq("user_id", user.id)
      .order("as_of_date", { ascending: false })
      .limit(20),
    supabase
      .from("corp_transactions")
      .select("id, date, amount_total, description, notes")
      .eq("user_id", user.id)
      .eq("account_code", "3010")
      .order("date", { ascending: false })
      .limit(30),
  ]);

  const snapshots  = (snapshotRes.data ?? []) as SnapshotRow[];
  const loanRows   = (loanRes.data ?? []) as LoanRow[];
  const latestSnap = snapshots[0] ?? null;
  const todayYmd   = new Date().toISOString().slice(0, 10);

  // Running balance: SUM of all signed amounts. Positive = corp owes Andrew.
  const loanBalance = loanRows.reduce((s, r) => s + Number(r.amount_total), 0);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start gap-4">
        <span
          aria-hidden
          className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/15"
        >
          <Wallet className="text-emerald-300 h-5 w-5" aria-hidden />
        </span>
        <div className="flex-1 min-w-0">
          <h1 className="text-foreground font-[var(--font-cockpit-display)] text-3xl font-normal tracking-tight">
            Cash
          </h1>
          <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm leading-relaxed">
            Cash-position snapshots and shareholder loan ledger. AR Inc. has no bank
            feed connected — all observations and events land here by hand.
          </p>
        </div>
      </header>

      {/* ── Toast banners ───────────────────────────────────────────────── */}
      {justLogged && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-sm text-emerald-200">
          Snapshot logged. Snapshot card refreshed.
        </div>
      )}
      {loanLogged && (
        <div className="rounded-lg border border-violet-500/20 bg-violet-500/[0.06] px-4 py-3 text-sm text-violet-200">
          Shareholder loan event recorded. Balance and Snapshot updated.
        </div>
      )}
      {errorCode && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-200">
          {errorCode === "missing_fields"  && "Date and amount are both required."}
          {errorCode === "invalid_amount"  && "Amount must be a non-negative number."}
          {errorCode === "insert_failed"   && <>Could not save snapshot: <span className="font-mono">{sp.detail ?? "unknown"}</span></>}
        </div>
      )}
      {loanErrorCode && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-200">
          {loanErrorCode === "missing_fields" && "Date and amount are both required."}
          {loanErrorCode === "invalid_amount" && "Amount must be a positive number."}
          {loanErrorCode === "insert_failed"  && <>Could not save loan event: <span className="font-mono">{sp.detail ?? "unknown"}</span></>}
        </div>
      )}

      {/* ── Section 1: Cash position snapshots ─────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section
          aria-label="Log new snapshot"
          className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent p-5 ring-1 ring-inset ring-emerald-500/15"
        >
          <h2 className="text-foreground/90 inline-flex items-center gap-2 text-[11px] font-medium tracking-[0.08em] uppercase">
            <span className="bg-emerald-400 inline-block h-1 w-1 rounded-full" aria-hidden />
            Log a cash snapshot
          </h2>
          <p className="text-muted-foreground/60 mt-1 text-[11px]">
            Record the current bank balance. Latest drives the Cash Position card.
          </p>
          <form action={logCashSnapshot} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs">
                <span className="text-muted-foreground/80 mb-1 block tracking-[0.08em] uppercase">As-of date</span>
                <input
                  type="date"
                  name="as_of_date"
                  defaultValue={todayYmd}
                  required
                  className="text-foreground w-full rounded-md border border-white/[0.08] bg-black/20 px-3 py-2 font-mono text-sm tabular-nums focus:border-emerald-500/40 focus:outline-none"
                />
              </label>
              <label className="block text-xs">
                <span className="text-muted-foreground/80 mb-1 block tracking-[0.08em] uppercase">Amount (CAD)</span>
                <input
                  type="number"
                  name="amount_cad"
                  step="0.01"
                  min="0"
                  required
                  placeholder="0.00"
                  className="text-foreground w-full rounded-md border border-white/[0.08] bg-black/20 px-3 py-2 font-mono text-sm tabular-nums focus:border-emerald-500/40 focus:outline-none"
                />
              </label>
            </div>
            <label className="block text-xs">
              <span className="text-muted-foreground/80 mb-1 block tracking-[0.08em] uppercase">Source label (optional)</span>
              <input
                type="text"
                name="source_label"
                placeholder="e.g. RBC Business chequing"
                maxLength={120}
                className="text-foreground w-full rounded-md border border-white/[0.08] bg-black/20 px-3 py-2 text-sm focus:border-emerald-500/40 focus:outline-none"
              />
            </label>
            <label className="block text-xs">
              <span className="text-muted-foreground/80 mb-1 block tracking-[0.08em] uppercase">Notes (optional)</span>
              <textarea
                name="notes"
                rows={2}
                maxLength={500}
                placeholder="Anything worth flagging — pending vendor draws, expected inflow, etc."
                className="text-foreground w-full rounded-md border border-white/[0.08] bg-black/20 px-3 py-2 text-sm focus:border-emerald-500/40 focus:outline-none"
              />
            </label>
            <button
              type="submit"
              className="bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 inline-flex items-center gap-2 rounded-md border border-emerald-500/30 px-4 py-2 text-sm font-medium transition-colors"
            >
              Log snapshot
            </button>
          </form>
        </section>

        <section
          aria-label="Recent snapshots"
          className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent p-5 ring-1 ring-inset ring-white/[0.04]"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-foreground/90 inline-flex items-center gap-2 text-[11px] font-medium tracking-[0.08em] uppercase">
              <span className="bg-muted-foreground/40 inline-block h-1 w-1 rounded-full" aria-hidden />
              Recent snapshots
            </h2>
            {latestSnap ? (
              <span className="text-muted-foreground/70 text-[11px]">
                Latest <span className="text-emerald-300 font-mono tabular-nums">{fmtCAD(Number(latestSnap.amount_cad))}</span>{" "}
                · <span className="font-mono tabular-nums">{latestSnap.as_of_date}</span>
              </span>
            ) : null}
          </div>
          {snapshots.length === 0 ? (
            <p className="text-muted-foreground/70 mt-4 text-sm">
              No snapshots yet. Log one to drive the Cash Position card.
            </p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {snapshots.map((row) => (
                <li
                  key={row.id}
                  className="flex items-start justify-between gap-3 border-b border-white/[0.04] pb-2.5 last:border-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground/85 font-mono tabular-nums text-sm">{row.as_of_date}</p>
                    {row.source_label && (
                      <p className="text-muted-foreground/70 mt-0.5 truncate text-xs">{row.source_label}</p>
                    )}
                    {row.notes && (
                      <p className="text-muted-foreground/60 mt-0.5 truncate text-xs italic">{row.notes}</p>
                    )}
                  </div>
                  <span className="text-foreground font-mono tabular-nums text-sm whitespace-nowrap">
                    {fmtCAD(Number(row.amount_cad))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ── Section 2: Shareholder loan ledger ─────────────────────────── */}
      <div>
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-foreground/90 font-[var(--font-cockpit-display)] text-xl font-normal tracking-tight">
            Shareholder loans
          </h2>
          <span className="text-muted-foreground/60 hidden text-[11px] tracking-[0.08em] uppercase sm:inline">
            Account 3010 · Due to Shareholder
          </span>
        </div>

        {/* Balance summary bar */}
        <div className="mb-5 flex items-center gap-4 rounded-lg border border-violet-500/15 bg-violet-500/[0.04] px-4 py-3">
          <div>
            <p className="text-muted-foreground/70 text-[10px] tracking-[0.08em] uppercase">Outstanding balance</p>
            <p className="text-foreground font-mono text-2xl tabular-nums">
              {fmtCAD2(loanBalance)}
            </p>
          </div>
          <div className="text-muted-foreground/60 ml-auto text-xs leading-relaxed">
            AR Inc. owes Andrew{" "}
            <span className="text-violet-300 font-mono tabular-nums">{fmtCAD2(Math.abs(loanBalance))}</span>
            {loanBalance >= 0 ? "" : " — balance is negative, check entries"}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Log form */}
          <section
            aria-label="Log shareholder loan event"
            className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent p-5 ring-1 ring-inset ring-violet-500/15"
          >
            <h3 className="text-foreground/90 inline-flex items-center gap-2 text-[11px] font-medium tracking-[0.08em] uppercase">
              <span className="bg-violet-400 inline-block h-1 w-1 rounded-full" aria-hidden />
              Log a loan event
            </h3>
            <p className="text-muted-foreground/60 mt-1 text-[11px]">
              Record a personal transfer in or a repayment out. Then log a fresh
              cash snapshot to keep the balance card current.
            </p>
            <form action={logShareholderLoan} className="mt-4 space-y-4">
              {/* Direction toggle */}
              <fieldset className="space-y-1.5">
                <legend className="text-muted-foreground/80 text-[10px] tracking-[0.08em] uppercase">Direction</legend>
                <div className="flex gap-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="radio" name="direction" value="in" defaultChecked className="accent-violet-400" />
                    <ArrowUpRight className="text-violet-300 h-3.5 w-3.5" aria-hidden />
                    <span className="text-foreground/85">Loan in</span>
                    <span className="text-muted-foreground/60 text-xs">(I transferred to corp)</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="radio" name="direction" value="out" className="accent-violet-400" />
                    <ArrowDownLeft className="text-muted-foreground/80 h-3.5 w-3.5" aria-hidden />
                    <span className="text-foreground/85">Repayment</span>
                    <span className="text-muted-foreground/60 text-xs">(corp paid me back)</span>
                  </label>
                </div>
              </fieldset>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-xs">
                  <span className="text-muted-foreground/80 mb-1 block tracking-[0.08em] uppercase">Date</span>
                  <input
                    type="date"
                    name="loan_date"
                    defaultValue={todayYmd}
                    required
                    className="text-foreground w-full rounded-md border border-white/[0.08] bg-black/20 px-3 py-2 font-mono text-sm tabular-nums focus:border-violet-500/40 focus:outline-none"
                  />
                </label>
                <label className="block text-xs">
                  <span className="text-muted-foreground/80 mb-1 block tracking-[0.08em] uppercase">Amount (CAD)</span>
                  <input
                    type="number"
                    name="loan_amount"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="50.00"
                    className="text-foreground w-full rounded-md border border-white/[0.08] bg-black/20 px-3 py-2 font-mono text-sm tabular-nums focus:border-violet-500/40 focus:outline-none"
                  />
                </label>
              </div>
              <label className="block text-xs">
                <span className="text-muted-foreground/80 mb-1 block tracking-[0.08em] uppercase">Notes (optional)</span>
                <input
                  type="text"
                  name="loan_notes"
                  maxLength={300}
                  placeholder='e.g. "e-transfer from personal RBC, ref 2026-05-06"'
                  className="text-foreground w-full rounded-md border border-white/[0.08] bg-black/20 px-3 py-2 text-sm focus:border-violet-500/40 focus:outline-none"
                />
              </label>
              <button
                type="submit"
                className="bg-violet-500/15 text-violet-200 hover:bg-violet-500/25 inline-flex items-center gap-2 rounded-md border border-violet-500/30 px-4 py-2 text-sm font-medium transition-colors"
              >
                Record loan event
              </button>
            </form>
          </section>

          {/* History panel */}
          <section
            aria-label="Shareholder loan history"
            className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent p-5 ring-1 ring-inset ring-white/[0.04]"
          >
            <h3 className="text-foreground/90 inline-flex items-center gap-2 text-[11px] font-medium tracking-[0.08em] uppercase">
              <span className="bg-muted-foreground/40 inline-block h-1 w-1 rounded-full" aria-hidden />
              Loan history
            </h3>
            {loanRows.length === 0 ? (
              <p className="text-muted-foreground/70 mt-4 text-sm">
                No loan events yet. Use the form to record your first transfer.
              </p>
            ) : (
              <ul className="mt-4 space-y-2.5">
                {loanRows.map((row) => {
                  const amt = Number(row.amount_total);
                  const isInflow = amt >= 0;
                  return (
                    <li
                      key={row.id}
                      className="flex items-start justify-between gap-3 border-b border-white/[0.04] pb-2.5 last:border-0 last:pb-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {isInflow
                            ? <ArrowUpRight className="text-violet-300 h-3 w-3 flex-shrink-0" aria-hidden />
                            : <ArrowDownLeft className="text-muted-foreground/70 h-3 w-3 flex-shrink-0" aria-hidden />
                          }
                          <p className="text-foreground/85 font-mono tabular-nums text-sm">{row.date}</p>
                        </div>
                        {row.description && (
                          <p className="text-muted-foreground/70 mt-0.5 truncate text-xs">{row.description}</p>
                        )}
                        {row.notes && (
                          <p className="text-muted-foreground/60 mt-0.5 truncate text-xs italic">{row.notes}</p>
                        )}
                      </div>
                      <span className={`font-mono tabular-nums text-sm whitespace-nowrap ${isInflow ? "text-violet-300" : "text-muted-foreground/80"}`}>
                        {isInflow ? "+" : ""}{fmtCAD2(amt)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-muted-foreground/50 mt-4 text-[11px] leading-relaxed">
              Each event posts to account 3010. Balance = sum of all signed amounts.
              Confirm cumulative balance with your accountant at T2 filing time.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
