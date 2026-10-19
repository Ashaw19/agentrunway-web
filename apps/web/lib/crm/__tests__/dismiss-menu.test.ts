import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyDismiss,
  dismissMenuFor,
  dismissToast,
  LATER_LABELS,
  MENU_HEADINGS,
  SKIP_LABEL,
  STOP_LABELS,
  type DismissPick,
} from "../dismiss-menu";
import { fakeDb, type FakeDbOptions, type Row } from "../../../../../packages/core/lib/__tests__/helpers/capture-fake-db";

/**
 * Flight Control's Dismiss button now opens a menu: Skip this time, Later
 * (in an hour, tonight, tomorrow) and Stop suggesting (3 months, 6 months,
 * move to the Hangar). The menu and the toast copy are pure; applyDismiss is
 * the glue between a menu pick, the writers and the Undo.
 */

/** Monday 2026-10-19 in Atlantic time (ADT, UTC-3). */
const at = (hhmm: string) => new Date(`2026-10-19T${String(Number(hhmm.slice(0, 2)) + 3).padStart(2, "0")}:${hhmm.slice(3)}:00.000Z`);

describe("dismissMenuFor", () => {
  it("offers Skip, Later and Stop suggesting at 18:59 Atlantic, with all three Later times and all three Stops", () => {
    expect(dismissMenuFor("idle_client", at("18:59"))).toEqual([
      { choice: "skip" },
      { choice: "later", options: ["in_an_hour", "tonight", "tomorrow"] },
      { choice: "stop", options: ["3_months", "6_months", "hangar"] },
    ]);
  });

  it("drops 'tonight' from 19:00 Atlantic on", () => {
    const later = dismissMenuFor("idle_client", at("19:00")).find((e) => e.choice === "later");
    expect(later).toEqual({ choice: "later", options: ["in_an_hour", "tomorrow"] });
  });

  it("reads the clock in Atlantic time, not UTC", () => {
    // 21:59Z is 18:59 in Atlantic and 21:59 in UTC; the UTC reading would drop 'tonight'.
    expect(at("18:59").toISOString()).toBe("2026-10-19T21:59:00.000Z");
    const later = dismissMenuFor("idle_client", at("18:59")).find((e) => e.choice === "later");
    expect(later && "options" in later && later.options).toContain("tonight");
  });

  it("a consent-lapsing card has no Stop (the CASL ask has a deadline)", () => {
    const menu = dismissMenuFor("consent_lapsing", at("12:00"));
    expect(menu.map((e) => e.choice)).toEqual(["skip", "later"]);
  });

  it("leaves out Already talked: on the web that is the Log contact button", () => {
    for (const type of ["idle_client", "consent_lapsing", "birthday"]) {
      expect(JSON.stringify(dismissMenuFor(type, at("12:00")))).not.toContain("already_talked");
    }
  });

  it("every entry has a label", () => {
    expect(SKIP_LABEL).toBeTruthy();
    expect(Object.keys(LATER_LABELS).sort()).toEqual(["in_an_hour", "tomorrow", "tonight"]);
    expect(Object.keys(STOP_LABELS).sort()).toEqual(["3_months", "6_months", "hangar"]);
    expect(MENU_HEADINGS).toEqual({ later: "Later", stop: "Stop suggesting" });
  });
});

describe("dismissToast", () => {
  it("Skip", () => {
    expect(dismissToast("skip", "Sam Lee", null)).toEqual({
      title: "Skipped Sam Lee this time.",
      description: "They come back at their next reason to reach out.",
    });
  });

  it("Later", () => {
    expect(dismissToast("later", "Sam Lee", "in_an_hour").title).toBe("Sam Lee is back in an hour.");
    expect(dismissToast("later", "Sam Lee", "tonight").title).toBe("Sam Lee is back tonight.");
    expect(dismissToast("later", "Sam Lee", "tomorrow")).toEqual({ title: "Sam Lee is back tomorrow.", description: "" });
  });

  it("Stop", () => {
    expect(dismissToast("stop", "Sam Lee", "3_months")).toEqual({ title: "No suggestions for Sam Lee for 3 months.", description: "" });
    expect(dismissToast("stop", "Sam Lee", "6_months").title).toBe("No suggestions for Sam Lee for 6 months.");
  });

  it("the Hangar, whether it comes as a Stop option or on its own", () => {
    expect(dismissToast("stop", "Sam Lee", "hangar")).toEqual({ title: "Sam Lee moved to the Hangar.", description: "" });
    expect(dismissToast("hangar", "Sam Lee")).toEqual({ title: "Sam Lee moved to the Hangar.", description: "" });
  });

  it("a card with no name still reads as a sentence", () => {
    expect(dismissToast("skip", "", null).title).toBe("Skipped this client this time.");
    expect(dismissToast("later", "  ", "tonight").title).toBe("This client is back tonight.");
    expect(dismissToast("stop", "", "6_months").title).toBe("No suggestions for this client for 6 months.");
    expect(dismissToast("hangar", "").title).toBe("This client moved to the Hangar.");
  });

  it("no em dash, no 'should', in any toast or menu label", () => {
    const strings: string[] = [SKIP_LABEL, ...Object.values(MENU_HEADINGS), ...Object.values(LATER_LABELS), ...Object.values(STOP_LABELS)];
    for (const choice of ["skip", "later", "stop", "hangar"] as const) {
      for (const detail of [null, "in_an_hour", "tonight", "tomorrow", "3_months", "6_months", "hangar"] as const) {
        const t = dismissToast(choice, "Sam Lee", detail);
        strings.push(t.title, t.description);
      }
    }
    for (const s of strings) {
      expect(s).not.toMatch(/[—–]/);
      expect(s).not.toMatch(/should/i);
    }
  });
});

// ── applyDismiss: a menu pick, the writers and the Undo ─────────────────────

const DISMISSALS = "flight_control_dismissals";
const PINS = "next_up_handful";
const NOW = at("12:00"); // 2026-10-19T15:00:00.000Z
const sam = { client_id: "c1", client_name: "Sam Lee", opportunity_type: "idle_client", trigger_date: "2026-10-01" };

function world(seed: Record<string, Row[]> = {}, options: FakeDbOptions = {}) {
  const fake = fakeDb(
    {
      clients: [{ id: "c1", user_id: "u1", name: "Sam Lee", archived_at: null, archive_reason: null }],
      [DISMISSALS]: [],
      [PINS]: [],
      ...seed,
    },
    { unique: { [DISMISSALS]: ["user_id", "client_id", "opportunity_type", "trigger_date"] }, ...options },
  );
  const supabase = {
    from: fake.db.from,
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  } as unknown as SupabaseClient;
  return { supabase, ...fake };
}

/** A pin the nightly sync or a Scan already closed today, 10:00 Atlantic. */
const closedPin = (how: string) => ({
  id: "p1", user_id: "u1", client_id: "c1", opportunity_type: "idle_client", trigger_date: "2026-10-01",
  rank: 0, added_at: "2026-10-19T04:00:00.000Z", handled_at: "2026-10-19T13:00:00.000Z", handled_how: how,
});

async function dismiss(supabase: SupabaseClient, pick: DismissPick, target = sam) {
  const out = await applyDismiss(supabase, target, pick, NOW);
  if (!out.ok) throw new Error(`expected a saved dismissal: ${out.message}`);
  return out;
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("applyDismiss", () => {
  const fakeNow = () => vi.useFakeTimers({ now: NOW, toFake: ["Date"] });

  it("Skip saves the occurrence and the toast says so", async () => {
    fakeNow();
    const { supabase, tables } = world();
    const out = await dismiss(supabase, { choice: "skip" });
    expect(tables[DISMISSALS]).toHaveLength(1);
    expect(tables[DISMISSALS][0]).toMatchObject({ client_id: "c1", opportunity_type: "idle_client", trigger_date: "2026-10-01", kind: "skip" });
    expect(out.toast.title).toBe("Skipped Sam Lee this time.");
    expect(out.hidesCard).toBe(true);
    expect(out.undo).toBeTypeOf("function");
  });

  it("Undo of a Skip removes the occurrence and reopens the pin a sync closed", async () => {
    fakeNow();
    const { supabase, tables } = world({ [PINS]: [closedPin("skipped")] });
    const out = await dismiss(supabase, { choice: "skip" });
    expect(await out.undo!()).toEqual({ ok: true });
    expect(tables[DISMISSALS]).toHaveLength(0);
    expect(tables[PINS][0]).toMatchObject({ handled_at: null, handled_how: null });
  });

  it("Undo of a Skip leaves a pin closed as contacted alone", async () => {
    fakeNow();
    const { supabase, tables } = world({ [PINS]: [closedPin("contacted")] });
    const out = await dismiss(supabase, { choice: "skip" });
    expect(await out.undo!()).toEqual({ ok: true });
    expect(tables[PINS][0]).toMatchObject({ handled_how: "contacted" });
  });

  it.each([
    ["in_an_hour", "2026-10-19T16:00:00.000Z", "Sam Lee is back in an hour."],
    ["tonight", "2026-10-19T22:00:00.000Z", "Sam Lee is back tonight."],
    ["tomorrow", "2026-10-20T11:00:00.000Z", "Sam Lee is back tomorrow."],
  ] as const)("Later %s holds the client until %s", async (option, until, title) => {
    fakeNow();
    const { supabase, tables } = world();
    const out = await dismiss(supabase, { choice: "later", option });
    expect(tables[DISMISSALS]).toHaveLength(1);
    expect(tables[DISMISSALS][0]).toMatchObject({ client_id: "c1", opportunity_type: "any", kind: "later", until });
    expect(out.toast).toEqual({ title, description: "" });
    expect(out.hidesCard).toBe(true);
  });

  it("Undo of a Later takes the hold off and does not touch the pin (a Later never closes it)", async () => {
    fakeNow();
    const { supabase, tables, writes } = world({ [PINS]: [{ ...closedPin("skipped"), id: "p-old" }] });
    const out = await dismiss(supabase, { choice: "later", option: "tomorrow" });
    expect(await out.undo!()).toEqual({ ok: true });
    expect(tables[DISMISSALS]).toHaveLength(0);
    expect(writes.filter((w) => w.table === PINS)).toEqual([]);
  });

  it.each([
    ["3_months", "2027-01-19T04:00:00.000Z", "No suggestions for Sam Lee for 3 months."],
    ["6_months", "2027-04-19T03:00:00.000Z", "No suggestions for Sam Lee for 6 months."],
  ] as const)("Stop %s holds the client until %s", async (option, until, title) => {
    fakeNow();
    const { supabase, tables } = world();
    const out = await dismiss(supabase, { choice: "stop", option });
    expect(tables[DISMISSALS][0]).toMatchObject({ opportunity_type: "any", kind: "stop", until });
    expect(out.toast).toEqual({ title, description: "" });
  });

  it("Undo of a Stop takes the hold off and reopens the pin a sync closed as stopped", async () => {
    fakeNow();
    const { supabase, tables } = world({ [PINS]: [closedPin("stopped")] });
    const out = await dismiss(supabase, { choice: "stop", option: "3_months" });
    expect(await out.undo!()).toEqual({ ok: true });
    expect(tables[DISMISSALS]).toHaveLength(0);
    expect(tables[PINS][0]).toMatchObject({ handled_at: null, handled_how: null });
  });

  it("the Hangar archives the client, and Undo brings them back and reopens the pin", async () => {
    fakeNow();
    const { supabase, tables } = world({ [PINS]: [closedPin("archived")] });
    const out = await dismiss(supabase, { choice: "stop", option: "hangar" });
    expect(tables.clients[0]).toMatchObject({ archive_reason: "other", archived_at: expect.any(String) });
    expect(out.toast).toEqual({ title: "Sam Lee moved to the Hangar.", description: "" });
    expect(await out.undo!()).toEqual({ ok: true });
    expect(tables.clients[0]).toMatchObject({ archived_at: null, archive_reason: null });
    expect(tables[PINS][0]).toMatchObject({ handled_at: null, handled_how: null });
  });

  it("a Later while a Stop is running writes nothing, says so, and offers no Undo (it would delete the Stop)", async () => {
    fakeNow();
    const running = { id: "h1", user_id: "u1", client_id: "c1", opportunity_type: "any", trigger_date: "2026-10-05", kind: "stop", until: "2027-01-05T04:00:00.000Z" };
    const { supabase, writes, tables } = world({ [DISMISSALS]: [running] });
    const out = await dismiss(supabase, { choice: "later", option: "tomorrow" });
    expect(out.toast).toEqual({ title: "Suggestions for Sam Lee are already stopped until January 5, 2027.", description: "" });
    expect(out.undo).toBeNull();
    expect(out.hidesCard).toBe(false);
    expect(writes).toEqual([]);
    expect(tables[DISMISSALS]).toHaveLength(1);
  });

  it("a refused save is reported with the writer's words, and the card isn't called handled", async () => {
    fakeNow();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { supabase } = world({}, { fail: { [DISMISSALS]: { code: "42501", message: "rls" } } });
    const skip = await applyDismiss(supabase, sam, { choice: "skip" }, NOW);
    expect(skip).toEqual({ ok: false, message: "Couldn't save that for Sam Lee. Try again." });
    const later = await applyDismiss(supabase, sam, { choice: "later", option: "tonight" }, NOW);
    expect(later.ok).toBe(false);
    if (!later.ok) expect(later.message).toMatch(/^Couldn't hold the suggestion/);
  });

  it("'tonight' picked after 19:00 is refused, not saved as a time already gone", async () => {
    vi.useFakeTimers({ now: at("19:01"), toFake: ["Date"] });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { supabase, writes } = world();
    const out = await applyDismiss(supabase, sam, { choice: "later", option: "tonight" }, at("19:01"));
    expect(out).toEqual({ ok: false, message: "That time has already passed." });
    expect(writes).toEqual([]);
  });

  it("a Hangar move that can't happen says why", async () => {
    fakeNow();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const archived = { id: "c1", user_id: "u1", name: "Sam Lee", archived_at: "2026-09-01T12:00:00.000Z", archive_reason: "moved_away" };
    const { supabase, tables } = world({ clients: [archived] });
    expect(await applyDismiss(supabase, sam, { choice: "stop", option: "hangar" }, NOW)).toEqual({ ok: false, message: "Sam Lee is already in the Hangar." });
    expect(tables.clients[0]).toMatchObject({ archive_reason: "moved_away" });
  });

  it("a sign-in lookup that throws is a failed save, never an unhandled error", async () => {
    fakeNow();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { supabase } = world();
    const broken = { ...supabase, auth: { getUser: async () => { throw new Error("socket hang up"); } } } as unknown as SupabaseClient;
    for (const pick of [{ choice: "skip" }, { choice: "later", option: "tomorrow" }, { choice: "stop", option: "hangar" }] as DismissPick[]) {
      expect(await applyDismiss(broken, sam, pick, NOW)).toEqual({ ok: false, message: "Couldn't save that for Sam Lee. Try again." });
    }
  });

  it("an Undo whose sign-in lookup throws is a failed Undo", async () => {
    fakeNow();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { supabase } = world();
    let calls = 0;
    // The save finds the user; the lookup fails the second time round, for the Undo.
    const flaky = { ...supabase, auth: { getUser: async () => { if (++calls > 1) throw new Error("socket hang up"); return { data: { user: { id: "u1" } } }; } } } as unknown as SupabaseClient;
    const out = await dismiss(flaky, { choice: "skip" });
    expect(await out.undo!()).toEqual({ ok: false });
  });

  it("an Undo that fails reports it and leaves the pin alone", async () => {
    fakeNow();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { supabase, tables, options } = world({ [PINS]: [closedPin("skipped")] });
    const out = await dismiss(supabase, { choice: "skip" });
    options.offline = [DISMISSALS];
    expect(await out.undo!()).toEqual({ ok: false });
    expect(tables[PINS][0]).toMatchObject({ handled_how: "skipped" });
  });

  it("an Undo that worked but couldn't reopen the pin says today's list may not show them", async () => {
    fakeNow();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { supabase, options } = world({ [PINS]: [closedPin("skipped")] });
    const out = await dismiss(supabase, { choice: "skip" });
    options.offline = [PINS];
    const undone = await out.undo!();
    expect(undone.ok).toBe(true);
    expect(undone.message).toBe("Undone. They may not show on today's list until tomorrow.");
    expect(undone.message).not.toMatch(/[—–]|should/i);
  });
});
