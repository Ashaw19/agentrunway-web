/**
 * The dashboard's wiring around the core Next up builder
 * (packages/core/lib/next-up/build.ts): what it is fed from the phone's
 * stores, where each card button and "Also waiting" row goes (the handful
 * row brings the handful into the stack, R33), and when a client back from
 * Later needs a fresh /api/next-up.
 *
 * Plain functions over plain values, so lib/__tests__ can run them.
 */

import type {
  AlsoWaitingRow,
  NextUpAction,
  NextUpCard,
  NextUpInput,
  NextUpView,
  SectionKey,
} from "@agent-runway/core/lib/next-up/build";
import { isOverdueTask, textPurposeFor, type TimeBand } from "@agent-runway/core/lib/next-up/rules";
import type { NextUpPayload } from "@agent-runway/core/lib/next-up/types";
import type { NextUpClock } from "./next-up-clock";
import { NAV } from "./app-nav";

/** The store slices the builder reads (data store and Next up store). */
export interface NextUpSources {
  clients: NextUpInput["clients"];
  tasks: NextUpInput["tasks"];
  /** Active deals only: the data store keeps only those. */
  pipeline: NextUpInput["pipeline"];
  clientRecords: NextUpInput["clientRecords"];
  receipts: readonly { expense_date: string | null }[];
  outreachQueue: readonly { client_id: string; channel: "email" | "sms"; status: string }[];
  schedule: NextUpInput["schedule"];
  tripsLoggedToday: number;
  /** todayBriefing().length */
  briefingCount: number;
  payload: NextUpPayload | null;
  localSnoozes: Readonly<Record<string, string>>;
  voiceNoteDoneOn: string | null;
  /** When the "Today's handful" row was tapped (the dashboard's own state, not saved). */
  handfulShown?: HandfulShown | null;
}

/**
 * The day and band in which the "Today's handful" row was tapped. Its cards
 * stay on the stack until the band changes; the dashboard keeps this in its
 * own state, so a restart clears it too.
 */
export interface HandfulShown { day: string; band: TimeBand }

/** True while the handful row's tap holds: the same Atlantic day and band it was tapped in. */
export function handfulForced(shown: HandfulShown | null, clock: Pick<NextUpClock, "today" | "band">): boolean {
  return !!shown && shown.day === clock.today && shown.band === clock.band;
}

/** The builder's input: Atlantic day and band from the clock, the rest from the stores. */
export function nextUpInput(src: NextUpSources, clock: Pick<NextUpClock, "today" | "band">, now: Date): NextUpInput {
  return {
    now,
    today: clock.today,
    band: clock.band,
    clients: src.clients,
    tasks: src.tasks,
    pipeline: src.pipeline,
    clientRecords: src.clientRecords,
    undatedReceipts: src.receipts.filter((r) => r.expense_date == null).length,
    outreachReady: src.outreachQueue
      .filter((r) => r.status === "ready")
      .map((r) => ({ client_id: r.client_id, channel: r.channel })),
    payload: src.payload,
    schedule: src.schedule,
    tripsLoggedToday: src.tripsLoggedToday,
    briefingCount: src.briefingCount,
    localSnoozes: src.localSnoozes,
    voiceNoteDoneOn: src.voiceNoteDoneOn,
    forceHandful: handfulForced(src.handfulShown ?? null, clock),
  };
}

// ── Where things open ────────────────────────────────────────────────────────

/** The rows that open a section. Messages and the handful are routed by rowTap. */
export const SECTION_ROUTES: Readonly<Record<Exclude<SectionKey, "handful" | "messages">, string>> = {
  checklist: NAV.checklist,
  new_leads: NAV.clients,
  deals: NAV.deals,
  receipts: NAV.expenses,
};

/**
 * Messages ready opens the tab that holds its items: the Texts tab when every
 * one is a text, else the Emails tab (the screen's default), where the emails
 * are (fix 9).
 */
export const MESSAGES_ROUTES = {
  texts: `${NAV.outreach}?tab=texts`,
  emails: `${NAV.outreach}?tab=emails`,
} as const;

const messagesRoute = (textsOnly: boolean | undefined) => (textsOnly ? MESSAGES_ROUTES.texts : MESSAGES_ROUTES.emails);

/** What tapping an "Also waiting" row does: open its section, or bring the handful into the stack (R33). */
export type RowTap = { kind: "open"; href: string } | { kind: "show_handful" };

export function rowTap(row: Pick<AlsoWaitingRow, "section" | "textsOnly">): RowTap {
  if (row.section === "handful") return { kind: "show_handful" };
  if (row.section === "messages") return { kind: "open", href: messagesRoute(row.textsOnly) };
  return { kind: "open", href: SECTION_ROUTES[row.section] };
}

/** The card buttons that open a fixed screen. Open messages: actionRoute. Open client is routed with its id (see the dashboard). */
export const ACTION_ROUTES: Readonly<Partial<Record<NextUpAction, string>>> = {
  open_checklist: NAV.checklist,
  open_briefing: NAV.briefing,
  open_deals: NAV.deals,
  open_receipts: NAV.expenses,
  open_mileage: NAV.mileage,
};

/** Where a card button opens, or undefined for a button that doesn't open a screen. */
export function actionRoute(action: NextUpAction, card: Pick<NextUpCard, "detail">): string | undefined {
  if (action === "open_messages") return messagesRoute(card.detail.textsOnly);
  return ACTION_ROUTES[action];
}

/**
 * The card the stack scrolls to after the handful row was tapped: the first
 * handful card, else the first card that holds a handful client (one client,
 * one card: a lead card can hold their pick), else none.
 */
export function handfulFocusKey(stack: readonly NextUpCard[], payload: NextUpPayload | null): string | null {
  const first = stack.find((c) => c.kind === "handful_client");
  if (first) return first.key;
  const ids = new Set((payload?.handful ?? []).map((h) => h.client_id));
  return stack.find((c) => !!c.clientId && ids.has(c.clientId))?.key ?? null;
}

// ── Small reads for the screen ───────────────────────────────────────────────

/** The greeting for the band: 12:00 is the afternoon, 17:00 the evening. */
export function greetingKey(band: TimeBand): "greeting.morning" | "greeting.afternoon" | "greeting.evening" {
  if (band === "morning") return "greeting.morning";
  if (band === "midday") return "greeting.afternoon";
  return "greeting.evening";
}

/**
 * True when a handful client's Later ran out in (fromMs, toMs]: the screen
 * then asks the server again, so the card gets its Text button and Skip back
 * (a client back from Later shows Call only until then). An unreadable time
 * never counts.
 */
export function snoozeEndedBetween(snoozed: readonly { until: string }[], fromMs: number, toMs: number): boolean {
  return snoozed.some((s) => {
    const until = Date.parse(s.until);
    return !Number.isNaN(until) && until > fromMs && until <= toMs;
  });
}

/**
 * True when the Checklist row holds an overdue task (one no stack card
 * covers): only then is its count red. Red is for overdue items only.
 */
export function checklistRowHasOverdue(
  view: Pick<NextUpView, "stack">,
  tasks: readonly { id: string; due_date: string; completed_at: string | null }[],
  today: string,
): boolean {
  const covered = new Set(view.stack.flatMap((c) => c.itemIds));
  return tasks.some((t) => !covered.has(t.id) && isOverdueTask(t, today));
}

// ── Text ─────────────────────────────────────────────────────────────────────

/**
 * What the Text button on a card does: send today's queued text, or draft
 * one first. A draft is tagged source "next_up" (R32), so the handful's
 * clean-up skips it once the client is handled before it's sent.
 */
export type TextPlan =
  | { kind: "send"; queueId: string }
  | { kind: "draft"; purpose: "check_in" | "consent_request"; note: string; source: "next_up" }
  | null;

/** The drafter's note for a new lead's first text. */
export const NEW_LEAD_TEXT_NOTE = "New lead, first contact";

/**
 * CASL: a handful or new-lead card texts only when the server said a text
 * can go (its status, checked under consentStatus when the payload was
 * built, R31): `ready` sends the queued text, `draftable` drafts one. A
 * handful card drafts with its purpose and Flight Control's label, a new
 * lead a first-contact check-in; the drafter checks consent again before
 * writing a word. Anything else (call only, no number, a lead the server
 * didn't check, a client back from Later before the server has answered
 * again) never texts. The text check before Messages opens (sendQueuedText)
 * still runs on every send.
 */
export function textPlan(card: NextUpCard): TextPlan {
  if (!card.phone?.trim()) return null;
  if (card.kind !== "handful_client" && card.kind !== "new_lead") return null;
  if (card.text?.status === "ready") return { kind: "send", queueId: card.text.queue_id };
  if (card.text?.status !== "draftable") return null;
  if (card.kind === "new_lead") return { kind: "draft", purpose: "check_in", note: NEW_LEAD_TEXT_NOTE, source: "next_up" };
  if (!card.occurrence) return null;
  return {
    kind: "draft", purpose: textPurposeFor(card.occurrence.opportunity_type), note: card.detail.label ?? "", source: "next_up",
  };
}
