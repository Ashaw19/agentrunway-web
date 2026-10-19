/**
 * The day's handful (next_up_handful, 00188): Flight Control's picks,
 * pinned per client so an untouched client stays until handled.
 *
 * A pin closes, first match wins, at the time of the event itself:
 *   1 archived   (clients.archived_at)
 *   2 stopped    (a stop row made after the pin)
 *   3 skipped    (a skip row for the client made after the pin)
 *   4 contacted  (last_contact_at or an outreach sent_at after the pin; the later)
 *   5 expired    (not picked and not on Later; now)
 * A pin on Later is never closed and keeps its slot. Closed pins other than
 * expired count as done today. Synthetic rows only.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/api/ai/detect-opportunities/route", () => ({ getTopOpportunities: vi.fn() }));

import { getTopOpportunities } from "@/app/api/ai/detect-opportunities/route";
import type { TopOpportunity } from "@agent-runway/core/types/database";
import type { DismissalRow } from "@agent-runway/core/lib/suggestion-dismissals";
import {
  countDoneToday,
  loadNextUpHandful,
  pinHandledBy,
  planHandfulSync,
  snoozedClientIdsOf,
  type HandfulFacts,
  type HandfulRow,
} from "../next-up-handful";
import { fakeSupabase, type Row, type Write } from "../../ai/__tests__/helpers/fake-supabase";

const USER = "user-1";
const NOW = new Date("2026-10-19T18:00:00Z");     // Mon Oct 19 2026, 15:00 ADT
const DAY_START = new Date("2026-10-19T03:00:00Z"); // Atlantic midnight starting Oct 19
const TODAY_NOON = "2026-10-19T15:00:00Z";
const YESTERDAY = "2026-10-18T15:00:00Z";
const TONIGHT = "2026-10-19T22:00:00Z";           // 19:00 ADT

const pin = (client: string, added_at: string, over: Partial<HandfulRow> = {}): HandfulRow => ({
  id: `pin-${client}`, client_id: client, opportunity_type: "idle_client", trigger_date: "2026-10-01",
  rank: 0, added_at, handled_at: null, handled_how: null, ...over,
});
const pick = (client: string, opportunity_type = "idle_client", trigger_date = "2026-10-01") =>
  ({ client_id: client, opportunity_type, trigger_date });
const facts = (over: Partial<HandfulFacts> = {}): HandfulFacts => ({
  lastContactAt: new Map(), lastSentAt: new Map(), archivedAt: new Map(), dismissals: [], ...over,
});
const dismissal = (client: string, kind: "skip" | "later" | "stop", dismissed_at: string, over: Partial<DismissalRow> = {}): DismissalRow => ({
  client_id: client,
  opportunity_type: kind === "skip" ? "idle_client" : "any",
  trigger_date: kind === "skip" ? "2026-10-01" : "2026-10-19",
  kind,
  until: kind === "skip" ? null : kind === "later" ? TONIGHT : "2027-01-19T04:00:00Z",
  dismissed_at,
  ...over,
});

// ── planHandfulSync ─────────────────────────────────────────────────────────

describe("planHandfulSync", () => {
  it("a contacted pin closes as contacted at the contact time and its slot refills", () => {
    const plan = planHandfulSync([pin("a", "2026-10-19T12:00:00Z")], [pick("b")], new Set(),
      facts({ lastContactAt: new Map([["a", "2026-10-19T15:00:00Z"]]) }), NOW);
    expect(plan.close).toEqual([{ id: "pin-a", client_id: "a", handled_at: "2026-10-19T15:00:00Z", handled_how: "contacted" }]);
    expect(plan.insert.map((r) => r.client_id)).toEqual(["b"]);
  });

  it("a pin on Later stays open and keeps its slot", () => {
    const plan = planHandfulSync([pin("a", "2026-10-19T12:00:00Z")], [pick("b")], new Set(["a"]), facts(), NOW);
    expect(plan.close).toEqual([]);
    expect(plan.insert).toEqual([{ client_id: "b", opportunity_type: "idle_client", trigger_date: "2026-10-01", rank: 1 }]);
  });

  it("a pin on Later stays open even when the client was contacted", () => {
    const plan = planHandfulSync([pin("a", "2026-10-19T12:00:00Z")], [], new Set(["a"]),
      facts({ lastContactAt: new Map([["a", "2026-10-19T15:00:00Z"]]) }), NOW);
    expect(plan.close).toEqual([]);
  });

  it("first match wins: archived, then stopped, then skipped, then contacted", () => {
    const added = "2026-10-19T12:00:00Z";
    const all = facts({
      archivedAt: new Map([["a", "2026-10-19T16:00:00Z"]]),
      dismissals: [dismissal("a", "stop", "2026-10-19T15:30:00Z"), dismissal("a", "skip", "2026-10-19T15:00:00Z")],
      lastContactAt: new Map([["a", "2026-10-19T14:00:00Z"]]),
    });
    const how = (f: HandfulFacts) => planHandfulSync([pin("a", added)], [pick("a")], new Set(), f, NOW).close;
    expect(how(all)).toEqual([{ id: "pin-a", client_id: "a", handled_at: "2026-10-19T16:00:00Z", handled_how: "archived" }]);
    const noArchive = { ...all, archivedAt: new Map([["a", null]]) };
    expect(how(noArchive)).toEqual([{ id: "pin-a", client_id: "a", handled_at: "2026-10-19T15:30:00Z", handled_how: "stopped" }]);
    const noStop = { ...noArchive, dismissals: all.dismissals.filter((d) => d.kind !== "stop") };
    expect(how(noStop)).toEqual([{ id: "pin-a", client_id: "a", handled_at: "2026-10-19T15:00:00Z", handled_how: "skipped" }]);
    const noSkip = { ...noStop, dismissals: [] };
    expect(how(noSkip)).toEqual([{ id: "pin-a", client_id: "a", handled_at: "2026-10-19T14:00:00Z", handled_how: "contacted" }]);
    expect(how(facts())).toEqual([]);
  });

  it("only dismissals made after the pin count, and a Later is not a stop", () => {
    const added = "2026-10-19T12:00:00Z";
    const before = facts({ dismissals: [dismissal("a", "stop", "2026-10-19T11:00:00Z"), dismissal("a", "skip", "2026-10-19T11:59:59Z")] });
    expect(planHandfulSync([pin("a", added)], [pick("a")], new Set(), before, NOW).close).toEqual([]);
    const later = facts({ dismissals: [dismissal("a", "later", "2026-10-19T13:00:00Z")] });
    expect(planHandfulSync([pin("a", added)], [pick("a")], new Set(), later, NOW).close).toEqual([]);
    const other = facts({ dismissals: [dismissal("b", "skip", "2026-10-19T13:00:00Z")] });
    expect(planHandfulSync([pin("a", added)], [pick("a")], new Set(), other, NOW).close).toEqual([]);
  });

  it("a skip of any of the client's occurrences counts; a row with no kind is a skip", () => {
    const added = "2026-10-19T12:00:00Z";
    const f = facts({ dismissals: [{ client_id: "a", opportunity_type: "birthday", trigger_date: "2026-10-25", dismissed_at: "2026-10-19T13:00:00Z" }] });
    expect(planHandfulSync([pin("a", added)], [pick("a")], new Set(), f, NOW).close)
      .toEqual([{ id: "pin-a", client_id: "a", handled_at: "2026-10-19T13:00:00Z", handled_how: "skipped" }]);
  });

  it("with several qualifying rows, the first one after the pin is when it was handled", () => {
    const f = facts({ dismissals: [
      dismissal("a", "skip", "2026-10-19T17:00:00Z"),
      dismissal("a", "skip", "2026-10-19T13:00:00Z", { trigger_date: "2026-09-01" }),
      dismissal("a", "skip", "2026-10-19T11:00:00Z", { trigger_date: "2026-08-01" }),
    ] });
    expect(planHandfulSync([pin("a", "2026-10-19T12:00:00Z")], [], new Set(), f, NOW).close[0].handled_at)
      .toBe("2026-10-19T13:00:00Z");
  });

  it("contacted: a send counts too, and the later of the two is the time", () => {
    const added = "2026-10-19T12:00:00Z";
    const sent = facts({ lastSentAt: new Map([["a", "2026-10-19T13:00:00Z"]]) });
    expect(planHandfulSync([pin("a", added)], [], new Set(), sent, NOW).close[0])
      .toMatchObject({ handled_how: "contacted", handled_at: "2026-10-19T13:00:00Z" });
    const both = facts({ lastSentAt: new Map([["a", "2026-10-19T13:00:00Z"]]), lastContactAt: new Map([["a", "2026-10-19T16:00:00Z"]]) });
    expect(planHandfulSync([pin("a", added)], [], new Set(), both, NOW).close[0])
      .toMatchObject({ handled_how: "contacted", handled_at: "2026-10-19T16:00:00Z" });
    const early = facts({ lastContactAt: new Map([["a", "2026-10-19T11:00:00Z"]]) });
    expect(planHandfulSync([pin("a", added)], [pick("a")], new Set(), early, NOW).close).toEqual([]);
  });

  it("compares instants, not text", () => {
    // 09:30 ADT is 12:30 UTC: after a pin added at 12:00 UTC, though "09" < "12" as text.
    const f = facts({ lastContactAt: new Map([["a", "2026-10-19T09:30:00-03:00"]]) });
    expect(planHandfulSync([pin("a", "2026-10-19T12:00:00+00:00")], [pick("a")], new Set(), f, NOW).close[0])
      .toMatchObject({ handled_how: "contacted", handled_at: "2026-10-19T09:30:00-03:00" });
  });

  it("a pin whose client isn't picked any more expires now; a picked, untouched pin stays", () => {
    const plan = planHandfulSync(
      [pin("a", "2026-10-19T12:00:00Z"), pin("b", "2026-10-19T12:00:00Z", { id: "pin-b", rank: 1 })],
      [pick("b")], new Set(), facts(), NOW,
    );
    expect(plan.close).toEqual([{ id: "pin-a", client_id: "a", handled_at: NOW.toISOString(), handled_how: "expired" }]);
    expect(plan.insert).toEqual([]);
  });

  it("new pins take the lowest free ranks, in Flight Control's order, never a client already pinned", () => {
    const open = [
      pin("a", "2026-10-19T12:00:00Z", { id: "pin-a", rank: 0 }),
      pin("b", "2026-10-19T12:00:00Z", { id: "pin-b", rank: 1 }),  // contacted: closes
      pin("c", "2026-10-19T12:00:00Z", { id: "pin-c", rank: 2 }),  // on Later: keeps rank 2
      pin("d", "2026-10-19T12:00:00Z", { id: "pin-d", rank: 4 }),
    ];
    const plan = planHandfulSync(
      open,
      [pick("a"), pick("d"), pick("x", "birthday", "2026-10-25T00:00:00Z"), pick("b"), pick("y")],
      new Set(["c"]),
      facts({ lastContactAt: new Map([["b", "2026-10-19T13:00:00Z"]]) }),
      NOW,
    );
    expect(plan.close.map((c) => [c.client_id, c.handled_how])).toEqual([["b", "contacted"]]);
    // b was handled in this sync: picked or not, it isn't pinned again.
    expect(plan.insert).toEqual([
      { client_id: "x", opportunity_type: "birthday", trigger_date: "2026-10-25", rank: 1 },
      { client_id: "y", opportunity_type: "idle_client", trigger_date: "2026-10-01", rank: 3 },
    ]);
  });

  it("never writes a rank past 9", () => {
    const open = Array.from({ length: 10 }, (_, i) => pin(`p${i}`, "2026-10-19T12:00:00Z", { id: `pin-p${i}`, rank: i }));
    const plan = planHandfulSync(open, [...open.map((p) => pick(p.client_id)), pick("new")], new Set(), facts(), NOW);
    expect(plan.insert).toEqual([]);
  });
});

describe("pinHandledBy", () => {
  it("is the table's rules 1 to 4, or null", () => {
    expect(pinHandledBy(pin("a", "2026-10-19T12:00:00Z"), facts())).toBeNull();
    expect(pinHandledBy(pin("a", "2026-10-19T12:00:00Z"), facts({ archivedAt: new Map([["a", YESTERDAY]]) })))
      .toEqual({ handled_at: YESTERDAY, handled_how: "archived" });
  });
});

describe("snoozedClientIdsOf", () => {
  const added = "2026-10-19T12:00:00Z";

  it("is the open pins whose client is on a Later that hasn't ended", () => {
    const f = facts({ dismissals: [dismissal("a", "later", "2026-10-19T13:00:00Z"), dismissal("b", "later", "2026-10-19T13:00:00Z", { until: "2026-10-19T17:59:59Z" })] });
    expect([...snoozedClientIdsOf([pin("a", added), pin("b", added, { id: "pin-b" }), pin("c", added, { id: "pin-c" })], f, NOW)]).toEqual(["a"]);
  });

  it("a Stop made after the pin, or the Hangar, ends the snooze, so the pin closes", () => {
    const later = dismissal("a", "later", "2026-10-19T13:00:00Z", { trigger_date: "2026-10-18" });
    const stopped = facts({ dismissals: [later, dismissal("a", "stop", "2026-10-19T14:00:00Z")] });
    expect(snoozedClientIdsOf([pin("a", added)], stopped, NOW).size).toBe(0);
    const archived = facts({ dismissals: [later], archivedAt: new Map([["a", "2026-10-19T14:00:00Z"]]) });
    expect(snoozedClientIdsOf([pin("a", added)], archived, NOW).size).toBe(0);
  });

  it("a Stop from before the pin (a consent-lapsing pick) doesn't end the snooze", () => {
    const f = facts({ dismissals: [dismissal("a", "stop", "2026-10-01T13:00:00Z", { trigger_date: "2026-10-01" }), dismissal("a", "later", "2026-10-19T13:00:00Z")] });
    expect([...snoozedClientIdsOf([pin("a", added, { opportunity_type: "consent_lapsing" })], f, NOW)]).toEqual(["a"]);
  });
});

describe("countDoneToday", () => {
  it("a pin whose reason lapsed closes as expired and isn't counted", () => {
    expect(countDoneToday([
      { handled_at: TODAY_NOON, handled_how: "expired" },
      { handled_at: TODAY_NOON, handled_how: "skipped" },
      { handled_at: YESTERDAY, handled_how: "contacted" },
    ], DAY_START)).toBe(1);
  });

  it("counts from the Atlantic day's start, and skips open rows", () => {
    expect(countDoneToday([
      { handled_at: "2026-10-19T02:59:59Z", handled_how: "contacted" },
      { handled_at: "2026-10-19T03:00:00Z", handled_how: "contacted" },
      { handled_at: null, handled_how: null },
      { handled_at: TODAY_NOON, handled_how: "stopped" },
      { handled_at: TODAY_NOON, handled_how: "archived" },
    ], DAY_START)).toBe(3);
  });
});

// ── loadNextUpHandful ───────────────────────────────────────────────────────

const opp = (client_id: string, opportunity_type = "idle_client", trigger_date = "2026-10-01"): TopOpportunity =>
  ({ client_id, client_name: `Client ${client_id}`, opportunity_type, trigger_date } as TopOpportunity);

const pinRow = (client: string, rank: number, added_at = "2026-10-19T12:00:00Z", over: Row = {}): Row => ({
  id: `pin-${client}`, user_id: USER, client_id: client, opportunity_type: "idle_client", trigger_date: "2026-10-01",
  rank, added_at, handled_at: null, handled_how: null, ...over,
});
const clientRow = (id: string, over: Row = {}): Row => ({
  id, user_id: USER, name: `Client ${id}`, last_contact_at: null, archived_at: null, ...over,
});
const holdRow = (client: string, kind: "later" | "stop", until: string, over: Row = {}): Row => ({
  id: `hold-${client}`, user_id: USER, client_id: client, opportunity_type: "any", trigger_date: "2026-10-19",
  kind, until, dismissed_at: "2026-10-19T13:00:00Z", ...over,
});
const draftRow = (client: string): Row => ({
  id: `q-${client}`, user_id: USER, client_id: client, opportunity_type: "text_message", channel: "sms",
  trigger_date: "2026-10-19", status: "ready", context: { source: "next_up" }, sent_at: null,
});

function seed(extra: Record<string, Row[]> = {}): Record<string, Row[]> {
  return { next_up_handful: [], clients: [], flight_control_dismissals: [], outreach_queue: [], ...extra };
}

const writesTo = (writes: Write[], table: string) => writes.filter((w) => w.table === table);

beforeEach(() => {
  vi.mocked(getTopOpportunities).mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadNextUpHandful", () => {
  /** a: contacted after its pin. b: untouched and still picked. c: on Later. */
  const scenario = () => seed({
    next_up_handful: [pinRow("a", 0), pinRow("b", 1), pinRow("c", 2)],
    clients: [clientRow("a", { last_contact_at: "2026-10-19T15:00:00Z" }), clientRow("b"), clientRow("c")],
    flight_control_dismissals: [holdRow("c", "later", TONIGHT)],
    outreach_queue: [draftRow("a")],
  });

  it("hands Flight Control the pins still open in rank order, the Later slots, the clock and today's done clients", async () => {
    const t = scenario();
    t.next_up_handful.push(
      pinRow("d", 3, "2026-10-19T10:00:00Z", { id: "done-d", handled_at: "2026-10-19T11:00:00Z", handled_how: "skipped" }),
      pinRow("e", 4, "2026-10-19T10:00:00Z", { id: "done-e", handled_at: "2026-10-19T11:00:00Z", handled_how: "expired" }),
    );
    vi.mocked(getTopOpportunities).mockResolvedValue([opp("b"), opp("x")]);
    const { client } = fakeSupabase(t);
    await loadNextUpHandful(USER, client, { now: NOW });
    expect(getTopOpportunities).toHaveBeenCalledTimes(1);
    const [userId, , opts] = vi.mocked(getTopOpportunities).mock.calls[0];
    expect(userId).toBe(USER);
    expect(opts).toMatchObject({ pinnedClientIds: ["b", "c"], reservedSlots: 1, now: NOW });
    expect([...(opts?.excludeClientIds ?? [])].sort()).toEqual(["a", "d"]);
  });

  it("closes, pins and counts in one pass", async () => {
    vi.mocked(getTopOpportunities).mockResolvedValue([opp("b"), opp("x", "birthday", "2026-10-25")]);
    const { client, writes, queries } = fakeSupabase(scenario());
    const out = await loadNextUpHandful(USER, client, { now: NOW });

    expect(out.day).toBe("2026-10-19");
    expect(out.opportunities.map((o) => o.client_id)).toEqual(["b", "x"]);
    expect(out.doneToday).toBe(1);
    expect(out.snoozed).toEqual([{ client_id: "c", client_name: "Client c", until: TONIGHT }]);

    // The close: by id, for this user, only while still open.
    const close = queries.find((q) => q.table === "next_up_handful" && q.op === "update");
    expect(close?.payload).toEqual({ handled_at: "2026-10-19T15:00:00Z", handled_how: "contacted" });
    expect(close?.filters).toEqual(expect.arrayContaining([
      { op: "eq", column: "id", value: "pin-a" },
      { op: "eq", column: "user_id", value: USER },
      { op: "is", column: "handled_at", value: null },
    ]));
    // The new pin takes the slot a left.
    expect(writesTo(writes, "next_up_handful").filter((w) => w.op === "insert").map((w) => w.payload)).toEqual([
      { user_id: USER, client_id: "x", opportunity_type: "birthday", trigger_date: "2026-10-25", rank: 0 },
    ]);
  });

  it("closing a handled pin skips today's unsent next_up text draft for that client", async () => {
    vi.mocked(getTopOpportunities).mockResolvedValue([opp("b")]);
    const { client, queries } = fakeSupabase(scenario());
    await loadNextUpHandful(USER, client, { now: NOW });
    const skip = queries.filter((q) => q.table === "outreach_queue" && q.op === "update");
    expect(skip).toHaveLength(1);
    expect(skip[0].payload).toEqual({ status: "skipped" });
    expect(skip[0].filters).toEqual(expect.arrayContaining([
      { op: "eq", column: "user_id", value: USER },
      { op: "in", column: "client_id", value: ["a"] },
      { op: "eq", column: "channel", value: "sms" },
      { op: "eq", column: "status", value: "ready" },
      { op: "eq", column: "trigger_date", value: "2026-10-19" },
      { op: "eq", column: "context->>source", value: "next_up" },
    ]));
  });

  it("an expired pin's draft is left alone", async () => {
    vi.mocked(getTopOpportunities).mockResolvedValue([]);
    const { client, writes } = fakeSupabase(seed({ next_up_handful: [pinRow("b", 0)], clients: [clientRow("b")], outreach_queue: [draftRow("b")] }));
    await loadNextUpHandful(USER, client, { now: NOW });
    expect(writesTo(writes, "next_up_handful").map((w) => w.payload)).toEqual([{ handled_at: NOW.toISOString(), handled_how: "expired" }]);
    expect(writesTo(writes, "outreach_queue")).toEqual([]);
  });

  it("persist:false writes nothing", async () => {
    vi.mocked(getTopOpportunities).mockResolvedValue([opp("b"), opp("x")]);
    const { client, queries } = fakeSupabase(scenario());
    const out = await loadNextUpHandful(USER, client, { persist: false, now: NOW });
    expect(queries).toEqual([]);
    // The view is the same as a synced one.
    expect(out.doneToday).toBe(1);
    expect(out.opportunities.map((o) => o.client_id)).toEqual(["b", "x"]);
  });

  it("a 23505 on inserting an open pin is ignored (another surface pinned it first)", async () => {
    vi.mocked(getTopOpportunities).mockResolvedValue([opp("x"), opp("y")]);
    const { client, writes, queries } = fakeSupabase(seed(), {
      writeError: (w) => w.table === "next_up_handful" && w.op === "insert" && (w.payload as Row).client_id === "x"
        ? { code: "23505", message: 'duplicate key value violates unique constraint "next_up_handful_open_client"' }
        : null,
    });
    const out = await loadNextUpHandful(USER, client, { now: NOW });
    expect(out.opportunities.map((o) => o.client_id)).toEqual(["x", "y"]);
    expect(queries.filter((q) => q.op === "insert").map((q) => [(q.payload as Row).client_id, q.error?.code ?? null]))
      .toEqual([["x", "23505"], ["y", null]]);
    expect(writes.map((w) => (w.payload as Row).client_id)).toEqual(["y"]);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("another failed insert is logged, and the handful is still served", async () => {
    vi.mocked(getTopOpportunities).mockResolvedValue([opp("x")]);
    const { client } = fakeSupabase(seed(), {
      writeError: (w) => (w.op === "insert" ? { code: "42501", message: "permission denied" } : null),
    });
    const out = await loadNextUpHandful(USER, client, { now: NOW });
    expect(out.opportunities.map((o) => o.client_id)).toEqual(["x"]);
    expect(console.error).toHaveBeenCalled();
  });

  it("two syncs at once leave one open pin per client", async () => {
    vi.mocked(getTopOpportunities).mockResolvedValue([opp("b"), opp("x")]);
    const pinned = new Set<string>();
    const { client, writes, queries } = fakeSupabase(scenario(), {
      // The partial unique index: the second open pin for a client is refused.
      writeError: (w) => {
        if (w.table !== "next_up_handful" || w.op !== "insert") return null;
        const id = (w.payload as Row).client_id as string;
        if (pinned.has(id)) return { code: "23505", message: "duplicate key" };
        pinned.add(id);
        return null;
      },
    });
    const [one, two] = await Promise.all([
      loadNextUpHandful(USER, client, { now: NOW }),
      loadNextUpHandful(USER, client, { now: NOW }),
    ]);
    expect(one.opportunities).toEqual(two.opportunities);
    expect(writes.filter((w) => w.op === "insert").map((w) => (w.payload as Row).client_id)).toEqual(["x"]);
    // Both closes of a's pin are guarded, so the second can't move the first's time.
    const closes = queries.filter((q) => q.table === "next_up_handful" && q.op === "update");
    expect(closes).toHaveLength(2);
    for (const c of closes) expect(c.filters).toContainEqual({ op: "is", column: "handled_at", value: null });
  });

  it("done today counts today's handled pins and this sync's closes, without expired, once each", async () => {
    const t = seed({
      next_up_handful: [
        pinRow("a", 0, "2026-10-18T12:00:00Z"),                       // contacted yesterday: closes, not today's
        pinRow("b", 1),                                                // contacted today: closes, counts
        pinRow("d", 2, "2026-10-19T10:00:00Z", { id: "done-d", handled_at: "2026-10-19T11:00:00Z", handled_how: "skipped" }),
        pinRow("e", 3, "2026-10-19T10:00:00Z", { id: "done-e", handled_at: "2026-10-19T11:00:00Z", handled_how: "expired" }),
        pinRow("f", 4, "2026-10-17T10:00:00Z", { id: "done-f", handled_at: YESTERDAY, handled_how: "contacted" }),
      ],
      clients: [
        clientRow("a", { last_contact_at: "2026-10-18T20:00:00Z" }),
        clientRow("b", { last_contact_at: "2026-10-19T14:00:00Z" }),
      ],
    });
    vi.mocked(getTopOpportunities).mockResolvedValue([]);
    const { client } = fakeSupabase(t);
    expect((await loadNextUpHandful(USER, client, { now: NOW })).doneToday).toBe(2);
  });

  it("the day is the Atlantic day: 23:00 ADT is still the 19th", async () => {
    const late = new Date("2026-10-20T02:00:00Z");
    const t = seed({
      next_up_handful: [
        pinRow("d", 0, "2026-10-18T10:00:00Z", { id: "done-d", handled_at: "2026-10-19T02:59:59Z", handled_how: "skipped" }),
        pinRow("e", 1, "2026-10-18T10:00:00Z", { id: "done-e", handled_at: "2026-10-19T03:00:00Z", handled_how: "skipped" }),
      ],
    });
    vi.mocked(getTopOpportunities).mockResolvedValue([]);
    const { client } = fakeSupabase(t);
    const out = await loadNextUpHandful(USER, client, { now: late });
    expect(out.day).toBe("2026-10-19");
    expect(out.doneToday).toBe(1);
  });

  it("an archived client on Later is closed, and not listed as snoozed", async () => {
    vi.mocked(getTopOpportunities).mockResolvedValue([]);
    const { client, writes } = fakeSupabase(seed({
      next_up_handful: [pinRow("c", 0)],
      clients: [clientRow("c", { archived_at: "2026-10-19T14:00:00Z" })],
      flight_control_dismissals: [holdRow("c", "later", TONIGHT)],
    }));
    const out = await loadNextUpHandful(USER, client, { now: NOW });
    expect(out.snoozed).toEqual([]);
    expect(writesTo(writes, "next_up_handful").map((w) => w.payload)).toEqual([{ handled_at: "2026-10-19T14:00:00Z", handled_how: "archived" }]);
    expect(vi.mocked(getTopOpportunities).mock.calls[0][2]).toMatchObject({ reservedSlots: 0 });
  });

  it("a send after the pin closes it as contacted", async () => {
    vi.mocked(getTopOpportunities).mockResolvedValue([]);
    const { client, writes } = fakeSupabase(seed({
      next_up_handful: [pinRow("a", 0)],
      clients: [clientRow("a")],
      outreach_queue: [
        { id: "q1", user_id: USER, client_id: "a", status: "sent", sent_at: "2026-10-19T11:00:00Z" },
        { id: "q2", user_id: USER, client_id: "a", status: "sent", sent_at: "2026-10-19T13:00:00Z" },
        { id: "q3", user_id: USER, client_id: "a", status: "ready", sent_at: null },
      ],
    }));
    await loadNextUpHandful(USER, client, { now: NOW });
    expect(writesTo(writes, "next_up_handful").map((w) => w.payload)).toEqual([{ handled_at: "2026-10-19T13:00:00Z", handled_how: "contacted" }]);
  });

  it("a stored kind it doesn't know is read as a skip, never as a Later", async () => {
    vi.mocked(getTopOpportunities).mockResolvedValue([]);
    const { client, writes } = fakeSupabase(seed({
      next_up_handful: [pinRow("c", 0)],
      clients: [clientRow("c")],
      flight_control_dismissals: [holdRow("c", "later", TONIGHT, { kind: "snooze" })],
    }));
    const out = await loadNextUpHandful(USER, client, { now: NOW });
    expect(out.snoozed).toEqual([]);
    expect(writesTo(writes, "next_up_handful").map((w) => (w.payload as Row).handled_how)).toEqual(["skipped"]);
  });

  it("when a read fails, the handful is served but nothing is written", async () => {
    vi.mocked(getTopOpportunities).mockResolvedValue([opp("x")]);
    for (const table of ["next_up_handful", "clients", "flight_control_dismissals", "outreach_queue"]) {
      const { client, queries } = fakeSupabase(scenario(), { readError: [table] });
      const out = await loadNextUpHandful(USER, client, { now: NOW });
      expect(out.opportunities.map((o) => o.client_id), table).toEqual(["x"]);
      expect(queries, table).toEqual([]);
    }
    expect(console.error).toHaveBeenCalled();
  });

  it("no pins: one read of the pins and the picks become pins", async () => {
    vi.mocked(getTopOpportunities).mockResolvedValue([opp("x"), opp("y")]);
    const { client, writes } = fakeSupabase(seed());
    const out = await loadNextUpHandful(USER, client, { now: NOW });
    expect(out).toMatchObject({ day: "2026-10-19", doneToday: 0, snoozed: [] });
    expect(writes.map((w) => [(w.payload as Row).client_id, (w.payload as Row).rank])).toEqual([["x", 0], ["y", 1]]);
  });
});
