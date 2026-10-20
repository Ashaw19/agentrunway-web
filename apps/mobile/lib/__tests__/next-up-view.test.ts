/**
 * The dashboard's wiring around buildNextUp (lib/next-up-view.ts): the
 * builder's input from the phone's stores, where buttons and rows open, the
 * greeting's band, when a client back from Later asks the server again, and
 * when the Checklist row's count is red. Every row is synthetic.
 */
import { describe, expect, it } from "vitest";
import { buildNextUp, cardActions, type NextUpAction, type NextUpCard } from "@agent-runway/core/lib/next-up/build";
import { timeBand } from "@agent-runway/core/lib/next-up/rules";
import { NEXT_UP_PAYLOAD_VERSION, type NextUpPayload } from "@agent-runway/core/lib/next-up/types";
import {
  ACTION_ROUTES,
  MESSAGES_ROUTES,
  SECTION_ROUTES,
  actionRoute,
  checklistRowHasOverdue,
  greetingKey,
  handfulFocusKey,
  handfulForced,
  nextUpInput,
  rowTap,
  snoozeEndedBetween,
  textPlan,
  type NextUpSources,
} from "../next-up-view";

const NOW = new Date("2026-10-19T13:00:00Z"); // 10:00 Atlantic
const TODAY = "2026-10-19";

const payload = (over: Partial<NextUpPayload> = {}): NextUpPayload => ({
  version: NEXT_UP_PAYLOAD_VERSION,
  day: TODAY, target: 5, done_today: 2, generated_at: "2026-10-19T12:00:00Z",
  handful: [{
    client_id: "c9", client_name: "Sam Lee", opportunity_type: "birthday", trigger_date: TODAY,
    label: "Birthday today", why_now: "Their birthday is today.", contact_channel: "call", phone: "5065550101",
    text: { status: "draftable" },
  }],
  snoozed: [],
  urgent: { new_leads: 0, overdue_tasks: 1, deal_deadlines: 0 },
  new_leads: [],
  ...over,
});

const sources = (over: Partial<NextUpSources> = {}): NextUpSources => ({
  clients: [], tasks: [], pipeline: [], clientRecords: [],
  receipts: [], outreachQueue: [], schedule: [],
  tripsLoggedToday: 0, briefingCount: 0, payload: null, localSnoozes: {}, voiceNoteDoneOn: null,
  ...over,
});

describe("nextUpInput", () => {
  it("counts undated receipts and ready messages, and takes the day and band from the clock", () => {
    const input = nextUpInput(sources({
      receipts: [{ expense_date: null }, { expense_date: "2026-10-01" }, { expense_date: null }],
      outreachQueue: [
        { client_id: "a", channel: "sms", status: "ready" },
        { client_id: "b", channel: "email", status: "draft" },
        { client_id: "c", channel: "email", status: "ready" },
        { client_id: "d", channel: "sms", status: "sent" },
      ],
      briefingCount: 4, tripsLoggedToday: 1, voiceNoteDoneOn: TODAY,
    }), { today: TODAY, band: "midday" }, NOW);
    expect(input.today).toBe(TODAY);
    expect(input.band).toBe("midday");
    expect(input.now).toBe(NOW);
    expect(input.undatedReceipts).toBe(2);
    expect(input.outreachReady).toEqual([{ client_id: "a", channel: "sms" }, { client_id: "c", channel: "email" }]);
    expect(input.briefingCount).toBe(4);
    expect(input.tripsLoggedToday).toBe(1);
    expect(input.voiceNoteDoneOn).toBe(TODAY);
    expect("activitiesToday" in input).toBe(false);
  });

  it("feeds the builder end to end: an overdue card on top, the morning's briefing, the handful waiting in its row", () => {
    const view = buildNextUp(nextUpInput(sources({
      tasks: [{ id: "t1", title: "Send comps", due_date: "2026-10-17", completed_at: null, client_id: null }],
      briefingCount: 3,
      payload: payload(),
    }), { today: TODAY, band: "morning" }, NOW));
    expect(view.stack.map((c) => c.kind)).toEqual(["overdue_tasks", "briefing"]);
    expect(view.alsoWaiting.map((r) => r.section)).toEqual(["handful"]);
    expect(view.progress).toEqual({ done: 2, target: 5 });
  });
});

describe("routes", () => {
  it("each row opens its section; the handful row brings the handful into the stack instead (R33)", () => {
    expect(SECTION_ROUTES).toEqual({
      checklist: "/profile/checklist",
      new_leads: "/clients",
      deals: "/deals",
      receipts: "/profile/expenses",
    });
    const row = (section: Parameters<typeof rowTap>[0]["section"], over = {}) => ({ section, count: 2, swipeTaskId: null, ...over });
    expect(rowTap(row("checklist"))).toEqual({ kind: "open", href: "/profile/checklist" });
    expect(rowTap(row("receipts"))).toEqual({ kind: "open", href: "/profile/expenses" });
    expect(rowTap(row("handful"))).toEqual({ kind: "show_handful" });
  });

  it("the Messages row opens the tab that holds its items: texts only, the Texts tab; any email, the Emails tab (fix 9)", () => {
    expect(MESSAGES_ROUTES).toEqual({ texts: "/profile/outreach?tab=texts", emails: "/profile/outreach?tab=emails" });
    const messages = (textsOnly?: boolean) => ({ section: "messages" as const, count: 2, swipeTaskId: null, textsOnly });
    expect(rowTap(messages(true))).toEqual({ kind: "open", href: "/profile/outreach?tab=texts" });
    expect(rowTap(messages(false))).toEqual({ kind: "open", href: "/profile/outreach?tab=emails" });
    expect(rowTap(messages(undefined))).toEqual({ kind: "open", href: "/profile/outreach?tab=emails" });
  });

  it("each open button opens its screen; Open client is routed with the client", () => {
    expect(ACTION_ROUTES).toEqual({
      open_checklist: "/profile/checklist",
      open_briefing: "/profile/briefing",
      open_deals: "/deals",
      open_receipts: "/profile/expenses",
      open_mileage: "/profile/mileage",
    });
    const handledElsewhere: NextUpAction[] = ["call", "text", "later", "dismiss", "mark_one_done", "record_voice_note", "open_client"];
    for (const a of handledElsewhere) expect(ACTION_ROUTES[a]).toBeUndefined();
  });

  it("the Messages card's Open goes where its messages are, as the row does (fix 9)", () => {
    const card = (textsOnly: boolean): NextUpCard => ({
      key: `messages_ready:${TODAY}`, kind: "messages_ready", clientId: null, clientName: null, phone: null,
      count: 2, itemIds: [], detail: { textsOnly },
    });
    expect(actionRoute("open_messages", card(true))).toBe("/profile/outreach?tab=texts");
    expect(actionRoute("open_messages", card(false))).toBe("/profile/outreach?tab=emails");
    expect(actionRoute("open_checklist", card(true))).toBe("/profile/checklist");
    expect(actionRoute("call", card(true))).toBeUndefined();
  });

  it("end to end: texts only opens Texts, a waiting email opens Emails", () => {
    const view = (queue: NextUpSources["outreachQueue"]) =>
      buildNextUp(nextUpInput(sources({ outreachQueue: queue }), { today: TODAY, band: "morning" }, NOW));
    const texts = view([{ client_id: "a", channel: "sms", status: "ready" }]);
    expect(rowTap(texts.alsoWaiting[0])).toEqual({ kind: "open", href: "/profile/outreach?tab=texts" });
    const mixed = view([{ client_id: "a", channel: "sms", status: "ready" }, { client_id: "b", channel: "email", status: "ready" }]);
    expect(rowTap(mixed.alsoWaiting[0])).toEqual({ kind: "open", href: "/profile/outreach?tab=emails" });
  });
});

describe("the handful row brings the handful into the stack (R33)", () => {
  const MORNING = { today: TODAY, band: "morning" as const };

  it("handfulForced lasts until the band changes (or the day), and nothing is forced unless the row was tapped", () => {
    expect(handfulForced({ day: TODAY, band: "morning" }, MORNING)).toBe(true);
    expect(handfulForced({ day: TODAY, band: "morning" }, { today: TODAY, band: "midday" })).toBe(false);
    expect(handfulForced({ day: "2026-10-18", band: "morning" }, MORNING)).toBe(false);
    expect(handfulForced(null, MORNING)).toBe(false);
  });

  it("nextUpInput passes it to the builder: the morning stack gains the handful, and the focus is its first card", () => {
    const src = sources({
      tasks: [{ id: "t1", title: "Send comps", due_date: "2026-10-17", completed_at: null, client_id: null }],
      briefingCount: 3,
      payload: payload(),
    });
    const before = buildNextUp(nextUpInput(src, MORNING, NOW));
    expect(before.stack.map((c) => c.kind)).toEqual(["overdue_tasks", "briefing"]);
    expect(nextUpInput(src, MORNING, NOW).forceHandful).toBe(false);

    const shown = nextUpInput({ ...src, handfulShown: { day: TODAY, band: "morning" } }, MORNING, NOW);
    expect(shown.forceHandful).toBe(true);
    const after = buildNextUp(shown);
    expect(after.stack.map((c) => c.kind)).toEqual(["overdue_tasks", "handful_client", "briefing"]);
    expect(after.alsoWaiting.map((r) => r.section)).not.toContain("handful");
    expect(handfulFocusKey(after.stack, payload())).toBe("handful_client:c9");

    // Midday: the band moved on, so the override is over (midday shows the handful anyway).
    expect(nextUpInput({ ...src, handfulShown: { day: TODAY, band: "morning" } }, { today: TODAY, band: "evening" }, NOW).forceHandful)
      .toBe(false);
  });

  it("with no handful card, the focus is the card that holds a handful client, else none", () => {
    const lead: NextUpCard = {
      key: "new_lead:c9", kind: "new_lead", clientId: "c9", clientName: "Sam Lee", phone: "5065550101",
      count: 1, itemIds: ["c9"], detail: {},
    };
    const tasks: NextUpCard = {
      key: `overdue_tasks:${TODAY}`, kind: "overdue_tasks", clientId: null, clientName: null, phone: null,
      count: 1, itemIds: ["t1"], detail: {},
    };
    expect(handfulFocusKey([tasks, lead], payload())).toBe("new_lead:c9");
    expect(handfulFocusKey([tasks], payload())).toBeNull();
    expect(handfulFocusKey([tasks, lead], null)).toBeNull();
  });
});

describe("greetingKey", () => {
  it("follows the bands: 12:00 is the afternoon, 17:00 the evening", () => {
    expect(greetingKey(timeBand(11))).toBe("greeting.morning");
    expect(greetingKey(timeBand(12))).toBe("greeting.afternoon");
    expect(greetingKey(timeBand(16))).toBe("greeting.afternoon");
    expect(greetingKey(timeBand(17))).toBe("greeting.evening");
  });
});

describe("snoozeEndedBetween", () => {
  const from = Date.parse("2026-10-19T15:00:00Z");
  const to = Date.parse("2026-10-19T15:00:30Z");

  it("is true when a Later runs out inside the window", () => {
    expect(snoozeEndedBetween([{ until: "2026-10-19T15:00:15Z" }], from, to)).toBe(true);
    expect(snoozeEndedBetween([{ until: "2026-10-19T15:00:30Z" }], from, to)).toBe(true);
  });

  it("is false for one that ran out before (already back) or later, or can't be read", () => {
    expect(snoozeEndedBetween([{ until: "2026-10-19T15:00:00Z" }], from, to)).toBe(false);
    expect(snoozeEndedBetween([{ until: "2026-10-19T14:00:00Z" }], from, to)).toBe(false);
    expect(snoozeEndedBetween([{ until: "2026-10-19T16:00:00Z" }], from, to)).toBe(false);
    expect(snoozeEndedBetween([{ until: "soon" }], from, to)).toBe(false);
    expect(snoozeEndedBetween([], from, to)).toBe(false);
  });
});

describe("checklistRowHasOverdue", () => {
  const overdue = { id: "t1", due_date: "2026-10-17", completed_at: null };
  const dueToday = { id: "t2", due_date: TODAY, completed_at: null };
  const covering = (ids: string[]) => ({ stack: [{ itemIds: ids }] as never });

  it("red only while an overdue task waits in the row", () => {
    expect(checklistRowHasOverdue(covering([]), [overdue, dueToday], TODAY)).toBe(true);
    expect(checklistRowHasOverdue(covering(["t1"]), [overdue, dueToday], TODAY)).toBe(false);
    expect(checklistRowHasOverdue(covering([]), [dueToday], TODAY)).toBe(false);
    expect(checklistRowHasOverdue(covering([]), [{ ...overdue, completed_at: "2026-10-18T12:00:00Z" }], TODAY)).toBe(false);
  });
});

describe("textPlan (CASL: Text only where the server said a text can go)", () => {
  const handful = (over: Partial<NextUpCard> = {}): NextUpCard => ({
    key: "handful_client:c9", kind: "handful_client", clientId: "c9", clientName: "Sam Lee", phone: "5065550101",
    count: 1, itemIds: ["c9"], detail: { label: "Birthday today", whyNow: "Their birthday is today." },
    text: { status: "draftable" }, occurrence: { opportunity_type: "birthday", trigger_date: TODAY },
    ...over,
  });

  it("a ready text is sent from the queue row the server named", () => {
    expect(textPlan(handful({ text: { status: "ready", queue_id: "q7", body: "Hi" } }))).toEqual({ kind: "send", queueId: "q7" });
  });

  it("a draftable card drafts with the card's purpose and Flight Control's label, tagged next_up (R32)", () => {
    expect(textPlan(handful())).toEqual({ kind: "draft", purpose: "check_in", note: "Birthday today", source: "next_up" });
    expect(textPlan(handful({ occurrence: { opportunity_type: "consent_lapsing", trigger_date: TODAY }, detail: { label: "Consent ends soon" } })))
      .toEqual({ kind: "draft", purpose: "consent_request", note: "Consent ends soon", source: "next_up" });
  });

  it("a new lead texts only as the server's CASL check allows (R31)", () => {
    const lead: NextUpCard = {
      key: "new_lead:c3", kind: "new_lead", clientId: "c3", clientName: "Kim Fox", phone: "5065550133",
      count: 1, itemIds: ["c3"], detail: {}, text: { status: "draftable" },
    };
    expect(textPlan(lead)).toEqual({ kind: "draft", purpose: "check_in", note: "New lead, first contact", source: "next_up" });
    expect(textPlan({ ...lead, text: { status: "ready", queue_id: "q3", body: "Hi Kim" } })).toEqual({ kind: "send", queueId: "q3" });
    // An opt-out, a lapsed or call-only lead, no number to text, or no check at all: never a text.
    expect(textPlan({ ...lead, text: { status: "call_only", reason: "Kim unsubscribed from your texts." } })).toBeNull();
    expect(textPlan({ ...lead, text: { status: "no_phone" } })).toBeNull();
    expect(textPlan({ ...lead, text: undefined })).toBeNull();
    expect(textPlan({ ...lead, phone: null })).toBeNull();
  });

  it("end to end: an opted-out new lead has no Text button, from a fresh or an old cached payload", () => {
    const clients = [{
      id: "c3", name: "Kim Fox", status: "boarding", last_contact_at: null,
      created_at: "2026-10-19T11:00:00Z", archived_at: null, phone: "5065550133",
    }];
    const fresh = buildNextUp(nextUpInput(sources({
      clients,
      payload: payload({ new_leads: [{ client_id: "c3", text: { status: "call_only", reason: "Kim unsubscribed from your texts." } }] }),
    }), { today: TODAY, band: "morning" }, NOW));
    expect(cardActions(fresh.stack[0])).toEqual(["call", "later"]);
    expect(textPlan(fresh.stack[0])).toBeNull();

    // A payload cached before new_leads existed: the lead is call only.
    const { new_leads: _gone, version: _v, ...older } = payload();
    const old = buildNextUp(nextUpInput(sources({ clients, payload: older as NextUpPayload }), { today: TODAY, band: "morning" }, NOW));
    expect(old.stack[0].kind).toBe("new_lead");
    expect(cardActions(old.stack[0])).toEqual(["call", "later"]);
    expect(textPlan(old.stack[0])).toBeNull();
  });

  it("never texts a call-only client, one with no number, a card back from Later, or any other card", () => {
    expect(textPlan(handful({ text: { status: "call_only", reason: "Opted out of texts." } }))).toBeNull();
    expect(textPlan(handful({ text: { status: "no_phone" } }))).toBeNull();
    expect(textPlan(handful({ text: undefined, occurrence: undefined, detail: { returning: true } }))).toBeNull();
    expect(textPlan(handful({ phone: null }))).toBeNull();
    expect(textPlan(handful({ kind: "schedule" }))).toBeNull();
  });
});
