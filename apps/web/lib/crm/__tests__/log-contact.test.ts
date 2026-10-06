import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logClientContact } from "../log-contact";

/**
 * "Log contact" from a Flight Control card (Andrew, 2026-10-06): the agent
 * reached the client another way and wants them off the list.
 *
 * The insert into contact_activities is what clears them: the DB trigger
 * moves clients.last_contact_at, and Scan suppresses anyone contacted in the
 * last 14 days. Every activity insert failed from April to 2026-10-06 (00112)
 * and the CRM showed only "Failed to log activity", so this helper must
 * report failure, never claim success.
 */

type Row = Record<string, unknown>;

function fakeSupabase(opts: {
  userId?: string | null;
  client?: Row | null;
  insertError?: { message: string; code?: string } | null;
  /** Emulates the 00105/00166 trigger flipping status on insert. */
  statusAfterInsert?: string;
}) {
  const inserts: Row[] = [];
  const client = opts.client ? { ...opts.client } : null;

  const from = (table: string) => {
    const filters: Row = {};
    const builder = {
      select: () => builder,
      eq: (k: string, v: unknown) => { filters[k] = v; return builder; },
      maybeSingle: async () => {
        const hit = table === "clients" && client
          && Object.entries(filters).every(([k, v]) => client[k] === v);
        return { data: hit ? { status: client!.status } : null, error: null };
      },
      insert: async (row: Row) => {
        if (opts.insertError) return { error: opts.insertError };
        inserts.push(row);
        if (client && opts.statusAfterInsert) client.status = opts.statusAfterInsert;
        return { error: null };
      },
    };
    return builder;
  };

  const supabase = {
    auth: { getUser: async () => ({ data: { user: opts.userId === null ? null : { id: opts.userId ?? "u1" } } }) },
    from,
  } as unknown as SupabaseClient;

  return { supabase, inserts };
}

describe("logClientContact", () => {
  it("inserts a contact activity for the signed-in user", async () => {
    const { supabase, inserts } = fakeSupabase({ client: { id: "c1", user_id: "u1", status: "boarding" } });
    const res = await logClientContact(supabase, {
      clientId: "c1", type: "call", description: "Caught up about the fall market",
      activityDate: "2026-10-06T15:00:00.000Z",
    });
    expect(res.ok).toBe(true);
    expect(inserts).toEqual([{
      user_id: "u1", client_id: "c1", type: "call",
      description: "Caught up about the fall market", activity_date: "2026-10-06T15:00:00.000Z",
    }]);
  });

  it("reports an insert failure instead of claiming success", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { supabase } = fakeSupabase({
      client: { id: "c1", user_id: "u1", status: "boarding" },
      insertError: { code: "42703", message: 'column "auto_promote_on_activity" does not exist' },
    });
    const res = await logClientContact(supabase, { clientId: "c1", type: "text", description: "x" });
    expect(res.ok).toBe(false);
    expect(spy).toHaveBeenCalled(); // the cause reaches the console, not just a generic toast
    spy.mockRestore();
  });

  it("refuses when nobody is signed in", async () => {
    const { supabase, inserts } = fakeSupabase({ userId: null, client: { id: "c1", user_id: "u1", status: "boarding" } });
    const res = await logClientContact(supabase, { clientId: "c1", type: "call", description: "x" });
    expect(res.ok).toBe(false);
    expect(inserts).toHaveLength(0);
  });

  it("refuses a client the user doesn't own", async () => {
    const { supabase, inserts } = fakeSupabase({ client: { id: "c1", user_id: "someone-else", status: "boarding" } });
    const res = await logClientContact(supabase, { clientId: "c1", type: "call", description: "x" });
    expect(res.ok).toBe(false);
    expect(inserts).toHaveLength(0);
  });

  it("reports an auto-promotion from Cruising to Boarding", async () => {
    const { supabase } = fakeSupabase({
      client: { id: "c1", user_id: "u1", status: "cruising" },
      statusAfterInsert: "boarding",
    });
    const res = await logClientContact(supabase, { clientId: "c1", type: "call", description: "x" });
    expect(res).toMatchObject({ ok: true, priorStatus: "cruising", newStatus: "boarding" });
  });

  it("defaults the activity date to now", async () => {
    const { supabase, inserts } = fakeSupabase({ client: { id: "c1", user_id: "u1", status: "boarding" } });
    const before = Date.now();
    await logClientContact(supabase, { clientId: "c1", type: "email", description: "x" });
    const stamped = Date.parse(inserts[0].activity_date as string);
    expect(stamped).toBeGreaterThanOrEqual(before - 1000);
    expect(stamped).toBeLessThanOrEqual(Date.now() + 1000);
  });
});
