/**
 * Undoing an AI change (core/lib/ai-undo.ts) against an in-memory stand-in
 * for the agent's own client. The rules: all or nothing on the checks, a
 * record changed since is left alone, a created record with something new
 * linked to it is left alone, a client goes through fn_delete_clients, and
 * the ledger rows are stamped undone. Synthetic rows only.
 */
import { describe, expect, it } from "vitest";
import type { AiRunWrite } from "../../types/database";
import { undoAIAction } from "../ai-undo";
import { actionFingerprint, groupWritesIntoActions, redactRow } from "../ai-activity";
import { FakeDb, markUndoneRpc, referencesRpc, undoApplyRpc, write } from "./ai-ledger-fixtures";

const NOW = new Date("2026-10-18T16:00:00.000Z");
const T1 = "2026-10-18T14:00:00.000000+00:00";
const T2 = "2026-10-18T14:00:01.000000+00:00";

function db(tables: Record<string, Record<string, unknown>[]>, writes: AiRunWrite[], extraRpcs = {}) {
  return new FakeDb(
    { ...tables, ai_run_writes: writes as unknown as Record<string, unknown>[] },
    {
      fn_mark_ai_writes_undone: markUndoneRpc,
      fn_ai_undo_apply: undoApplyRpc,
      fn_ai_row_references: referencesRpc([
        { table: "contact_activities", column: "client_id" },
        { table: "client_notes", column: "client_id" },
      ]),
      ...extraRpcs,
    },
  );
}

describe("undoAIAction", () => {
  it("puts back the columns an update changed, and stamps the ledger", async () => {
    const before = { id: "e1", user_id: "u1", vendor: "Staples", total_amount: 45, updated_at: T1 };
    const after = { ...before, total_amount: 54, updated_at: T2 };
    const fake = db({ receipt_expenses: [after] }, [
      write({ id: "w1", tool_name: "updateExpense", action: "update", row_id: "e1", before_image: before, after_image: after }),
    ]);
    const r = await undoAIAction(fake, "u1", "call-1", { now: NOW });
    expect(r).toMatchObject({ ok: true, status: "undone", restored: 1 });
    expect(fake.rows("receipt_expenses")[0]).toMatchObject({ total_amount: 45 });
    // One apply step, guarded on the whole after-image (updated_at included).
    expect(fake.log).toContain("apply update receipt_expenses e1");
    expect(fake.rows("ai_run_writes")[0].undone_at).not.toBeNull();
  });

  it("refuses, changing nothing, when the record was edited since", async () => {
    const before = { id: "e1", vendor: "Staples", total_amount: 45 };
    const after = { ...before, total_amount: 54 };
    const fake = db({ receipt_expenses: [{ ...after, notes: "edited by hand" }] }, [
      write({ action: "update", row_id: "e1", before_image: before, after_image: after }),
    ]);
    const r = await undoAIAction(fake, "u1", "call-1", { now: NOW });
    expect(r).toMatchObject({ ok: false, status: "refused" });
    expect(r.message).toMatch(/changed after Flight Crew's change/);
    expect(fake.rows("receipt_expenses")[0]).toMatchObject({ total_amount: 54, notes: "edited by hand" });
    expect(fake.rows("ai_run_writes")[0].undone_at).toBeNull();
  });

  it("removes a record the AI created", async () => {
    const row = { id: "t1", user_id: "u1", address: "12 Example St", sale_price: 400000 };
    const fake = db({ transactions: [row] }, [write({ tool_name: "recordTransaction", table_name: "transactions", row_id: "t1", after_image: row })]);
    const r = await undoAIAction(fake, "u1", "call-1", { now: NOW });
    expect(r).toMatchObject({ ok: true, status: "undone" });
    expect(fake.rows("transactions")).toEqual([]);
  });

  it("leaves a created client alone when a call was logged on it since", async () => {
    const client = { id: "c1", user_id: "u1", name: "Pat Example" };
    const fake = db(
      { clients: [client], contact_activities: [{ id: "a9", client_id: "c1", type: "call" }] },
      [write({ tool_name: "createClient", table_name: "clients", row_id: "c1", after_image: client })],
    );
    const r = await undoAIAction(fake, "u1", "call-1", { now: NOW });
    expect(r).toMatchObject({ ok: false, status: "refused" });
    expect(r.message).toMatch(/1 activity linked/);
    expect(fake.rows("clients")).toHaveLength(1);
  });

  it("removes a created client through fn_delete_clients, never a plain delete", async () => {
    const client = { id: "c1", user_id: "u1", name: "Pat Example" };
    const fake = db({ clients: [client] }, [write({ tool_name: "createClient", table_name: "clients", row_id: "c1", after_image: client })], {
      fn_delete_clients: (args: Record<string, unknown>, d: FakeDb) => {
        const ids = args.p_client_ids as string[];
        d.tables.clients = d.rows("clients").filter((c) => !ids.includes(String(c.id)));
        return { data: { deleted: ids, archived: [] }, error: null };
      },
    });
    const r = await undoAIAction(fake, "u1", "call-1", { now: NOW });
    expect(r.status).toBe("undone");
    expect(fake.log).toContain("rpc fn_delete_clients");
    expect(fake.log.some((l) => l.startsWith("delete clients"))).toBe(false);
    expect(fake.rows("clients")).toEqual([]);
  });

  it("a record created alongside its children in one call is removed with them", async () => {
    const client = { id: "c1", user_id: "u1", name: "Pat Example" };
    const note = { id: "n1", user_id: "u1", client_id: "c1", body: "met at open house" };
    const fake = db({ clients: [client], client_notes: [note] }, [
      write({ id: "w1", tool_name: "createClient", table_name: "clients", row_id: "c1", after_image: client }),
      write({ id: "w2", tool_name: "createClient", seq: 1, table_name: "client_notes", row_id: "n1", after_image: note }),
    ], {
      fn_delete_clients: (args: Record<string, unknown>, d: FakeDb) => {
        d.tables.clients = [];
        return { data: { deleted: args.p_client_ids, archived: [] }, error: null };
      },
    });
    const r = await undoAIAction(fake, "u1", "call-1", { now: NOW });
    expect(r).toMatchObject({ status: "undone", restored: 2 });
    // The note (written second) goes first.
    const order = fake.log.filter((l) => l.startsWith("apply"));
    expect(order).toEqual(["apply delete client_notes n1", "apply delete clients c1"]);
  });

  it("puts a deleted record back with its old id, leaving out computed columns", async () => {
    const before = { id: "m1", user_id: "u1", km: 42, deduction: 30.66, description: "Showing at 12 Example St" };
    const fake = db({ mileage_logs: [] }, [
      write({ tool_name: "deleteMileage", table_name: "mileage_logs", action: "delete", row_id: "m1", before_image: before, after_image: null }),
    ]);
    const r = await undoAIAction(fake, "u1", "call-1", { now: NOW });
    expect(r.status).toBe("undone");
    expect(fake.rows("mileage_logs")).toEqual([{ id: "m1", user_id: "u1", km: 42, description: "Showing at 12 Example St" }]);
  });

  it("can remove an AI draft but not put back earlier AI-written text", async () => {
    const draft = { id: "q1", user_id: "u1", status: "ready", ai_body: "Hi Pat" };
    const created = db({ outreach_queue: [draft] }, [
      write({ tool_name: "draftOutreachForClient", table_name: "outreach_queue", row_id: "q1", after_image: redactRow("outreach_queue", draft) }),
    ]);
    expect((await undoAIAction(created, "u1", "call-1", { now: NOW })).status).toBe("undone");
    expect(created.rows("outreach_queue")).toEqual([]);

    const rewritten = { ...draft, ai_body: "Hello Pat" };
    const changed = db({ outreach_queue: [rewritten] }, [
      write({
        tool_name: "draftOutreachForClient",
        table_name: "outreach_queue",
        action: "update",
        row_id: "q1",
        before_image: redactRow("outreach_queue", draft),
        after_image: redactRow("outreach_queue", rewritten),
      }),
    ]);
    const r = await undoAIAction(changed, "u1", "call-1", { now: NOW });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/doesn't keep AI-written text/);
    expect(changed.rows("outreach_queue")[0].ai_body).toBe("Hello Pat");
  });

  it("already back the way it was: marks it undone without writing", async () => {
    const before = { id: "e1", total_amount: 45 };
    const after = { id: "e1", total_amount: 54 };
    const fake = db({ receipt_expenses: [before] }, [write({ action: "update", row_id: "e1", before_image: before, after_image: after })]);
    const r = await undoAIAction(fake, "u1", "call-1", { now: NOW });
    expect(r).toMatchObject({ ok: true, status: "already", restored: 0 });
    expect(fake.log.some((l) => l.startsWith("apply"))).toBe(false);
    expect(fake.rows("ai_run_writes")[0].undone_at).not.toBeNull();
  });

  it("not found, another user's change, and an already-undone change", async () => {
    const fake = db({ receipt_expenses: [] }, [write({ user_id: "someone-else" })]);
    expect((await undoAIAction(fake, "u1", "call-1", { now: NOW })).status).toBe("not_found");
    const done = db({}, [write({ undone_at: "2026-10-18T15:00:00Z" })]);
    expect(await undoAIAction(done, "u1", "call-1", { now: NOW })).toMatchObject({ ok: true, status: "already" });
  });

  it("a logged call comes back out together with what its trigger did to the client", async () => {
    const activity = { id: "a1", user_id: "u1", client_id: "c1", type: "call", description: "talked about spring" };
    const clientBefore = { id: "c1", user_id: "u1", name: "Sam Example", status: "cruising", last_contact_at: null, first_contacted_at: null, updated_at: T1 };
    const clientAfter = { ...clientBefore, status: "boarding", last_contact_at: T2, first_contacted_at: T2, updated_at: T2 };
    const fake = db({ contact_activities: [activity], clients: [clientAfter] }, [
      write({ id: "w1", tool_name: "logContactActivity", table_name: "contact_activities", row_id: "a1", after_image: activity }),
      write({ id: "w2", tool_name: "logContactActivity", table_name: "clients", action: "update", row_id: "c1", before_image: clientBefore, after_image: clientAfter }),
    ]);
    const r = await undoAIAction(fake, "u1", "call-1", { now: NOW });
    expect(r).toMatchObject({ ok: true, status: "undone", restored: 2 });
    expect(fake.rows("contact_activities")).toEqual([]);
    expect(fake.rows("clients")[0]).toMatchObject({ status: "cruising", last_contact_at: null, first_contacted_at: null });
  });

  it("all or nothing: a record that changes between the checks and the apply leaves everything as it was", async () => {
    const t = { id: "t1", user_id: "u1", address: "12 Example St", sale_price: 400000 };
    const note = { id: "n1", user_id: "u1", body: "closing gift sent" };
    const fake = db({ transactions: [t], client_notes: [note] }, [
      write({ id: "w1", tool_name: "recordTransaction", table_name: "transactions", row_id: "t1", after_image: t }),
      write({ id: "w2", tool_name: "recordTransaction", seq: 1, table_name: "client_notes", row_id: "n1", after_image: note }),
    ], {
      // Someone edits the deal while the undo is being planned.
      fn_ai_row_references: (_args: Record<string, unknown>, d: FakeDb) => {
        d.rows("transactions")[0].sale_price = 410000;
        return { data: [], error: null };
      },
    });
    const r = await undoAIAction(fake, "u1", "call-1", { now: NOW });
    expect(r).toMatchObject({ ok: false, status: "refused" });
    expect(fake.rows("client_notes")).toHaveLength(1); // the note step ran first in the apply, and was rolled back
    expect(fake.rows("transactions")).toHaveLength(1);
    expect(fake.rows("ai_run_writes").every((w) => w.undone_at === null)).toBe(true);
  });

  it("refuses unless it is still exactly the change that was shown for approval", async () => {
    const row = { id: "t1", user_id: "u1", address: "12 Example St" };
    const ws = [write({ tool_name: "recordTransaction", table_name: "transactions", row_id: "t1", after_image: row })];
    const shown = actionFingerprint(groupWritesIntoActions(ws)[0]);
    const wrong = await undoAIAction(db({ transactions: [row] }, ws), "u1", "call-1", { now: NOW, expected: "something-else" });
    expect(wrong).toMatchObject({ ok: false, status: "refused" });
    const right = await undoAIAction(db({ transactions: [row] }, ws), "u1", "call-1", { now: NOW, expected: shown });
    expect(right.status).toBe("undone");
  });

  it("never offers an undo it can't finish: a delete that unlinked other records", async () => {
    const before = { id: "p1", user_id: "u1", address: "12 Example St" };
    const fake = db({ pipeline_deals: [] }, [
      write({
        tool_name: "removePipelineDeal", table_name: "pipeline_deals", action: "delete", row_id: "p1", before_image: before, after_image: null,
        irreversible_reason: "Other records were linked to it when it was deleted (1 deal), and undo can't put those links back.",
      }),
    ]);
    const r = await undoAIAction(fake, "u1", "call-1", { now: NOW });
    expect(r).toMatchObject({ ok: false, status: "refused" });
    expect(r.message).toMatch(/links back/);
    expect(fake.rows("pipeline_deals")).toEqual([]);
  });

  describe("a logged call and contacts logged since", () => {
    const T_AI = "2026-10-18T14:00:00.000000+00:00";
    const T_LATER = "2026-10-18T15:30:00.000000+00:00";
    const activity = { id: "a1", user_id: "u1", client_id: "c1", type: "call", activity_date: T_AI, created_at: T_AI };
    const clientBefore = { id: "c1", user_id: "u1", name: "Sam Example", status: "cruising", last_contact_at: null, first_contacted_at: null, updated_at: T1 };
    const clientAfter = { ...clientBefore, status: "boarding", last_contact_at: T_AI, first_contacted_at: T_AI, updated_at: T2 };
    const ledger = () => [
      write({ id: "w1", tool_name: "logContactActivity", table_name: "contact_activities", row_id: "a1", after_image: activity }),
      write({ id: "w2", tool_name: "logContactActivity", table_name: "clients", action: "update", row_id: "c1", before_image: clientBefore, after_image: clientAfter }),
    ];
    // Logged after the AI's call but dated a week earlier: the trigger only
    // moves last_contact_at forward, so the client row is unchanged.
    const laterCall = { id: "a2", user_id: "u1", client_id: "c1", type: "call", activity_date: "2026-10-11T14:00:00Z", created_at: T_LATER };

    it("refuses, changing nothing, when another call was logged for the client since (even dated earlier)", async () => {
      const fake = db({ contact_activities: [activity, laterCall], clients: [clientAfter] }, ledger());
      const r = await undoAIAction(fake, "u1", "call-1", { now: NOW });
      expect(r).toMatchObject({ ok: false, status: "refused" });
      expect(r.message).toMatch(/another activity was logged for client "Sam Example"/);
      expect(fake.rows("contact_activities")).toHaveLength(2);
      expect(fake.rows("clients")[0]).toMatchObject({ status: "boarding", last_contact_at: T_AI });
    });

    it("a note logged since doesn't block it (a note isn't contact)", async () => {
      const fake = db({ contact_activities: [activity, { ...laterCall, type: "note" }], clients: [clientAfter] }, ledger());
      expect((await undoAIAction(fake, "u1", "call-1", { now: NOW })).status).toBe("undone");
      expect(fake.rows("clients")[0]).toMatchObject({ status: "cruising", last_contact_at: null });
    });

    it("the apply re-checks it: a call logged while the undo is planned rolls everything back", async () => {
      const fake = db({ contact_activities: [activity], clients: [clientAfter] }, ledger(), {
        fn_ai_row_references: (_args: Record<string, unknown>, d: FakeDb) => {
          d.rows("contact_activities").push({ ...laterCall });
          return { data: [], error: null };
        },
      });
      const r = await undoAIAction(fake, "u1", "call-1", { now: NOW });
      expect(r).toMatchObject({ ok: false, status: "refused" });
      expect(r.message).toMatch(/something new was logged/);
      expect(fake.rows("contact_activities").map((a) => a.id)).toEqual(["a1", "a2"]);
      expect(fake.rows("clients")[0]).toMatchObject({ status: "boarding" });
    });
  });

  describe("the vehicle logbook (00184: composite keys to vehicles)", () => {
    const vehicle = { id: "v1", user_id: "u1", name: "My vehicle" };
    const period = { id: "lp1", user_id: "u1", vehicle_id: "v1", kind: "base", start_date: "2026-11-01", end_date: "2027-10-31" };
    const ledger = () => [
      write({ id: "w1", tool_name: "startLogbookPeriod", table_name: "vehicles", row_id: "v1", after_image: vehicle }),
      write({ id: "w2", tool_name: "startLogbookPeriod", seq: 1, table_name: "vehicle_logbook_periods", row_id: "lp1", after_image: period }),
    ];
    const vehicleRefs = referencesRpc([
      { table: "vehicle_logbook_periods", column: "vehicle_id" },
      { table: "vehicle_odometer_readings", column: "vehicle_id" },
      { table: "mileage_logs", column: "vehicle_id" },
    ]);

    it("a vehicle and the period started with it come out together, period first", async () => {
      const fake = db({ vehicles: [vehicle], vehicle_logbook_periods: [period], mileage_logs: [] }, ledger(), { fn_ai_row_references: vehicleRefs });
      const r = await undoAIAction(fake, "u1", "call-1", { now: NOW });
      expect(r).toMatchObject({ ok: true, status: "undone", restored: 2 });
      expect(fake.log.filter((l) => l.startsWith("apply"))).toEqual(["apply delete vehicle_logbook_periods lp1", "apply delete vehicles v1"]);
    });

    it("a vehicle a trip was logged against since stays (mileage_logs is NO ACTION)", async () => {
      const trip = { id: "m9", user_id: "u1", vehicle_id: "v1", km: 42, trip_date: "2026-11-03" };
      const fake = db({ vehicles: [vehicle], vehicle_logbook_periods: [period], mileage_logs: [trip] }, ledger(), { fn_ai_row_references: vehicleRefs });
      const r = await undoAIAction(fake, "u1", "call-1", { now: NOW });
      expect(r).toMatchObject({ ok: false, status: "refused" });
      expect(r.message).toMatch(/1 mileage entry linked to it/);
      expect(fake.rows("vehicles")).toHaveLength(1);
      expect(fake.rows("vehicle_logbook_periods")).toHaveLength(1);
    });
  });
});
