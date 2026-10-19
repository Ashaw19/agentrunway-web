/**
 * The phone's cached "Next up" (stores/next-up-store.ts), run for real.
 * Mocked: saved storage (lib/mmkv, an in-memory map), the signed-in session
 * (lib/supabase) and the network (fetch). The clock is faked so the
 * once-a-minute fetch gate is deterministic. Every row is synthetic.
 *
 * What this holds:
 *   - hydrate restores the day's payload, the phone-only snoozes, the
 *     voice-note day and the call waiting for its after-call sheet; a fetch
 *     that finished before storage loaded is not overwritten by the saved copy
 *   - a failed fetch (no connection, a refusal, a body that is not a payload,
 *     a timeout) keeps the cached payload
 *   - the server is asked at most once a minute unless forced
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextUpPayload } from "@agent-runway/core/lib/next-up/types";
// The vi.mock calls below are hoisted over this import, so it loads the mocks.
import { useNextUpStore } from "../../stores/next-up-store";

const { mem, net, fetchMock } = vi.hoisted(() => ({
  mem: new Map<string, string | number>(),
  net: { getSession: vi.fn(async (): Promise<unknown> => ({ data: { session: { access_token: "tok-1" } } })) },
  fetchMock: vi.fn(),
}));

vi.mock("../mmkv", () => ({
  isStorageReady: () => true,
  initStorage: async () => {},
  storage: {
    getString: (k: string) => (typeof mem.get(k) === "string" ? (mem.get(k) as string) : undefined),
    getNumber: (k: string) => (typeof mem.get(k) === "number" ? (mem.get(k) as number) : undefined),
    set: (k: string, v: string | number) => void mem.set(k, v),
    delete: (k: string) => void mem.delete(k),
  },
  mmkvStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));
vi.mock("../supabase", () => ({
  supabase: { auth: { getSession: () => net.getSession() } },
}));
vi.stubGlobal("fetch", fetchMock);

// ── Fixtures ─────────────────────────────────────────────────────────────────

const handfulItem = (clientId: string, name: string): NextUpPayload["handful"][number] => ({
  client_id: clientId,
  client_name: name,
  opportunity_type: "birthday",
  trigger_date: "2026-10-19",
  label: "Birthday today",
  why_now: "Their birthday is today.",
  contact_channel: "call",
  phone: "5065550101",
  text: { status: "draftable" },
});

const payload = (over: Partial<NextUpPayload> = {}): NextUpPayload => ({
  day: "2026-10-19",
  target: 5,
  done_today: 1,
  generated_at: "2026-10-19T14:00:00.000Z",
  handful: [handfulItem("c1", "Sam Lee"), handfulItem("c2", "Pat Roy")],
  snoozed: [],
  urgent: { new_leads: 0, overdue_tasks: 0, deal_deadlines: 0 },
  ...over,
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

const EMPTY = {
  payload: null,
  fetchedAt: null,
  localSnoozes: {},
  voiceNoteDoneOn: null,
  pendingCall: null,
};

/** Each test starts a few hours after the last, well past the one-minute gate. */
let clock = Date.UTC(2026, 9, 19, 12, 0, 0);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  clock += 3 * 60 * 60 * 1000;
  vi.setSystemTime(clock);
  mem.clear();
  fetchMock.mockReset();
  net.getSession.mockReset();
  net.getSession.mockImplementation(async () => ({ data: { session: { access_token: "tok-1" } } }));
  useNextUpStore.setState(EMPTY);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const state = () => useNextUpStore.getState();

// ── hydrate ──────────────────────────────────────────────────────────────────

describe("hydrate", () => {
  it("restores the payload, the snoozes, the voice-note day and the pending call", () => {
    const saved = payload();
    const call = { clientId: "c1", clientName: "Sam Lee", at: 1_760_000_000_000 };
    mem.set("next_up_payload", JSON.stringify(saved));
    mem.set("next_up_local_snoozes", JSON.stringify({ "briefing:2026-10-19": "2026-10-19T20:00:00.000Z" }));
    mem.set("next_up_voice_note_done_on", "2026-10-19");
    mem.set("next_up_pending_call", JSON.stringify(call));

    state().hydrate();

    expect(state().payload).toEqual(saved);
    expect(state().localSnoozes).toEqual({ "briefing:2026-10-19": "2026-10-19T20:00:00.000Z" });
    expect(state().voiceNoteDoneOn).toBe("2026-10-19");
    expect(state().pendingCall).toEqual(call);
    // When the cached payload was built, so a screen can say how old it is.
    expect(state().fetchedAt).toBe(Date.parse(saved.generated_at));
  });

  it("leaves everything empty when nothing was saved", () => {
    state().hydrate();
    expect(state()).toMatchObject(EMPTY);
  });

  it("skips a saved value that is damaged and keeps the rest", () => {
    mem.set("next_up_payload", "{not json");
    mem.set("next_up_local_snoozes", JSON.stringify({ "briefing:2026-10-19": "2026-10-19T20:00:00.000Z" }));
    mem.set("next_up_pending_call", JSON.stringify({ clientId: 7 }));

    state().hydrate();

    expect(state().payload).toBeNull();
    expect(state().pendingCall).toBeNull();
    expect(state().localSnoozes).toEqual({ "briefing:2026-10-19": "2026-10-19T20:00:00.000Z" });
  });

  it("skips a saved payload that is not a payload", () => {
    mem.set("next_up_payload", JSON.stringify({ error: "Unauthorized" }));
    state().hydrate();
    expect(state().payload).toBeNull();
  });

  it("does not overwrite a payload fetched before storage finished loading", async () => {
    const fresh = payload({ done_today: 3, generated_at: "2026-10-19T15:00:00.000Z" });
    fetchMock.mockResolvedValue(ok(fresh));
    await state().fetchNextUp();
    // The older copy on disk (and an older write in memory) turns up afterwards.
    mem.set("next_up_payload", JSON.stringify(payload({ done_today: 0 })));
    mem.set("next_up_local_snoozes", JSON.stringify({ "a:1": "2099-01-01T00:00:00.000Z" }));
    useNextUpStore.setState({ localSnoozes: { "b:2": "2099-01-01T00:00:00.000Z" } });

    state().hydrate();

    expect(state().payload?.done_today).toBe(3);
    expect(state().localSnoozes).toEqual({ "a:1": "2099-01-01T00:00:00.000Z", "b:2": "2099-01-01T00:00:00.000Z" });
  });
});

// ── fetchNextUp ──────────────────────────────────────────────────────────────

describe("fetchNextUp", () => {
  it("asks /api/next-up with the Bearer token, keeps the answer and saves it", async () => {
    const fresh = payload({ done_today: 2 });
    fetchMock.mockResolvedValue(ok(fresh));

    await state().fetchNextUp();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/next-up$/);
    expect(init).toMatchObject({ method: "GET", headers: { Authorization: "Bearer tok-1" } });
    expect(state().payload).toEqual(fresh);
    expect(state().fetchedAt).toBe(Date.now());
    expect(JSON.parse(mem.get("next_up_payload") as string)).toEqual(fresh);
  });

  it("keeps the cached payload when there is no connection", async () => {
    const cached = payload();
    useNextUpStore.setState({ payload: cached, fetchedAt: 123 });
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));

    await expect(state().fetchNextUp()).resolves.toBeUndefined();

    expect(state().payload).toEqual(cached);
    expect(state().fetchedAt).toBe(123);
  });

  it("keeps the cached payload when the server refuses", async () => {
    const cached = payload();
    useNextUpStore.setState({ payload: cached });
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({ error: "Slow down" }) });

    await state().fetchNextUp();

    expect(state().payload).toEqual(cached);
  });

  it("keeps the cached payload when the answer is not a payload", async () => {
    const cached = payload();
    useNextUpStore.setState({ payload: cached });
    fetchMock.mockResolvedValue(ok({ error: "Internal server error" }));

    await state().fetchNextUp();
    expect(state().payload).toEqual(cached);

    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token <"); } });
    await state().fetchNextUp({ force: true });
    expect(state().payload).toEqual(cached);
    expect(mem.has("next_up_payload")).toBe(false);
  });

  it("keeps the cached payload when the server takes longer than 15 seconds", async () => {
    const cached = payload();
    useNextUpStore.setState({ payload: cached });
    fetchMock.mockReturnValue(new Promise(() => {}));

    const done = state().fetchNextUp();
    await vi.advanceTimersByTimeAsync(14_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2);
    await done;

    expect(state().payload).toEqual(cached);
  });

  it("does nothing when nobody is signed in", async () => {
    net.getSession.mockImplementation(async () => ({ data: { session: null } }));

    await state().fetchNextUp();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(state().payload).toBeNull();
  });

  it("asks at most once a minute", async () => {
    fetchMock.mockResolvedValue(ok(payload()));

    await state().fetchNextUp();
    await vi.advanceTimersByTimeAsync(59_000);
    await state().fetchNextUp();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    await state().fetchNextUp();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("counts a failed try toward the minute, so a refusing server isn't asked again at once", async () => {
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));

    await state().fetchNextUp();
    await state().fetchNextUp();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks again at once when forced", async () => {
    fetchMock.mockResolvedValue(ok(payload()));

    await state().fetchNextUp();
    await state().fetchNextUp({ force: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shares one request between callers that overlap", async () => {
    let answer!: (v: unknown) => void;
    fetchMock.mockReturnValue(new Promise((resolve) => { answer = resolve; }));

    const a = state().fetchNextUp();
    const b = state().fetchNextUp();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    answer(ok(payload()));
    await Promise.all([a, b]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a forced call made during a request asks again afterwards, so it sees what was just saved", async () => {
    const before = payload({ done_today: 1 });
    const after = payload({ done_today: 2 });
    let first!: (v: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => { first = resolve; }));
    fetchMock.mockResolvedValueOnce(ok(after));

    const a = state().fetchNextUp();
    await vi.advanceTimersByTimeAsync(0);
    const b = state().fetchNextUp({ force: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    first(ok(before));
    await Promise.all([a, b]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(state().payload).toEqual(after);
  });
});

// ── The small writers ────────────────────────────────────────────────────────

describe("snoozes, voice note and pending call", () => {
  it("snoozeCard keeps the time and saves it", () => {
    state().snoozeCard("briefing:2026-10-19", "2026-10-19T20:00:00.000Z");
    expect(state().localSnoozes).toEqual({ "briefing:2026-10-19": "2026-10-19T20:00:00.000Z" });
    expect(JSON.parse(mem.get("next_up_local_snoozes") as string)).toEqual(state().localSnoozes);
  });

  it("snoozeCard lets go of snoozes whose time has passed", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const ahead = new Date(Date.now() + 60_000).toISOString();
    useNextUpStore.setState({ localSnoozes: { "old:1": past, "odd:2": "not a time", "new:3": ahead } });

    state().snoozeCard("task:9", ahead);

    expect(state().localSnoozes).toEqual({ "new:3": ahead, "task:9": ahead });
  });

  it("markVoiceNoteDone keeps the day and saves it", () => {
    state().markVoiceNoteDone("2026-10-19");
    expect(state().voiceNoteDoneOn).toBe("2026-10-19");
    expect(mem.get("next_up_voice_note_done_on")).toBe("2026-10-19");
  });

  it("setPendingCall and clearPendingCall save and remove the call", () => {
    const call = { clientId: "c1", clientName: "Sam Lee", at: Date.now() };
    state().setPendingCall(call);
    expect(state().pendingCall).toEqual(call);
    expect(JSON.parse(mem.get("next_up_pending_call") as string)).toEqual(call);

    state().clearPendingCall();
    expect(state().pendingCall).toBeNull();
    expect(mem.has("next_up_pending_call")).toBe(false);
  });
});

describe("dropHandfulClient", () => {
  it("takes the client off the handful at once, counts them as done, and saves it", () => {
    useNextUpStore.setState({ payload: payload({ done_today: 1 }) });

    state().dropHandfulClient("c1");

    expect(state().payload?.handful.map((h) => h.client_id)).toEqual(["c2"]);
    expect(state().payload?.done_today).toBe(2);
    expect(JSON.parse(mem.get("next_up_payload") as string).handful).toHaveLength(1);
  });

  it("also takes a client back from Later", () => {
    const later = { client_id: "c3", client_name: "Kim Fox", until: "2026-10-19T12:00:00.000Z", phone: null };
    useNextUpStore.setState({ payload: payload({ snoozed: [later], done_today: 0 }) });

    state().dropHandfulClient("c3");

    expect(state().payload?.snoozed).toEqual([]);
    expect(state().payload?.handful).toHaveLength(2);
    expect(state().payload?.done_today).toBe(1);
  });

  it("changes nothing for a client who isn't on the handful, or with no payload", () => {
    const cached = payload();
    useNextUpStore.setState({ payload: cached });
    state().dropHandfulClient("nobody");
    expect(state().payload).toEqual(cached);

    useNextUpStore.setState({ payload: null });
    expect(() => state().dropHandfulClient("c1")).not.toThrow();
    expect(state().payload).toBeNull();
  });
});
