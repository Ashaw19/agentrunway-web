import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  opportunityKey, withoutDismissed, dismissOpportunity, undismissOpportunity,
} from "../dismissed-opportunities";

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

function fakeSupabase(opts: { userId?: string | null; error?: { message: string } | null } = {}) {
  const calls: { op: string; table: string; payload?: unknown; options?: unknown; filters?: Record<string, unknown> }[] = [];
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    const del = {
      eq(k: string, v: unknown) { filters[k] = v; return del; },
      then(resolve: (r: { error: unknown }) => void) {
        calls.push({ op: "delete", table, filters });
        resolve({ error: opts.error ?? null });
      },
    };
    return {
      upsert: async (payload: unknown, options: unknown) => {
        calls.push({ op: "upsert", table, payload, options });
        return { error: opts.error ?? null };
      },
      delete: () => del,
    };
  };
  const supabase = {
    auth: { getUser: async () => ({ data: { user: opts.userId === null ? null : { id: opts.userId ?? "u1" } } }) },
    from,
  } as unknown as SupabaseClient;
  return { supabase, calls };
}

const opp = { client_id: "c1", opportunity_type: "idle_client", trigger_date: "2026-10-01" };

describe("dismissOpportunity", () => {
  it("stores the occurrence for the signed-in user, idempotently", async () => {
    const { supabase, calls } = fakeSupabase();
    expect(await dismissOpportunity(supabase, opp)).toEqual({ ok: true });
    expect(calls).toEqual([{
      op: "upsert",
      table: "flight_control_dismissals",
      payload: { user_id: "u1", client_id: "c1", opportunity_type: "idle_client", trigger_date: "2026-10-01" },
      options: { onConflict: "user_id,client_id,opportunity_type,trigger_date", ignoreDuplicates: true },
    }]);
  });

  it("reports failure instead of pretending it saved", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { supabase } = fakeSupabase({ error: { message: "permission denied" } });
    expect(await dismissOpportunity(supabase, opp)).toEqual({ ok: false });
    spy.mockRestore();
  });

  it("refuses when nobody is signed in", async () => {
    const { supabase, calls } = fakeSupabase({ userId: null });
    expect(await dismissOpportunity(supabase, opp)).toEqual({ ok: false });
    expect(calls).toHaveLength(0);
  });
});

describe("undismissOpportunity", () => {
  it("deletes exactly that occurrence for the signed-in user", async () => {
    const { supabase, calls } = fakeSupabase();
    expect(await undismissOpportunity(supabase, opp)).toEqual({ ok: true });
    expect(calls).toEqual([{
      op: "delete",
      table: "flight_control_dismissals",
      filters: { user_id: "u1", client_id: "c1", opportunity_type: "idle_client", trigger_date: "2026-10-01" },
    }]);
  });
});
