/**
 * POST /api/mobile/outreach/draft-texts: the phone's Text drafting.
 *
 * R32: a tap on Text on a Next up card (a handful pick or a new lead) sends
 * source "next_up", and the drafter tags the text context.source = "next_up",
 * so the handful's clean-up skips it once the client is handled before it's
 * sent. The tag is only a tag: the background drafter's never-overwrite rule
 * (background) is never set here, so a tap may still draft over a text the
 * agent skipped earlier. With no source, nothing is tagged. Any other source
 * is refused. Synthetic rows only; the drafter itself is mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, draftTextForClient } = vi.hoisted(() => ({
  state: { signedIn: true },
  draftTextForClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.signedIn ? { id: "user-1" } : null }, error: null }) },
  }),
}));
vi.mock("@/lib/require-pro", () => ({ requirePro: async () => ({ allowed: true }) }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: true, remaining: 19, resetAt: new Date(0) }),
  rateLimitHeaders: () => ({}),
}));
vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({ models: { default: "m", fallback: "f" }, aiCallHeaders: () => ({}) }));
vi.mock("@/lib/ai/draft-text", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/draft-text")>()),
  draftTextForClient,
}));

import { POST } from "@/app/api/mobile/outreach/draft-texts/route";

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/mobile/outreach/draft-texts", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest);

beforeEach(() => {
  state.signedIn = true;
  draftTextForClient.mockReset();
  draftTextForClient.mockImplementation(async (input: { clientId: string }) =>
    ({ status: "created", clientId: input.clientId, clientName: "Sam Lee", queueItemId: "q-1" }));
});

describe("POST /api/mobile/outreach/draft-texts: the Next up tag (R32)", () => {
  it("source next_up tags the draft, with no background rule (a tap may draft over a skipped text)", async () => {
    const res = await post({ client_ids: ["c-1"], purpose: "check_in", note: "New lead, first contact", source: "next_up" });
    expect(res.status).toBe(200);
    expect(draftTextForClient).toHaveBeenCalledTimes(1);
    const input = draftTextForClient.mock.calls[0][0];
    expect(input).toMatchObject({ userId: "user-1", clientId: "c-1", purpose: "check_in", note: "New lead, first contact", source: "next_up" });
    expect(input.background).toBeUndefined();
  });

  it("with no source nothing is tagged", async () => {
    const res = await post({ client_ids: ["c-1", "c-2"], purpose: "check_in" });
    expect(res.status).toBe(200);
    for (const [input] of draftTextForClient.mock.calls) {
      expect(input.source).toBeUndefined();
      expect(input.background).toBeUndefined();
    }
  });

  it("any other source is refused, and nothing is drafted", async () => {
    const res = await post({ client_ids: ["c-1"], purpose: "check_in", source: "nightly" });
    expect(res.status).toBe(400);
    expect(draftTextForClient).not.toHaveBeenCalled();
  });

  it("still needs a signed-in user", async () => {
    state.signedIn = false;
    const res = await post({ client_ids: ["c-1"], purpose: "check_in", source: "next_up" });
    expect(res.status).toBe(401);
    expect(draftTextForClient).not.toHaveBeenCalled();
  });
});
