/**
 * The phone dashboard's Next up: the card stack, the "Also waiting" rows,
 * the context line, the day's progress and the all-clear card, built from
 * the cached /api/next-up payload and the phone's own rows.
 *
 * Pure: no database and no clock. The caller passes `now` (an instant),
 * `today` (the Atlantic YYYY-MM-DD) and the time band (timeBand of the
 * Atlantic hour). Calendar days stay YYYY-MM-DD strings, compared as text or
 * with daysBetweenISO; none is ever made into a Date.
 *
 * The stack, in order (both read from the constants):
 *   1 always on top (ALWAYS_ON_TOP): new leads newest first, deal deadlines
 *     soonest first, then one card for every overdue task
 *   2 the handful's cards, when the "Today's handful" row was tapped
 *     (forceHandful, R33), whatever the band and even once today's handful
 *     is done
 *   3 the current band's cards (BAND_KINDS); nothing from another band
 * A card leaves it when the phone put it on Later (localSnoozes, until a
 * later instant), when it's a handful card and the day's handful is done
 * (progress.done >= target) and the row wasn't tapped, or when its client
 * already has an earlier card. Then at most STACK_LIMIT cards.
 *
 * Later on a card keyed by the day lasts past midnight: a "tomorrow" chosen
 * at 21:00 is saved on yesterday's key, and still hides today's card until
 * 08:00.
 *
 * One client, one card. A card carries a client when everything on it is
 * that client's: a new lead, a handful pick, a condition deadline, or a task
 * or schedule card whose every item is theirs. The first such card claims
 * the client, and a later card for them is dropped. A lead and a handful
 * pick for the same person are one card: both cover the client's own id, so
 * whichever comes first covers the other's item. Any other dropped card's
 * items wait in their own row (a task in the Checklist row, a deadline in
 * the Deals row, a pick in the handful row), since the first card can't act
 * on them. A card on Later still claims its client: Later on a client keeps
 * all their cards away, and their items wait in the rows.
 *
 * Rows count, per section, the items no card on the stack covers (by id),
 * so an item is never on a card and in a row, and nothing waiting is left
 * off the dashboard. A row at 0 is left out. The Deals row holds passed
 * close dates and the deal deadlines that have no card (cut by STACK_LIMIT,
 * on Later, or their client already has a card).
 *
 * Relative imports only: the MCP build copies packages/core into Deno.
 */

import { isArchivedClient } from "../client-groups";
import { addDaysISO, daysBetweenISO } from "../local-date";
import {
  conditionDeadlineDays,
  dealDeadlineDays,
  isDueToday,
  isNewLead,
  isOverdueTask,
  isPastCloseDate,
  isUncontactedLead,
  type TimeBand,
} from "./rules";
import type { HandfulTextStatus, NextUpPayload } from "./types";

export type NextUpKind = "new_lead" | "deal_deadline" | "overdue_tasks" | "briefing" | "schedule" | "tasks_today"
  | "handful_client" | "messages_ready" | "voice_note" | "undated_receipts" | "trips";
export type SectionKey = "checklist" | "new_leads" | "deals" | "handful" | "messages" | "receipts";
export type NextUpAction = "call" | "text" | "later" | "dismiss" | "open_client" | "open_checklist" | "mark_one_done"
  | "open_briefing" | "open_deals" | "open_messages" | "open_receipts" | "open_mileage" | "record_voice_note";

export interface NextUpCard {
  /**
   * `${kind}:${id or day}`; local snoozes key on it. A card about many items
   * keys on the day, so tomorrow's is new; a Later saved on yesterday's key
   * still hides it until that Later's time.
   */
  key: string;
  kind: NextUpKind;
  /** The one client everything on the card belongs to, else null. */
  clientId: string | null; clientName: string | null; phone: string | null;
  count: number; itemIds: string[];  // ids this card covers, so the list never repeats them
  /**
   * By kind:
   *   overdue_tasks, tasks_today  title and due of the first task (oldest first); days overdue
   *   deal_deadline               address, days to go, label "close" (a pipeline deal's
   *                               expected close) or "conditions" (a deal's condition date)
   *   handful_client              the server's label and why_now; returning when back from Later
   *   schedule, voice_note, trips today's showings and listing appointments
   *   messages_ready              textsOnly: every message waiting is a text
   */
  detail: { title?: string; due?: string; days?: number; address?: string; label?: string; whyNow?: string;
            showings?: number; appointments?: number; returning?: boolean; textsOnly?: boolean };
  /**
   * The server's CASL-checked text status: handful cards from today's picks
   * (a client back from Later has none), new-lead cards from the payload's
   * new_leads. None means no Text.
   */
  text?: HandfulTextStatus; occurrence?: { opportunity_type: string; trigger_date: string };
}

/**
 * One "Also waiting" row. swipeTaskId: the checklist row's task when it holds
 * exactly one (swipe marks it done). A row holding one item names it:
 * firstName of its client, and days: overdue for the checklist (0 = due
 * today); for deals, days from today to the date (negative once passed:
 * -3 is a close date 3 days ago; 0 to 7 is a deadline). The messages row
 * says textsOnly: true when every message waiting is a text (so it opens
 * the Texts tab), false with any email.
 */
export interface AlsoWaitingRow {
  section: SectionKey; count: number; swipeTaskId: string | null; firstName?: string; days?: number; textsOnly?: boolean;
}

export interface NextUpView {
  stack: NextUpCard[]; alsoWaiting: AlsoWaitingRow[];
  /** Today's showings and appointments, else how many cards and rows wait (never a big count), else all clear. */
  context: { kind: "schedule"; showings: number; appointments: number } | { kind: "waiting"; count: number } | { kind: "all_clear" };
  progress: { done: number; target: number } | null;
  /**
   * With an empty stack only: the next showing or appointment after today
   * (dates only, so today's may have been), else the next open task due
   * today or later. Null when the stack has a card or nothing is ahead.
   */
  allClear: { kind: "showing" | "appointment"; date: string; clientName: string | null } | { kind: "task"; date: string; title: string } | null;
}

export interface NextUpInput {
  now: Date; today: string; band: TimeBand;
  clients: readonly { id: string; name: string; status: string; last_contact_at: string | null; created_at: string; archived_at: string | null; phone: string | null }[];
  tasks: readonly { id: string; title: string; due_date: string; completed_at: string | null; client_id: string | null }[];
  pipeline: readonly { id: string; address: string | null; client_name: string | null; expected_close_date: string | null }[]; // active only
  clientRecords: readonly { id: string; client_id: string | null; address: string | null; condition_date: string | null; condition_status: string | null }[];
  undatedReceipts: number;
  outreachReady: readonly { client_id: string; channel: "email" | "sms" }[];
  payload: NextUpPayload | null;
  schedule: readonly { kind: "showing" | "appointment"; client_id: string | null; date: string }[]; // today..+14
  tripsLoggedToday: number; briefingCount: number;
  localSnoozes: Readonly<Record<string, string>>; voiceNoteDoneOn: string | null;
  /** The "Today's handful" row was tapped: its cards join the stack in any band (R33). */
  forceHandful?: boolean;
}

export const STACK_LIMIT = 7;
export const ALWAYS_ON_TOP: readonly NextUpKind[] = ["new_lead", "deal_deadline", "overdue_tasks"];
export const BAND_KINDS: Readonly<Record<TimeBand, readonly NextUpKind[]>> = {
  morning: ["briefing", "schedule", "tasks_today"],
  midday:  ["handful_client", "messages_ready"],
  evening: ["voice_note", "undated_receipts", "trips"],
};
export const SECTION_ORDER: readonly SectionKey[] = ["checklist", "new_leads", "deals", "handful", "messages", "receipts"];

type Client = NextUpInput["clients"][number];
type Task = NextUpInput["tasks"][number];

/** A handful client the phone can show: today's pick or one back from Later. */
interface HandfulEntry {
  clientId:   string;
  clientName: string;
  phone:      string | null;
  item?:      NextUpPayload["handful"][number];
}

const day = (value: string) => value.slice(0, 10);

function firstName(name: string | null | undefined): string | undefined {
  return name?.trim().split(/\s+/)[0] || undefined;
}

function hasPhone(phone: string | null): boolean {
  return !!phone?.trim();
}

/** Oldest due first; a stable sort keeps the input order within a day. */
function byDue(tasks: readonly Task[]): Task[] {
  return [...tasks].sort((a, b) => (day(a.due_date) < day(b.due_date) ? -1 : day(a.due_date) > day(b.due_date) ? 1 : 0));
}

/** The one client every item belongs to, else null (none, mixed, or one with no client). */
function soleClient(clientIds: readonly (string | null)[]): string | null {
  const first = clientIds[0];
  return first && clientIds.every((id) => id === first) ? first : null;
}

/**
 * Ready messages for the "Messages ready" card and row. A text waiting for a
 * client in the handful (today's picks and those on Later) or a new lead the
 * server checked is that card's Text, so it isn't counted again here. Emails
 * always count.
 */
export function messagesReadyCount(
  ready:             NextUpInput["outreachReady"],
  cardTextClientIds: ReadonlySet<string>,
): number {
  return ready.filter((r) => !(r.channel === "sms" && cardTextClientIds.has(r.client_id))).length;
}

/**
 * A card's buttons. Text only where a text can go: a handful or new-lead card
 * whose text status is ready or draftable (checked under CASL on the server,
 * R31), and with a number. A lead the server didn't check (a payload from
 * before new_leads, or none) is call only. No number: Open client instead of
 * Call. Later on a card about tasks is a phone-only snooze, as on the other
 * non-client cards (correction 15).
 */
export function cardActions(card: NextUpCard): NextUpAction[] {
  const phone = hasPhone(card.phone);
  const textable = card.text?.status === "ready" || card.text?.status === "draftable";
  switch (card.kind) {
    case "new_lead":
      if (textable && phone) return ["call", "text", "later"];
      return phone ? ["call", "later"] : ["open_client", "later"];
    case "handful_client": {
      if (textable && phone) return ["call", "text", "later", "dismiss"];
      return phone ? ["call", "later", "dismiss"] : ["open_client", "later", "dismiss"];
    }
    case "overdue_tasks":
    case "tasks_today":
      return ["open_checklist", "mark_one_done", "later"];
    case "deal_deadline":    return ["open_deals", "later"];
    case "briefing":         return ["open_briefing", "later"];
    case "schedule":         return ["open_client", "later"];
    case "messages_ready":   return ["open_messages", "later"];
    case "voice_note":       return ["record_voice_note", "later"];
    case "undated_receipts": return ["open_receipts", "later"];
    case "trips":            return ["open_mileage", "later"];
  }
}

export function buildNextUp(input: NextUpInput): NextUpView {
  const { now, today, band, payload } = input;
  const nowMs = now.getTime();
  const clientsById = new Map<string, Client>(input.clients.map((c) => [c.id, c]));
  const archived = (id: string) => {
    const c = clientsById.get(id);
    return !!c && isArchivedClient(c);
  };
  const nameOf = (id: string | null) => (id ? clientsById.get(id)?.name ?? null : null);
  const phoneOf = (id: string | null) => (id ? clientsById.get(id)?.phone ?? null : null);

  // ── Each section's items ────────────────────────────────────────────────
  const overdue = byDue(input.tasks.filter((t) => isOverdueTask(t, today)));
  const dueToday = byDue(input.tasks.filter((t) => isDueToday(t, today)));
  const uncontacted = input.clients.filter((c) => isUncontactedLead(c));
  const pastClose = input.pipeline.filter((d) => isPastCloseDate(d, today));

  // The cached handful is sticky: yesterday's picks stay until the refresh.
  // A client archived since is never suggested; one on Later is back once
  // its time has come. A client on Later is only ever their snoozed entry,
  // even if a stale payload also lists them as a pick: an active hold never
  // shows, and no one is counted twice.
  const onLater = new Set((payload?.snoozed ?? []).map((s) => s.client_id));
  const returning: HandfulEntry[] = (payload?.snoozed ?? [])
    .filter((s) => !archived(s.client_id) && Date.parse(s.until) <= nowMs)
    .map((s) => ({ clientId: s.client_id, clientName: s.client_name, phone: s.phone }));
  const picks: HandfulEntry[] = (payload?.handful ?? [])
    .filter((h) => !archived(h.client_id) && !onLater.has(h.client_id))
    .map((h) => ({ clientId: h.client_id, clientName: h.client_name, phone: h.phone, item: h }));
  const handful = [...returning, ...picks];
  // A new lead's text status, as the server checked it under CASL. A payload
  // from before new_leads has none: every lead is call only.
  const leadTexts = new Map((payload?.new_leads ?? []).map((l) => [l.client_id, l.text]));
  // A text waiting for a handful client or a new lead is that card's Text.
  const cardTextClientIds = new Set(
    [...(payload?.handful ?? []), ...(payload?.snoozed ?? []), ...(payload?.new_leads ?? [])].map((h) => h.client_id),
  );
  const messages = messagesReadyCount(input.outreachReady, cardTextClientIds);
  // The messages waiting are all texts (the Texts tab holds them), or not.
  const textsOnly = !input.outreachReady.some((r) => r.channel !== "sms");

  const todaySchedule = input.schedule.filter((s) => day(s.date) === today);
  const showings = todaySchedule.filter((s) => s.kind === "showing").length;
  const appointments = todaySchedule.filter((s) => s.kind === "appointment").length;

  const progress = payload
    ? { done: payload.day === today ? Math.min(payload.done_today, payload.target) : 0, target: payload.target }
    : null;
  const handfulDone = !!progress && progress.done >= progress.target;

  // ── Cards ───────────────────────────────────────────────────────────────
  const make = (kind: NextUpKind, id: string, over: Partial<NextUpCard> = {}): NextUpCard => ({
    key: `${kind}:${id}`, kind, clientId: null, clientName: null, phone: null, count: 1, itemIds: [], detail: {},
    ...over,
  });
  const forClient = (clientId: string | null) =>
    ({ clientId, clientName: nameOf(clientId), phone: phoneOf(clientId) });
  const taskCard = (kind: "overdue_tasks" | "tasks_today", tasks: Task[]): NextUpCard[] => {
    if (tasks.length === 0) return [];
    const first = tasks[0];
    return [make(kind, today, {
      ...forClient(soleClient(tasks.map((t) => t.client_id))),
      count: tasks.length,
      itemIds: tasks.map((t) => t.id),
      detail: { title: first.title, due: day(first.due_date), days: daysBetweenISO(day(first.due_date), today) },
    })];
  };
  const scheduleDetail = { showings, appointments };
  const hadSchedule = showings + appointments > 0;

  const newLeadCards = uncontacted
    .filter((c) => isNewLead(c, now))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((c) => {
      const text = leadTexts.get(c.id);
      return make("new_lead", c.id, { clientId: c.id, clientName: c.name, phone: c.phone, itemIds: [c.id], ...(text && { text }) });
    });

  // Every deadline, with its date and client, for its card and the Deals row.
  const deadlines: { id: string; days: number; date: string; card: NextUpCard }[] = [];
  for (const d of input.pipeline) {
    const days = dealDeadlineDays(d, today);
    if (days === null) continue;
    deadlines.push({ id: d.id, days, date: day(d.expected_close_date!), card: make("deal_deadline", d.id, {
      clientName: d.client_name, itemIds: [d.id],
      detail: { address: d.address ?? undefined, days, label: "close" },
    }) });
  }
  for (const r of input.clientRecords) {
    const days = conditionDeadlineDays(r, today);
    if (days === null) continue;
    deadlines.push({ id: r.id, days, date: day(r.condition_date!), card: make("deal_deadline", r.id, {
      ...forClient(r.client_id), itemIds: [r.id],
      detail: { address: r.address ?? undefined, days, label: "conditions" },
    }) });
  }
  const deadlineCards = deadlines.sort((a, b) => a.days - b.days).map((d) => d.card);

  const handfulCards = handful.map((h) => make("handful_client", h.clientId, {
    clientId: h.clientId, clientName: h.clientName, phone: h.phone, itemIds: [h.clientId],
    ...(h.item
      ? {
          detail: { label: h.item.label, whyNow: h.item.why_now },
          text: h.item.text,
          occurrence: { opportunity_type: h.item.opportunity_type, trigger_date: h.item.trigger_date },
        }
      : { detail: { returning: true } }),
  }));

  // Each kind's cards, made only when its kind is in today's order.
  const cardsOf: Record<NextUpKind, () => NextUpCard[]> = {
    new_lead:       () => newLeadCards,
    deal_deadline:  () => deadlineCards,
    overdue_tasks:  () => taskCard("overdue_tasks", overdue),
    briefing:       () => (input.briefingCount > 0 ? [make("briefing", today, { count: input.briefingCount })] : []),
    schedule:       () => (hadSchedule
      ? [make("schedule", today, {
          ...forClient(soleClient(todaySchedule.map((s) => s.client_id))),
          count: todaySchedule.length, detail: scheduleDetail,
        })]
      : []),
    tasks_today:    () => taskCard("tasks_today", dueToday),
    handful_client: () => handfulCards,
    messages_ready: () => (messages > 0 ? [make("messages_ready", today, { count: messages, detail: { textsOnly } })] : []),
    voice_note:     () => (hadSchedule && input.voiceNoteDoneOn !== today ? [make("voice_note", today, { detail: scheduleDetail })] : []),
    undated_receipts: () => (input.undatedReceipts > 0 ? [make("undated_receipts", today, { count: input.undatedReceipts })] : []),
    trips:          () => (hadSchedule && input.tripsLoggedToday === 0 ? [make("trips", today, { detail: scheduleDetail })] : []),
  };
  const forced: NextUpKind[] = input.forceHandful ? ["handful_client"] : [];
  const order = [...new Set<NextUpKind>([...ALWAYS_ON_TOP, ...forced, ...BAND_KINDS[band]])];
  const candidates = order.flatMap((kind) => cardsOf[kind]());

  // ── The stack ───────────────────────────────────────────────────────────
  // A Later on a card keyed by the day is saved on that day's key;
  // yesterday's still counts until its time ("tomorrow" at 21:00 lasts
  // until 08:00). An unreadable time hides nothing.
  const yesterday = addDaysISO(today, -1);
  const snoozed = (card: NextUpCard) =>
    (card.key === `${card.kind}:${today}` ? [card.key, `${card.kind}:${yesterday}`] : [card.key]).some((key) => {
      const until = input.localSnoozes[key];
      return !!until && Date.parse(until) > nowMs;
    });
  // A client's first card claims them, shown or away; a later card for them
  // is dropped and its items wait in their row, unless the first card covers
  // them (a lead and a handful pick share the client's id).
  const claimed = new Set<string>();
  const shown: NextUpCard[] = [];
  for (const card of candidates) {
    if (card.clientId) {
      if (claimed.has(card.clientId)) continue;
      claimed.add(card.clientId);
    }
    const away = snoozed(card) || (card.kind === "handful_client" && handfulDone && !input.forceHandful);
    if (!away) shown.push(card);
  }
  const stack = shown.slice(0, STACK_LIMIT);

  // ── Also waiting ────────────────────────────────────────────────────────
  const covered = new Set(stack.flatMap((c) => c.itemIds));
  const onStack = (kind: NextUpKind) => stack.find((c) => c.kind === kind)?.count ?? 0;
  const left = <T>(items: readonly T[], id: (x: T) => string) => items.filter((x) => !covered.has(id(x)));

  const checklist = byDue(left([...overdue, ...dueToday], (t) => t.id));
  const leads = left(uncontacted, (c) => c.id);
  const deals = left([
    ...pastClose.map((d) => ({ id: d.id, name: d.client_name, date: day(d.expected_close_date!) })),
    ...deadlines.map((d) => ({ id: d.id, name: d.card.clientName, date: d.date })),
  ], (d) => d.id);
  const restOfHandful = left(handful, (h) => h.clientId);

  // A row holding one item names it; only the checklist's one task swipes.
  const only = <T>(items: readonly T[]) => (items.length === 1 ? items[0] : undefined);
  const soleTask = only(checklist);
  const soleDeal = only(deals);
  const rows: Record<SectionKey, { count: number; swipeTaskId?: string; firstName?: string; days?: number; textsOnly?: boolean }> = {
    checklist: soleTask
      ? { count: 1, swipeTaskId: soleTask.id, firstName: firstName(nameOf(soleTask.client_id)),
          days: daysBetweenISO(day(soleTask.due_date), today) }
      : { count: checklist.length },
    new_leads: { count: leads.length, firstName: firstName(only(leads)?.name) },
    deals: soleDeal
      ? { count: 1, firstName: firstName(soleDeal.name), days: daysBetweenISO(today, soleDeal.date) }
      : { count: deals.length },
    handful:  { count: restOfHandful.length, firstName: firstName(only(restOfHandful)?.clientName) },
    messages: { count: messages - onStack("messages_ready"), textsOnly },
    receipts: { count: input.undatedReceipts - onStack("undated_receipts") },
  };
  const alsoWaiting: AlsoWaitingRow[] = SECTION_ORDER
    .filter((s) => rows[s].count > 0)
    .map((s) => {
      const { count, swipeTaskId, firstName: name, days, textsOnly: onlyTexts } = rows[s];
      return {
        section: s, count, swipeTaskId: swipeTaskId ?? null,
        ...(name !== undefined && { firstName: name }),
        ...(days !== undefined && { days }),
        ...(onlyTexts !== undefined && { textsOnly: onlyTexts }),
      };
    });

  // ── Context and all clear ───────────────────────────────────────────────
  const waiting = stack.length + alsoWaiting.length;
  const context: NextUpView["context"] = hadSchedule
    ? { kind: "schedule", showings, appointments }
    : waiting > 0 ? { kind: "waiting", count: waiting } : { kind: "all_clear" };

  return { stack, alsoWaiting, context, progress, allClear: stack.length === 0 ? nextUp(input, nameOf) : null };
}

/**
 * What's next once the stack is clear: the next showing or appointment after
 * today, else the next open task due today or later. The earliest wins; on
 * the same day, the first in the input.
 */
function nextUp(input: NextUpInput, nameOf: (id: string | null) => string | null): NextUpView["allClear"] {
  const { today } = input;
  const next = <T>(items: readonly T[], date: (x: T) => string): T | undefined =>
    items.reduce<T | undefined>((best, x) => (best === undefined || date(x) < date(best) ? x : best), undefined);

  const visit = next(input.schedule.filter((s) => day(s.date) > today), (s) => day(s.date));
  if (visit) return { kind: visit.kind, date: day(visit.date), clientName: nameOf(visit.client_id) };
  const task = next(input.tasks.filter((t) => !t.completed_at && !!t.due_date && day(t.due_date) >= today), (t) => day(t.due_date));
  return task ? { kind: "task", date: day(task.due_date), title: task.title } : null;
}
