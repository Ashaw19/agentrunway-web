import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";

export interface PreIncorpDisplayRow {
  id: string;
  effective_incurred_date: string;
  days_before_incorp: number;
  vendor_display: string | null;
  account_code: string | null;
  account_name: string | null;
  amount_pretax: number;
  gst_hst: number;
  amount_total: number;
  currency: string;
  description: string | null;
  needs_review: boolean;
  review_reason: string | null;
  cra_rule_status: string | null;
}

function fmtCAD(n: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function RegisterTable({ rows }: { rows: PreIncorpDisplayRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-muted-foreground/60 text-sm">
          No pre-incorporation transactions found.
        </p>
      </div>
    );
  }

  const totalPretax = rows.reduce((s, r) => s + r.amount_pretax, 0);
  const totalGst    = rows.reduce((s, r) => s + r.gst_hst, 0);
  const totalTotal  = rows.reduce((s, r) => s + r.amount_total, 0);

  return (
    <div className="space-y-3">
      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCell label="Transactions" value={String(rows.length)} />
        <StatCell label="Pre-tax total" value={fmtCAD(totalPretax)} />
        <StatCell label="GST/HST" value={fmtCAD(totalGst)} />
        <StatCell label="Total" value={fmtCAD(totalTotal)} highlight />
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <Th>Date</Th>
              <Th>Days before</Th>
              <Th>Vendor</Th>
              <Th>Account</Th>
              <Th right>Pre-tax</Th>
              <Th right>GST/HST</Th>
              <Th right>Total</Th>
              <Th>Notes</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={cn(
                  "border-b border-white/[0.04] last:border-0 transition-colors hover:bg-white/[0.02]",
                  row.needs_review && "bg-amber-500/[0.03]",
                )}
              >
                <td className="px-4 py-2.5">
                  <span className="text-foreground/80 font-mono text-xs tabular-nums">
                    {fmtDate(row.effective_incurred_date)}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className="rounded-full bg-violet-500/10 px-2 py-0.5 font-mono text-[11px] tabular-nums text-violet-300/80 ring-1 ring-inset ring-violet-500/20">
                    {row.days_before_incorp}d
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-foreground/80 text-xs">
                    {row.vendor_display ?? <span className="text-muted-foreground/40 italic">unknown</span>}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  {row.account_name ? (
                    <span className="text-foreground/70 text-xs">{row.account_name}</span>
                  ) : row.account_code ? (
                    <span className="text-muted-foreground/50 font-mono text-[11px]">{row.account_code}</span>
                  ) : (
                    <span className="text-muted-foreground/30 text-xs italic">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <span className="text-foreground/70 font-mono text-xs tabular-nums">
                    {fmtCAD(row.amount_pretax)}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <span className="text-muted-foreground/50 font-mono text-xs tabular-nums">
                    {fmtCAD(row.gst_hst)}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <span className="text-foreground/80 font-mono text-xs tabular-nums font-medium">
                    {fmtCAD(row.amount_total)}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    {row.needs_review && (
                      <span
                        title={row.review_reason ?? "Needs review"}
                        className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-inset ring-amber-500/20"
                      >
                        <AlertCircle className="h-2.5 w-2.5" aria-hidden />
                        Review
                      </span>
                    )}
                    {row.description && (
                      <span
                        className="text-muted-foreground/50 max-w-[140px] truncate text-[11px]"
                        title={row.description}
                      >
                        {row.description}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-muted-foreground/50 text-[11px]">
        AR Inc. incorporated 2026-04-16. Days-before-incorp uses the incurred date if set, otherwise
        the transaction date. Accountant sign-off (CRA rule status) is reserved for T2 filing season.
      </p>
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

function StatCell({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <p className="text-muted-foreground/60 text-[11px] tracking-[0.08em] uppercase">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-mono text-base tabular-nums",
          highlight ? "text-foreground" : "text-foreground/70",
        )}
      >
        {value}
      </p>
    </div>
  );
}
