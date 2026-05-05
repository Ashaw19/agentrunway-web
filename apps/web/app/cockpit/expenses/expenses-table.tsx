import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CorpSourceChannel } from "@agent-runway/core/types/database";
import { cn } from "@/lib/utils";
import { Receipt, AlertTriangle } from "lucide-react";

export interface ExpenseRow {
  id: string;
  date: string;
  vendor_display: string | null;
  account_code: string | null;
  account_name: string | null;
  amount_pretax: number;
  gst_hst: number;
  amount_total: number;
  currency: string;
  needs_review: boolean;
  review_reason: string | null;
  source_channel: CorpSourceChannel;
}

const SOURCE_LABELS: Record<CorpSourceChannel, string> = {
  receipt_upload: "Upload",
  mobile_photo:   "Mobile",
  email_inbound:  "Email",
  qbo:            "QBO",
  manual:         "Manual",
  stripe:         "Stripe",
  bank_csv:       "Bank CSV",
};

function fmtCurrency(amount: number, currency: string): string {
  // Locale-stable formatting — the cockpit is single-user English-CA.
  // We pass the value through Intl so negative amounts (e.g. Stripe fee
  // splits) render with a minus sign and 2-decimal precision.
  const fmt = new Intl.NumberFormat("en-CA", {
    style: "decimal",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = amount < 0 ? "−" : "";
  const body = fmt.format(Math.abs(amount));
  return `${sign}${currency === "CAD" ? "$" : currency + " "}${body}`;
}

function fmtDate(iso: string): string {
  // ISO YYYY-MM-DD → "May 5, 2026" — keeps the column dense but readable.
  // Avoids tz drift by parsing the date parts directly.
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function ExpensesTable({ rows }: { rows: ExpenseRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent p-12 text-center ring-1 ring-inset ring-white/[0.04]">
        <Receipt
          className="text-muted-foreground/50 mx-auto h-10 w-10"
          aria-hidden
        />
        <p className="text-foreground/85 mt-4 text-sm font-medium">
          No transactions yet
        </p>
        <p className="text-muted-foreground/80 mx-auto mt-1.5 max-w-sm text-xs leading-relaxed">
          Add one or upload a receipt — every booked expense lands here once
          the vendor regex match assigns an account code.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent ring-1 ring-inset ring-white/[0.04]">
      <Table>
        <TableHeader>
          <TableRow className="border-white/[0.06] hover:bg-transparent">
            <TableHead className="text-muted-foreground/80 text-[10px] tracking-[0.08em] uppercase">
              Date
            </TableHead>
            <TableHead className="text-muted-foreground/80 text-[10px] tracking-[0.08em] uppercase">
              Vendor
            </TableHead>
            <TableHead className="text-muted-foreground/80 text-[10px] tracking-[0.08em] uppercase">
              Account
            </TableHead>
            <TableHead className="text-muted-foreground/80 text-right text-[10px] tracking-[0.08em] uppercase">
              Pretax
            </TableHead>
            <TableHead className="text-muted-foreground/80 text-right text-[10px] tracking-[0.08em] uppercase">
              GST/HST
            </TableHead>
            <TableHead className="text-muted-foreground/80 text-right text-[10px] tracking-[0.08em] uppercase">
              Total
            </TableHead>
            <TableHead className="text-muted-foreground/80 text-[10px] tracking-[0.08em] uppercase">
              Status
            </TableHead>
            <TableHead className="text-muted-foreground/80 text-[10px] tracking-[0.08em] uppercase">
              Source
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.id}
              className="border-white/[0.04] hover:bg-white/[0.02]"
            >
              <TableCell className="text-foreground/85 text-sm">
                {fmtDate(row.date)}
              </TableCell>
              <TableCell className="text-foreground/90 max-w-[16rem] truncate text-sm">
                {row.vendor_display ?? (
                  <span className="text-muted-foreground/60 italic">
                    (no vendor)
                  </span>
                )}
              </TableCell>
              <TableCell className="text-sm">
                {row.account_code ? (
                  <span className="text-foreground/85">
                    <span className="text-muted-foreground/70 font-mono tabular-nums">
                      {row.account_code}
                    </span>
                    <span className="text-foreground/85 ml-1.5">
                      {row.account_name ?? "—"}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground/60 italic">—</span>
                )}
              </TableCell>
              <TableCell className="text-foreground font-mono text-right text-sm tabular-nums">
                {fmtCurrency(row.amount_pretax, row.currency)}
              </TableCell>
              <TableCell className="text-foreground/85 font-mono text-right text-sm tabular-nums">
                {row.gst_hst === 0 ? (
                  <span className="text-muted-foreground/50">—</span>
                ) : (
                  fmtCurrency(row.gst_hst, row.currency)
                )}
              </TableCell>
              <TableCell className="text-foreground font-mono text-right text-sm tabular-nums">
                {fmtCurrency(row.amount_total, row.currency)}
              </TableCell>
              <TableCell className="text-sm">
                {row.needs_review ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium tracking-[0.04em] uppercase ring-1 ring-inset",
                      "bg-amber-500/10 text-amber-300 ring-amber-500/20",
                    )}
                    title={row.review_reason ?? "Needs review"}
                  >
                    <AlertTriangle className="h-3 w-3" aria-hidden />
                    Review
                  </span>
                ) : (
                  <span className="text-muted-foreground/60 text-[11px]">
                    Posted
                  </span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground/80 text-[11px] tracking-wide uppercase">
                {SOURCE_LABELS[row.source_channel]}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
