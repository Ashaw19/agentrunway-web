import { afterEach, describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  opportunityKey, withoutDismissed, dismissOpportunity, undismissOpportunity, holdSuggestion, resumeSuggestion,
  moveToHangar, bringBackFromHangar, reopenTodaysPin,
} from "../dismissed-opportunities";
import { fakeDb, type FakeDbOptions, type Row } from "../../../../../packages/core/lib/__tests__/helpers/capture-fake-db";

/**
 * Flight Control "Dismiss" (Andrew, 2026-10-06): "When I dismiss a suggested
 * contact opp in the flight control, then refresh the page, the contact opp
 * just populates again."
 *
 * Dismiss used to be React state only. It is now stored per occurrence —
 * (client, opportunity type, trigger date) — the same key outreach_queue is
 * unique on. Scan and the nightly drafter both drop dismissed candidates
 * before selecting, so the dismissed card's slot backfills with the next
 * person and nothing is drafted for it.
 */

const cand = (client_id: string, opportunity_type: string, trigger_date: string) => ({
  client_id, opportunity_type, trigger_date, context: {},
});

describe("opportunityKey", () => {
  it("keys on client, type and trigger date", () => {
    expect(opportunityKey(cand("c1", "idle_client", "2026-10-01"))).toBe("c1|idle_client|2026-10-01");
  });

  it("normalises a timestamp-shaped trigger date to the date", () => {
    // A DATE column can come back as a full timestamp from some drivers.
    expect(opportunityKey({ client_id: "c1", opportunity_type: "birthday", trigger_date: "2026-10-12T00:00:00+00:00" }))
      .toBe("c1|birthday|2026-10-12");
  });
});

describe("withoutDismissed", () => {
  it("drops exactly the dismissed occurrence (the reported bug)", () => {
    const out = withoutDismissed(
      [cand("c1", "idle_client", "2026-10-01"), cand("c2", "idle_client", "2026-10-01")],
      [{ client_id: "c1", opportunity_type: "idle_client", trigger_date: "2026-10-01" }],
    );
    expect(out.map((o) => o.client_id)).toEqual(["c2"]);
  });

  it("lets the next occurrence through — a dismissal is for one reminder, not forever", () => {
    const out = withoutDismissed(
      [cand("c1", "idle_client", "2026-11-01")],
      [{ client_id: "c1", opportunity_type: "idle_client", trigger_date: "2026-10-01" }],
    );
    expect(out).toHaveLength(1);
  });

  it("keeps the client's other opportunity types", () => {
    const out = withoutDismissed(
      [cand("c1", "birthday", "2026-10-12"), cand("c1", "idle_client", "2026-10-01")],
      [{ client_id: "c1", opportunity_type: "idle_client", trigger_date: "2026-10-01" }],
    );
    expect(out.map((o) => o.opportunity_type)).toEqual(["birthday"]);
  });

  it("is a no-op with no dismissals and doesn't mutate the input", () => {
    const input = [cand("c1", "idle_client", "2026-10-01")];
    const out = withoutDismissed(input, []);
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
  });
});

// ── Persisting a dismissal (browser, RLS-scoped client) ─────────────────────
//
// The helpers find the signed-in user and call the writers in core
// (record-writers.ts), which the core suite covers in full. These tests pin
// the hand-off: whose id, which row, what is reported.

const TABLE = "flight_control_dismissals";

function supabaseFor(opts: { userId?: string | null; seed?: Row[]; db?: FakeDbOptions } = {}) {
  const fake = fakeDb(
    { [TABLE]: opts.seed ?? [] },
    { unique: { [TABLE]: ["user_id", "client_id", "opportunity_type", "trigger_date"] }, ...opts.db },
  );
  const supabase = {
    from: fake.db.from,
    auth: { getUser: async () => ({ data: { user: opts.userId === null ? null : { id: opts.userId ?? "u1" } } }) },
  } as unknown as SupabaseClient;
  return { supabase, ...fake };
}

const opp = { client_id: "c1", opportunity_type: "idle_client", trigger_date: "2026-10-01" };
const skipRow = (user_id: string, extra: Row = {}) => ({ id: `d-${user_id}`, user_id, ...opp, kind: "skip", ...extra });

afterEach(() => { vi.useRealTimers(); });

describe("dismissOpportunity", () => {
  it("stores the occurrence for the signed-in user, once", async () => {
    const { supabase, writes, tables } = supabaseFor();
    expect(await dismissOpportunity(supabase, opp)).toEqual({ ok: true });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ table: TABLE, op: "insert" });
    expect(writes[0].payload).toEqual({ id: expect.any(String), user_id: "u1", ...opp, kind: "skip" });
    // Dismissing twice is not an error and does not make a second row.
    expect(await dismissOpportunity(supabase, opp)).toEqual({ ok: true });
    expect(tables[TABLE]).toHaveLength(1);
  });

  it("passes only the occurrence on, not the rest of the card", async () => {
    const { supabase, writes } = supabaseFor();
    await dismissOpportunity(supabase, { ...opp, trigger_date: "2026-10-01T00:00:00Z", context: { note: "x" } } as typeof opp);
    expect(Object.keys(writes[0].payload).sort()).toEqual(["client_id", "id", "kind", "opportunity_type", "trigger_date", "user_id"]);
    expect(writes[0].payload.trigger_date).toBe("2026-10-01");
  });

  it("reports failure instead of pretending it saved", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { supabase } = supabaseFor({ db: { fail: { [TABLE]: { code: "42501", message: "permission denied" } } } });
    expect(await dismissOpportunity(supabase, opp)).toEqual({ ok: false });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("refuses when nobody is signed in", async () => {
    const { supabase, writes } = supabaseFor({ userId: null });
    expect(await dismissOpportunity(supabase, opp)).toEqual({ ok: false });
    expect(writes).toHaveLength(0);
  });
});

describe("undismissOpportunity", () => {
  it("deletes exactly that occurrence for the signed-in user", async () => {
    const other = { ...skipRow("u1"), id: "d-other", client_id: "c2" };
    const { supabase, tables } = supabaseFor({ seed: [skipRow("u1"), skipRow("u2"), other] });
    expect(await undismissOpportunity(supabase, opp)).toEqual({ ok: true });
    expect(tables[TABLE].map((r) => r.id)).toEqual(["d-u2", "d-other"]);
  });

  it("refuses when nobody is signed in", async () => {
    const { supabase, tables } = supabaseFor({ userId: null, seed: [skipRow("u1")] });
    expect(await undismissOpportunity(supabase, opp)).toEqual({ ok: false });
    expect(tables[TABLE]).toHaveLength(1);
  });
});

describe("holdSuggestion and resumeSuggestion", () => {
  const args = (until: Date) => ({ clientId: "c1", clientName: "Sam Lee", kind: "later" as const, until });

  it("holds the client for the signed-in user on the Atlantic day, not the UTC day", async () => {
    // 23:30 ADT on Oct 19 is already Oct 20 in UTC.
    vi.useFakeTimers({ now: new Date("2026-10-20T02:30:00.000Z"), toFake: ["Date"] });
    const { supabase, writes } = supabaseFor();
    const until = new Date("2026-10-20T11:00:00.000Z"); // 08:00 ADT
    const out = await holdSuggestion(supabase, args(until));
    expect(out).toMatchObject({ ok: true });
    expect(out.alreadySaved).toBeUndefined(); // written: Undo is offered
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ table: TABLE, op: "upsert", onConflict: "user_id,client_id,opportunity_type,trigger_date" });
    expect(writes[0].payload).toEqual({
      user_id: "u1", client_id: "c1", opportunity_type: "any", trigger_date: "2026-10-19",
      kind: "later", until: until.toISOString(), dismissed_at: "2026-10-20T02:30:00.000Z",
    });
  });

  it("hands back the writer's outcome and its marker, so the card can say a Stop is already running and skip Undo", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-19T15:00:00.000Z"), toFake: ["Date"] });
    const running = { id: "h1", user_id: "u1", client_id: "c1", opportunity_type: "any", trigger_date: "2026-10-05", kind: "stop", until: "2027-01-05T04:00:00.000Z" };
    const { supabase, writes } = supabaseFor({ seed: [running] });
    const out = await holdSuggestion(supabase, args(new Date("2026-10-19T16:00:00.000Z")));
    expect(out).toMatchObject({ ok: true, message: "Suggestions for Sam Lee are already stopped until January 5, 2027." });
    // Nothing was written, so there is nothing to undo; the end of the Stop is a field, not text.
    expect(out).toMatchObject({ alreadySaved: true, stoppedUntil: "2027-01-05T04:00:00.000Z" });
    expect(writes).toHaveLength(0);
  });

  it("refuses a time that has passed", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-19T15:00:00.000Z"), toFake: ["Date"] });
    const { supabase, writes } = supabaseFor();
    expect(await holdSuggestion(supabase, args(new Date("2026-10-19T14:59:00.000Z")))).toMatchObject({ ok: false, message: "That time has already passed." });
    expect(writes).toHaveLength(0);
  });

  it("resumes the signed-in user's holds for that client only", async () => {
    const hold = (id: string, user_id: string, client_id: string) => ({ id, user_id, client_id, opportunity_type: "any", trigger_date: "2026-10-19", kind: "stop", until: "2027-01-05T04:00:00.000Z" });
    const { supabase, tables } = supabaseFor({ seed: [hold("h1", "u1", "c1"), hold("h2", "u1", "c2"), hold("h3", "u2", "c1"), skipRow("u1")] });
    expect(await resumeSuggestion(supabase, "c1")).toMatchObject({ ok: true });
    expect(tables[TABLE].map((r) => r.id)).toEqual(["h2", "h3", "d-u1"]);
  });

  it("both refuse when nobody is signed in", async () => {
    const { supabase, writes } = supabaseFor({ userId: null });
    expect(await holdSuggestion(supabase, args(new Date(Date.now() + 3_600_000)))).toMatchObject({ ok: false });
    expect(await resumeSuggestion(supabase, "c1")).toMatchObject({ ok: false });
    expect(writes).toHaveLength(0);
  });
});

// ── The Hangar and today's pin: the same hand-off for the rest of the menu ──

describe("moveToHangar, bringBackFromHangar and reopenTodaysPin", () => {
  const CLIENTS = "clients";
  const PINS = "next_up_handful";
  const sam = { clientId: "c1", clientName: "Sam Lee" };

  function supabaseWith(seed: Record<string, Row[]>, userId: string | null = "u1") {
    const fake = fakeDb(seed);
    const supabase = {
      from: fake.db.from,
      auth: { getUser: async () => ({ data: { user: userId === null ? null : { id: userId } } }) },
    } as unknown as SupabaseClient;
    return { supabase, ...fake };
  }
  const client = (extra: Row = {}) => ({ id: "c1", user_id: "u1", name: "Sam Lee", archived_at: null, archive_reason: null, ...extra });

  it("moves the signed-in user's client to the Hangar with the reason 'other'", async () => {
    const { supabase, tables } = supabaseWith({ [CLIENTS]: [client()] });
    expect(await moveToHangar(supabase, sam)).toMatchObject({ ok: true, message: "Sam Lee moved to the Hangar." });
    expect(tables[CLIENTS][0]).toMatchObject({ archive_reason: "other", archived_at: expect.any(String) });
  });

  it("brings back only a client moved by this menu", async () => {
    const mine = supabaseWith({ [CLIENTS]: [client({ archived_at: "2026-10-19T15:00:00.000Z", archive_reason: "other" })] });
    expect(await bringBackFromHangar(mine.supabase, sam)).toMatchObject({ ok: true });
    expect(mine.tables[CLIENTS][0]).toMatchObject({ archived_at: null, archive_reason: null });
    const theirs = supabaseWith({ [CLIENTS]: [client({ archived_at: "2026-10-19T15:00:00.000Z", archive_reason: "do_not_contact" })] });
    expect(await bringBackFromHangar(theirs.supabase, sam)).toMatchObject({ ok: false });
    expect(theirs.tables[CLIENTS][0]).toMatchObject({ archive_reason: "do_not_contact" });
  });

  it("reopens today's pin for the signed-in user", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-19T15:00:00.000Z"), toFake: ["Date"] });
    const pin = { id: "p1", user_id: "u1", client_id: "c1", handled_at: "2026-10-19T14:00:00.000Z", handled_how: "skipped" };
    const { supabase, tables } = supabaseWith({ [PINS]: [pin] });
    expect(await reopenTodaysPin(supabase, "c1")).toMatchObject({ ok: true, id: "p1" });
    expect(tables[PINS][0]).toMatchObject({ handled_at: null, handled_how: null });
  });

  it("all three refuse when nobody is signed in", async () => {
    const { supabase, writes } = supabaseWith({ [CLIENTS]: [client()], [PINS]: [] }, null);
    expect(await moveToHangar(supabase, sam)).toMatchObject({ ok: false });
    expect(await bringBackFromHangar(supabase, sam)).toMatchObject({ ok: false });
    expect(await reopenTodaysPin(supabase, "c1")).toMatchObject({ ok: false });
    expect(writes).toHaveLength(0);
  });
});
