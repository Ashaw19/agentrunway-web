/**
 * Which unattended routines have gone quiet.
 *
 * Every scheduled job (the Vercel cron routes and the Claude Code routines)
 * writes a heartbeat row when it finishes (routine_heartbeats, 00191). This
 * reads the latest row per routine against the schedule each is expected to
 * keep, and names the ones that are overdue, so a routine that was deleted,
 * is failing before it reports, or is stuck on a usage limit is noticed in a
 * day rather than in three months (Finn and Owen, 2026-07-27 to 2026-11-02).
 *
 * Pure: no I/O. The caller supplies the registry (what should run and how
 * often) and the latest beat per routine.
 */

export interface RoutineSpec {
  /** Stable id, the same string the routine writes in its heartbeat. */
  id: string;
  /** What a person calls it. */
  name: string;
  /** How long may pass between finishes before it is overdue, in hours. */
  expectedEveryHours: number;
  /** A routine that is off on purpose is listed but never overdue. */
  paused?: boolean;
}

export interface HeartbeatRow {
  routine_id: string;
  /** ISO timestamp of the last finish. */
  finished_at: string;
  /** "ok" or "error". */
  outcome: string;
  note?: string | null;
}

export type RoutineState = "ok" | "overdue" | "never" | "paused" | "error";

export interface RoutineStatus {
  id: string;
  name: string;
  state: RoutineState;
  lastFinishedAt: string | null;
  /** Hours since the last finish, or null when it never reported. */
  hoursSince: number | null;
  expectedEveryHours: number;
  note: string | null;
}

export interface HeartbeatReport {
  statuses: RoutineStatus[];
  /** Overdue, never reported, or last outcome an error. */
  attention: RoutineStatus[];
}

const HOUR = 3_600_000;

/**
 * The registry: every unattended routine and its expected cadence, with a
 * margin for jitter and the day-of-week gaps (Finn runs Mon/Thu, so up to
 * 4 days can pass; a weekday routine can skip the weekend).
 */
export const ROUTINE_REGISTRY: readonly RoutineSpec[] = [
  // Vercel cron routes (vercel.json). Each writes a heartbeat on finish.
  { id: "cron:outreach-detector",    name: "Flight Control outreach detector (daily)", expectedEveryHours: 30 },
  { id: "cron:precompute-briefings", name: "Morning briefings (daily)",                 expectedEveryHours: 30 },
  { id: "cron:calendar-sync",        name: "Calendar sync (daily)",                     expectedEveryHours: 30 },
  { id: "cron:db-health",            name: "Database health check (daily)",             expectedEveryHours: 30 },
  { id: "cron:ai-knowledge-audit",   name: "AI knowledge audit log (daily)",            expectedEveryHours: 30 },
  { id: "cron:weekly-digest",        name: "Weekly digest email (Mondays)",             expectedEveryHours: 8 * 24 },
  // Claude Code routines (~/.claude/scheduled-tasks). Each writes a heartbeat
  // through the Supabase MCP at the end of its prompt.
  { id: "routine:finn",   name: "Finn, field intelligence (Mon/Thu)",   expectedEveryHours: 5 * 24 },
  { id: "routine:owen",   name: "Owen, AI knowledge audit (weekdays)",  expectedEveryHours: 4 * 24 },
  { id: "routine:marcus", name: "Marcus, SR&ED daily log",             expectedEveryHours: 30 },
  { id: "routine:hugo",   name: "Hugo, weekly bookkeeping scan (Mon)", expectedEveryHours: 8 * 24 },
  { id: "routine:vera",   name: "Vera, monthly cash and deadlines",    expectedEveryHours: 33 * 24 },
  { id: "routine:iris",   name: "Iris, daily QA stress test",          expectedEveryHours: 30, paused: true },
];

export function heartbeatReport(
  registry: readonly RoutineSpec[],
  beats: readonly HeartbeatRow[],
  now: Date,
): HeartbeatReport {
  // Latest beat per routine.
  const latest = new Map<string, HeartbeatRow>();
  for (const b of beats) {
    const have = latest.get(b.routine_id);
    if (!have || b.finished_at > have.finished_at) latest.set(b.routine_id, b);
  }

  const statuses: RoutineStatus[] = registry.map((spec) => {
    const b = latest.get(spec.id) ?? null;
    const hoursSince = b ? (now.getTime() - new Date(b.finished_at).getTime()) / HOUR : null;
    let state: RoutineState;
    if (spec.paused) state = "paused";
    else if (!b) state = "never";
    else if (b.outcome !== "ok") state = "error";
    else if (hoursSince !== null && hoursSince > spec.expectedEveryHours) state = "overdue";
    else state = "ok";
    return {
      id: spec.id,
      name: spec.name,
      state,
      lastFinishedAt: b?.finished_at ?? null,
      hoursSince: hoursSince === null ? null : Math.round(hoursSince * 10) / 10,
      expectedEveryHours: spec.expectedEveryHours,
      note: b?.note ?? null,
    };
  });

  return { statuses, attention: statuses.filter((s) => s.state === "overdue" || s.state === "never" || s.state === "error") };
}

/** The alert email's lines, one per routine needing attention. Plain words. */
export function heartbeatAlertLines(report: HeartbeatReport): string[] {
  return report.attention.map((s) => {
    const last = s.lastFinishedAt ? `last finished ${s.lastFinishedAt.slice(0, 16).replace("T", " ")} UTC` : "has never reported";
    const since = s.hoursSince === null ? "" : ` (${Math.round(s.hoursSince / 24 * 10) / 10} days ago, expected every ${Math.round(s.expectedEveryHours / 24 * 10) / 10} days)`;
    const why = s.state === "error" ? `last run ended in an error${s.note ? `: ${s.note}` : ""}` : s.state === "never" ? "no heartbeat on record" : "overdue";
    return `${s.name}: ${why}. It ${last}${since}.`;
  });
}
