/**
 * GET /api/ai/top-opportunities (web Flight Control Scan) serves the day's
 * handful (lib/crm/next-up-handful.ts), so Scan and the phone show the same
 * people. Same rate limit and `{ opportunities }` shape as before.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, loadNextUpHandful, checkRateLimit } = vi.hoisted(() => ({
  state: { signedIn: true },
  loadNextUpHandful: vi.fn(),
  checkRateLimit: vi.fn(),
}));

const SUPABASE = { tag: "rls-client" };

vi.mock("@/lib/api-helpers", async () => {
  const { NextResponse } = await import("next/server");
  return {
    authenticateRequest: async () => (state.signedIn
      ? { supabase: SUPABASE, userId: "user-1" }
      : { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }),
  };
});
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit, rateLimitHeaders: () => ({}) }));
vi.mock("@/lib/crm/next-up-handful", () => ({ loadNextUpHandful }));
// The route must not reach the stateless scan directly.
vi.mock("@/app/api/ai/detect-opportunities/route", () => ({
  getTopOpportunities: () => { throw new Error("Scan reads the handful, not getTopOpportunities"); },
}));

import { GET } from "@/app/api/ai/top-opportunities/route";

beforeEach(() => {
  state.signedIn = true;
  loadNextUpHandful.mockReset();
  checkRateLimit.mockReset();
  checkRateLimit.mockResolvedValue({ allowed: true, remaining: 19, resetAt: 0, limit: 20 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/ai/top-opportunities", () => {
  it("returns the handful's cards, synced (persisted) for the signed-in user", async () => {
    const opportunities = [{ client_id: "c1" }, { client_id: "c2" }];
    loadNextUpHandful.mockResolvedValue({ day: "2026-10-19", doneToday: 1, opportunities, snoozed: [] });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ opportunities });
    expect(loadNextUpHandful).toHaveBeenCalledTimes(1);
    const [userId, supabase, opts] = loadNextUpHandful.mock.calls[0];
    expect([userId, supabase]).toEqual(["user-1", SUPABASE]);
    expect(opts?.persist ?? true).toBe(true);
  });

  it("keeps its rate limit: 20 an hour", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: 0, limit: 20 });
    const res = await GET();
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith("user-1", "top_opportunities", 20, 60);
    expect(loadNextUpHandful).not.toHaveBeenCalled();
  });

  it("401 when signed out", async () => {
    state.signedIn = false;
    expect((await GET()).status).toBe(401);
    expect(loadNextUpHandful).not.toHaveBeenCalled();
  });

  it("500 when the handful can't be built", async () => {
    loadNextUpHandful.mockRejectedValue(new Error("clients fetch failed"));
    expect((await GET()).status).toBe(500);
  });
});
