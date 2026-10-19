import { describe, expect, it } from "vitest";
import {
  ALWAYS_ON_TOP,
  BAND_KINDS,
  SECTION_ORDER,
  STACK_LIMIT,
  buildNextUp,
  cardActions,
  messagesReadyCount,
  type NextUpCard,
  type NextUpInput,
  type NextUpView,
  type SectionKey,
} from "../next-up/build";
import {
  conditionDeadlineDays,
  dealDeadlineDays,
  isDueToday,
  isOverdueTask,
  isPastCloseDate,
  isUncontactedLead,
  type TimeBand,
} from "../next-up/rules";
import type { HandfulItem, NextUpPayload } from "../next-up/types";

/**
 * The phone dashboard's Next up, built from the cached /api/next-up payload
 * and the phone's own rows. Pure: `now`, `today` and the time band come in.
 * Synthetic rows only.
 */

const NOW = new Date("2026-10-19T17:00:00Z"); // Mon Oct 19 2026, 14:00 ADT
const TODAY = "2026-10-19";
const YESTERDAY = "2026-10-18";
const TOMORROW = "2026-10-20";
const at = (iso: string) => new Date(iso);
const hoursAgo = (h: number, from: Date = NOW) => new Date(from.getTime() - h * 3_600_000).toISOString();

type ClientRow = NextUpInput["clients"][number];
type TaskRow = NextUpInput["tasks"][number];

function client(id: string, name: string, over: Partial<ClientRow> = {}): ClientRow {
  return {
    id, name, status: "cruising",
    last_contact_at: "2026-01-10T12:00:00Z", created_at: "2024-01-01T12:00:00Z",
    archived_at: null, phone: "506-555-0101",
    ...over,
  };
}

/** A Boarding client never contacted, added `h` hours before NOW. */
function lead(id: string, name: string, h: number, over: Partial<ClientRow> = {}): ClientRow {
  return client(id, name, { status: "boarding", last_contact_at: null, created_at: hoursAgo(h), ...over });
}

function task(id: string, due_date: string, over: Partial<TaskRow> = {}): TaskRow {
  return { id, title: `Task ${id}`, due_date, completed_at: null, client_id: null, ...over };
}

function item(client_id: string, client_name: string, over: Partial<HandfulItem> = {}): HandfulItem {
  return {
    client_id, client_name,
    opportunity_type: "idle_client", trigger_date: "2026-10-01",
    label: `${client_name.split(" ")[0]} · no contact in 14 months`, why_now: "It's been over a year.",
    contact_channel: "call", phone: "506-555-0102", text: { status: "draftable" },
    ...over,
  };
}

function payload(over: Partial<NextUpPayload> = {}): NextUpPayload {
  return {
    day: TODAY, target: 5, done_today: 0, generated_at: hoursAgo(1),
    handful: [], snoozed: [],
    urgent: { new_leads: 0, overdue_tasks: 0, deal_deadlines: 0 },
    ...over,
  };
}

function input(over: Partial<NextUpInput> = {}): NextUpInput {
  return {
    now: NOW, today: TODAY, band: "midday",
    clients: [], tasks: [], pipeline: [], clientRecords: [],
    undatedReceipts: 0, outreachReady: [], payload: null, schedule: [],
    tripsLoggedToday: 0, briefingCount: 0,
    localSnoozes: {}, voiceNoteDoneOn: null,
    ...over,
  };
}

const kinds = (v: NextUpView) => v.stack.map((c) => c.kind);
const row = (v: NextUpView, s: SectionKey) => v.alsoWaiting.find((r) => r.section === s);
const card = (v: NextUpView, key: string): NextUpCard => {
  const found = v.stack.find((c) => c.key === key);
  if (!found) throw new Error(`${key} not on the stack: ${v.stack.map((c) => c.key).join(", ")}`);
  return found;
};

describe("constants", () => {
  it("are the plan's values", () => {
    expect(STACK_LIMIT).toBe(7);
    expect(ALWAYS_ON_TOP).toEqual(["new_lead", "deal_deadline", "overdue_tasks"]);
    expect(BAND_KINDS).toEqual({
      morning: ["briefing", "schedule", "tasks_today"],
      midday:  ["handful_client", "messages_ready"],
      evening: ["voice_note", "undated_receipts", "trips"],
    });
    expect(SECTION_ORDER).toEqual(["checklist", "new_leads", "deals", "handful", "messages", "receipts"]);
  });
});

describe("buildNextUp: the stack by time of day", () => {
  /** Something for every band, nothing always on top. */
  const day = (over: Partial<NextUpInput> = {}) => input({
    clients: [client("c-1", "Riley Stone"), client("c-2", "Dana Fox"), client("c-show", "Sam Reed")],
    briefingCount: 3,
    schedule: [
      { kind: "showing", client_id: "c-show", date: TODAY },
      { kind: "appointment", client_id: null, date: TODAY },
      { kind: "showing", client_id: "c-show", date: TOMORROW },
    ],
    tasks: [task("t-1", TODAY), task("t-2", TODAY), task("t-later", TOMORROW)],
    payload: payload({ handful: [item("c-1", "Riley Stone"), item("c-2", "Dana Fox")] }),
    outreachReady: [{ client_id: "c-other", channel: "email" }, { client_id: "c-other2", channel: "sms" }],
    undatedReceipts: 3,
    ...over,
  });

  it("morning shows briefing, schedule, tasks due today; midday shows the handful and messages; evening shows the wrap-up", () => {
    const morning = buildNextUp(day({ band: "morning" }));
    expect(kinds(morning)).toEqual(["briefing", "schedule", "tasks_today"]);
    expect(card(morning, `briefing:${TODAY}`).count).toBe(3);
    expect(card(morning, `schedule:${TODAY}`).detail).toMatchObject({ showings: 1, appointments: 1 });
    expect(card(morning, `tasks_today:${TODAY}`)).toMatchObject({ count: 2, itemIds: ["t-1", "t-2"] });

    const midday = buildNextUp(day({ band: "midday" }));
    expect(kinds(midday)).toEqual(["handful_client", "handful_client", "messages_ready"]);
    expect(card(midday, "handful_client:c-1")).toMatchObject({
      clientId: "c-1", clientName: "Riley Stone", phone: "506-555-0102", itemIds: ["c-1"],
      detail: { label: "Riley · no contact in 14 months", whyNow: "It's been over a year." },
      text: { status: "draftable" }, occurrence: { opportunity_type: "idle_client", trigger_date: "2026-10-01" },
    });
    expect(card(midday, `messages_ready:${TODAY}`).count).toBe(2);

    const evening = buildNextUp(day({ band: "evening" }));
    expect(kinds(evening)).toEqual(["voice_note", "undated_receipts", "trips"]);
    expect(card(evening, `undated_receipts:${TODAY}`).count).toBe(3);
  });

  it("a card is made only when there's something for it", () => {
    const quiet = { briefingCount: 0, schedule: [], tasks: [], payload: null, outreachReady: [], undatedReceipts: 0 };
    for (const band of ["morning", "midday", "evening"] as TimeBand[]) {
      expect(buildNextUp(day({ band, ...quiet })).stack).toEqual([]);
    }
    // Voice note done today, a trip already logged: only the receipts remain.
    expect(kinds(buildNextUp(day({ band: "evening", voiceNoteDoneOn: TODAY, tripsLoggedToday: 1 }))))
      .toEqual(["undated_receipts"]);
    // Yesterday's voice note doesn't cover today.
    expect(kinds(buildNextUp(day({ band: "evening", voiceNoteDoneOn: YESTERDAY, tripsLoggedToday: 1 }))))
      .toEqual(["voice_note", "undated_receipts"]);
    // No showing or appointment today (tomorrow's doesn't count): no voice note, no trips.
    const tomorrowOnly = day({ band: "evening", schedule: [{ kind: "showing", client_id: null, date: TOMORROW }] });
    expect(kinds(buildNextUp(tomorrowOnly))).toEqual(["undated_receipts"]);
    expect(kinds(buildNextUp({ ...tomorrowOnly, band: "morning" }))).toEqual(["briefing", "tasks_today"]);
  });

  it("the order comes from ALWAYS_ON_TOP and BAND_KINDS: changing them changes the stack", () => {
    const busy = (band: TimeBand) => day({
      band,
      clients: [lead("l-1", "Lia Lead", 2), client("c-1", "Riley Stone"), client("c-show", "Sam Reed")],
      pipeline: [{ id: "d-1", address: "1 A St", client_name: null, expected_close_date: "2026-10-22" }],
      tasks: [task("t-o", "2026-10-10"), task("t-1", TODAY)],
      payload: payload({ handful: [item("c-1", "Riley Stone")] }),
    });
    const kindOrder = (v: NextUpView) => [...new Set(kinds(v))];
    for (const band of ["morning", "midday", "evening"] as TimeBand[]) {
      expect(kindOrder(buildNextUp(busy(band)))).toEqual([...ALWAYS_ON_TOP, ...BAND_KINDS[band]]);
    }

    // Reorder the constants in place (restored after): the stack follows.
    const top = ALWAYS_ON_TOP as NextUpCard["kind"][];
    const midday = BAND_KINDS.midday as NextUpCard["kind"][];
    top.reverse();
    midday.reverse();
    try {
      expect(kindOrder(buildNextUp(busy("midday"))))
        .toEqual(["overdue_tasks", "deal_deadline", "new_lead", "messages_ready", "handful_client"]);
    } finally {
      top.reverse();
      midday.reverse();
    }
    expect(ALWAYS_ON_TOP).toEqual(["new_lead", "deal_deadline", "overdue_tasks"]);
  });
});

describe("buildNextUp: always on top", () => {
  const urgent = (band: TimeBand) => input({
    band,
    clients: [
      lead("lead-old", "Olive Old", 10),
      lead("lead-new", "Nina New", 2),
      client("c-cond", "Carl Cond"),
    ],
    pipeline: [
      { id: "deal-5", address: "12 Elm St", client_name: "Pat Buyer", expected_close_date: "2026-10-24" },
      { id: "deal-far", address: "9 Oak St", client_name: null, expected_close_date: "2026-10-30" },
    ],
    clientRecords: [
      { id: "rec-2", client_id: "c-cond", address: "4 Pine Ave", condition_date: "2026-10-21", condition_status: "pending" },
      { id: "rec-firm", client_id: "c-cond", address: "4 Pine Ave", condition_date: "2026-10-20", condition_status: "firmed" },
    ],
    tasks: [task("t-new", "2026-10-17"), task("t-old", "2026-10-02", { title: "Send the CMA" })],
    briefingCount: 1,
    outreachReady: [{ client_id: "c-x", channel: "email" }],
    undatedReceipts: 1,
  });

  it("always-on-top items lead in every band", () => {
    const band: Record<TimeBand, string> = { morning: "briefing", midday: "messages_ready", evening: "undated_receipts" };
    for (const b of ["morning", "midday", "evening"] as TimeBand[]) {
      const v = buildNextUp(urgent(b));
      expect(v.stack.map((c) => c.key)).toEqual([
        "new_lead:lead-new",
        "new_lead:lead-old",
        "deal_deadline:rec-2",
        "deal_deadline:deal-5",
        `overdue_tasks:${TODAY}`,
        `${band[b]}:${TODAY}`,
      ]);
    }

    const v = buildNextUp(urgent("midday"));
    expect(card(v, "new_lead:lead-new")).toMatchObject({
      clientId: "lead-new", clientName: "Nina New", phone: "506-555-0101", count: 1, itemIds: ["lead-new"],
    });
    expect(card(v, "deal_deadline:rec-2")).toMatchObject({
      clientId: "c-cond", clientName: "Carl Cond", itemIds: ["rec-2"],
      detail: { address: "4 Pine Ave", days: 2, label: "conditions" },
    });
    expect(card(v, "deal_deadline:deal-5")).toMatchObject({
      clientId: null, clientName: "Pat Buyer", itemIds: ["deal-5"],
      detail: { address: "12 Elm St", days: 5, label: "close" },
    });
    // One overdue card, oldest first.
    expect(card(v, `overdue_tasks:${TODAY}`)).toMatchObject({
      clientId: null, count: 2, itemIds: ["t-old", "t-new"],
      detail: { title: "Send the CMA", due: "2026-10-02", days: 17 },
    });
  });

  it("a 47-hour lead is a card, a 49-hour lead is only in the New leads row", () => {
    const v = buildNextUp(input({
      clients: [
        lead("lead-47", "Ava Recent", 47),
        lead("lead-49", "Ben Earlier", 49),
        lead("lead-called", "Cal Called", 3, { last_contact_at: hoursAgo(1) }),
        lead("lead-gone", "Gus Gone", 3, { archived_at: hoursAgo(1) }),
      ],
    }));
    expect(v.stack.map((c) => c.key)).toEqual(["new_lead:lead-47"]);
    expect(row(v, "new_leads")).toMatchObject({ count: 1, firstName: "Ben" });
  });

  it("deal deadlines run from today to 7 days out; a passed close date is in the Deals row", () => {
    const v = buildNextUp(input({
      pipeline: [
        { id: "d-today", address: "1 A St", client_name: null, expected_close_date: TODAY },
        { id: "d-7", address: "7 G St", client_name: null, expected_close_date: "2026-10-26" },
        { id: "d-8", address: "8 H St", client_name: null, expected_close_date: "2026-10-27" },
        { id: "d-past", address: "0 Z St", client_name: "Pam Past", expected_close_date: "2026-10-16" },
        { id: "d-undated", address: null, client_name: null, expected_close_date: null },
      ],
      clientRecords: [
        { id: "r-collapsed", client_id: null, address: null, condition_date: "2026-10-20", condition_status: "collapsed" },
        { id: "r-waived", client_id: null, address: null, condition_date: "2026-10-20", condition_status: "waived" },
        { id: "r-null-status", client_id: null, address: "3 C St", condition_date: "2026-10-22", condition_status: null },
      ],
    }));
    expect(v.stack.map((c) => [c.key, c.detail.days])).toEqual([
      ["deal_deadline:d-today", 0],
      ["deal_deadline:r-null-status", 3],
      ["deal_deadline:d-7", 7],
    ]);
    // Days run from today to the date: a close date 3 days ago is -3.
    expect(row(v, "deals")).toMatchObject({ count: 1, firstName: "Pam", days: -3, swipeTaskId: null });
  });
});

describe("buildNextUp: one client, one card", () => {
  it("one client, one card: lead + handful + client task", () => {
    const v = buildNextUp(input({
      clients: [lead("x", "Xena Lead", 3), client("y", "Yuri Pick")],
      tasks: [task("t-x", "2026-10-15", { client_id: "x" })],
      payload: payload({ handful: [item("x", "Xena Lead"), item("y", "Yuri Pick")] }),
    }));
    // X has the lead card only; her handful pick merges into it.
    expect(v.stack.filter((c) => c.clientId === "x")).toHaveLength(1);
    expect(v.stack.map((c) => c.key)).toEqual(["new_lead:x", "handful_client:y"]);
    expect(card(v, "new_lead:x").itemIds).toEqual(["x"]);
    // Her overdue task can't be done from a lead card: it waits in the Checklist row.
    expect(v.alsoWaiting).toEqual([{ section: "checklist", count: 1, swipeTaskId: "t-x", firstName: "Xena", days: 4 }]);
  });

  // A dropped card's item is either on a card that can act on it or in its own row.
  it("a schedule card doesn't take the client's task due today: it waits in the Checklist row", () => {
    const v = buildNextUp(input({
      band: "morning",
      clients: [client("x", "Xan Seller")],
      schedule: [{ kind: "showing", client_id: "x", date: TODAY }],
      tasks: [task("t-x", TODAY, { client_id: "x" })],
    }));
    expect(v.stack.map((c) => c.key)).toEqual([`schedule:${TODAY}`]);
    expect(card(v, `schedule:${TODAY}`).itemIds).toEqual([]);
    expect(row(v, "checklist")).toMatchObject({ count: 1, swipeTaskId: "t-x" });
  });

  it("a deal deadline card doesn't take the client's overdue task: it waits in the Checklist row", () => {
    const v = buildNextUp(input({
      clients: [client("x", "Xan Buyer")],
      clientRecords: [{ id: "r-x", client_id: "x", address: "1 X St", condition_date: "2026-10-21", condition_status: "pending" }],
      tasks: [task("t-x", "2026-10-15", { client_id: "x" })],
    }));
    expect(v.stack.map((c) => c.key)).toEqual(["deal_deadline:r-x"]);
    expect(card(v, "deal_deadline:r-x").itemIds).toEqual(["r-x"]);
    expect(row(v, "checklist")).toMatchObject({ count: 1, swipeTaskId: "t-x" });
  });

  it("an overdue card doesn't take the client's handful pick: it waits in the handful row", () => {
    const v = buildNextUp(input({
      clients: [client("x", "Xan Pick")],
      tasks: [task("t-x", "2026-10-15", { client_id: "x" })],
      payload: payload({ handful: [item("x", "Xan Pick")] }),
    }));
    expect(v.stack.map((c) => c.key)).toEqual([`overdue_tasks:${TODAY}`]);
    expect(card(v, `overdue_tasks:${TODAY}`).itemIds).toEqual(["t-x"]);
    expect(row(v, "handful")).toMatchObject({ count: 1, firstName: "Xan" });
  });

  it("an overdue card over several clients' tasks has no client and stays", () => {
    const v = buildNextUp(input({
      clients: [lead("x", "Xena Lead", 3), client("z", "Zoe Other")],
      tasks: [task("t-x", "2026-10-15", { client_id: "x" }), task("t-z", "2026-10-16", { client_id: "z" })],
    }));
    expect(v.stack.map((c) => c.key)).toEqual(["new_lead:x", `overdue_tasks:${TODAY}`]);
    expect(card(v, `overdue_tasks:${TODAY}`)).toMatchObject({ clientId: null, count: 2, itemIds: ["t-x", "t-z"] });
    expect(v.alsoWaiting).toEqual([]);
  });

  it("an overdue card whose tasks are all one client's names them", () => {
    const v = buildNextUp(input({
      clients: [client("z", "Zoe Other", { phone: "506-555-0177" })],
      tasks: [task("t-z1", "2026-10-15", { client_id: "z" }), task("t-z2", "2026-10-16", { client_id: "z" })],
    }));
    expect(card(v, `overdue_tasks:${TODAY}`)).toMatchObject({ clientId: "z", clientName: "Zoe Other", phone: "506-555-0177" });
  });

  it("a deal deadline whose client already has a card waits in the Deals row", () => {
    const v = buildNextUp(input({
      clients: [lead("x", "Xena Lead", 3), client("y", "Yan Two")],
      clientRecords: [
        { id: "r-x", client_id: "x", address: "1 X St", condition_date: "2026-10-21", condition_status: "pending" },
        { id: "r-y1", client_id: "y", address: "2 Y St", condition_date: "2026-10-22", condition_status: "pending" },
        { id: "r-y2", client_id: "y", address: "3 Y St", condition_date: "2026-10-24", condition_status: "pending" },
      ],
    }));
    // X's lead card wins; Y's sooner deadline is Y's card.
    expect(v.stack.map((c) => c.key)).toEqual(["new_lead:x", "deal_deadline:r-y1"]);
    // Neither dropped deadline rides on a card the client's card doesn't show.
    expect(card(v, "new_lead:x").itemIds).toEqual(["x"]);
    expect(card(v, "deal_deadline:r-y1").itemIds).toEqual(["r-y1"]);
    // Both wait in the Deals row, so nothing waiting leaves the dashboard.
    expect(row(v, "deals")).toMatchObject({ count: 2, swipeTaskId: null });
  });
});

describe("buildNextUp: rows", () => {
  /** Every section with items, some on the stack and some not. */
  function busy(band: TimeBand, over: Partial<NextUpInput> = {}): NextUpInput {
    return input({
      band,
      clients: [
        lead("lead-1", "Ann Lead", 5),
        lead("lead-2", "Bo Lead", 30),
        lead("lead-old", "Cy Lead", 72),
        lead("h-lead", "Dee Both", 80),            // an older lead who is also a handful pick
        client("h-1", "Eve Pick"), client("h-2", "Fay Pick"), client("h-3", "Gil Pick"),
        client("h-arch", "Hal Gone", { archived_at: hoursAgo(2) }),
        client("h-back", "Ike Back"), client("h-held", "Jo Held"),
      ],
      tasks: [
        task("t-o1", "2026-10-12"), task("t-o2", "2026-10-18", { client_id: "h-1" }),
        task("t-d1", TODAY), task("t-d2", TODAY, { client_id: "lead-1" }),
        task("t-done", "2026-10-10", { completed_at: hoursAgo(5) }), task("t-future", TOMORROW),
      ],
      pipeline: [
        { id: "p-past1", address: "1 Past St", client_name: null, expected_close_date: "2026-10-01" },
        { id: "p-past2", address: "2 Past St", client_name: null, expected_close_date: "2026-10-17" },
        { id: "p-soon", address: "3 Soon St", client_name: null, expected_close_date: "2026-10-22" },
      ],
      // Ann (lead-1) already has her lead card, so this deadline waits in the Deals row.
      clientRecords: [
        { id: "r-lead", client_id: "lead-1", address: "5 Lead Ln", condition_date: "2026-10-21", condition_status: "pending" },
      ],
      payload: payload({
        done_today: 1,
        handful: [item("h-lead", "Dee Both"), item("h-1", "Eve Pick"), item("h-2", "Fay Pick"), item("h-3", "Gil Pick"), item("h-arch", "Hal Gone")],
        snoozed: [
          { client_id: "h-back", client_name: "Ike Back", until: hoursAgo(1), phone: null },
          { client_id: "h-held", client_name: "Jo Held", until: "2026-10-19T22:00:00Z", phone: null },
        ],
      }),
      outreachReady: [
        { client_id: "h-1", channel: "sms" }, { client_id: "h-1", channel: "email" },
        { client_id: "o-1", channel: "sms" }, { client_id: "o-2", channel: "email" },
      ],
      schedule: [{ kind: "showing", client_id: "h-2", date: TODAY }],
      undatedReceipts: 4,
      briefingCount: 2,
      ...over,
    });
  }

  /** Each section's items, by the rules, independent of the stack. */
  function sectionTotals(i: NextUpInput) {
    const archived = new Set(i.clients.filter((c) => c.archived_at).map((c) => c.id));
    const handful = [
      ...(i.payload?.handful ?? []).map((h) => h.client_id),
      ...(i.payload?.snoozed ?? []).filter((s) => Date.parse(s.until) <= i.now.getTime()).map((s) => s.client_id),
    ].filter((id) => !archived.has(id));
    const handfulIds = new Set([...(i.payload?.handful ?? []), ...(i.payload?.snoozed ?? [])].map((h) => h.client_id));
    return {
      checklist: i.tasks.filter((t) => isOverdueTask(t, i.today) || isDueToday(t, i.today)).map((t) => t.id),
      new_leads: i.clients.filter((c) => isUncontactedLead(c)).map((c) => c.id),
      deals: [
        ...i.pipeline.filter((d) => isPastCloseDate(d, i.today) || dealDeadlineDays(d, i.today) !== null).map((d) => d.id),
        ...i.clientRecords.filter((r) => conditionDeadlineDays(r, i.today) !== null).map((r) => r.id),
      ],
      handful,
      messages:  messagesReadyCount(i.outreachReady, handfulIds),
      receipts:  i.undatedReceipts,
    };
  }

  function expectNoDoubleCount(i: NextUpInput) {
    const v = buildNextUp(i);
    const totals = sectionTotals(i);
    const covered = new Set(v.stack.flatMap((c) => c.itemIds));
    const onStack = (kind: NextUpCard["kind"]) => v.stack.find((c) => c.kind === kind)?.count ?? 0;
    const coveredCount: Record<SectionKey, number> = {
      checklist: totals.checklist.filter((id) => covered.has(id)).length,
      new_leads: totals.new_leads.filter((id) => covered.has(id)).length,
      deals:     totals.deals.filter((id) => covered.has(id)).length,
      handful:   totals.handful.filter((id) => covered.has(id)).length,
      messages:  onStack("messages_ready"),
      receipts:  onStack("undated_receipts"),
    };
    const total: Record<SectionKey, number> = {
      checklist: totals.checklist.length, new_leads: totals.new_leads.length, deals: totals.deals.length,
      handful: totals.handful.length, messages: totals.messages, receipts: totals.receipts,
    };
    for (const s of SECTION_ORDER) {
      expect({ s, sum: (row(v, s)?.count ?? 0) + coveredCount[s] }).toEqual({ s, sum: total[s] });
    }
    // Rows come in SECTION_ORDER and none is empty.
    expect(v.alsoWaiting.map((r) => r.section)).toEqual(SECTION_ORDER.filter((s) => v.alsoWaiting.some((r) => r.section === s)));
    expect(v.alsoWaiting.every((r) => r.count > 0)).toBe(true);
    return v;
  }

  it("nothing on the stack is counted in a row", () => {
    for (const band of ["morning", "midday", "evening"] as TimeBand[]) {
      expectNoDoubleCount(busy(band));
      expectNoDoubleCount(busy(band, { payload: payload({ ...busy(band).payload!, done_today: 5 }) }));
      expectNoDoubleCount(busy(band, { localSnoozes: { [`overdue_tasks:${TODAY}`]: "2026-10-19T23:00:00Z", "new_lead:lead-1": "2026-10-19T23:00:00Z" } }));
    }

    const midday = expectNoDoubleCount(busy("midday"));
    // The overdue card covers both overdue tasks; the two due today wait in the row.
    expect(row(midday, "checklist")).toMatchObject({ count: 2, swipeTaskId: null });
    // Cy is too old for a card; Dee is covered by her handful card.
    expect(row(midday, "new_leads")).toMatchObject({ count: 1, firstName: "Cy" });
    // Two passed close dates, and Ann's deadline (her lead card came first).
    expect(row(midday, "deals")).toMatchObject({ count: 3 });
    // Stack: the two new leads, the deadline, the overdue card, then the handful,
    // the client back from Later first, cut at 7.
    expect(midday.stack.map((c) => c.key)).toEqual([
      "new_lead:lead-1", "new_lead:lead-2", "deal_deadline:p-soon", `overdue_tasks:${TODAY}`,
      "handful_client:h-back", "handful_client:h-lead", "handful_client:h-1",
    ]);
    // h-2 and h-3 overflow into the handful row; Hal is archived and Jo is still on Later.
    expect(row(midday, "handful")).toMatchObject({ count: 2 });
    // h-1's text is a handful draft; h-1's email, o-1 and o-2 are ready.
    expect(row(midday, "messages")).toMatchObject({ count: 3 });
    expect(row(midday, "receipts")).toMatchObject({ count: 4 });
  });

  it("swipe only when the checklist row holds one task", () => {
    const one = buildNextUp(input({ tasks: [task("t-1", TODAY)] }));
    expect(one.alsoWaiting).toEqual([{ section: "checklist", count: 1, swipeTaskId: "t-1", days: 0 }]);

    const two = buildNextUp(input({ tasks: [task("t-1", TODAY), task("t-2", TODAY)] }));
    expect(row(two, "checklist")).toMatchObject({ count: 2, swipeTaskId: null });

    // The overdue card covers the overdue ones; the row holds the one due today.
    const mixed = buildNextUp(input({ tasks: [task("t-o", "2026-10-10"), task("t-o2", "2026-10-11"), task("t-d", TODAY)] }));
    expect(row(mixed, "checklist")).toMatchObject({ count: 1, swipeTaskId: "t-d" });

    // In the morning the tasks-today card covers it: no row.
    expect(row(buildNextUp(input({ band: "morning", tasks: [task("t-d", TODAY)] })), "checklist")).toBeUndefined();

    // No other row ever offers a swipe.
    const others = buildNextUp(input({
      clients: [lead("l-old", "Lu Old", 60)],
      pipeline: [{ id: "p-past", address: null, client_name: null, expected_close_date: "2026-10-01" }],
      undatedReceipts: 1,
    }));
    expect(others.alsoWaiting.map((r) => [r.section, r.swipeTaskId])).toEqual([
      ["new_leads", null], ["deals", null], ["receipts", null],
    ]);
  });

  it("a row holding one item names it", () => {
    const v = buildNextUp(input({
      band: "morning",
      clients: [lead("l-old", "Lu Old", 60), client("c-t", "Tia Task")],
      tasks: [task("t-1", "2026-10-15", { client_id: "c-t" })],
      localSnoozes: { [`overdue_tasks:${TODAY}`]: "2026-10-19T23:00:00Z" },
      payload: payload({ handful: [item("h-1", "Mo Pick")] }),
    }));
    expect(row(v, "checklist")).toEqual({ section: "checklist", count: 1, swipeTaskId: "t-1", firstName: "Tia", days: 4 });
    expect(row(v, "new_leads")).toEqual({ section: "new_leads", count: 1, swipeTaskId: null, firstName: "Lu" });
    expect(row(v, "handful")).toEqual({ section: "handful", count: 1, swipeTaskId: null, firstName: "Mo" });
  });

  it("STACK_LIMIT caps the stack and overflow stays in rows", () => {
    const leads = Array.from({ length: 9 }, (_, n) => lead(`lead-${n}`, `Lead ${n}`, n + 1));
    const v = buildNextUp(input({
      clients: leads,
      tasks: [task("t-o1", "2026-10-10"), task("t-o2", "2026-10-11")],
      pipeline: [{ id: "p-soon", address: "3 Soon St", client_name: "Pia Deal", expected_close_date: "2026-10-22" }],
      outreachReady: [{ client_id: "c-x", channel: "sms" }],
    }));
    expect(v.stack).toHaveLength(STACK_LIMIT);
    expect(v.stack.map((c) => c.key)).toEqual(leads.slice(0, 7).map((l) => `new_lead:${l.id}`));
    expect(row(v, "new_leads")).toMatchObject({ count: 2 });
    // The deadline cut by the limit waits in the Deals row.
    expect(row(v, "deals")).toEqual({ section: "deals", count: 1, swipeTaskId: null, firstName: "Pia", days: 3 });
    expect(row(v, "checklist")).toMatchObject({ count: 2, swipeTaskId: null });
    expect(row(v, "messages")).toMatchObject({ count: 1 });
  });
});

describe("buildNextUp: the handful", () => {
  const five = [
    item("h-1", "Ann One"), item("h-2", "Bo Two"), item("h-3", "Cy Three"), item("h-4", "Di Four"), item("h-5", "Ed Five"),
  ];

  it("handful cards leave the stack at 5 done; the row keeps the rest", () => {
    const four = buildNextUp(input({ payload: payload({ handful: five.slice(0, 3), done_today: 4 }) }));
    expect(kinds(four)).toEqual(["handful_client", "handful_client", "handful_client"]);
    expect(four.progress).toEqual({ done: 4, target: 5 });

    const done = buildNextUp(input({
      payload: payload({
        handful: five.slice(0, 3), done_today: 5,
        snoozed: [{ client_id: "h-back", client_name: "Back Again", until: hoursAgo(1), phone: "506-555-0190" }],
      }),
      outreachReady: [{ client_id: "o-1", channel: "sms" }],
    }));
    expect(kinds(done)).toEqual(["messages_ready"]);
    expect(done.progress).toEqual({ done: 5, target: 5 });
    expect(row(done, "handful")).toMatchObject({ count: 4 });

    // More done than the target still reads 5 of 5.
    expect(buildNextUp(input({ payload: payload({ handful: five, done_today: 7 }) })).progress).toEqual({ done: 5, target: 5 });
  });

  it("yesterday's payload shows 0 of 5", () => {
    const v = buildNextUp(input({ payload: payload({ day: YESTERDAY, handful: five, done_today: 5 }) }));
    expect(v.progress).toEqual({ done: 0, target: 5 });
    // The handful is sticky: yesterday's picks are today's cards until the refresh.
    expect(kinds(v)).toEqual(Array(5).fill("handful_client"));

    expect(buildNextUp(input({ payload: null })).progress).toBeNull();
  });

  it("a client on Later until 08:00 returns at 08:00 from the cached payload", () => {
    // Cached last night, phone offline: Lou is on Later until 08:00 ADT.
    const cached = payload({
      day: YESTERDAY, done_today: 3, generated_at: "2026-10-18T23:30:00Z",
      handful: [item("h-1", "Ann One")],
      snoozed: [{ client_id: "c-later", client_name: "Lou Later", until: "2026-10-19T11:00:00Z", phone: "506-555-0144" }],
    });
    const openAt = (now: Date, band: TimeBand) => buildNextUp(input({
      now, band, payload: cached,
      clients: [client("h-1", "Ann One"), client("c-later", "Lou Later")],
    }));

    // 07:59: still away, in no card and no row.
    const before = openAt(at("2026-10-19T10:59:00Z"), "morning");
    expect(before.stack).toEqual([]);
    expect(row(before, "handful")).toMatchObject({ count: 1, firstName: "Ann" });
    expect(before.progress).toEqual({ done: 0, target: 5 });

    // 08:00: back in today's handful, with no network.
    const back = openAt(at("2026-10-19T11:00:00Z"), "morning");
    expect(row(back, "handful")).toMatchObject({ count: 2 });

    // At midday Lou is a card again, first, marked as back from Later. No text
    // status came with the hold, so the card offers no Text.
    const noon = openAt(at("2026-10-19T15:00:00Z"), "midday");
    expect(noon.stack.map((c) => c.key)).toEqual(["handful_client:c-later", "handful_client:h-1"]);
    const lou = card(noon, "handful_client:c-later");
    expect(lou).toMatchObject({ clientId: "c-later", clientName: "Lou Later", phone: "506-555-0144", itemIds: ["c-later"] });
    expect(lou.detail.returning).toBe(true);
    expect(lou.text).toBeUndefined();
    expect(cardActions(lou)).toEqual(["call", "later", "dismiss"]);
    expect(noon.progress).toEqual({ done: 0, target: 5 });
  });

  it("a client both picked and on Later is only their Later: hidden while it holds, once when back", () => {
    // A stale payload lists Hy and Bea as picks and on Later.
    const both = payload({
      handful: [item("h-1", "Ann One"), item("h-held", "Hy Held"), item("h-back", "Bea Back")],
      snoozed: [
        { client_id: "h-held", client_name: "Hy Held", until: "2026-10-19T22:00:00Z", phone: null },
        { client_id: "h-back", client_name: "Bea Back", until: hoursAgo(1), phone: "506-555-0150" },
      ],
    });
    const v = buildNextUp(input({ payload: both }));
    expect(v.stack.map((c) => c.key)).toEqual(["handful_client:h-back", "handful_client:h-1"]);
    expect(card(v, "handful_client:h-back").detail.returning).toBe(true);
    expect(v.alsoWaiting).toEqual([]);

    // In the morning they wait in the row: Ann and Bea, once each; Hy is still away.
    expect(row(buildNextUp(input({ band: "morning", payload: both })), "handful")).toMatchObject({ count: 2 });
  });

  it("an archived client from a cached payload is never suggested", () => {
    const v = buildNextUp(input({
      clients: [client("h-1", "Ann One", { archived_at: hoursAgo(1) }), client("h-2", "Bo Two")],
      payload: payload({
        handful: [item("h-1", "Ann One"), item("h-2", "Bo Two")],
        snoozed: [{ client_id: "h-1", client_name: "Ann One", until: hoursAgo(2), phone: null }],
      }),
    }));
    expect(v.stack.map((c) => c.key)).toEqual(["handful_client:h-2"]);
    expect(v.alsoWaiting).toEqual([]);
  });

  it("handful drafts don't count in Messages ready", () => {
    const ready = [
      { client_id: "h-1", channel: "sms" as const },
      { client_id: "h-1", channel: "email" as const },
      { client_id: "h-held", channel: "sms" as const },
      { client_id: "o-1", channel: "sms" as const },
      { client_id: "o-2", channel: "email" as const },
    ];
    expect(messagesReadyCount(ready, new Set(["h-1", "h-held"]))).toBe(3);
    expect(messagesReadyCount(ready, new Set())).toBe(5);
    expect(messagesReadyCount([], new Set(["h-1"]))).toBe(0);

    // In the builder, the handful is today's picks and the clients on Later.
    const p = payload({
      handful: [item("h-1", "Ann One")],
      snoozed: [{ client_id: "h-held", client_name: "Hy Held", until: "2026-10-19T22:00:00Z", phone: null }],
    });
    const midday = buildNextUp(input({ payload: p, outreachReady: ready }));
    expect(card(midday, `messages_ready:${TODAY}`).count).toBe(3);
    const morning = buildNextUp(input({ band: "morning", payload: p, outreachReady: ready }));
    expect(row(morning, "messages")).toMatchObject({ count: 3 });

    // Only handful texts are left out: nothing ready leaves no card and no row.
    const onlyHandful = buildNextUp(input({ payload: p, outreachReady: [ready[0], ready[2]] }));
    expect(kinds(onlyHandful)).toEqual(["handful_client"]);
    expect(row(onlyHandful, "messages")).toBeUndefined();
  });
});

describe("buildNextUp: Later on the phone", () => {
  it("a local snooze hides the card until its time", () => {
    const base = input({
      clients: [lead("x", "Xena Lead", 3)],
      tasks: [task("t-1", "2026-10-15"), task("t-2", "2026-10-16")],
      payload: payload({ handful: [item("x", "Xena Lead"), item("y", "Yuri Pick")] }),
      localSnoozes: {
        [`overdue_tasks:${TODAY}`]: "2026-10-19T18:00:00Z", // 15:00 ADT
        "new_lead:x": "2026-10-19T18:00:00Z",
      },
    });

    // 14:00: both hidden. The overdue tasks wait in the Checklist row; X's
    // handful card stays away with her lead card.
    const v = buildNextUp(base);
    expect(v.stack.map((c) => c.key)).toEqual(["handful_client:y"]);
    expect(row(v, "checklist")).toMatchObject({ count: 2 });
    expect(row(v, "new_leads")).toMatchObject({ count: 1, firstName: "Xena" });

    // 15:00: both back.
    const later = buildNextUp({ ...base, now: at("2026-10-19T18:00:00Z") });
    expect(later.stack.map((c) => c.key)).toEqual(["new_lead:x", `overdue_tasks:${TODAY}`, "handful_client:y"]);

    // Yesterday's snooze whose time has passed doesn't hide today's card.
    const stale = buildNextUp({ ...base, localSnoozes: { [`overdue_tasks:${YESTERDAY}`]: "2026-10-19T11:00:00Z" } });
    expect(kinds(stale)).toContain("overdue_tasks");

    // An unreadable time hides nothing.
    const junk = buildNextUp({ ...base, localSnoozes: { [`overdue_tasks:${TODAY}`]: "soon" } });
    expect(kinds(junk)).toContain("overdue_tasks");
  });

  it("Later \"tomorrow\" chosen at 21:00 hides the day's card until 08:00, past midnight", () => {
    // 21:00 ADT on Oct 18: the overdue card is overdue_tasks:2026-10-18, and
    // "tomorrow" is 08:00 ADT on Oct 19 (11:00 UTC).
    const snoozes = { [`overdue_tasks:${YESTERDAY}`]: "2026-10-19T11:00:00Z" };
    const open = (iso: string) => buildNextUp(input({
      now: at(iso), band: "morning",
      tasks: [task("t-1", "2026-10-15"), task("t-2", "2026-10-16")],
      localSnoozes: snoozes,
    }));
    // The evening it was chosen.
    const evening = buildNextUp(input({
      now: at("2026-10-19T00:30:00Z"), today: YESTERDAY, band: "evening",
      tasks: [task("t-1", "2026-10-15"), task("t-2", "2026-10-16")], localSnoozes: snoozes,
    }));
    expect(kinds(evening)).not.toContain("overdue_tasks");

    // 06:00 on Oct 19: a new day's key, still hidden; the tasks wait in the Checklist row.
    const six = open("2026-10-19T09:00:00Z");
    expect(kinds(six)).not.toContain("overdue_tasks");
    expect(row(six, "checklist")).toMatchObject({ count: 2 });

    // 08:00: back.
    expect(card(open("2026-10-19T11:00:00Z"), `overdue_tasks:${TODAY}`).count).toBe(2);

    // A Later from two days ago never reaches today.
    const old = buildNextUp(input({
      tasks: [task("t-1", "2026-10-15")],
      localSnoozes: { "overdue_tasks:2026-10-17": "2026-10-20T11:00:00Z" },
    }));
    expect(kinds(old)).toContain("overdue_tasks");

    // A card keyed on a client isn't day-keyed: only its own key counts.
    const lead1 = lead("x", "Xena Lead", 3);
    expect(kinds(buildNextUp(input({ clients: [lead1], localSnoozes: { "new_lead:x": "2026-10-20T11:00:00Z" } })))).toEqual([]);
  });
});

describe("buildNextUp: context and all clear", () => {
  it("context: schedule, then waiting, then all clear", () => {
    const schedule = buildNextUp(input({
      tasks: [task("t-1", "2026-10-10")],
      schedule: [
        { kind: "showing", client_id: null, date: TODAY },
        { kind: "showing", client_id: null, date: TODAY },
        { kind: "appointment", client_id: null, date: TODAY },
        { kind: "appointment", client_id: null, date: TOMORROW },
      ],
    }));
    expect(schedule.context).toEqual({ kind: "schedule", showings: 2, appointments: 1 });

    // One card and one row: two things waiting.
    const waiting = buildNextUp(input({
      tasks: [task("t-1", "2026-10-10")],
      undatedReceipts: 2,
      schedule: [{ kind: "showing", client_id: null, date: TOMORROW }],
    }));
    expect(waiting.stack).toHaveLength(1);
    expect(waiting.alsoWaiting).toHaveLength(1);
    expect(waiting.context).toEqual({ kind: "waiting", count: 2 });

    // Only a row (the stack empty) is still waiting.
    expect(buildNextUp(input({ undatedReceipts: 1 })).context).toEqual({ kind: "waiting", count: 1 });

    expect(buildNextUp(input()).context).toEqual({ kind: "all_clear" });
  });

  it("all clear names the next showing, else the next due task", () => {
    const tasks = [
      task("t-done", TOMORROW, { completed_at: hoursAgo(1) }),
      task("t-3", "2026-10-22", { title: "Order sign" }),
      task("t-1", TOMORROW, { title: "Call the inspector" }),
    ];
    // Evening, the voice note recorded and the trip logged: nothing on the stack.
    const quiet = (over: Partial<NextUpInput>) => input({
      band: "evening", voiceNoteDoneOn: TODAY, tripsLoggedToday: 1,
      clients: [client("c-s", "Sky Buyer")], tasks, ...over,
    });

    const showing = buildNextUp(quiet({
      schedule: [
        { kind: "showing", client_id: "c-s", date: TODAY },             // today's has been
        { kind: "appointment", client_id: null, date: "2026-10-23" },
        { kind: "showing", client_id: "c-s", date: "2026-10-21" },
      ],
    }));
    expect(showing.stack).toEqual([]);
    expect(showing.allClear).toEqual({ kind: "showing", date: "2026-10-21", clientName: "Sky Buyer" });

    const appointment = buildNextUp(quiet({ schedule: [{ kind: "appointment", client_id: null, date: "2026-10-23" }] }));
    expect(appointment.allClear).toEqual({ kind: "appointment", date: "2026-10-23", clientName: null });

    expect(buildNextUp(quiet({ schedule: [] })).allClear)
      .toEqual({ kind: "task", date: TOMORROW, title: "Call the inspector" });

    // A task due today is still to do.
    expect(buildNextUp(quiet({ tasks: [...tasks, task("t-today", TODAY, { title: "Book photos" })] })).allClear)
      .toEqual({ kind: "task", date: TODAY, title: "Book photos" });

    // An overdue task put on Later isn't what's next.
    expect(buildNextUp(quiet({
      tasks: [...tasks, task("t-late", "2026-10-12", { title: "Overdue" })],
      localSnoozes: { [`overdue_tasks:${TODAY}`]: "2026-10-20T11:00:00Z" },
    })).allClear).toEqual({ kind: "task", date: TOMORROW, title: "Call the inspector" });

    // Nothing ahead: null (the card says nothing else is scheduled).
    expect(buildNextUp(quiet({ tasks: [] })).allClear).toBeNull();

    // Not all clear while the stack has a card.
    expect(buildNextUp(quiet({ undatedReceipts: 1 })).allClear).toBeNull();
  });
});

describe("cardActions", () => {
  const base: NextUpCard = {
    key: "k", kind: "briefing", clientId: null, clientName: null, phone: null, count: 1, itemIds: [], detail: {},
  };
  const of = (over: Partial<NextUpCard>) => cardActions({ ...base, ...over });

  it("call-only and no-phone handful cards have no text action", () => {
    const h = (text: NextUpCard["text"], phone: string | null) => of({ kind: "handful_client", clientId: "c", phone, text });
    expect(h({ status: "ready", queue_id: "q-1", body: "Hi" }, "506-555-0101")).toEqual(["call", "text", "later", "dismiss"]);
    expect(h({ status: "draftable" }, "506-555-0101")).toEqual(["call", "text", "later", "dismiss"]);
    expect(h({ status: "call_only", reason: "SMS opt-out" }, "506-555-0101")).toEqual(["call", "later", "dismiss"]);
    // Too short to text, still there to call.
    expect(h({ status: "no_phone" }, "555-0101")).toEqual(["call", "later", "dismiss"]);
    expect(h({ status: "no_phone" }, null)).toEqual(["open_client", "later", "dismiss"]);
    expect(h({ status: "call_only", reason: "Lapsed" }, "  ")).toEqual(["open_client", "later", "dismiss"]);
    expect(h(undefined, null)).toEqual(["open_client", "later", "dismiss"]);
    // A text status with no number on the card: nothing to call or text from here.
    expect(h({ status: "draftable" }, null)).toEqual(["open_client", "later", "dismiss"]);
  });

  it("each card's buttons suit its job", () => {
    expect(of({ kind: "new_lead", phone: "506-555-0101" })).toEqual(["call", "text", "later"]);
    expect(of({ kind: "new_lead", phone: null })).toEqual(["open_client", "later"]);
    // Later on a task card is a phone-only snooze (correction 15).
    expect(of({ kind: "overdue_tasks" })).toEqual(["open_checklist", "mark_one_done", "later"]);
    expect(of({ kind: "tasks_today" })).toEqual(["open_checklist", "mark_one_done", "later"]);
    expect(of({ kind: "deal_deadline" })).toEqual(["open_deals", "later"]);
    expect(of({ kind: "briefing" })).toEqual(["open_briefing", "later"]);
    expect(of({ kind: "schedule" })).toEqual(["open_client", "later"]);
    expect(of({ kind: "messages_ready" })).toEqual(["open_messages", "later"]);
    expect(of({ kind: "voice_note" })).toEqual(["record_voice_note", "later"]);
    expect(of({ kind: "undated_receipts" })).toEqual(["open_receipts", "later"]);
    expect(of({ kind: "trips" })).toEqual(["open_mileage", "later"]);
  });
});
