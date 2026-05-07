import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type {
  CorpComplianceSeverity,
  CorpComplianceUrgency,
  CorpUpcomingComplianceRow,
} from "@agent-runway/core/types/database";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const fmtDate = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

const KIND_LABELS: Record<string, string> = {
  "cra-t2-filing": "CRA · T2 filing",
  "cra-t2-payment": "CRA · T2 payment",
  "cra-hst-filing": "CRA · HST/GST filing",
  "cra-hst-instalment": "CRA · HST/GST instalment",
  "cra-payroll-t4": "CRA · T4 / T4A",
  "cra-payroll-source-deductions": "CRA · Source deductions",
  "corp-annual-return-federal": "Corp · CBCA annual return",
  "corp-annual-return-nb": "Corp · NB annual return",
  "corp-minute-book": "Corp · Minute book",
  "corp-insurance-renewal": "Corp · Insurance renewal",
  "corp-other": "Corp · Other",
};

const URGENCY_BADGE: Record<CorpComplianceUrgency, string> = {
  overdue: "border-red-500/40 bg-red-500/15 text-red-200",
  critical: "border-red-500/30 bg-red-500/[0.06] text-red-300",
  soon: "border-amber-500/30 bg-amber-500/[0.06] text-amber-300",
  upcoming: "border-white/10 bg-white/[0.03] text-muted-foreground/80",
};

const URGENCY_LABEL: Record<CorpComplianceUrgency, string> = {
  overdue: "Overdue",
  critical: "Within 7 days",
  soon: "Within 30 days",
  upcoming: "Upcoming",
};

const SEVERITY_DOT: Record<CorpComplianceSeverity, string> = {
  high: "bg-red-400",
  medium: "bg-amber-400",
  low: "bg-muted-foreground/40",
};

function formatDaysUntil(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "1 day overdue";
  if (days < 0) return `${Math.abs(days)} days overdue`;
  return `in ${days} days`;
}

export default async function CompliancePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/cockpit/compliance");

  const { data: rows } = await supabase
    .from("v_corp_upcoming_compliance")
    .select(
      "id, title, kind, due_date, severity, recurring_pattern, notes, completed_at, created_at, days_until_due, urgency",
    )
    .eq("user_id", user.id)
    .order("due_date", { ascending: true });

  const events = (rows ?? []) as CorpUpcomingComplianceRow[];

  // Group by urgency tier
  const overdue = events.filter((e) => e.urgency === "overdue");
  const critical = events.filter((e) => e.urgency === "critical");
  const soon = events.filter((e) => e.urgency === "soon");
  const upcoming = events.filter((e) => e.urgency === "upcoming");

  return (
    <div className="space-y-8">
      <header className="min-w-0">
        <h1 className="text-foreground font-[var(--font-cockpit-display)] text-4xl font-normal leading-none tracking-tight">
          Compliance calendar
        </h1>
        <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm leading-relaxed">
          T2 filing and payment dates, HST/GST quarterly windows, federal and NB annual returns,
          minute-book updates, payroll obligations, and insurance renewals. Events are seeded once
          and roll forward by recurring pattern. Filing decisions sit with your accountant — this is
          the operator-side framing.
        </p>
      </header>

      {events.length === 0 && (
        <section className="border-border/40 rounded-xl border bg-white/[0.02] p-8 text-center">
          <p className="text-muted-foreground/80 text-sm">
            No compliance events yet. Events should appear once the calendar is seeded.
          </p>
        </section>
      )}

      {overdue.length > 0 && (
        <ComplianceSection
          title="Overdue"
          subtitle="Past due — action needed."
          tone="overdue"
          events={overdue}
        />
      )}

      {critical.length > 0 && (
        <ComplianceSection
          title="Within 7 days"
          subtitle="Imminent."
          tone="critical"
          events={critical}
        />
      )}

      {soon.length > 0 && (
        <ComplianceSection
          title="Within 30 days"
          subtitle="On the near horizon."
          tone="soon"
          events={soon}
        />
      )}

      {upcoming.length > 0 && (
        <ComplianceSection
          title="Upcoming"
          subtitle="Beyond 30 days."
          tone="upcoming"
          events={upcoming}
        />
      )}
    </div>
  );
}

interface ComplianceSectionProps {
  title: string;
  subtitle: string;
  tone: CorpComplianceUrgency;
  events: CorpUpcomingComplianceRow[];
}

function ComplianceSection({
  title,
  subtitle,
  tone,
  events,
}: ComplianceSectionProps) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-foreground text-base font-medium tracking-tight">
            {title}
          </h2>
          <p className="text-muted-foreground/70 text-xs">{subtitle}</p>
        </div>
        <span className="text-muted-foreground/50 text-[11px] tracking-wide uppercase">
          {events.length} {events.length === 1 ? "event" : "events"}
        </span>
      </div>

      <ul className="space-y-2">
        {events.map((evt) => (
          <ComplianceEventCard key={evt.id} evt={evt} tone={tone} />
        ))}
      </ul>
    </section>
  );
}

interface ComplianceEventCardProps {
  evt: CorpUpcomingComplianceRow;
  tone: CorpComplianceUrgency;
}

function ComplianceEventCard({ evt, tone }: ComplianceEventCardProps) {
  const kindLabel = KIND_LABELS[evt.kind] ?? evt.kind;

  return (
    <li
      className={cn(
        "rounded-xl border bg-white/[0.02] px-4 py-3.5 transition-colors",
        tone === "overdue"
          ? "border-red-500/30"
          : tone === "critical"
            ? "border-red-500/20"
            : tone === "soon"
              ? "border-amber-500/20"
              : "border-border/30",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                SEVERITY_DOT[evt.severity],
              )}
              aria-hidden
            />
            <h3 className="text-foreground text-[14px] font-medium leading-snug">
              {evt.title}
            </h3>
          </div>
          <p className="text-muted-foreground/70 text-[11px] tracking-wide">
            {kindLabel}
            {evt.recurring_pattern && (
              <>
                {" · "}
                <span className="text-muted-foreground/50">
                  recurs {evt.recurring_pattern}
                </span>
              </>
            )}
          </p>
          {evt.notes && (
            <p className="text-muted-foreground/85 mt-1.5 text-[12px] leading-relaxed">
              {evt.notes}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5 whitespace-nowrap">
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] tracking-wide uppercase",
              URGENCY_BADGE[tone],
            )}
          >
            {URGENCY_LABEL[tone]}
          </span>
          <time
            dateTime={evt.due_date}
            className="text-muted-foreground/90 text-[12px] font-medium"
          >
            {fmtDate(evt.due_date)}
          </time>
          <span className="text-muted-foreground/50 text-[11px]">
            {formatDaysUntil(evt.days_until_due)}
          </span>
        </div>
      </div>
    </li>
  );
}

