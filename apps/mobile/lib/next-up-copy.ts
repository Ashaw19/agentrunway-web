/**
 * The words on the dashboard's welcome, Next up cards, "Also waiting" rows,
 * all-clear card and the toasts after a card's button, from the "home" namespace
 * (packages/i18n/mobile/<locale>/home.json).
 *
 * Counts go through i18next plurals: the app runs i18next 24 (JSON v4), so a
 * key with a count resolves `<key>_one` / `<key>_other` (and the other
 * plural forms a language has: Arabic six, French and Spanish three, Chinese
 * one). A `_plural` key is never read, and none is left in any locale
 * (lib/__tests__/next-up-copy.test.ts renders 1 and 2 through lib/i18n.ts;
 * lib/__tests__/next-up-locales.test.ts holds the forms of every language).
 *
 * Days are calendar days (YYYY-MM-DD): printed from local noon with
 * toLocaleDateString and no timeZone, so the printed day is the day stored.
 */

import type { AlsoWaitingRow, NextUpAction, NextUpCard, NextUpView } from "@agent-runway/core/lib/next-up/build";
import { daysBetweenISO } from "@agent-runway/core/lib/local-date";
import type { TimeBand } from "@agent-runway/core/lib/next-up/rules";
import type { LaterChoice } from "@agent-runway/core/lib/suggestion-dismissals";
import { greetingKey } from "./next-up-view";

/** i18next's t for the "home" namespace, narrowed to what these helpers call. */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Joins a name and a detail on a row or card line. */
const SEP = " · ";

// ── Days ─────────────────────────────────────────────────────────────────────

function printDay(iso: string, locale: string, options: Intl.DateTimeFormatOptions): string {
  const noon = new Date(`${iso}T12:00:00`);
  try {
    return noon.toLocaleDateString(locale, options);
  } catch {
    return noon.toLocaleDateString("en-CA", options);
  }
}

/**
 * A calendar day for a line of copy: today, tomorrow or yesterday by name,
 * the weekday within 6 days either way, else "Oct 12". `offset` is the days
 * from today to `iso` (negative in the past).
 */
export function dayLabel(iso: string, offset: number, t: Translate, locale: string): string {
  if (offset === 0) return t("stack.today");
  if (offset === 1) return t("stack.tomorrow");
  if (offset === -1) return t("stack.yesterday");
  if (Math.abs(offset) <= 6) return printDay(iso, locale, { weekday: "long" });
  return printDay(iso, locale, { month: "short", day: "numeric" });
}

// ── Welcome ──────────────────────────────────────────────────────────────────

export function greetingLine(band: TimeBand, name: string, t: Translate): string {
  return t("welcome.greeting", { greeting: t(greetingKey(band)), name });
}

/** "2 showings today", "1 listing appointment today", or both. Null with neither. */
export function scheduleLine(showings: number, appointments: number, t: Translate): string | null {
  if (showings > 0 && appointments > 0) {
    return t("welcome.showingsAndAppointments", {
      showings: t("welcome.showingCount", { count: showings }),
      appointments: t("welcome.appointmentCount", { count: appointments }),
    });
  }
  if (showings > 0) return t("welcome.showings", { count: showings });
  if (appointments > 0) return t("welcome.appointments", { count: appointments });
  return null;
}

/** The one line of context under the greeting. */
export function contextLine(context: NextUpView["context"], t: Translate): string {
  if (context.kind === "schedule") return scheduleLine(context.showings, context.appointments, t) ?? t("welcome.allClear");
  if (context.kind === "waiting") return t("welcome.waiting", { count: context.count });
  return t("welcome.allClear");
}

/**
 * "2 of 5 done today · 6-day streak". The streak shows from 2 days and says
 * nothing when it breaks. Null when there is neither.
 */
export function progressLine(progress: NextUpView["progress"], streak: number, t: Translate): string | null {
  const parts: string[] = [];
  if (progress) parts.push(t("welcome.progress", { done: progress.done, target: progress.target }));
  if (streak >= 2) parts.push(t("welcome.streak", { count: streak }));
  return parts.length > 0 ? parts.join(SEP) : null;
}

// ── Cards ────────────────────────────────────────────────────────────────────

export interface CardCopy {
  title: string;
  /** One line under the title. */
  detail?: string;
  /** A longer line under that (a handful pick's why-now). */
  note?: string;
}

export interface CardCopyContext {
  locale: string;
  now: Date;
  /** created_at of a new lead's client, for "N hours, no contact yet". */
  leadCreatedAt?: string | null;
}

/** Whole hours since `iso`, never below 0; null when it can't be read. */
function hoursSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.floor((now.getTime() - at) / 3_600_000));
}

export function cardCopy(card: NextUpCard, t: Translate, ctx: CardCopyContext): CardCopy {
  const name = card.clientName ?? "";
  const d = card.detail;
  const schedule = () => scheduleLine(d.showings ?? 0, d.appointments ?? 0, t) ?? undefined;
  switch (card.kind) {
    case "new_lead": {
      const hours = hoursSince(ctx.leadCreatedAt, ctx.now);
      return {
        title: card.phone?.trim() ? t("stack.newLead", { name }) : name,
        detail: hours === null ? undefined : t("stack.newLeadDetail", { count: hours }),
      };
    }
    case "handful_client":
      return d.returning
        ? { title: name, detail: t("stack.returning") }
        : { title: name, detail: d.label || undefined, note: d.whyNow || undefined };
    case "overdue_tasks": {
      const day = d.due ? dayLabel(d.due, -(d.days ?? 0), t, ctx.locale) : "";
      return {
        title: t("stack.overdue", { count: card.count }),
        detail: d.title ? t(card.count === 1 ? "stack.taskDue" : "stack.overdueOldest", { title: d.title, day }) : undefined,
      };
    }
    case "tasks_today":
      return { title: t("stack.tasksToday", { count: card.count }), detail: d.title };
    case "deal_deadline": {
      const days = d.days ?? 0;
      if (d.label === "conditions") {
        return {
          title: days === 0 ? t("stack.conditionsDueToday") : t("stack.conditionsDue", { count: days }),
          detail: d.address || card.clientName || undefined,
        };
      }
      const address = d.address || card.clientName || t("stack.aDeal");
      return {
        title: days === 0 ? t("stack.dealClosesToday", { address }) : t("stack.dealCloses", { address, count: days }),
        detail: d.address && card.clientName ? card.clientName : undefined,
      };
    }
    case "briefing":
      return { title: t("stack.briefing"), detail: t("stack.briefingDetail", { count: card.count }) };
    case "schedule":
      return { title: schedule() ?? t("welcome.allClear"), detail: card.clientName ?? undefined };
    case "messages_ready":
      return { title: t("stack.messages", { count: card.count }), detail: t("stack.messagesDetail") };
    case "voice_note":
      return { title: t("stack.voiceNote"), detail: schedule() };
    case "undated_receipts":
      return { title: t("stack.receipts", { count: card.count }) };
    case "trips":
      return { title: t("stack.trips"), detail: schedule() };
  }
}

const ACTION_KEYS: Readonly<Record<NextUpAction, string>> = {
  call: "cardActions.call",
  text: "cardActions.text",
  later: "cardActions.later",
  dismiss: "cardActions.notNow",
  open_client: "cardActions.open",
  open_checklist: "cardActions.openChecklist",
  mark_one_done: "cardActions.markOneDone",
  open_briefing: "cardActions.open",
  open_deals: "cardActions.open",
  open_messages: "cardActions.open",
  open_receipts: "cardActions.open",
  open_mileage: "cardActions.open",
  record_voice_note: "cardActions.recordNote",
};

export function actionLabel(action: NextUpAction, t: Translate): string {
  return t(ACTION_KEYS[action]);
}

/** A rough width, in points, for the labelled buttons other than Later and Not now. */
const WIDE_BUTTONS = 200;

/**
 * True when Later shows as a round clock button rather than a labelled one:
 * the card's other labelled buttons are long (the task cards' "Open
 * checklist" and "Mark one done", or longer words in another language), so
 * the row would run off a narrow phone. Not now is always a round button.
 */
export function laterAsIcon(actions: readonly NextUpAction[], t: Translate): boolean {
  return actions
    .filter((a) => a !== "later" && a !== "dismiss")
    .reduce((w, a) => w + actionLabel(a, t).length * 7 + 42, 0) > WIDE_BUTTONS;
}

// ── Also waiting ─────────────────────────────────────────────────────────────

export interface RowCopy {
  title: string;
  detail?: string;
}

/** A Deals row holding one item: days from today to its date (negative once passed). */
function dealDetail(days: number, t: Translate): string {
  if (days < 0) return t("alsoWaiting.dealPassed", { count: -days });
  if (days === 0) return t("alsoWaiting.dealDeadlineToday");
  return t("alsoWaiting.dealDeadline", { count: days });
}

/** `taskTitle`: the Checklist row's one task, when it holds exactly one. */
export function rowCopy(row: AlsoWaitingRow, t: Translate, taskTitle?: string | null): RowCopy {
  const one = row.count === 1;
  switch (row.section) {
    case "checklist":
      return {
        title: t("alsoWaiting.checklist"),
        detail: one && taskTitle ? taskTitle : t("alsoWaiting.checklistDetail", { count: row.count }),
      };
    case "new_leads":
      return {
        title: t("alsoWaiting.newLeads"),
        detail: one && row.firstName ? t("alsoWaiting.newLeadsOne", { name: row.firstName }) : t("alsoWaiting.newLeadsDetail"),
      };
    case "deals":
      return {
        title: t("alsoWaiting.deals"),
        detail: one && row.days !== undefined
          ? [row.firstName, dealDetail(row.days, t)].filter(Boolean).join(SEP)
          : t("alsoWaiting.dealsDetail"),
      };
    case "handful":
      return {
        title: t("alsoWaiting.handful"),
        detail: one && row.firstName ? row.firstName : t("alsoWaiting.handfulDetail"),
      };
    case "messages":
      return { title: t("alsoWaiting.messages"), detail: t("alsoWaiting.messagesDetail") };
    case "receipts":
      return { title: t("alsoWaiting.receipts"), detail: t("stack.receipts", { count: row.count }) };
  }
}

// ── All clear ────────────────────────────────────────────────────────────────

/**
 * The card shown when the stack is empty: all caught up (or nothing urgent,
 * when rows still wait below), and what comes next.
 */
export function allClearCopy(
  allClear: NextUpView["allClear"],
  hasRows: boolean,
  today: string,
  t: Translate,
  locale: string,
): RowCopy {
  const title = hasRows ? t("allClear.nothingUrgent") : t("allClear.title");
  if (!allClear) return { title, detail: t("allClear.nothing") };
  const day = dayLabel(allClear.date, daysBetweenISO(today, allClear.date), t, locale);
  if (allClear.kind === "task") return { title, detail: t("allClear.nextTask", { title: allClear.title, day }) };
  return {
    title,
    detail: t(allClear.kind === "showing" ? "allClear.nextShowing" : "allClear.nextAppointment", { day }),
  };
}

// ── After a card's button ────────────────────────────────────────────────────

/** What was done to a card, for its toast. Mirrors Flight Control's (apps/web/lib/crm/dismiss-menu.ts). */
export type HandledCard =
  | { kind: "skip" }
  | { kind: "later"; choice?: LaterChoice }
  | { kind: "stop"; months?: 3 | 6 }
  | { kind: "hangar" }
  | { kind: "logged"; type: "call" | "text" | "meeting" }
  /** A phone-only Later (a card that isn't a handful client's). */
  | { kind: "snoozed"; choice: LaterChoice };

const BACK_KEYS: Readonly<Record<LaterChoice, string>> = {
  in_an_hour: "nextUpToast.backInAnHour",
  tonight: "nextUpToast.backTonight",
  tomorrow: "nextUpToast.backTomorrow",
};
const CARD_BACK_KEYS: Readonly<Record<LaterChoice, string>> = {
  in_an_hour: "nextUpToast.cardInAnHour",
  tonight: "nextUpToast.cardTonight",
  tomorrow: "nextUpToast.cardTomorrow",
};
const LOGGED_KEYS = { call: "nextUpToast.loggedCall", text: "nextUpToast.loggedText", meeting: "nextUpToast.loggedMeeting" } as const;

/** The toast after a card was handled. `name` is the client's; blank reads "this client". */
export function handledToast(done: HandledCard, name: string | null | undefined, t: Translate): string {
  const named = name?.trim();
  const mid = named || t("nextUpToast.thisClient");
  const start = named || t("nextUpToast.thisClientStart");
  switch (done.kind) {
    case "skip":
      return t("nextUpToast.skipped", { name: mid });
    case "later":
      return t(done.choice ? BACK_KEYS[done.choice] : "nextUpToast.backLater", { name: start });
    case "snoozed":
      return named ? t(BACK_KEYS[done.choice], { name: named }) : t(CARD_BACK_KEYS[done.choice]);
    case "stop":
      return t(
        done.months === 3 ? "nextUpToast.stoppedThreeMonths" : done.months === 6 ? "nextUpToast.stoppedSixMonths" : "nextUpToast.stoppedAWhile",
        { name: mid },
      );
    case "hangar":
      return t("nextUpToast.hangar", { name: start });
    case "logged":
      return t(LOGGED_KEYS[done.type], { name: mid });
  }
}
