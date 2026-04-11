"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Flame,
  CircleDot,
  Bell,
  CalendarDays,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtCompact } from "@/lib/formatters";
import type {
  Client,
  ClientRecord,
  ContactActivity,
  ListingAppointment,
} from "@/lib/types/database";
import {
  CLIENT_STATUS_LABELS,
  CLIENT_STATUS_COLORS,
} from "@/lib/types/database";

// ── Props ────────────────────────────────────────────────────────────────────

interface PipelineTabProps {
  clients:             Client[];
  records:             ClientRecord[];
  activities:          ContactActivity[];
  listingAppointments: ListingAppointment[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function contactAge(client: Client): number | null {
  return daysSince(client.last_contact_at ?? client.created_at);
}

function fmtAge(days: number | null): string {
  if (days === null) return "No contact on record";
  if (days === 0)    return "Today";
  if (days === 1)    return "Yesterday";
  if (days < 7)     return `${days}d ago`;
  if (days < 30)    return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function StatusBadge({ status }: { status: string }) {
  const colors = CLIENT_STATUS_COLORS[status as keyof typeof CLIENT_STATUS_COLORS];
  const label  = CLIENT_STATUS_LABELS[status as keyof typeof CLIENT_STATUS_LABELS] ?? status;
  if (!colors) return <Badge variant="outline" className="text-[9px] px-1.5 py-0">{label}</Badge>;
  return (
    <span className={cn("text-[9px] font-semibold border rounded-full px-2 py-0 shrink-0", colors.bg, colors.text, colors.border)}>
      {label}
    </span>
  );
}

function ClientRow({
  client,
  detail,
  age,
  action,
  urgent = false,
}: {
  client:  Client;
  detail?: string;
  age:     number | null;
  action?: string;
  urgent?: boolean;
}) {
  return (
    <div className={cn(
      "flex items-start gap-3 py-2.5 px-3 rounded-lg border",
      urgent
        ? "bg-red-50/50 border-red-100 dark:bg-red-950/10 dark:border-red-900/30"
        : "bg-white/50 border-border/40 dark:bg-muted/20",
    )}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground">{client.first_name ?? ""} {client.last_name ?? client.name}</span>
          <StatusBadge status={client.status} />
        </div>
        {detail && <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>}
        {action && <p className="text-[11px] text-primary/70 font-medium mt-1 italic">{action}</p>}
      </div>
      <div className={cn(
        "text-[10px] shrink-0 font-medium tabular-nums mt-0.5",
        age !== null && age >= 30 ? "text-red-500" : age !== null && age >= 14 ? "text-amber-500" : "text-muted-foreground",
      )}>
        {fmtAge(age)}
      </div>
    </div>
  );
}

function ListingRow({ appt, clientName }: { appt: ListingAppointment; clientName?: string }) {
  const daysActive = daysSince(appt.appointment_date);
  return (
    <div className="flex items-start gap-3 py-2.5 px-3 rounded-lg border bg-white/50 border-border/40 dark:bg-muted/20">
      <CalendarDays className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground">{appt.property_address || "Address TBD"}</span>
          <span className="text-[9px] font-semibold border rounded-full px-2 py-0 bg-orange-50 text-orange-700 border-orange-200">
            Active Listing
          </span>
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          {clientName && <span className="text-xs text-muted-foreground">{clientName}</span>}
          {appt.estimated_list_price && (
            <span className="text-xs text-muted-foreground">Est. {fmtCompact(appt.estimated_list_price)}</span>
          )}
          {appt.actual_list_price && (
            <span className="text-xs text-muted-foreground">Listed {fmtCompact(appt.actual_list_price)}</span>
          )}
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
        {daysActive !== null ? `${daysActive}d active` : "—"}
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  label,
  count,
  color,
  description,
  totalValue,
}: {
  icon:        React.ReactNode;
  label:       string;
  count:       number;
  color:       string;
  description: string;
  totalValue?: number;
}) {
  return (
    <div className="flex items-start gap-3 mb-3">
      <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5", color)}>
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-foreground">{label}</h3>
          <span className="text-xs font-semibold bg-muted text-muted-foreground rounded-full px-2 py-0.5">{count}</span>
          {totalValue != null && totalValue > 0 && (
            <span className="text-xs font-semibold text-emerald-600 ml-auto tabular-nums">{fmtCompact(totalValue)}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function PipelineTab({
  clients,
  records: _records,
  activities: _activities,
  listingAppointments,
}: PipelineTabProps) {
  // Active (non-archived) clients only
  const active = useMemo(
    () => clients.filter((c) => !c.archived_at),
    [clients],
  );

  // Client lookup map for listing appointments
  const clientMap = useMemo(
    () => new Map(clients.map((c) => [c.id, c])),
    [clients],
  );

  // ── Section 1: In Motion ──────────────────────────────────────────────────
  // In-Flight clients + Active listing appointments
  const inFlight = useMemo(
    () => active.filter((c) => c.status === "in_flight"),
    [active],
  );

  const activeListings = useMemo(
    () => listingAppointments.filter((a) => a.status === "active"),
    [listingAppointments],
  );

  const inMotionCount = inFlight.length + activeListings.length;

  // ── Section 2: On Deck ────────────────────────────────────────────────────
  // Pre-approved / budget-set boarding clients contacted within 30 days —
  // these are the prospects most likely to write an offer next.
  const onDeck = useMemo(() => {
    return active.filter((c) => {
      if (c.status !== "boarding") return false;
      const hasBudget =
        c.buyer_pre_approved ||
        c.buyer_pre_approval_amount != null ||
        (c.property_interest_type === "budget" && c.property_interest != null);
      const age = contactAge(c);
      return hasBudget && (age === null || age <= 30);
    });
  }, [active]);

  // ── Section 3: Check In ───────────────────────────────────────────────────
  // Active-status clients with no contact in 14+ days
  const checkIn = useMemo(
    () =>
      active.filter((c) => {
        if (!["boarding", "scheduled", "in_flight"].includes(c.status)) return false;
        // Exclude in_flight (already in Section 1) and on-deck clients (Section 2)
        if (c.status === "in_flight") return false;
        if (onDeck.some((d) => d.id === c.id)) return false;
        const age = contactAge(c);
        return age === null || age >= 14;
      }),
    [active, onDeck],
  );

  // ── Dollar values per section ──────────────────────────────────────────────
  const DEFAULT_COMMISSION = 0.025;

  const inMotionValue = useMemo(() => {
    const clientValue = inFlight.reduce((sum, c) => {
      const budget = c.buyer_pre_approval_amount ?? c.property_interest ?? 0;
      return sum + budget * DEFAULT_COMMISSION;
    }, 0);
    const listingValue = activeListings.reduce((sum, a) => {
      const price = a.actual_list_price ?? a.estimated_list_price ?? 0;
      const pct = a.estimated_commission_pct ?? DEFAULT_COMMISSION;
      return sum + price * pct;
    }, 0);
    return clientValue + listingValue;
  }, [inFlight, activeListings]);

  const onDeckValue = useMemo(() => {
    return onDeck.reduce((sum, c) => {
      const budget = c.buyer_pre_approval_amount ?? c.property_interest ?? 0;
      return sum + budget * DEFAULT_COMMISSION;
    }, 0);
  }, [onDeck]);

  const checkInValue = useMemo(() => {
    return checkIn.reduce((sum, c) => {
      const budget = c.buyer_pre_approval_amount ?? c.property_interest ?? 0;
      return sum + budget * DEFAULT_COMMISSION;
    }, 0);
  }, [checkIn]);

  const totalPipelineGCI = inMotionValue + onDeckValue + checkInValue;

  // ── Summary bar ───────────────────────────────────────────────────────────
  const today = new Date().toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  if (inMotionCount === 0 && onDeck.length === 0 && checkIn.length === 0) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium">No active pipeline items.</p>
        <p className="text-xs mt-1">Add clients and mark them active to see them here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-foreground">Weekly Pipeline</h2>
            <Link href="/pipeline" className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors">
              View full pipeline →
            </Link>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{today}</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {totalPipelineGCI > 0 && (
            <span className="font-semibold text-emerald-600 tabular-nums">{fmtCompact(totalPipelineGCI)} GCI</span>
          )}
          <span><span className="font-semibold text-foreground">{inMotionCount}</span> closing</span>
          <span><span className="font-semibold text-foreground">{onDeck.length}</span> on deck</span>
          <span className={cn("font-semibold", checkIn.length > 0 ? "text-amber-600" : "text-foreground")}>{checkIn.length}</span>
          <span>to check in</span>
        </div>
      </div>

      {/* ── Section 1: In Motion ─────────────────────────────────────────── */}
      {inMotionCount > 0 && (
        <div>
          <SectionHeader
            icon={<Flame className="h-4 w-4 text-white" />}
            label="In Motion"
            count={inMotionCount}
            color="bg-emerald-500"
            description="Under contract or actively listed — these should close soon."
            totalValue={inMotionValue}
          />
          <div className="space-y-2">
            {inFlight.map((c) => {
              const budget = c.buyer_pre_approval_amount ?? c.property_interest;
              const detail = budget ? `Budget: ${fmtCompact(budget)}` : c.timeframe ? `Timeframe: ${c.timeframe.replace(/_/g, " ")}` : undefined;
              return (
                <ClientRow
                  key={c.id}
                  client={c}
                  detail={detail}
                  age={contactAge(c)}
                  action="Confirm next milestone and expected close date."
                />
              );
            })}
            {activeListings.map((a) => (
              <ListingRow
                key={a.id}
                appt={a}
                clientName={a.client_id ? clientMap.get(a.client_id)?.name : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Section 2: On Deck ───────────────────────────────────────────── */}
      {onDeck.length > 0 && (
        <div>
          <SectionHeader
            icon={<CircleDot className="h-4 w-4 text-white" />}
            label="On Deck"
            count={onDeck.length}
            color="bg-violet-500"
            description="Pre-approved buyers with recent momentum — who writes an offer next?"
            totalValue={onDeckValue}
          />
          <div className="space-y-2">
            {onDeck.map((c) => {
              const preApproval = c.buyer_pre_approval_amount;
              const budget = c.property_interest;
              const financing = c.buyer_financing_type;
              const targetDate = c.buyer_target_close_date;
              const parts: string[] = [];
              if (preApproval) parts.push(`Pre-approved: ${fmtCompact(preApproval)}`);
              else if (budget)  parts.push(`Budget: ${fmtCompact(budget)}`);
              if (financing && financing !== "unknown") parts.push(financing.charAt(0).toUpperCase() + financing.slice(1));
              if (targetDate) parts.push(`Target close: ${new Date(targetDate + "T12:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric" })}`);
              return (
                <ClientRow
                  key={c.id}
                  client={c}
                  detail={parts.join(" · ") || undefined}
                  age={contactAge(c)}
                  action="Review readiness — are they close to writing an offer?"
                />
              );
            })}
          </div>
        </div>
      )}

      {/* ── Section 3: Check In ──────────────────────────────────────────── */}
      {checkIn.length > 0 && (
        <div>
          <SectionHeader
            icon={<Bell className="h-4 w-4 text-white" />}
            label="Check In"
            count={checkIn.length}
            color="bg-amber-500"
            description="Active clients with no contact in 14+ days — who risks going cold?"
            totalValue={checkInValue}
          />
          <div className="space-y-2">
            {[...checkIn]
              .sort((a, b) => (contactAge(b) ?? 0) - (contactAge(a) ?? 0))
              .map((c) => {
                const age = contactAge(c);
                const budget = c.buyer_pre_approval_amount ?? c.property_interest;
                const detail = budget ? `Budget: ${fmtCompact(budget)}` : c.timeframe ? `Timeframe: ${c.timeframe.replace(/_/g, " ")}` : undefined;
                const action =
                  c.status === "boarding"
                    ? "No contact yet — reach out to make first contact."
                    : age !== null && age >= 30
                    ? "Over 30 days — priority follow-up this week."
                    : "Due for a check-in — what's changed for them?";
                return (
                  <ClientRow
                    key={c.id}
                    client={c}
                    detail={detail}
                    age={age}
                    action={action}
                    urgent={age !== null && age >= 30}
                  />
                );
              })}
          </div>
        </div>
      )}

      {/* Footer note */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t border-border/40">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        <span>Cruising clients are excluded — this view focuses on active, pre-close opportunities only.</span>
      </div>
    </div>
  );
}
