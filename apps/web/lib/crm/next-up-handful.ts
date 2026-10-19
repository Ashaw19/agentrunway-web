/**
 * The day's handful: Flight Control's picks, pinned per client
 * (next_up_handful, 00188), shared by web Scan, the phone's Next up, Flight
 * Crew and MCP so all four show the same people.
 *
 * getTopOpportunities is stateless: a birthday entering its 14-day window
 * would push an untouched client off the list tomorrow. A pin keeps them
 * (correction 1 in the design): pinned clients who are still candidates rank
 * first. A pin closes, first match wins, at the time of the event itself, so
 * "done today" counts when the agent acted:
 *
 *   1 archived   the client has archived_at                       archived_at
 *   2 stopped    a stop row made after the pin                    its dismissed_at
 *   3 skipped    a skip row for the client made after the pin     its dismissed_at
 *   4 contacted  last_contact_at or an outreach sent_at after it  the later of the two
 *   5 expired    not picked any more and not on Later             now
 *
 * A pin on Later is never closed and keeps its slot (correction 2): Flight
 * Control picks one fewer for each. A Stop made after the pin, or the
 * Hangar, ends the snooze, so that pin closes as stopped or archived. Expired
 * doesn't count as done. A client handled today (closed any way but expired)
 * isn't picked again until tomorrow: a birthday card the agent already acted
 * on would otherwise come straight back as a new pin.
 *
 * Two surfaces can sync at once (phone and web). The partial unique index
 * keeps one open pin per client (a second insert is a 23505, ignored), and a
 * close only lands on a pin that is still open, so it can't move the first
 * close's time.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TopOpportunity } from "@agent-runway/core/types/database";
import { atlanticDayStart, atlanticISODate } from "@agent-runway/core/lib/local-date";
import {
  activeLaterUntil,
  dismissalRowsFrom,
  type DismissalRow,
} from "@agent-runway/core/lib/suggestion-dismissals";
import { getTopOpportunities } from "@/app/api/ai/detect-opportunities/route";
import { fetchAllIn } from "@/lib/supabase/fetch-all";

export type HandledHow = "contacted" | "skipped" | "stopped" | "archived" | "expired";

const HANDLED_HOWS: readonly string[] = ["contacted", "skipped", "stopped", "archived", "expired"];

/** A next_up_handful row. */
export interface HandfulRow {
  id:               string;
  client_id:        string;
  opportunity_type: string;
  trigger_date:     string;
  rank:             number;
  added_at:         string;
  handled_at:       string | null;
  handled_how:      HandledHow | null;
}

/** One of Flight Control's picks: the client and the reason it named. */
export interface HandfulPick {
  client_id:        string;
  opportunity_type: string;
  trigger_date:     string;
}

/** What the close rules read, per pinned client. */
export interface HandfulFacts {
  lastContactAt: ReadonlyMap<string, string | null>;
  /** The latest outreach sent_at since the oldest open pin. */
  lastSentAt:    ReadonlyMap<string, string>;
  archivedAt:    ReadonlyMap<string, string | null>;
  dismissals:    readonly DismissalRow[];
}

export interface HandfulClose {
  id:          string;
  client_id:   string;
  handled_at:  string;
  handled_how: HandledHow;
}

export interface HandfulInsert extends HandfulPick {
  rank: number;
}

export interface HandfulPlan {
  close:  HandfulClose[];
  insert: HandfulInsert[];
}

export interface NextUpHandfulResult {
  /** The Atlantic day the handful is for (YYYY-MM-DD). */
  day:           string;
  /** Pins closed today any way but expired. */
  doneToday:     number;
  /** Flight Control's cards: the handful, in Scan's order. */
  opportunities: TopOpportunity[];
  /** Pinned clients on Later: hidden until `until`, holding their slot. */
  snoozed:       { client_id: string; client_name: string; until: string }[];
}

/** rank is a smallint CHECK (rank BETWEEN 0 AND 9). */
const MAX_RANK = 9;

const PIN_COLUMNS = "id, client_id, opportunity_type, trigger_date, rank, added_at, handled_at, handled_how";

const ms = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : NaN);
const text = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** next_up_handful rows as a query returns them. handled_how is text: an unknown value reads as null. */
function handfulRowsFrom(raw: readonly unknown[] | null | undefined): HandfulRow[] {
  const out: HandfulRow[] = [];
  for (const r of raw ?? []) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.client_id !== "string") continue;
    out.push({
      id:               o.id,
      client_id:        o.client_id,
      opportunity_type: text(o.opportunity_type) ?? "",
      trigger_date:     text(o.trigger_date) ?? "",
      rank:             typeof o.rank === "number" ? o.rank : Number(o.rank ?? 0) || 0,
      added_at:         text(o.added_at) ?? "",
      handled_at:       text(o.handled_at),
      handled_how:      typeof o.handled_how === "string" && HANDLED_HOWS.includes(o.handled_how) ? (o.handled_how as HandledHow) : null,
    });
  }
  return out;
}

/** Rank order, then the oldest pin, then id: the order Flight Control keeps them in. */
function byRank(a: HandfulRow, b: HandfulRow): number {
  return a.rank - b.rank || (ms(a.added_at) || 0) - (ms(b.added_at) || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** The client's first dismissal of a kind made after `afterMs` (by dismissed_at). */
function firstAfter(
  rows:     readonly DismissalRow[],
  clientId: string,
  isKind:   (kind: DismissalRow["kind"]) => boolean,
  afterMs:  number,
): { at: number; iso: string } | null {
  let first: { at: number; iso: string } | null = null;
  for (const r of rows) {
    if (r.client_id !== clientId || !isKind(r.kind) || !r.dismissed_at) continue;
    const at = ms(r.dismissed_at);
    if (!(at > afterMs)) continue;
    if (!first || at < first.at) first = { at, iso: r.dismissed_at };
  }
  return first;
}

/**
 * Rules 1 to 4 of the close table: how and when the pin was handled, or
 * null when it wasn't. Instants are compared as instants, never as text.
 */
export function pinHandledBy(
  pin:   HandfulRow,
  facts: HandfulFacts,
): { handled_at: string; handled_how: Exclude<HandledHow, "expired"> } | null {
  const archived = facts.archivedAt.get(pin.client_id);
  if (archived) return { handled_at: archived, handled_how: "archived" };

  const added = ms(pin.added_at);
  const stop = firstAfter(facts.dismissals, pin.client_id, (k) => k === "stop", added);
  if (stop) return { handled_at: stop.iso, handled_how: "stopped" };
  // A row with no kind (or one we don't know) is a skip.
  const skip = firstAfter(facts.dismissals, pin.client_id, (k) => (k ?? "skip") === "skip", added);
  if (skip) return { handled_at: skip.iso, handled_how: "skipped" };

  let contact: { at: number; iso: string } | null = null;
  for (const iso of [facts.lastContactAt.get(pin.client_id), facts.lastSentAt.get(pin.client_id)]) {
    const at = ms(iso);
    if (!iso || !(at > added)) continue;
    if (!contact || at > contact.at) contact = { at, iso };
  }
  if (contact) return { handled_at: contact.iso, handled_how: "contacted" };
  return null;
}

/**
 * The open pins' clients on a Later that hasn't ended. A Stop made after
 * the pin, or the Hangar, ends the snooze: those pins close instead. A Stop
 * from before the pin (a consent-lapsing pick, which a Stop lets through)
 * doesn't.
 */
export function snoozedClientIdsOf(
  open:  readonly HandfulRow[],
  facts: HandfulFacts,
  now:   Date,
): Set<string> {
  const out = new Set<string>();
  for (const pin of open) {
    if (!activeLaterUntil(pin.client_id, facts.dismissals, now)) continue;
    const by = pinHandledBy(pin, facts);
    if (by && (by.handled_how === "archived" || by.handled_how === "stopped")) continue;
    out.add(pin.client_id);
  }
  return out;
}

/**
 * Which pins close and which picks become pins. Pure.
 *   A snoozed pin is never closed and keeps its rank.
 *   Otherwise the close table, first match wins; a pin whose client isn't
 *   picked any more expires now.
 *   A picked client with no open pin (kept or closing) gets one, at the
 *   lowest rank no kept pin holds, in Flight Control's order.
 */
export function planHandfulSync(
  open:             readonly HandfulRow[],
  picked:           readonly HandfulPick[],
  snoozedClientIds: ReadonlySet<string>,
  facts:            HandfulFacts,
  now:              Date,
): HandfulPlan {
  const pickedIds = new Set(picked.map((p) => p.client_id));
  const close: HandfulClose[] = [];
  const heldRanks = new Set<number>();
  const pinnedIds = new Set<string>();

  for (const pin of open) {
    pinnedIds.add(pin.client_id);
    if (snoozedClientIds.has(pin.client_id)) {
      heldRanks.add(pin.rank);
      continue;
    }
    const by = pinHandledBy(pin, facts)
      ?? (pickedIds.has(pin.client_id) ? null : { handled_at: now.toISOString(), handled_how: "expired" as const });
    if (by) close.push({ id: pin.id, client_id: pin.client_id, ...by });
    else heldRanks.add(pin.rank);
  }

  const insert: HandfulInsert[] = [];
  let rank = 0;
  for (const p of picked) {
    if (pinnedIds.has(p.client_id)) continue;
    while (heldRanks.has(rank)) rank++;
    if (rank > MAX_RANK) break;
    pinnedIds.add(p.client_id);
    heldRanks.add(rank);
    insert.push({ client_id: p.client_id, opportunity_type: p.opportunity_type, trigger_date: p.trigger_date.slice(0, 10), rank });
  }
  return { close, insert };
}

/** Pins handled since `dayStart`, any way but expired. */
export function countDoneToday(
  rows:     readonly Pick<HandfulRow, "handled_at" | "handled_how">[],
  dayStart: Date,
): number {
  const start = dayStart.getTime();
  return rows.filter((r) => r.handled_how && r.handled_how !== "expired" && ms(r.handled_at) >= start).length;
}

/**
 * Today's handful for the user: reads the pins, asks Flight Control for its
 * picks with them, and (unless `persist` is false) closes handled pins, pins
 * new picks and skips today's unsent Next up text for each handled client
 * (correction 12). When a read fails the handful is still served, but
 * nothing is written: a missing dismissal could expire a client on Later.
 */
export async function loadNextUpHandful(
  userId:   string,
  supabase: SupabaseClient,
  opts:     { persist?: boolean; now?: Date } = {},
): Promise<NextUpHandfulResult> {
  const persist = opts.persist ?? true;
  const now = opts.now ?? new Date();
  const day = atlanticISODate(now);
  const dayStart = atlanticDayStart(day);
  const dayStartISO = dayStart.toISOString();
  const failed: string[] = [];

  const [openRes, todayRes] = await Promise.all([
    supabase.from("next_up_handful").select(PIN_COLUMNS).eq("user_id", userId).is("handled_at", null),
    supabase.from("next_up_handful").select(PIN_COLUMNS).eq("user_id", userId).gte("handled_at", dayStartISO),
  ]);
  if (openRes.error) failed.push(`open pins: ${openRes.error.message}`);
  if (todayRes.error) failed.push(`pins handled today: ${todayRes.error.message}`);
  const open = handfulRowsFrom(openRes.data).sort(byRank);
  const handledToday = handfulRowsFrom(todayRes.data);

  const facts = {
    lastContactAt: new Map<string, string | null>(),
    lastSentAt:    new Map<string, string>(),
    archivedAt:    new Map<string, string | null>(),
    dismissals:    [] as DismissalRow[],
  };
  const names = new Map<string, string>();
  const clientIds = [...new Set(open.map((p) => p.client_id))];
  if (clientIds.length > 0) {
    const oldest = Math.min(...open.map((p) => ms(p.added_at)).filter(Number.isFinite));
    const sentSince = new Date(Number.isFinite(oldest) ? oldest : dayStart.getTime()).toISOString();
    const [clientsRes, dismissalsRes, sentRes] = await Promise.all([
      // Archived clients too: archiving closes their pin.
      fetchAllIn<string, { id: string; name: string | null; last_contact_at: string | null; archived_at: string | null }>(
        clientIds,
        (chunk, from, to) => supabase
          .from("clients")
          .select("id, name, last_contact_at, archived_at")
          .eq("user_id", userId)
          .in("id", chunk)
          .order("id")
          .range(from, to),
      ),
      fetchAllIn<string, unknown>(
        clientIds,
        (chunk, from, to) => supabase
          .from("flight_control_dismissals")
          .select("id, client_id, opportunity_type, trigger_date, kind, until, dismissed_at")
          .eq("user_id", userId)
          .in("client_id", chunk)
          .order("id")
          .range(from, to),
      ),
      fetchAllIn<string, { client_id: string; sent_at: string | null }>(
        clientIds,
        (chunk, from, to) => supabase
          .from("outreach_queue")
          .select("id, client_id, sent_at")
          .eq("user_id", userId)
          .eq("status", "sent")
          .gte("sent_at", sentSince)
          .in("client_id", chunk)
          .order("id")
          .range(from, to),
      ),
    ]);
    if (clientsRes.error) failed.push(`clients: ${clientsRes.error.message}`);
    if (dismissalsRes.error) failed.push(`dismissals: ${dismissalsRes.error.message}`);
    if (sentRes.error) failed.push(`sent outreach: ${sentRes.error.message}`);

    for (const c of clientsRes.data) {
      names.set(c.id, c.name ?? "");
      facts.lastContactAt.set(c.id, text(c.last_contact_at));
      facts.archivedAt.set(c.id, text(c.archived_at));
    }
    // kind is a text column: an unknown value reads as a skip, never a hold.
    facts.dismissals = dismissalRowsFrom(dismissalsRes.data);
    for (const s of sentRes.data) {
      if (!s.sent_at || !Number.isFinite(ms(s.sent_at))) continue;
      const prev = facts.lastSentAt.get(s.client_id);
      if (!prev || ms(s.sent_at) > ms(prev)) facts.lastSentAt.set(s.client_id, s.sent_at);
    }
  }

  const snoozed = snoozedClientIdsOf(open, facts, now);
  // Pins the close rules already settle (rules 1 to 4): no longer pinned, and
  // with today's other handled clients, not picked again today.
  const handledNow = new Set(
    open.filter((p) => !snoozed.has(p.client_id) && pinHandledBy(p, facts)).map((p) => p.client_id),
  );
  const doneClients = handledToday.filter((r) => r.handled_how && r.handled_how !== "expired").map((r) => r.client_id);

  const opportunities = await getTopOpportunities(userId, supabase, {
    pinnedClientIds:  open.filter((p) => !handledNow.has(p.client_id)).map((p) => p.client_id),
    reservedSlots:    snoozed.size,
    now,
    excludeClientIds: [...new Set([...handledNow, ...doneClients])],
  });

  const plan = planHandfulSync(open, opportunities, snoozed, facts, now);
  if (failed.length > 0) {
    console.error(`[next-up] handful read failed, nothing written: ${failed.join("; ")}`);
  } else if (persist) {
    await writePlan(supabase, userId, day, plan);
  }

  // Today's handled pins and this sync's closes, once each.
  const handled = new Map<string, Pick<HandfulRow, "handled_at" | "handled_how">>();
  for (const r of handledToday) handled.set(r.id, r);
  for (const c of plan.close) if (!handled.has(c.id)) handled.set(c.id, c);

  return {
    day,
    doneToday: countDoneToday([...handled.values()], dayStart),
    opportunities,
    snoozed: open
      .filter((p) => snoozed.has(p.client_id) && names.has(p.client_id))
      .map((p) => ({
        client_id:   p.client_id,
        client_name: names.get(p.client_id) ?? "",
        until:       activeLaterUntil(p.client_id, facts.dismissals, now) ?? "",
      })),
  };
}

async function writePlan(supabase: SupabaseClient, userId: string, day: string, plan: HandfulPlan): Promise<void> {
  // Only while still open: a second sync can't move the first close's time.
  await Promise.all(plan.close.map(async (c) => {
    const { error } = await supabase
      .from("next_up_handful")
      .update({ handled_at: c.handled_at, handled_how: c.handled_how })
      .eq("id", c.id)
      .eq("user_id", userId)
      .is("handled_at", null);
    if (error) console.error("[next-up] pin not closed:", error.message);
  }));

  // One insert per pin: a 23505 means another surface pinned the client
  // first (one open pin per client), which is the outcome wanted.
  await Promise.all(plan.insert.map(async (row) => {
    const { error } = await supabase.from("next_up_handful").insert({ user_id: userId, ...row });
    if (error && error.code !== "23505") console.error("[next-up] pin not saved:", error.message);
  }));

  // A handled client's Next up text left unsent today would show up as a
  // message ready to send (correction 12). Expired pins weren't handled.
  const handledClients = [...new Set(plan.close.filter((c) => c.handled_how !== "expired").map((c) => c.client_id))];
  if (handledClients.length > 0) {
    const { error } = await supabase
      .from("outreach_queue")
      .update({ status: "skipped" })
      .eq("user_id", userId)
      .in("client_id", handledClients)
      .eq("channel", "sms")
      .eq("status", "ready")
      .eq("trigger_date", day)
      .eq("context->>source", "next_up");
    if (error) console.error("[next-up] handled clients' texts not skipped:", error.message);
  }
}
