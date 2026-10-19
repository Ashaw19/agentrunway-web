/**
 * checkRateLimit with a calendar window: a limit "per Atlantic day" counts
 * from atlanticDayStart(day) to the next day's start, not a fixed UTC-aligned
 * block (a 24-hour block would reset at 8 or 9 pm Atlantic). The phone's Next
 * up uses it to cap draft attempts per client per day. A number still means
 * a fixed window of that many minutes, as before.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({ state: { admin: null as unknown } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => state.admin }));

import { checkRateLimit } from "@/lib/rate-limit";
import { fakeSupabase, type Row } from "../ai/__tests__/helpers/fake-supabase";

const USER = "user-1";
const KEY = "next_up_draft:c-1";
const OCT19 = { start: new Date("2026-10-19T03:00:00Z"), end: new Date("2026-10-20T03:00:00Z") };

function withRow(row: Row | null) {
  const db = fakeSupabase({ rate_limits: row ? [{ user_id: USER, endpoint: KEY, ...row }] : [] });
  state.admin = db.client;
  return db;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T01:00:00Z")); // 22:00 ADT on Oct 19
});
afterEach(() => vi.useRealTimers());

describe("checkRateLimit: a calendar window", () => {
  it("the first attempt of the day starts the window at the day's start", async () => {
    const db = withRow(null);
    const r = await checkRateLimit(USER, KEY, 2, OCT19);
    expect(r).toEqual({ allowed: true, remaining: 1, resetAt: OCT19.end });
    expect(db.writes).toEqual([{
      table: "rate_limits", op: "upsert",
      payload: { user_id: USER, endpoint: KEY, window_start: OCT19.start.toISOString(), request_count: 1 },
    }]);
  });

  it("the second attempt counts; the third is refused and writes nothing", async () => {
    let db = withRow({ window_start: OCT19.start.toISOString(), request_count: 1 });
    expect(await checkRateLimit(USER, KEY, 2, OCT19)).toEqual({ allowed: true, remaining: 0, resetAt: OCT19.end });
    expect(db.writes).toEqual([{ table: "rate_limits", op: "update", payload: { request_count: 2 } }]);

    db = withRow({ window_start: OCT19.start.toISOString(), request_count: 2 });
    expect(await checkRateLimit(USER, KEY, 2, OCT19)).toEqual({ allowed: false, remaining: 0, resetAt: OCT19.end });
    expect(db.writes).toEqual([]);
  });

  it("past UTC midnight the Atlantic day's count still holds", async () => {
    // A 24-hour fixed block would have started over at 00:00 UTC (21:00 ADT).
    withRow({ window_start: OCT19.start.toISOString(), request_count: 2 });
    expect((await checkRateLimit(USER, KEY, 2, OCT19)).allowed).toBe(false);
  });

  it("yesterday's count doesn't carry into today", async () => {
    vi.setSystemTime(new Date("2026-10-20T13:00:00Z"));
    const OCT20 = { start: new Date("2026-10-20T03:00:00Z"), end: new Date("2026-10-21T03:00:00Z") };
    const db = withRow({ window_start: OCT19.start.toISOString(), request_count: 2 });
    expect(await checkRateLimit(USER, KEY, 2, OCT20)).toEqual({ allowed: true, remaining: 1, resetAt: OCT20.end });
    expect(db.writes[0]).toMatchObject({ op: "upsert", payload: { window_start: OCT20.start.toISOString(), request_count: 1 } });
  });
});

describe("checkRateLimit: a number of minutes, unchanged", () => {
  it("is a fixed window aligned to the clock", async () => {
    vi.setSystemTime(new Date("2026-10-19T18:20:00Z"));
    const db = withRow(null);
    const r = await checkRateLimit(USER, "next_up", 60, 60);
    expect(r).toEqual({ allowed: true, remaining: 59, resetAt: new Date("2026-10-19T19:00:00Z") });
    expect(db.writes[0]).toMatchObject({ payload: { window_start: "2026-10-19T18:00:00.000Z" } });
  });
});
