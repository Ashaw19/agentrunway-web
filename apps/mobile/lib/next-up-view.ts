/**
 * The dashboard's wiring around the core Next up builder
 * (packages/core/lib/next-up/build.ts): what it is fed from the phone's
 * stores, where each card button and "Also waiting" row goes, and when a
 * client back from Later needs a fresh /api/next-up.
 *
 * Plain functions over plain values, so lib/__tests__ can run them.
 */

import type { NextUpCard, NextUpInput, NextUpAction, NextUpView, SectionKey } from "@agent-runway/core/lib/next-up/build";
import { isOverdueTask, textPurposeFor, type TimeBand } from "@agent-runway/core/lib/next-up/rules";
import type { NextUpPayload } from "@agent-runway/core/lib/next-up/types";
import type { NextUpClock } from "./next-up-clock";

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
  };
}

// ── Where things open ────────────────────────────────────────────────────────

/** Each "Also waiting" row opens its section. */
export const SECTION_ROUTES: Readonly<Record<SectionKey, string>> = {
  checklist: "/profile/checklist",
  new_leads: "/clients",
  deals: "/deals",
  handful: "/profile/outreach",
  messages: "/profile/outreach?tab=texts",
  receipts: "/profile/expenses",
};

/** The card buttons that open a screen. Open client is routed with its id (see the dashboard). */
export const ACTION_ROUTES: Readonly<Partial<Record<NextUpAction, string>>> = {
  open_checklist: "/profile/checklist",
  open_briefing: "/profile/briefing",
  open_deals: "/deals",
  open_messages: "/profile/outreach?tab=texts",
  open_receipts: "/profile/expenses",
  open_mileage: "/profile/mileage",
};

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

/** What the Text button on a card does: send today's queued text, or draft one first. */
export type TextPlan =
  | { kind: "send"; queueId: string }
  | { kind: "draft"; purpose: "check_in" | "consent_request"; note: string }
  | null;

/** The drafter's note for a new lead's first text. */
export const NEW_LEAD_TEXT_NOTE = "New lead, first contact";

/**
 * CASL: a handful card texts only when the server said a text can go (its
 * status, checked under consentStatus when the payload was built): `ready`
 * sends the queued text, `draftable` drafts one with the card's purpose and
 * Flight Control's label. A new lead drafts a first-contact check-in, and the
 * drafter checks their consent before writing a word (call_only otherwise).
 * Anything else (call only, no number, a client back from Later before the
 * server has answered again) never texts. The text check before Messages
 * opens (sendQueuedText) still runs on every send.
 */
export function textPlan(card: NextUpCard): TextPlan {
  if (!card.phone?.trim()) return null;
  if (card.kind === "new_lead") return { kind: "draft", purpose: "check_in", note: NEW_LEAD_TEXT_NOTE };
  if (card.kind !== "handful_client") return null;
  if (card.text?.status === "ready") return { kind: "send", queueId: card.text.queue_id };
  if (card.text?.status === "draftable" && card.occurrence) {
    return { kind: "draft", purpose: textPurposeFor(card.occurrence.opportunity_type), note: card.detail.label ?? "" };
  }
  return null;
}
