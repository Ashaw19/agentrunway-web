/**
 * Loading the AI run ledger for one agent (migration 00182): the same
 * queries for every surface, so the web page, the phone, Flight Crew's
 * getAIActivity, the connector's get_ai_activity and the chat diagnostics
 * all count the same rows. RLS limits every read to the caller's own rows;
 * the user_id filter keeps the service role honest too.
 *
 * No imports outside packages/core (the connector uses the generated copy).
 */

import type { AiRun, AiRunWrite } from "../types/database";
import {
  actionFingerprint,
  actionUndoBlocker,
  describeAction,
  describeRowChange,
  featureLabel,
  formatAiCost,
  groupWritesIntoActions,
  netRowChanges,
  summarizeRuns,
  summaryFromTotals,
  tableLabel,
  undoConsequences,
  type AIAction,
  type AiRunSummary,
  type AiRunFeatureTotalsRow,
  type AiRunSummaryRow,
} from "./ai-activity";
import { APP_TIME_ZONE, addDaysISO, atlanticDayStart, atlanticISODate } from "./local-date";

/** The slice of a supabase-js client this uses (see UndoClient in ai-undo.ts). */
export interface LedgerReadClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
  /** When present, the totals come from fn_ai_run_summary (one query). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc?(fn: string, args?: Record<string, unknown>): any;
}

/** The run columns the activity surfaces show. */
export const AI_RUN_LIST_COLUMNS =
  "id, feature, model_id, call_type, outcome, error_class, estimated_cost_usd, latency_ms, input_tokens, output_tokens, cache_read_tokens, created_at";

export type AiRunListRow = Pick<
  AiRun,
  | "id"
  | "feature"
  | "model_id"
  | "call_type"
  | "outcome"
  | "error_class"
  | "estimated_cost_usd"
  | "latency_ms"
  | "input_tokens"
  | "output_tokens"
  | "cache_read_tokens"
  | "created_at"
>;

export interface AIActivitySnapshot {
  /** One per tool call, newest first. */
  actions: AIAction[];
  /** The most recent calls, newest first (at most `recentRuns`). Empty when runs weren't asked for. */
  runs: AiRunListRow[];
  /** Every call in the period, counted in full (paged past the API's 1,000-row cap). */
  summary: AiRunSummary;
  /** A list hit its limit, so older rows are left out of the lists and totals. */
  truncated: boolean;
  /** A read failed; what loaded is still returned. */
  error: string | null;
}

export interface LoadAIActivityOptions {
  /** ISO instant: rows from here on. */
  since: string;
  includeRuns?: boolean;
  /** Most changes to read (default 5,000). */
  writeLimit?: number;
  /** Most calls to count for the totals when paging (default 50,000; not used when fn_ai_run_summary answers). */
  runLimit?: number;
  /** Calls listed one by one (default 100). */
  recentRuns?: number;
}

/** The API returns at most 1,000 rows per request (max_rows), whatever .limit() asks. */
export const LEDGER_PAGE_SIZE = 1000;

type Page = PromiseLike<{ data: unknown[] | null; error: { message?: string } | null }>;

/** Rows page by page up to `max`; `capped` when there were more. */
async function readPaged<T>(
  page: (from: number, to: number) => Page,
  max: number,
): Promise<{ rows: T[]; capped: boolean; error: string | null }> {
  const rows: T[] = [];
  // Reads one row past `max` to tell "exactly max" from "more than max".
  for (let from = 0; from <= max; from += LEDGER_PAGE_SIZE) {
    const to = Math.min(from + LEDGER_PAGE_SIZE, max + 1) - 1;
    const { data, error } = await page(from, to);
    if (error) return { rows, capped: false, error: error.message ?? "read failed" };
    const got = (data ?? []) as T[];
    rows.push(...got);
    if (got.length < to - from + 1) return { rows: rows.slice(0, max), capped: rows.length > max, error: null };
  }
  return { rows: rows.slice(0, max), capped: rows.length > max, error: null };
}

const NO_ROWS = { rows: [], capped: false, error: null };

export async function loadAIActivity(
  client: LedgerReadClient,
  userId: string,
  opts: LoadAIActivityOptions,
): Promise<AIActivitySnapshot> {
  const writeLimit = opts.writeLimit ?? 5_000;
  const runLimit = opts.runLimit ?? 50_000;
  const recentRuns = opts.recentRuns ?? 100;
  const withRuns = opts.includeRuns !== false;

  const [writes, totals, recent] = await Promise.all([
    readPaged<AiRunWrite>(
      (from, to) =>
        client
          .from("ai_run_writes")
          .select("*")
          .eq("user_id", userId)
          .gte("created_at", opts.since)
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to),
      writeLimit,
    ),
    // The totals: counted in Postgres (fn_ai_run_summary, the caller's own
    // rows), or, if that isn't there, three columns of every call paged in.
    withRuns ? runTotals(client, userId, opts.since, runLimit) : Promise.resolve({ summary: summarizeRuns([]), capped: false, error: null }),
    withRuns
      ? client
          .from("ai_runs")
          .select(AI_RUN_LIST_COLUMNS)
          .eq("user_id", userId)
          .gte("created_at", opts.since)
          .order("created_at", { ascending: false })
          .limit(recentRuns)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const error = writes.error ?? totals.error ?? (recent.error ? recent.error.message ?? "read failed" : null);
  return {
    actions: groupWritesIntoActions(writes.rows),
    runs: (recent.data ?? []) as AiRunListRow[],
    summary: totals.summary,
    truncated: writes.capped || totals.capped,
    error,
  };
}

async function runTotals(
  client: LedgerReadClient,
  userId: string,
  since: string,
  runLimit: number,
): Promise<{ summary: AiRunSummary; capped: boolean; error: string | null }> {
  if (typeof client.rpc === "function") {
    try {
      const { data, error } = await client.rpc("fn_ai_run_summary", { p_since: since });
      if (!error && Array.isArray(data)) {
        return { summary: summaryFromTotals(data as AiRunFeatureTotalsRow[]), capped: false, error: null };
      }
    } catch {
      // fall back to paging
    }
  }
  const paged = await readPaged<AiRunSummaryRow>(
    (from, to) =>
      client
        .from("ai_runs")
        .select("feature, outcome, estimated_cost_usd")
        .eq("user_id", userId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to),
    runLimit,
  );
  return { summary: summarizeRuns(paged.rows), capped: paged.capped, error: paged.error };
}

export interface AIFailureCounts {
  /** AI calls that errored (not counting ones the agent stopped). */
  failedRuns: number;
  /** Writes by Flight Crew tools that Postgres refused. */
  failedWrites: number;
  /** A count couldn't be read. */
  unknown: boolean;
}

/**
 * Failed AI calls and failed AI writes in the 24 hours before `now`: the
 * daily failure signal. Pass `userId` for one agent; null counts everyone
 * (the service role, db-health).
 */
export async function countAIFailures(
  client: LedgerReadClient,
  userId: string | null,
  now: Date = new Date(),
): Promise<AIFailureCounts> {
  const since = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const count = (table: string) => {
    let q = client.from(table).select("id", { count: "exact", head: true }).eq("outcome", "error").gte("created_at", since);
    if (userId) q = q.eq("user_id", userId);
    return q;
  };
  const [runs, writes] = await Promise.all([count("ai_runs"), count("ai_run_writes")]);
  return {
    failedRuns: runs.count ?? 0,
    failedWrites: writes.count ?? 0,
    unknown: Boolean(runs.error || writes.error),
  };
}

// ── Periods and the plain-text report ───────────────────────────────────────

export type AIActivityPeriod = "today" | "7d" | "30d";

/** Where a period starts: Atlantic midnight today, 6 or 29 days before. */
export function aiActivitySince(period: AIActivityPeriod, now: Date = new Date()): string {
  const today = atlanticISODate(now);
  const back = period === "today" ? 0 : period === "7d" ? 6 : 29;
  return atlanticDayStart(addDaysISO(today, -back)).toISOString();
}

export function aiActivityPeriodLabel(period: AIActivityPeriod): string {
  return period === "today" ? "today" : period === "7d" ? "the last 7 days" : "the last 30 days";
}

/** "Oct 18, 2:14 p.m." in Atlantic time. */
export function formatAiActivityTime(iso: string): string {
  return new Date(iso).toLocaleString("en-CA", {
    timeZone: APP_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** One action's status in words: undone, undo available, or why not. */
export function actionStatusText(action: AIAction, now: Date = new Date()): string {
  if (action.undone) return "Undone";
  const ok = action.writes.some((w) => w.outcome === "ok");
  if (!ok) {
    const code = action.writes.find((w) => w.error_class)?.error_class;
    return `Didn't save${code ? ` (error ${code})` : ""}`;
  }
  const blocker = actionUndoBlocker(action, now);
  return blocker ? `Can't undo: ${blocker.replace(/\.$/, "")}` : "Undo available";
}

/**
 * What Flight Crew changed and which AI calls ran, as plain text: the
 * Flight Crew tool's and the connector's answer. Each change carries its
 * tool call id, which undoAIChange / undo_ai_change take.
 */
export function aiActivityReport(
  snap: AIActivitySnapshot,
  failures: AIFailureCounts | null,
  opts: { periodLabel: string; now?: Date; maxActions?: number },
): string {
  const now = opts.now ?? new Date();
  const max = opts.maxActions ?? 15;
  const lines: string[] = [`AI activity, ${opts.periodLabel}:`];

  lines.push("", `Changes Flight Crew made: ${snap.actions.length}`);
  for (const a of snap.actions.slice(0, max)) {
    lines.push(`- ${formatAiActivityTime(a.createdAt)}: ${describeAction(a)}. ${actionStatusText(a, now)}. (toolCallId: ${a.toolCallId})`);
  }
  if (snap.actions.length > max) lines.push(`- and ${snap.actions.length - max} more on the AI activity page.`);

  const s = snap.summary;
  lines.push(
    "",
    `AI calls: ${s.calls}${s.calls ? ` (${s.failed} failed, ${s.aborted} stopped)` : ""}, estimated cost ${formatAiCost(s.costUsd)} at list prices.`,
  );
  if (s.byFeature.length) {
    lines.push(`By feature: ${s.byFeature.slice(0, 8).map((f) => `${featureLabel(f.feature)} ${f.calls}`).join(", ")}.`);
  }
  if (failures) {
    lines.push(
      failures.unknown
        ? "Failures in the last 24 hours: couldn't be counted."
        : `Failed in the last 24 hours: ${failures.failedRuns} AI call${failures.failedRuns === 1 ? "" : "s"}, ${failures.failedWrites} change${failures.failedWrites === 1 ? "" : "s"}.`,
    );
  }
  if (snap.truncated) lines.push("Only the most recent rows are listed.");
  if (snap.error) lines.push("Part of the ledger couldn't be read.");
  lines.push("", "Undo: the AI activity page (/ai-activity, also under Settings), or ask Flight Crew to undo one; it asks for approval first.");
  return lines.join("\n");
}

// ── View model for the lists (web page, phone) ──────────────────────────────

/** One AI change as the lists show it: no row images, just words. */
export interface AIActionView {
  toolCallId: string;
  createdAt: string;
  /** "Logged an expense: Staples" */
  label: string;
  source: AIAction["source"];
  /** "Undo available", "Undone", "Can't undo: ...", "Didn't save (error 42703)" */
  status: string;
  canUndo: boolean;
  undone: boolean;
  failed: boolean;
  /** "Changed expense: total amount, vendor", one per record. */
  details: string[];
  /** What Undo will do, one line per record ("Deletes the client "Pat Example" for good"). */
  consequences: string[];
  /** Undo removes a client for good: the confirm step says so plainly. */
  deletesClient: boolean;
  /** actionFingerprint: sent with Undo, so it refuses if the change moved on since this was shown. */
  fingerprint: string;
}

export function actionView(action: AIAction, now: Date = new Date()): AIActionView {
  const details = netRowChanges(action.writes, { includeUndone: true }).map(describeRowChange);
  for (const w of action.writes) {
    if (w.outcome === "error") details.push(`${tableLabel(w.table_name)}: didn't save${w.error_class ? ` (error ${w.error_class})` : ""}`);
  }
  return {
    toolCallId: action.toolCallId,
    createdAt: action.createdAt,
    label: describeAction(action),
    source: action.source,
    status: actionStatusText(action, now),
    canUndo: actionUndoBlocker(action, now) === null,
    undone: action.undone,
    failed: action.failed,
    details,
    consequences: undoConsequences(action),
    deletesClient: netRowChanges(action.writes).some((c) => c.kind === "created" && c.table === "clients"),
    fingerprint: actionFingerprint(action),
  };
}
