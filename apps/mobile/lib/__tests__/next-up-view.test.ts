/**
 * The dashboard's wiring around buildNextUp (lib/next-up-view.ts): the
 * builder's input from the phone's stores, where buttons and rows open, the
 * greeting's band, when a client back from Later asks the server again, and
 * when the Checklist row's count is red. Every row is synthetic.
 */
import { describe, expect, it } from "vitest";
import { buildNextUp, type NextUpAction } from "@agent-runway/core/lib/next-up/build";
import { timeBand } from "@agent-runway/core/lib/next-up/rules";
import type { NextUpPayload } from "@agent-runway/core/lib/next-up/types";
import {
  ACTION_ROUTES,
  SECTION_ROUTES,
  checklistRowHasOverdue,
  greetingKey,
  nextUpInput,
  snoozeEndedBetween,
  type NextUpSources,
} from "../next-up-view";

const NOW = new Date("2026-10-19T13:00:00Z"); // 10:00 Atlantic
const TODAY = "2026-10-19";

const payload = (over: Partial<NextUpPayload> = {}): NextUpPayload => ({
  day: TODAY, target: 5, done_today: 2, generated_at: "2026-10-19T12:00:00Z",
  handful: [{
    client_id: "c9", client_name: "Sam Lee", opportunity_type: "birthday", trigger_date: TODAY,
    label: "Birthday today", why_now: "Their birthday is today.", contact_channel: "call", phone: "5065550101",
    text: { status: "draftable" },
  }],
  snoozed: [],
  urgent: { new_leads: 0, overdue_tasks: 1, deal_deadlines: 0 },
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
  it("each row opens its section", () => {
    expect(SECTION_ROUTES).toEqual({
      checklist: "/profile/checklist",
      new_leads: "/clients",
      deals: "/deals",
      handful: "/profile/outreach",
      messages: "/profile/outreach?tab=texts",
      receipts: "/profile/expenses",
    });
  });

  it("each open button opens its screen; Open client is routed with the client", () => {
    expect(ACTION_ROUTES).toEqual({
      open_checklist: "/profile/checklist",
      open_briefing: "/profile/briefing",
      open_deals: "/deals",
      open_messages: "/profile/outreach?tab=texts",
      open_receipts: "/profile/expenses",
      open_mileage: "/profile/mileage",
    });
    const handledElsewhere: NextUpAction[] = ["call", "text", "later", "dismiss", "mark_one_done", "record_voice_note", "open_client"];
    for (const a of handledElsewhere) expect(ACTION_ROUTES[a]).toBeUndefined();
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
