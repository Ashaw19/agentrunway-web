import { Wallet } from "lucide-react";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Phase 1 cash surface: minimal manual-snapshot logger. AR Inc. has no
// bank-feed integration (Plaid Growth deferred, QuickBooks skipped) so
// every cash-position observation lands here by hand. Latest by as_of_date
// becomes the displayed value on the Snapshot's Cash Position card.
//
// The fuller cash route (30/90/365 trend chart, inflow vs outflow split,
// shareholder-loan balance trend) stays in the planned-Phase-2 list — see
// _lib/placeholder-page.tsx for the prior copy.

export const dynamic = "force-dynamic";

type SnapshotRow = {
  id: string;
  as_of_date: string;
  amount_cad: number;
  source_label: string | null;
  notes: string | null;
};

const fmtCAD = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

async function logCashSnapshot(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/cockpit/cash");

  const asOfDateRaw = String(formData.get("as_of_date") ?? "").trim();
  const amountRaw = String(formData.get("amount_cad") ?? "").trim();
  const sourceLabel = String(formData.get("source_label") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!asOfDateRaw || !amountRaw) {
    redirect("/cockpit/cash?error=missing_fields");
  }

  const amount = Number(amountRaw.replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount < 0) {
    redirect("/cockpit/cash?error=invalid_amount");
  }

  const { error } = await supabase.from("corp_cash_snapshots").insert({
    user_id: user.id,
    as_of_date: asOfDateRaw,
    amount_cad: amount,
    source_label: sourceLabel || null,
    notes: notes || null,
  });
  if (error) {
    redirect(`/cockpit/cash?error=insert_failed&detail=${encodeURIComponent(error.message).slice(0, 200)}`);
  }

  revalidatePath("/cockpit");
  revalidatePath("/cockpit/cash");
  redirect("/cockpit/cash?logged=1");
}

export default async function CashPage({
  searchParams,
}: {
  searchParams: Promise<{ logged?: string; error?: string; detail?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/cockpit/cash");

  const sp = await searchParams;
  const justLogged = sp.logged === "1";
  const errorCode = sp.error ?? null;

  const { data } = await supabase
    .from("corp_cash_snapshots")
    .select("id, as_of_date, amount_cad, source_label, notes")
    .eq("user_id", user.id)
    .order("as_of_date", { ascending: false })
    .limit(20);

  const rows = (data ?? []) as SnapshotRow[];
  const latest = rows[0] ?? null;
  const todayYmd = new Date().toISOString().slice(0, 10);

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
            Manual cash-position snapshots. AR Inc. has no bank feed connected, so
            every observation lands here by hand. Latest snapshot drives the Cash
            Position card on the Snapshot page.
          </p>
        </div>
      </header>

      {justLogged ? (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-sm text-emerald-200">
          Snapshot logged. Snapshot card refreshed.
        </div>
      ) : null}
      {errorCode ? (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-200">
          {errorCode === "missing_fields" && "Date and amount are both required."}
          {errorCode === "invalid_amount" && "Amount must be a non-negative number."}
          {errorCode === "insert_failed" && (
            <>
              Could not save snapshot: <span className="font-mono">{sp.detail ?? "unknown"}</span>
            </>
          )}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section
          aria-label="Log new snapshot"
          className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent p-5 ring-1 ring-inset ring-emerald-500/15"
        >
          <h2 className="text-foreground/90 inline-flex items-center gap-2 text-[11px] font-medium tracking-[0.08em] uppercase">
            <span className="bg-emerald-400 inline-block h-1 w-1 rounded-full" aria-hidden />
            Log a snapshot
          </h2>
          <form action={logCashSnapshot} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs">
                <span className="text-muted-foreground/80 mb-1 block tracking-[0.08em] uppercase">
                  As-of date
                </span>
                <input
                  type="date"
                  name="as_of_date"
                  defaultValue={todayYmd}
                  required
                  className="text-foreground w-full rounded-md border border-white/[0.08] bg-black/20 px-3 py-2 font-mono text-sm tabular-nums focus:border-emerald-500/40 focus:outline-none"
                />
              </label>
              <label className="block text-xs">
                <span className="text-muted-foreground/80 mb-1 block tracking-[0.08em] uppercase">
                  Amount (CAD)
                </span>
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
              <span className="text-muted-foreground/80 mb-1 block tracking-[0.08em] uppercase">
                Source label (optional)
              </span>
              <input
                type="text"
                name="source_label"
                placeholder="e.g. RBC Business chequing"
                maxLength={120}
                className="text-foreground w-full rounded-md border border-white/[0.08] bg-black/20 px-3 py-2 text-sm focus:border-emerald-500/40 focus:outline-none"
              />
            </label>
            <label className="block text-xs">
              <span className="text-muted-foreground/80 mb-1 block tracking-[0.08em] uppercase">
                Notes (optional)
              </span>
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
            {latest ? (
              <span className="text-muted-foreground/70 text-[11px]">
                Latest <span className="text-emerald-300 font-mono tabular-nums">{fmtCAD(Number(latest.amount_cad))}</span>{" "}
                · <span className="font-mono tabular-nums">{latest.as_of_date}</span>
              </span>
            ) : null}
          </div>
          {rows.length === 0 ? (
            <p className="text-muted-foreground/70 mt-4 text-sm">
              No snapshots yet. Log one to drive the Cash Position card.
            </p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex items-start justify-between gap-3 border-b border-white/[0.04] pb-2.5 last:border-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground/85 font-mono tabular-nums text-sm">{row.as_of_date}</p>
                    {row.source_label ? (
                      <p className="text-muted-foreground/70 mt-0.5 truncate text-xs">{row.source_label}</p>
                    ) : null}
                    {row.notes ? (
                      <p className="text-muted-foreground/60 mt-0.5 truncate text-xs italic">{row.notes}</p>
                    ) : null}
                  </div>
                  <span className="text-foreground font-mono tabular-nums text-sm whitespace-nowrap">
                    {fmtCAD(Number(row.amount_cad))}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-muted-foreground/60 mt-4 text-[11px] leading-relaxed">
            Edit / delete and the 30/90/365-day trend, inflow vs outflow split, and
            shareholder-loan trend land in a follow-up surface.
          </p>
        </section>
      </div>
    </div>
  );
}
