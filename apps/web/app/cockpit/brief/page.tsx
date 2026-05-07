import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { CorpBriefEntry, CorpBriefPriority } from "@agent-runway/core/types/database";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const fmtDate = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-CA", {
    weekday: "long",
    month:   "long",
    day:     "numeric",
    year:    "numeric",
  });

const isToday = (iso: string) =>
  iso === new Date().toISOString().split("T")[0];

const SOURCE_LABELS: Record<string, string> = {
  "hugo-bookkeeping":   "Hugo · Weekly Bookkeeping",
  "vera-monthly-cash":  "Vera · Monthly Cash",
  "quinn-quarterly-hst": "Quinn · Quarterly HST",
  "tessa-annual-t2":    "Tessa · Annual T2",
  "marcus-sred":        "Marcus · SR&ED Logger",
  "main-session":       "Main Session",
  "manual":             "Manual",
};

const PRIORITY_STYLES: Record<CorpBriefPriority, string> = {
  high:   "border-red-500/30 bg-red-500/[0.05] text-red-300",
  medium: "border-amber-500/30 bg-amber-500/[0.05] text-amber-300",
  low:    "border-white/[0.06] bg-white/[0.02] text-muted-foreground/60",
};

const PRIORITY_DOT: Record<CorpBriefPriority, string> = {
  high:   "bg-red-400",
  medium: "bg-amber-400",
  low:    "bg-muted-foreground/40",
};

export default async function BriefPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/cockpit/brief");

  const { data: rows } = await supabase
    .from("corp_brief_entries")
    .select("id, brief_date, source, title, content_md, des_priority, created_at")
    .eq("user_id", user.id)
    .order("brief_date", { ascending: false })
    .order("created_at",  { ascending: false });

  const entries = (rows ?? []) as CorpBriefEntry[];

  // Group by brief_date
  const grouped = new Map<string, CorpBriefEntry[]>();
  for (const entry of entries) {
    const existing = grouped.get(entry.brief_date) ?? [];
    existing.push(entry);
    grouped.set(entry.brief_date, existing);
  }

  const today = new Date().toISOString().split("T")[0];
  const hasTodayEntry = grouped.has(today);

  return (
    <div className="space-y-8">
      <header className="min-w-0">
        <h1 className="text-foreground font-[var(--font-cockpit-display)] text-4xl font-normal leading-none tracking-tight">
          Daily brief
        </h1>
        <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm leading-relaxed">
          Structured findings from Hugo, Vera, Quinn, Tessa, and Marcus —
          the scheduled routines that monitor AR Inc.&apos;s financial and operational
          state. Entries appear here once routines write to{" "}
          <code className="text-violet-300/80 rounded bg-white/[0.04] px-1 py-0.5 text-xs">
            corp_brief_entries
          </code>
          .
        </p>
      </header>

      {entries.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-8">
          {!hasTodayEntry && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3">
              <span className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400" aria-hidden />
              <p className="text-amber-300/80 text-sm">
                No brief for today yet. Showing most recent entries below.
              </p>
            </div>
          )}

          {Array.from(grouped.entries()).map(([date, dateEntries]) => (
            <section key={date} className="space-y-3">
              {/* Date heading */}
              <div className="flex items-baseline gap-3">
                <h2 className="text-foreground/90 font-[var(--font-cockpit-display)] text-xl font-normal tracking-tight">
                  {fmtDate(date)}
                </h2>
                {isToday(date) && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-2 py-0.5 text-[10px] tracking-wide text-emerald-300/80">
                    <span className="inline-block h-1 w-1 rounded-full bg-emerald-400" aria-hidden />
                    Today
                  </span>
                )}
              </div>

              {/* Entries for this date */}
              <div className="space-y-3">
                {dateEntries.map((entry) => (
                  <BriefCard key={entry.id} entry={entry} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function BriefCard({ entry }: { entry: CorpBriefEntry }) {
  const priority = (entry.des_priority ?? "medium") as CorpBriefPriority;
  const sourceLabel = SOURCE_LABELS[entry.source] ?? entry.source;

  return (
    <article className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
      {/* Card header */}
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/[0.04] px-4 py-3">
        <div className="min-w-0">
          <p className="text-foreground/90 text-sm font-medium leading-snug">
            {entry.title}
          </p>
          <p className="text-muted-foreground/50 mt-0.5 text-[11px]">
            {sourceLabel}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] tracking-wide",
            PRIORITY_STYLES[priority],
          )}
        >
          <span
            className={cn("inline-block h-1 w-1 rounded-full", PRIORITY_DOT[priority])}
            aria-hidden
          />
          {priority.charAt(0).toUpperCase() + priority.slice(1)}
        </span>
      </div>

      {/* Content */}
      {entry.content_md ? (
        <div className="px-4 py-3">
          <pre className="text-foreground/70 max-w-full overflow-x-auto whitespace-pre-wrap break-words font-[inherit] text-xs leading-relaxed">
            {entry.content_md}
          </pre>
        </div>
      ) : (
        <p className="text-muted-foreground/40 px-4 py-3 text-xs italic">
          No content body.
        </p>
      )}
    </article>
  );
}

function EmptyState() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] px-6 py-12 text-center">
        <p className="text-foreground/60 text-sm font-medium">No briefs yet</p>
        <p className="text-muted-foreground/50 mt-2 max-w-md mx-auto text-xs leading-relaxed">
          The scheduled routines — Hugo (weekly bookkeeping), Vera (monthly cash),
          Quinn (quarterly HST), Tessa (annual T2), and Marcus (daily SR&ED) — will
          post entries here once deployed and connected to{" "}
          <code className="rounded bg-white/[0.04] px-1 py-0.5">corp_brief_entries</code>.
        </p>
      </div>

      {/* Routine status reference */}
      <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="text-muted-foreground/60 px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.08em]">
                Routine
              </th>
              <th className="text-muted-foreground/60 px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.08em]">
                Person
              </th>
              <th className="text-muted-foreground/60 px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.08em]">
                Cadence
              </th>
              <th className="text-muted-foreground/60 px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.08em]">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {ROUTINES.map((r) => (
              <tr
                key={r.source}
                className="border-b border-white/[0.04] last:border-0"
              >
                <td className="text-foreground/70 px-4 py-2.5">{r.name}</td>
                <td className="text-foreground/60 px-4 py-2.5">{r.person}</td>
                <td className="text-muted-foreground/60 px-4 py-2.5">{r.cadence}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] tracking-wide",
                      r.deployed
                        ? "border border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300/80"
                        : "border border-white/[0.06] bg-white/[0.02] text-muted-foreground/50",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-1 w-1 rounded-full",
                        r.deployed ? "bg-emerald-400" : "bg-muted-foreground/30",
                      )}
                      aria-hidden
                    />
                    {r.deployed ? "Deployed" : "Pending"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const ROUTINES = [
  { source: "hugo-bookkeeping",   name: "Weekly Bookkeeping Scan", person: "Hugo",   cadence: "Mondays",          deployed: false },
  { source: "vera-monthly-cash",  name: "Monthly Cash + Deadlines", person: "Vera",   cadence: "1st of month",     deployed: false },
  { source: "quinn-quarterly-hst", name: "Quarterly HST Review",    person: "Quinn",  cadence: "Mar/Jun/Sep/Dec",  deployed: false },
  { source: "tessa-annual-t2",    name: "Annual T2 Trigger",        person: "Tessa",  cadence: "Nov 1",            deployed: false },
  { source: "marcus-sred",        name: "Daily SR&ED Logger",       person: "Marcus", cadence: "Daily 10:30am",    deployed: true  },
];
