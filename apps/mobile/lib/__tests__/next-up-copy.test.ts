/**
 * The dashboard's words (lib/next-up-copy.ts), rendered through the app's
 * real i18n setup (lib/i18n.ts: i18next 24, the en home.json). Mocked: the
 * device locale (expo-localization) and saved storage (lib/mmkv).
 *
 * What this holds:
 *   - plurals: every count key in the new namespaces reads right at 1 and 2
 *     (i18next 24 resolves `_one` / `_other`; an old `_plural` key is never
 *     picked by i18next itself, so its callers choose it by hand)
 *   - the welcome's context and progress lines, the card and row lines, the
 *     all-clear card
 *   - the toasts after a card's button, as web Flight Control words them
 *   - the new strings carry no em dash and no "should"
 */
import { describe, expect, it, vi } from "vitest";
import type { AlsoWaitingRow, NextUpAction, NextUpCard } from "@agent-runway/core/lib/next-up/build";
import enHome from "@agent-runway/i18n/mobile/en/home.json";
// The vi.mock calls below are hoisted over these imports, so i18n loads the mocks.
import i18n from "../i18n";
import {
  actionLabel,
  allClearCopy,
  cardCopy,
  handledToast,
  contextLine,
  dayLabel,
  greetingLine,
  laterAsIcon,
  progressLine,
  rowCopy,
  scheduleLine,
} from "../next-up-copy";

vi.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-CA" }] }));
vi.mock("../mmkv", () => ({ storage: { getString: () => undefined, set: () => {} } }));

const t = i18n.getFixedT("en", "home") as unknown as (key: string, options?: Record<string, unknown>) => string;

/** The namespaces this build adds to home.json (the card buttons' sheets and toasts too). */
const NEW_NAMESPACES = [
  "welcome", "stack", "alsoWaiting", "allClear", "cardActions",
  "later", "dismiss", "postCall", "nextUpToast", "textFlow",
] as const;

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === "string" ? [[`${prefix}${k}`, v] as [string, string]] : leaves(v, `${prefix}${k}.`));
}

const home = enHome as unknown as Tree;
const newStrings = NEW_NAMESPACES.flatMap((ns) => leaves(home[ns] as Tree, `${ns}.`));

const card = (over: Partial<NextUpCard>): NextUpCard => ({
  key: "k", kind: "briefing", clientId: null, clientName: null, phone: null, count: 1, itemIds: [], detail: {}, ...over,
});
const ctx = { locale: "en-CA", now: new Date("2026-10-19T15:00:00Z") };

describe("plurals through the app's i18n (R3)", () => {
  it("the app's i18n is English here", () => {
    expect(i18n.language).toBe("en");
  });

  const pluralBases = [...new Set(newStrings.filter(([k]) => k.endsWith("_one")).map(([k]) => k.slice(0, -"_one".length)))];

  it("the new namespaces have count keys, each with _one and _other", () => {
    expect(pluralBases.length).toBeGreaterThan(10);
    const keys = new Set(newStrings.map(([k]) => k));
    for (const base of pluralBases) expect(keys.has(`${base}_other`), base).toBe(true);
  });

  for (const base of [
    "welcome.waiting", "welcome.showings", "welcome.appointments", "stack.overdue", "stack.tasksToday",
    "stack.messages", "stack.receipts", "stack.newLeadDetail", "alsoWaiting.dealPassed",
  ]) {
    it(`${base} reads 1 and 2`, () => {
      const one = t(base, { count: 1, address: "12 Elm St" });
      const two = t(base, { count: 2, address: "12 Elm St" });
      expect(one).not.toBe(two);
      expect(one).not.toContain(base);
      expect(one).toMatch(/\b1\b/);
      expect(two).toMatch(/\b2\b/);
    });
  }

  it("spot checks", () => {
    expect(t("welcome.waiting", { count: 1 })).toBe("1 thing waiting");
    expect(t("welcome.waiting", { count: 2 })).toBe("2 things waiting");
    expect(t("stack.overdue", { count: 1 })).toBe("1 task is overdue");
    expect(t("stack.overdue", { count: 3 })).toBe("3 tasks are overdue");
    expect(t("stack.receipts", { count: 1 })).toBe("1 receipt has no date");
    expect(t("stack.receipts", { count: 2 })).toBe("2 receipts have no date");
  });

  it("an old _plural key is not picked by i18next 24 (its callers choose it by hand)", () => {
    expect(t("sync.pendingSync", { count: 2 })).toBe("2 change pending sync");
    expect(t("sync.pendingSync_plural", { count: 2 })).toBe("2 changes pending sync");
  });
});

describe("the welcome", () => {
  it("greets by band", () => {
    expect(greetingLine("morning", "Andrew", t)).toBe("Good morning, Andrew");
    expect(greetingLine("midday", "Andrew", t)).toBe("Good afternoon, Andrew");
    expect(greetingLine("evening", "Andrew", t)).toBe("Good evening, Andrew");
  });

  it("names today's showings and appointments, singular and plural", () => {
    expect(scheduleLine(1, 0, t)).toBe("1 showing today");
    expect(scheduleLine(0, 2, t)).toBe("2 listing appointments today");
    expect(scheduleLine(1, 1, t)).toBe("1 showing and 1 listing appointment today");
    expect(scheduleLine(2, 3, t)).toBe("2 showings and 3 listing appointments today");
    expect(scheduleLine(0, 0, t)).toBeNull();
  });

  it("context: schedule first, else what waits, else all clear", () => {
    expect(contextLine({ kind: "schedule", showings: 2, appointments: 0 }, t)).toBe("2 showings today");
    expect(contextLine({ kind: "waiting", count: 3 }, t)).toBe("3 things waiting");
    expect(contextLine({ kind: "all_clear" }, t)).toBe("Nothing waiting right now");
  });

  it("progress with the streak from 2 days, and nothing said about a break", () => {
    expect(progressLine({ done: 2, target: 5 }, 6, t)).toBe("2 of 5 done today · 6-day streak");
    expect(progressLine({ done: 0, target: 5 }, 1, t)).toBe("0 of 5 done today");
    expect(progressLine(null, 3, t)).toBe("3-day streak");
    expect(progressLine(null, 0, t)).toBeNull();
  });
});

describe("cards", () => {
  it("a new lead: Call and how long since they came in", () => {
    const lead = card({ kind: "new_lead", clientId: "c1", clientName: "Dana Whitfield", phone: "5065550101" });
    expect(cardCopy(lead, t, { ...ctx, leadCreatedAt: "2026-10-19T10:00:00Z" })).toEqual({
      title: "Call Dana Whitfield", detail: "New lead · 5 hours, no contact yet",
    });
    expect(cardCopy(lead, t, { ...ctx, leadCreatedAt: "2026-10-19T13:30:00Z" }).detail).toBe("New lead · 1 hour, no contact yet");
    expect(cardCopy({ ...lead, phone: null }, t, ctx)).toEqual({ title: "Dana Whitfield", detail: undefined });
  });

  it("overdue tasks name the oldest and its day", () => {
    const overdue = card({ kind: "overdue_tasks", count: 3, detail: { title: "Send comps to Sam", due: "2026-10-18", days: 1 } });
    expect(cardCopy(overdue, t, ctx)).toEqual({ title: "3 tasks are overdue", detail: "Oldest: Send comps to Sam, due yesterday" });
    const one = card({ kind: "overdue_tasks", count: 1, detail: { title: "Send comps to Sam", due: "2026-10-18", days: 1 } });
    expect(cardCopy(one, t, ctx)).toEqual({ title: "1 task is overdue", detail: "Send comps to Sam, due yesterday" });
  });

  it("deal deadlines: a close and a condition date", () => {
    const close = card({ kind: "deal_deadline", clientName: "Pat Roy", detail: { address: "12 Elm St", days: 3, label: "close" } });
    expect(cardCopy(close, t, ctx)).toEqual({ title: "12 Elm St closes in 3 days", detail: "Pat Roy" });
    expect(cardCopy({ ...close, detail: { ...close.detail, days: 0 } }, t, ctx).title).toBe("12 Elm St closes today");
    expect(cardCopy({ ...close, clientName: null, detail: { days: 1, label: "close" } }, t, ctx).title).toBe("A deal closes in 1 day");
    const cond = card({ kind: "deal_deadline", detail: { address: "12 Elm St", days: 1, label: "conditions" } });
    expect(cardCopy(cond, t, ctx)).toEqual({ title: "Conditions due in 1 day", detail: "12 Elm St" });
  });

  it("a handful pick shows the server's label and why now; one back from Later says so", () => {
    const pick = card({ kind: "handful_client", clientName: "Sam Lee", detail: { label: "Birthday today", whyNow: "Their birthday is today." } });
    expect(cardCopy(pick, t, ctx)).toEqual({ title: "Sam Lee", detail: "Birthday today", note: "Their birthday is today." });
    expect(cardCopy(card({ kind: "handful_client", clientName: "Sam Lee", detail: { returning: true } }), t, ctx))
      .toEqual({ title: "Sam Lee", detail: "Back from Later" });
  });

  it("the rest of the kinds", () => {
    expect(cardCopy(card({ kind: "briefing", count: 4 }), t, ctx)).toEqual({ title: "Your morning briefing", detail: "4 items to look at" });
    expect(cardCopy(card({ kind: "tasks_today", count: 1, detail: { title: "Call the lender" } }), t, ctx))
      .toEqual({ title: "1 task due today", detail: "Call the lender" });
    expect(cardCopy(card({ kind: "messages_ready", count: 2 }), t, ctx).title).toBe("2 messages ready to send");
    expect(cardCopy(card({ kind: "undated_receipts", count: 1 }), t, ctx).title).toBe("1 receipt has no date");
    expect(cardCopy(card({ kind: "voice_note", detail: { showings: 1, appointments: 0 } }), t, ctx))
      .toEqual({ title: "Anything to note from today?", detail: "1 showing today" });
    expect(cardCopy(card({ kind: "trips", detail: { showings: 0, appointments: 1 } }), t, ctx))
      .toEqual({ title: "Log today's driving", detail: "1 listing appointment today" });
    expect(cardCopy(card({ kind: "schedule", clientName: "Sam Lee", detail: { showings: 2, appointments: 0 } }), t, ctx))
      .toEqual({ title: "2 showings today", detail: "Sam Lee" });
  });

  it("every button has a label", () => {
    const actions: NextUpAction[] = ["call", "text", "later", "dismiss", "open_client", "open_checklist", "mark_one_done",
      "open_briefing", "open_deals", "open_messages", "open_receipts", "open_mileage", "record_voice_note"];
    for (const a of actions) expect(actionLabel(a, t)).not.toMatch(/cardActions/);
    expect(actionLabel("open_checklist", t)).toBe("Open checklist");
    expect(actionLabel("mark_one_done", t)).toBe("Mark one done");
    expect(actionLabel("open_deals", t)).toBe("Open");
  });

  it("Later keeps its label beside Call and Text, and turns round beside the long task buttons", () => {
    expect(laterAsIcon(["call", "text", "later"], t)).toBe(false);
    expect(laterAsIcon(["call", "text", "later", "dismiss"], t)).toBe(false);
    expect(laterAsIcon(["open_deals", "later"], t)).toBe(false);
    expect(laterAsIcon(["open_checklist", "mark_one_done", "later"], t)).toBe(true);
  });
});

describe("Also waiting rows", () => {
  const row = (over: Partial<AlsoWaitingRow>): AlsoWaitingRow => ({ section: "deals", count: 1, swipeTaskId: null, ...over });

  it("Deals: one item names its date, never as 'close dates have passed' alone", () => {
    expect(rowCopy(row({ firstName: "Dana", days: -3 }), t)).toEqual({ title: "Deals", detail: "Dana · Close date passed 3 days ago" });
    expect(rowCopy(row({ days: -1 }), t).detail).toBe("Close date passed 1 day ago");
    expect(rowCopy(row({ days: 0 }), t).detail).toBe("Deadline today");
    expect(rowCopy(row({ days: 2 }), t).detail).toBe("Deadline in 2 days");
    expect(rowCopy(row({ count: 4 }), t)).toEqual({ title: "Deals", detail: "Close dates and deadlines" });
  });

  it("Checklist: the one task's title, else how many", () => {
    expect(rowCopy(row({ section: "checklist", swipeTaskId: "t1" }), t, "Call the lender").detail).toBe("Call the lender");
    expect(rowCopy(row({ section: "checklist", count: 3 }), t)).toEqual({ title: "Checklist", detail: "3 items to tick off" });
  });

  it("the other sections", () => {
    expect(rowCopy(row({ section: "new_leads", firstName: "Dana" }), t)).toEqual({ title: "New leads", detail: "Dana, no contact yet" });
    expect(rowCopy(row({ section: "handful", count: 3 }), t)).toEqual({ title: "Today's handful", detail: "Flight Control's picks for today" });
    expect(rowCopy(row({ section: "messages", count: 2 }), t)).toEqual({ title: "Messages ready", detail: "Drafted, waiting for you to send" });
    expect(rowCopy(row({ section: "receipts", count: 2 }), t)).toEqual({ title: "Receipts", detail: "2 receipts have no date" });
  });
});

describe("the all-clear card", () => {
  it("all caught up, and what's next", () => {
    expect(allClearCopy({ kind: "task", date: "2026-10-20", title: "Call the lender" }, false, "2026-10-19", t, "en-CA"))
      .toEqual({ title: "You're all caught up", detail: "Next task: Call the lender, tomorrow" });
    expect(allClearCopy({ kind: "showing", date: "2026-10-19", clientName: null }, false, "2026-10-19", t, "en-CA").detail)
      .toBe("Next showing: today");
    expect(allClearCopy({ kind: "appointment", date: "2026-10-20", clientName: null }, false, "2026-10-19", t, "en-CA").detail)
      .toBe("Next listing appointment: tomorrow");
    expect(allClearCopy(null, false, "2026-10-19", t, "en-CA")).toEqual({ title: "You're all caught up", detail: "Nothing else is scheduled" });
  });

  it("says nothing is urgent, not all caught up, while rows still wait", () => {
    expect(allClearCopy(null, true, "2026-10-19", t, "en-CA").title).toBe("Nothing urgent right now");
  });
});

describe("days", () => {
  it("prints a calendar day from local noon, with no time zone", () => {
    expect(dayLabel("2026-10-19", 0, t, "en-CA")).toBe("today");
    expect(dayLabel("2026-10-15", -4, t, "en-CA")).toBe(new Date("2026-10-15T12:00:00").toLocaleDateString("en-CA", { weekday: "long" }));
    expect(dayLabel("2026-10-15", -4, t, "en-CA")).toBe("Thursday");
    expect(dayLabel("2026-11-02", 14, t, "en-CA")).toBe(new Date("2026-11-02T12:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric" }));
  });
});

describe("handledToast", () => {
  it("words each handled card as Flight Control's Dismiss does", () => {
    expect(handledToast({ kind: "skip" }, "Sam Lee", t)).toBe("Skipped Sam Lee this time. They come back at their next reason to reach out.");
    expect(handledToast({ kind: "later", choice: "tonight" }, "Sam Lee", t)).toBe("Sam Lee is back tonight.");
    expect(handledToast({ kind: "later", choice: "tomorrow" }, "Sam Lee", t)).toBe("Sam Lee is back tomorrow.");
    expect(handledToast({ kind: "stop", months: 6 }, "Sam Lee", t)).toBe("No suggestions for Sam Lee for 6 months.");
    expect(handledToast({ kind: "hangar" }, "Sam Lee", t)).toBe("Sam Lee moved to the Hangar.");
    expect(handledToast({ kind: "logged", type: "call" }, "Sam Lee", t)).toBe("Logged your call with Sam Lee.");
  });

  it("reads 'this client' with no name, and a phone-only card's Later needs none", () => {
    expect(handledToast({ kind: "skip" }, "  ", t)).toBe("Skipped this client this time. They come back at their next reason to reach out.");
    expect(handledToast({ kind: "hangar" }, null, t)).toBe("This client moved to the Hangar.");
    expect(handledToast({ kind: "snoozed", choice: "in_an_hour" }, null, t)).toBe("Back in an hour.");
    expect(handledToast({ kind: "snoozed", choice: "tomorrow" }, null, t)).toBe("Back tomorrow morning.");
    expect(handledToast({ kind: "snoozed", choice: "tonight" }, "Kim Fox", t)).toBe("Kim Fox is back tonight.");
  });
});

describe("the new strings", () => {
  it("carry no em dash and no 'should'", () => {
    for (const [key, value] of newStrings) {
      expect(value, key).not.toContain("—");
      expect(value, key).not.toMatch(/\bshould\b/i);
    }
  });

  it("use _one / _other, never _plural", () => {
    expect(newStrings.filter(([k]) => k.endsWith("_plural"))).toEqual([]);
  });
});
