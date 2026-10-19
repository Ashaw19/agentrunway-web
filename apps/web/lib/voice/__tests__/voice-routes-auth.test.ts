/**
 * Both voice routes take the web session cookie AND the iPhone app's Bearer
 * token (getRequestUser). Until 2026-10-18 they read only the cookie, so the
 * phone could not use them. The model and Groq are mocked at the boundary
 * (no API keys locally); the Supabase clients are test doubles that say who
 * is signed in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ── Boundaries ───────────────────────────────────────────────────────────────

const cookieUser = { current: null as { id: string } | null };
const bearerUsers = new Map<string, { id: string }>();
const tokenClients: string[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: cookieUser.current } }) },
    from: () => emptyQuery(),
  })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { getUser: async (token: string) => ({ data: { user: bearerUsers.get(token) ?? null } }) },
  }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn((_url: string, _key: string, opts: { global: { headers: { Authorization: string } } }) => {
    tokenClients.push(opts.global.headers.Authorization);
    return { from: () => emptyQuery() };
  }),
}));
vi.mock("@/lib/require-pro", () => ({ requirePro: vi.fn(async () => ({ allowed: true })) }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  rateLimitHeaders: vi.fn(() => ({})),
}));
vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({ models: { fast: "test-fast" }, heliconeHeaders: () => ({}) }));
const transcribe = vi.fn();
vi.mock("openai", () => ({
  default: class {
    audio = { transcriptions: { create: transcribe } };
  },
}));

/** A query that finds nothing: the name search has no clients to match here. */
function emptyQuery() {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "in", "ilike", "filter", "limit", "order"]) q[m] = () => q;
  q.maybeSingle = async () => ({ data: null, error: null });
  q.single = async () => ({ data: null, error: null });
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
  return q;
}

import { generateText } from "ai";
import { POST as extractPOST } from "@/app/api/voice-extract/route";
import { POST as transcribePOST } from "@/app/api/voice-transcribe/route";

const MODEL_REPLY = JSON.stringify({
  transcript_cleaned: "Order sign riders Friday",
  intents: [{ intent: "create_task", title: "Order sign riders", client_name: null, due_spoken: "Friday", due_date: null, priority: "normal" }],
});

function extractRequest(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/voice-extract", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ transcript: "Remind me to order sign riders Friday" }),
  });
}

function transcribeRequest(headers: Record<string, string> = {}) {
  const form = new FormData();
  form.append("audio", new File([new Uint8Array(2048)], "note.m4a", { type: "audio/m4a" }));
  return new NextRequest("http://localhost/api/voice-transcribe", { method: "POST", headers, body: form });
}

beforeEach(() => {
  cookieUser.current = null;
  bearerUsers.clear();
  tokenClients.length = 0;
  vi.stubEnv("ANTHROPIC_API_KEY", "test");
  vi.stubEnv("GROQ_API_KEY", "test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://supabase.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  vi.mocked(generateText).mockReset();
  vi.mocked(generateText).mockResolvedValue({ text: MODEL_REPLY } as never);
  transcribe.mockReset();
  transcribe.mockResolvedValue({ text: "Remind me to order sign riders Friday" });
});
afterEach(() => vi.unstubAllEnvs());

describe("/api/voice-extract auth", () => {
  it("401 with no cookie and no token", async () => {
    const res = await extractPOST(extractRequest());
    expect(res.status).toBe(401);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("401 with a token that isn't a session", async () => {
    const res = await extractPOST(extractRequest({ authorization: "Bearer not-a-session" }));
    expect(res.status).toBe(401);
  });

  it("works with the web cookie", async () => {
    cookieUser.current = { id: "user-web" };
    const res = await extractPOST(extractRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.writes[0]).toMatchObject({ tool: "createContactTask", args: { title: "Order sign riders", priority: "normal" } });
    expect(tokenClients).toEqual([]);
  });

  it("works with the phone's Bearer token, through a token-scoped client", async () => {
    bearerUsers.set("phone-token", { id: "user-phone" });
    const res = await extractPOST(extractRequest({ authorization: "Bearer phone-token" }));
    expect(res.status).toBe(200);
    expect(tokenClients).toEqual(["Bearer phone-token"]);
    const body = await res.json();
    expect(body.transcript).toBe("Remind me to order sign riders Friday");
    expect(body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("422 when the model's reply isn't JSON", async () => {
    cookieUser.current = { id: "user-web" };
    vi.mocked(generateText).mockResolvedValue({ text: "Sorry, I can't." } as never);
    const res = await extractPOST(extractRequest());
    expect(res.status).toBe(422);
  });
});

describe("/api/voice-transcribe auth", () => {
  it("401 with no cookie and no token", async () => {
    const res = await transcribePOST(transcribeRequest());
    expect(res.status).toBe(401);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("works with the web cookie", async () => {
    cookieUser.current = { id: "user-web" };
    const res = await transcribePOST(transcribeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ transcript: "Remind me to order sign riders Friday" });
  });

  it("works with the phone's Bearer token, and asks Whisper for English", async () => {
    bearerUsers.set("phone-token", { id: "user-phone" });
    const res = await transcribePOST(transcribeRequest({ authorization: "Bearer phone-token" }));
    expect(res.status).toBe(200);
    expect(transcribe).toHaveBeenCalledWith(expect.objectContaining({ model: "whisper-large-v3-turbo", language: "en" }));
  });

  it("refuses audio over 4 MB (Vercel stops bodies at 4.5 MB before the route runs)", async () => {
    cookieUser.current = { id: "user-web" };
    const form = new FormData();
    form.append("audio", new File([new Uint8Array(4 * 1024 * 1024 + 1)], "long.m4a", { type: "audio/m4a" }));
    const res = await transcribePOST(new NextRequest("http://localhost/api/voice-transcribe", { method: "POST", body: form }));
    expect(res.status).toBe(413);
  });
});
