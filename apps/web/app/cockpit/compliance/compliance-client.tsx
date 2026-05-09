"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type {
  CorpComplianceKind,
  CorpComplianceRecurringPattern,
  CorpComplianceSeverity,
  CorpComplianceUrgency,
  CorpUpcomingComplianceRow,
} from "@agent-runway/core/types/database";

const KIND_OPTIONS: { value: CorpComplianceKind; label: string }[] = [
  { value: "cra-t2-filing", label: "CRA · T2 filing" },
  { value: "cra-t2-payment", label: "CRA · T2 payment" },
  { value: "cra-hst-filing", label: "CRA · HST/GST filing" },
  { value: "cra-hst-instalment", label: "CRA · HST/GST instalment" },
  { value: "cra-payroll-t4", label: "CRA · T4 / T4A" },
  { value: "cra-payroll-source-deductions", label: "CRA · Source deductions" },
  { value: "corp-annual-return-federal", label: "Corp · CBCA annual return" },
  { value: "corp-annual-return-nb", label: "Corp · NB annual return" },
  { value: "corp-minute-book", label: "Corp · Minute book" },
  { value: "corp-insurance-renewal", label: "Corp · Insurance renewal" },
  { value: "corp-other", label: "Corp · Other" },
];

const KIND_LABEL_LOOKUP: Record<string, string> = Object.fromEntries(
  KIND_OPTIONS.map((k) => [k.value, k.label]),
);

const RECURRING_OPTIONS: { value: "" | CorpComplianceRecurringPattern; label: string }[] = [
  { value: "", label: "One-off (no recurrence)" },
  { value: "annual", label: "Annual" },
  { value: "quarterly", label: "Quarterly" },
  { value: "monthly", label: "Monthly" },
  { value: "fiscal-anniversary", label: "Fiscal-anniversary" },
];

const SEVERITY_OPTIONS: { value: CorpComplianceSeverity; label: string }[] = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

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

const fmtDate = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

function formatDaysUntil(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "1 day overdue";
  if (days < 0) return `${Math.abs(days)} days overdue`;
  return `in ${days} days`;
}

interface Props {
  initialEvents: CorpUpcomingComplianceRow[];
}

type ModalMode =
  | { kind: "closed" }
  | { kind: "new" }
  | { kind: "edit"; event: CorpUpcomingComplianceRow }
  | { kind: "complete"; event: CorpUpcomingComplianceRow }
  | { kind: "snooze"; event: CorpUpcomingComplianceRow };

export function ComplianceClient({ initialEvents }: Props) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalMode>({ kind: "closed" });
  const [, startTransition] = useTransition();

  const events = initialEvents;

  const grouped = useMemo(() => {
    return {
      overdue: events.filter((e) => e.urgency === "overdue"),
      critical: events.filter((e) => e.urgency === "critical"),
      soon: events.filter((e) => e.urgency === "soon"),
      upcoming: events.filter((e) => e.urgency === "upcoming"),
    };
  }, [events]);

  const refresh = () => startTransition(() => router.refresh());

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-foreground font-[var(--font-cockpit-display)] text-4xl font-normal leading-none tracking-tight">
            Compliance calendar
          </h1>
          <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm leading-relaxed">
            T2 filing and payment dates, HST/GST quarterly windows, federal and NB annual returns,
            minute-book updates, payroll obligations, and insurance renewals. Recurring events
            roll forward automatically when marked complete. Filing decisions sit with your
            accountant — this is the operator-side framing.
          </p>
        </div>
        <button
          onClick={() => setModal({ kind: "new" })}
          className="border-border/40 bg-white/[0.04] hover:bg-white/[0.08] text-foreground rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap"
        >
          + New event
        </button>
      </header>

      {events.length === 0 && (
        <section className="border-border/40 rounded-xl border bg-white/[0.02] p-8 text-center">
          <p className="text-muted-foreground/80 text-sm">
            No open compliance events. Add one to start tracking.
          </p>
        </section>
      )}

      {grouped.overdue.length > 0 && (
        <Section
          title="Overdue"
          subtitle="Past due — action needed."
          tone="overdue"
          events={grouped.overdue}
          onEdit={(e) => setModal({ kind: "edit", event: e })}
          onComplete={(e) => setModal({ kind: "complete", event: e })}
          onSnooze={(e) => setModal({ kind: "snooze", event: e })}
        />
      )}

      {grouped.critical.length > 0 && (
        <Section
          title="Within 7 days"
          subtitle="Imminent."
          tone="critical"
          events={grouped.critical}
          onEdit={(e) => setModal({ kind: "edit", event: e })}
          onComplete={(e) => setModal({ kind: "complete", event: e })}
          onSnooze={(e) => setModal({ kind: "snooze", event: e })}
        />
      )}

      {grouped.soon.length > 0 && (
        <Section
          title="Within 30 days"
          subtitle="On the near horizon."
          tone="soon"
          events={grouped.soon}
          onEdit={(e) => setModal({ kind: "edit", event: e })}
          onComplete={(e) => setModal({ kind: "complete", event: e })}
          onSnooze={(e) => setModal({ kind: "snooze", event: e })}
        />
      )}

      {grouped.upcoming.length > 0 && (
        <Section
          title="Upcoming"
          subtitle="Beyond 30 days."
          tone="upcoming"
          events={grouped.upcoming}
          onEdit={(e) => setModal({ kind: "edit", event: e })}
          onComplete={(e) => setModal({ kind: "complete", event: e })}
          onSnooze={(e) => setModal({ kind: "snooze", event: e })}
        />
      )}

      {modal.kind === "new" && (
        <EventForm
          mode="new"
          onClose={() => setModal({ kind: "closed" })}
          onSaved={() => {
            setModal({ kind: "closed" });
            refresh();
          }}
        />
      )}

      {modal.kind === "edit" && (
        <EventForm
          mode="edit"
          event={modal.event}
          onClose={() => setModal({ kind: "closed" })}
          onSaved={() => {
            setModal({ kind: "closed" });
            refresh();
          }}
        />
      )}

      {modal.kind === "complete" && (
        <CompleteForm
          event={modal.event}
          onClose={() => setModal({ kind: "closed" })}
          onSaved={() => {
            setModal({ kind: "closed" });
            refresh();
          }}
        />
      )}

      {modal.kind === "snooze" && (
        <SnoozeForm
          event={modal.event}
          onClose={() => setModal({ kind: "closed" })}
          onSaved={() => {
            setModal({ kind: "closed" });
            refresh();
          }}
        />
      )}
    </div>
  );
}

// ── Section ──────────────────────────────────────────────────────────────────

interface SectionProps {
  title: string;
  subtitle: string;
  tone: CorpComplianceUrgency;
  events: CorpUpcomingComplianceRow[];
  onEdit: (e: CorpUpcomingComplianceRow) => void;
  onComplete: (e: CorpUpcomingComplianceRow) => void;
  onSnooze: (e: CorpUpcomingComplianceRow) => void;
}

function Section({ title, subtitle, tone, events, onEdit, onComplete, onSnooze }: SectionProps) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-foreground text-base font-medium tracking-tight">{title}</h2>
          <p className="text-muted-foreground/70 text-xs">{subtitle}</p>
        </div>
        <span className="text-muted-foreground/50 text-[11px] tracking-wide uppercase">
          {events.length} {events.length === 1 ? "event" : "events"}
        </span>
      </div>

      <ul className="space-y-2">
        {events.map((evt) => (
          <EventCard
            key={evt.id}
            evt={evt}
            tone={tone}
            onEdit={() => onEdit(evt)}
            onComplete={() => onComplete(evt)}
            onSnooze={() => onSnooze(evt)}
          />
        ))}
      </ul>
    </section>
  );
}

// ── Event card ───────────────────────────────────────────────────────────────

interface EventCardProps {
  evt: CorpUpcomingComplianceRow;
  tone: CorpComplianceUrgency;
  onEdit: () => void;
  onComplete: () => void;
  onSnooze: () => void;
}

function EventCard({ evt, tone, onEdit, onComplete, onSnooze }: EventCardProps) {
  const kindLabel = KIND_LABEL_LOOKUP[evt.kind] ?? evt.kind;

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
              className={cn("inline-block h-1.5 w-1.5 rounded-full", SEVERITY_DOT[evt.severity])}
              aria-hidden
            />
            <h3 className="text-foreground text-[14px] font-medium leading-snug">{evt.title}</h3>
          </div>
          <p className="text-muted-foreground/70 text-[11px] tracking-wide">
            {kindLabel}
            {evt.recurring_pattern && (
              <>
                {" · "}
                <span className="text-muted-foreground/50">recurs {evt.recurring_pattern}</span>
              </>
            )}
          </p>
          {evt.notes && (
            <p className="text-muted-foreground/85 mt-1.5 text-[12px] leading-relaxed whitespace-pre-wrap">
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
          <time dateTime={evt.due_date} className="text-muted-foreground/90 text-[12px] font-medium">
            {fmtDate(evt.due_date)}
          </time>
          <span className="text-muted-foreground/50 text-[11px]">
            {formatDaysUntil(evt.days_until_due)}
          </span>
        </div>
      </div>

      <div className="border-border/20 mt-3 flex items-center gap-2 border-t pt-2.5">
        <button
          onClick={onComplete}
          className="text-muted-foreground hover:text-foreground rounded-md px-2 py-1 text-[12px] transition-colors"
        >
          Mark complete
        </button>
        <span className="text-muted-foreground/30">·</span>
        <button
          onClick={onSnooze}
          className="text-muted-foreground hover:text-foreground rounded-md px-2 py-1 text-[12px] transition-colors"
        >
          Snooze
        </button>
        <span className="text-muted-foreground/30">·</span>
        <button
          onClick={onEdit}
          className="text-muted-foreground hover:text-foreground rounded-md px-2 py-1 text-[12px] transition-colors"
        >
          Edit
        </button>
      </div>
    </li>
  );
}

// ── New / Edit form ──────────────────────────────────────────────────────────

interface EventFormProps {
  mode: "new" | "edit";
  event?: CorpUpcomingComplianceRow;
  onClose: () => void;
  onSaved: () => void;
}

function EventForm({ mode, event, onClose, onSaved }: EventFormProps) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [kind, setKind] = useState<string>(event?.kind ?? "corp-other");
  const [dueDate, setDueDate] = useState<string>(event?.due_date ?? new Date().toISOString().slice(0, 10));
  const [severity, setSeverity] = useState<CorpComplianceSeverity>(event?.severity ?? "medium");
  const [recurring, setRecurring] = useState<string>(event?.recurring_pattern ?? "");
  const [notes, setNotes] = useState<string>(event?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const url = mode === "new" ? "/api/cockpit/compliance" : `/api/cockpit/compliance/${event!.id}`;
      const method = mode === "new" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          kind,
          due_date: dueDate,
          severity,
          recurring_pattern: recurring === "" ? null : recurring,
          notes: notes.trim() || null,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? `${method} failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setSubmitting(false);
    }
  };

  const remove = async () => {
    if (!event) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/cockpit/compliance/${event.id}`, { method: "DELETE" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? `DELETE failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose} title={mode === "new" ? "New compliance event" : "Edit event"}>
      <div className="space-y-3.5">
        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-background border-border/40 focus:border-foreground/30 w-full rounded-md border px-3 py-2 text-sm outline-none"
            placeholder="e.g. T2 filing — FY2026"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Kind">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="bg-background border-border/40 focus:border-foreground/30 w-full rounded-md border px-3 py-2 text-sm outline-none"
            >
              {KIND_OPTIONS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Severity">
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as CorpComplianceSeverity)}
              className="bg-background border-border/40 focus:border-foreground/30 w-full rounded-md border px-3 py-2 text-sm outline-none"
            >
              {SEVERITY_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Due date">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="bg-background border-border/40 focus:border-foreground/30 w-full rounded-md border px-3 py-2 text-sm outline-none"
            />
          </Field>

          <Field label="Recurrence">
            <select
              value={recurring}
              onChange={(e) => setRecurring(e.target.value)}
              className="bg-background border-border/40 focus:border-foreground/30 w-full rounded-md border px-3 py-2 text-sm outline-none"
            >
              {RECURRING_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Notes (optional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="bg-background border-border/40 focus:border-foreground/30 w-full rounded-md border px-3 py-2 text-sm outline-none"
            placeholder="Context, accountant note, prep checklist…"
          />
        </Field>

        {error && (
          <p className="text-red-400 bg-red-500/10 border-red-500/30 rounded-md border px-3 py-2 text-xs">
            {error}
          </p>
        )}

        <div className="border-border/20 flex items-center justify-between gap-2 border-t pt-3">
          {mode === "edit" && !confirmDelete && (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={submitting}
              className="text-red-400/80 hover:text-red-400 text-xs"
            >
              Delete
            </button>
          )}
          {mode === "edit" && confirmDelete && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Confirm delete?</span>
              <button
                onClick={remove}
                disabled={submitting}
                className="text-red-400 font-medium"
              >
                Yes
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={submitting}
                className="text-muted-foreground"
              >
                No
              </button>
            </div>
          )}
          {mode === "new" && <span />}

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={submitting}
              className="text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={submitting || !title.trim()}
              className="border-foreground/20 bg-foreground/10 hover:bg-foreground/15 text-foreground rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {submitting ? "Saving…" : mode === "new" ? "Create" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Complete form ────────────────────────────────────────────────────────────

interface CompleteFormProps {
  event: CorpUpcomingComplianceRow;
  onClose: () => void;
  onSaved: () => void;
}

function CompleteForm({ event, onClose, onSaved }: CompleteFormProps) {
  const [note, setNote] = useState("");
  const [rollForward, setRollForward] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/cockpit/compliance/${event.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: note.trim() || undefined,
          roll_forward: event.recurring_pattern ? rollForward : undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? `Complete failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Mark complete">
      <div className="space-y-3.5">
        <p className="text-muted-foreground text-sm">
          <span className="text-foreground font-medium">{event.title}</span>
          <br />
          Due {fmtDate(event.due_date)}
        </p>

        <Field label="Completion note (optional)">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="bg-background border-border/40 focus:border-foreground/30 w-full rounded-md border px-3 py-2 text-sm outline-none"
            placeholder="e.g. filed via Cox & Palmer 2026-04-15"
          />
        </Field>

        {event.recurring_pattern && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={rollForward}
              onChange={(e) => setRollForward(e.target.checked)}
            />
            <span className="text-muted-foreground">
              Roll forward to next occurrence ({event.recurring_pattern})
            </span>
          </label>
        )}

        {error && (
          <p className="text-red-400 bg-red-500/10 border-red-500/30 rounded-md border px-3 py-2 text-xs">
            {error}
          </p>
        )}

        <div className="border-border/20 flex items-center justify-end gap-2 border-t pt-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="border-emerald-500/30 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Mark complete"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Snooze form ──────────────────────────────────────────────────────────────

interface SnoozeFormProps {
  event: CorpUpcomingComplianceRow;
  onClose: () => void;
  onSaved: () => void;
}

function SnoozeForm({ event, onClose, onSaved }: SnoozeFormProps) {
  const [days, setDays] = useState(7);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/cockpit/compliance/${event.id}/snooze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days, reason: reason.trim() || undefined }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? `Snooze failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setSubmitting(false);
    }
  };

  const QUICK = [7, 14, 30, 60];

  return (
    <Modal onClose={onClose} title="Snooze event">
      <div className="space-y-3.5">
        <p className="text-muted-foreground text-sm">
          <span className="text-foreground font-medium">{event.title}</span>
          <br />
          Currently due {fmtDate(event.due_date)}
        </p>

        <Field label="Push forward by (days)">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
              className="bg-background border-border/40 focus:border-foreground/30 w-24 rounded-md border px-3 py-2 text-sm outline-none"
            />
            <div className="flex items-center gap-1">
              {QUICK.map((q) => (
                <button
                  key={q}
                  onClick={() => setDays(q)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-[11px] transition-colors",
                    days === q
                      ? "border-foreground/30 bg-foreground/10 text-foreground"
                      : "border-border/30 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {q}d
                </button>
              ))}
            </div>
          </div>
        </Field>

        <Field label="Reason (optional, appended to notes)">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="bg-background border-border/40 focus:border-foreground/30 w-full rounded-md border px-3 py-2 text-sm outline-none"
            placeholder="e.g. accountant requested 30-day extension"
          />
        </Field>

        {error && (
          <p className="text-red-400 bg-red-500/10 border-red-500/30 rounded-md border px-3 py-2 text-xs">
            {error}
          </p>
        )}

        <div className="border-border/20 flex items-center justify-end gap-2 border-t pt-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="border-amber-500/30 bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {submitting ? "Saving…" : `Snooze ${days} days`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Modal shell + helpers ────────────────────────────────────────────────────

function Modal({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-[10vh]"
      onClick={onClose}
    >
      <div
        className="border-border/40 bg-background w-full max-w-lg rounded-xl border p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-foreground text-base font-medium">{title}</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-muted-foreground/80 mb-1 block text-[11px] tracking-wide uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}
