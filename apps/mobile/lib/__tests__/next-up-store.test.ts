/**
 * The phone's cached "Next up" (stores/next-up-store.ts), run for real.
 * Mocked: saved storage (lib/mmkv, an in-memory map), the signed-in session
 * (lib/supabase), the network (fetch), the device locale (for the app's real
 * i18n, lib/i18n.ts) and core's suggestion writers (record-writers), so what
 * the store does with each outcome is what is tested. The clock is faked so
 * the once-a-minute fetch gate is deterministic. Every row is synthetic.
 *
 * What this holds:
 *   - hydrate restores the day's payload, the phone-only snoozes, the
 *     voice-note day and the call waiting for its after-call sheet; a fetch
 *     that finished before storage loaded is not overwritten by the saved copy
 *   - a failed fetch (no connection, a refusal, a body that is not a payload,
 *     a timeout) keeps the cached payload
 *   - the server is asked at most once a minute unless forced
 *   - an answer to a request that left before a card was handled on the
 *     phone doesn't bring the card back (R22)
 *   - the write actions: Skip, Later, Stop, the Hangar and "already talked"
 *     go through core's writers; on success the card leaves at once, the
 *     server is asked again and the toast offers Undo; offline the card
 *     stays and the toast says to try again; a Later a running Stop blocked
 *     writes nothing and offers no Undo; Undo for Skip, Stop and the Hangar
 *     puts the client back on today's list
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NEXT_UP_PAYLOAD_VERSION, type NextUpPayload } from "@agent-runway/core/lib/next-up/types";
// The vi.mock calls below are hoisted over these imports, so they load the mocks.
import "../i18n";
import { onNextUpClientChange, useNextUpStore } from "../../stores/next-up-store";
import { useToastStore } from "../../stores/toast-store";
import { useOfflineQueueStore } from "../../stores/offline-queue";

const SESSION = { data: { session: { access_token: "tok-1", user: { id: "u1" } } } };

const { mem, net, fetchMock, writers } = vi.hoisted(() => ({
  mem: new Map<string, string | number>(),
  net: { getSession: vi.fn(async (): Promise<unknown> => ({ data: { session: { access_token: "tok-1", user: { id: "u1" } } } })) },
  fetchMock: vi.fn(),
  writers: {
    writeSuggestionSkip: vi.fn(),
    removeSuggestionDismissal: vi.fn(),
    removeSuggestionSkipByKey: vi.fn(),
    writeSuggestionHold: vi.fn(),
    resumeSuggestions: vi.fn(),
    writeClientToHangar: vi.fn(),
    restoreClientFromHangar: vi.fn(),
    reopenHandfulPin: vi.fn(),
    writeContactActivity: vi.fn(),
    applyCaptureWrite: vi.fn(),
  },
}));

vi.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-CA" }] }));
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
vi.mock("@agent-runway/core/lib/record-writers", () => writers);
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
  version: NEXT_UP_PAYLOAD_VERSION,
  day: "2026-10-19",
  target: 5,
  done_today: 1,
  generated_at: "2026-10-19T14:00:00.000Z",
  handful: [handfulItem("c1", "Sam Lee"), handfulItem("c2", "Pat Roy")],
  snoozed: [],
  urgent: { new_leads: 0, overdue_tasks: 0, deal_deadlines: 0 },
  new_leads: [],
  ...over,
});

/** A payload as the server sent it before `version` and `new_leads` (R31). */
const versionOne = () => {
  const { version: _v, new_leads: _l, ...older } = payload();
  return older;
};

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
  net.getSession.mockImplementation(async () => SESSION);
  for (const w of Object.values(writers)) w.mockReset();
  useNextUpStore.setState(EMPTY);
  useToastStore.setState({ message: null, action: undefined });
  useOfflineQueueStore.setState({ isOnline: true });
  onNextUpClientChange(null);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(async () => {
  // A request a test left hanging times out here, so the next test starts with none in flight.
  await vi.advanceTimersByTimeAsync(20_000);
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

  it("ignores a payload saved in an older shape (no version, no new leads' text): it isn't read as today's (R31)", () => {
    mem.set("next_up_payload", JSON.stringify(versionOne()));
    state().hydrate();
    expect(state().payload).toBeNull();
    expect(state().fetchedAt).toBeNull();

    mem.set("next_up_payload", JSON.stringify({ ...payload(), version: 99 }));
    state().hydrate();
    expect(state().payload).toBeNull();

    mem.set("next_up_payload", JSON.stringify({ ...payload(), new_leads: undefined }));
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

// ── The pending call (R34) ───────────────────────────────────────────────────

describe("noteAppBackgrounded", () => {
  it("stamps the call waiting with when the app went to the background, and saves it", () => {
    const call = { clientId: "c1", clientName: "Sam Lee", at: Date.now() - 2_000 };
    state().setPendingCall(call);
    state().noteAppBackgrounded(Date.now());
    expect(state().pendingCall).toEqual({ ...call, backgroundedAt: Date.now() });
    expect(JSON.parse(mem.get("next_up_pending_call") as string)).toEqual({ ...call, backgroundedAt: Date.now() });

    // A second trip away keeps the first stamp.
    const first = Date.now();
    vi.advanceTimersByTime(60_000);
    state().noteAppBackgrounded(Date.now());
    expect(state().pendingCall?.backgroundedAt).toBe(first);
  });

  it("does nothing with no call waiting", () => {
    state().noteAppBackgrounded(Date.now());
    expect(state().pendingCall).toBeNull();
    expect(mem.has("next_up_pending_call")).toBe(false);
  });

  it("the stamp survives a restart (hydrate), so a call that outlived the app still asks", () => {
    const saved = { clientId: "c1", clientName: "Sam Lee", at: 1_760_000_000_000, backgroundedAt: 1_760_000_001_000 };
    mem.set("next_up_pending_call", JSON.stringify(saved));
    state().hydrate();
    expect(state().pendingCall).toEqual(saved);
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

  it("keeps the cached payload when the answer is in an older or unknown shape (R31)", async () => {
    const cached = payload();
    useNextUpStore.setState({ payload: cached });
    fetchMock.mockResolvedValue(ok(versionOne()));

    await state().fetchNextUp();
    expect(state().payload).toEqual(cached);

    fetchMock.mockResolvedValue(ok({ ...payload({ done_today: 4 }), version: 3 }));
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

// ── R22: a late answer never brings a handled card back ──────────────────────

describe("an answer that left before a card was handled", () => {
  it("is ignored, so the dismissed client stays off; a request sent after is taken", async () => {
    useNextUpStore.setState({ payload: payload({ done_today: 1 }) });
    let late!: (v: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => { late = resolve; }));

    const stale = state().fetchNextUp();
    await vi.advanceTimersByTimeAsync(0);
    state().dropHandfulClient("c1");
    // The server built this before the skip landed: it still lists c1.
    late(ok(payload({ done_today: 1 })));
    await stale;

    expect(state().payload?.handful.map((h) => h.client_id)).toEqual(["c2"]);
    expect(state().payload?.done_today).toBe(2);

    fetchMock.mockResolvedValueOnce(ok(payload({ handful: [handfulItem("c2", "Pat Roy")], done_today: 2, generated_at: "2026-10-19T16:00:00.000Z" })));
    await state().fetchNextUp({ force: true });
    expect(state().payload?.generated_at).toBe("2026-10-19T16:00:00.000Z");
  });

  it("a forced pull that left before the card was handled is ignored too; the handled card's own refetch lands", async () => {
    useNextUpStore.setState({ payload: payload() });
    let late!: (v: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => { late = resolve; }));
    fetchMock.mockResolvedValueOnce(ok(payload({ handful: [handfulItem("c2", "Pat Roy")], done_today: 2 })));

    const pull = state().fetchNextUp({ force: true });
    await vi.advanceTimersByTimeAsync(0);
    state().dropHandfulClient("c1");
    const after = state().fetchNextUp({ force: true });
    late(ok(payload()));
    await Promise.all([pull, after]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(state().payload?.handful.map((h) => h.client_id)).toEqual(["c2"]);
  });
});

// ── The write actions ────────────────────────────────────────────────────────

const toast = () => useToastStore.getState();
const settle = async () => {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
};
/** The server's answer after a write: it no longer lists `gone`. */
const answerWithout = (gone: string, over: Partial<NextUpPayload> = {}) =>
  fetchMock.mockResolvedValue(ok(payload({ handful: payload().handful.filter((h) => h.client_id !== gone), ...over })));

describe("skipSuggestion", () => {
  it("skips the occurrence through core, drops the card, asks the server again and offers Undo", async () => {
    useNextUpStore.setState({ payload: payload({ done_today: 1 }) });
    // A fetch a moment ago: only a forced one goes now.
    fetchMock.mockResolvedValueOnce(ok(payload({ done_today: 1 })));
    await state().fetchNextUp();
    let answer!: (v: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => { answer = resolve; }));
    writers.writeSuggestionSkip.mockResolvedValue({ ok: true, message: "Suggestion skipped.", id: "d1" });

    await expect(state().skipSuggestion(payload().handful[0])).resolves.toBe(true);

    expect(writers.writeSuggestionSkip).toHaveBeenCalledWith(expect.anything(), "u1", {
      client_id: "c1", opportunity_type: "birthday", trigger_date: "2026-10-19",
    });
    expect(state().payload?.handful.map((h) => h.client_id)).toEqual(["c2"]);
    expect(state().payload?.done_today).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(toast().message).toBe("Skipped Sam Lee this time. They come back at their next reason to reach out.");
    expect(toast().action?.label).toBe("Undo");
    answer(ok(payload({ handful: [handfulItem("c2", "Pat Roy")], done_today: 2 })));
    await settle();
  });

  it("offline: the card stays, nothing is queued, and the toast says to try again", async () => {
    useNextUpStore.setState({ payload: payload() });
    writers.writeSuggestionSkip.mockResolvedValue({ ok: false, offline: true, message: "Couldn't skip the suggestion: Network request failed." });

    await expect(state().skipSuggestion(payload().handful[0])).resolves.toBe(false);

    expect(state().payload).toEqual(payload());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(toast().message).toBe("No connection. Try again.");
    expect(toast().action).toBeUndefined();
  });

  it("known to be offline: the write isn't even tried", async () => {
    useNextUpStore.setState({ payload: payload() });
    useOfflineQueueStore.setState({ isOnline: false });

    await expect(state().skipSuggestion(payload().handful[0])).resolves.toBe(false);

    expect(writers.writeSuggestionSkip).not.toHaveBeenCalled();
    expect(toast().message).toBe("No connection. Try again.");
  });

  it("a refusal keeps the card and says so", async () => {
    useNextUpStore.setState({ payload: payload() });
    writers.writeSuggestionSkip.mockResolvedValue({ ok: false, message: "Couldn't skip the suggestion: permission was refused.", code: "42501" });

    await expect(state().skipSuggestion(payload().handful[0])).resolves.toBe(false);

    expect(state().payload).toEqual(payload());
    expect(toast().message).toBe("Couldn't save that for Sam Lee. Try again.");
    expect(toast().variant).toBe("error");
  });

  it("Undo removes the skip, reopens today's pin and brings the card back", async () => {
    useNextUpStore.setState({ payload: payload({ done_today: 1 }) });
    writers.writeSuggestionSkip.mockResolvedValue({ ok: true, message: "Suggestion skipped.", id: "d1" });
    writers.removeSuggestionDismissal.mockResolvedValue({ ok: true, message: "Skip undone." });
    writers.reopenHandfulPin.mockResolvedValue({ ok: true, message: "Back on today's list." });
    answerWithout("c1", { done_today: 2 });

    await state().skipSuggestion(payload().handful[0]);
    await settle();
    expect(state().payload?.handful.map((h) => h.client_id)).toEqual(["c2"]);

    fetchMock.mockResolvedValue(ok(payload({ done_today: 1, generated_at: "2026-10-19T17:00:00.000Z" })));
    await toast().action!.onPress();
    await settle();

    expect(writers.removeSuggestionDismissal).toHaveBeenCalledWith(expect.anything(), "u1", "d1");
    expect(writers.reopenHandfulPin).toHaveBeenCalledWith(expect.anything(), "u1", "c1");
    // The undo saved before the pin was reopened.
    expect(writers.removeSuggestionDismissal.mock.invocationCallOrder[0]).toBeLessThan(writers.reopenHandfulPin.mock.invocationCallOrder[0]);
    expect(state().payload?.handful.map((h) => h.client_id)).toEqual(["c1", "c2"]);
    expect(state().payload?.done_today).toBe(1);
  });

  const reopenFails: [string, () => void][] = [
    ["couldn't reopen the pin", () => writers.reopenHandfulPin.mockResolvedValue({ ok: false, message: "Couldn't check today's list: permission was refused." })],
    ["threw while reopening it", () => writers.reopenHandfulPin.mockRejectedValue(new Error("boom"))],
  ];
  for (const [what, reopen] of reopenFails) {
    it(`Undo that saved but ${what} says so and still counts as undone`, async () => {
      useNextUpStore.setState({ payload: payload({ done_today: 1 }) });
      writers.writeSuggestionSkip.mockResolvedValue({ ok: true, message: "Suggestion skipped.", id: "d1" });
      writers.removeSuggestionDismissal.mockResolvedValue({ ok: true, message: "Skip undone." });
      reopen();
      answerWithout("c1", { done_today: 2 });

      await state().skipSuggestion(payload().handful[0]);
      await settle();
      // The Undo's refetch doesn't land here, so the test sees what Undo put back.
      fetchMock.mockReturnValue(new Promise(() => {}));
      await toast().action!.onPress();

      expect(toast().message).toBe("Undone. They may not show on today's list until tomorrow.");
      expect(toast().variant).not.toBe("error");
      expect(state().payload?.handful.map((h) => h.client_id)).toEqual(["c1", "c2"]);
    });
  }

  it("Undo that didn't save says so and leaves the card off", async () => {
    useNextUpStore.setState({ payload: payload() });
    writers.writeSuggestionSkip.mockResolvedValue({ ok: true, message: "Suggestion skipped.", id: "d1" });
    writers.removeSuggestionDismissal.mockResolvedValue({ ok: false, message: "Couldn't undo the skip: permission was refused." });
    answerWithout("c1", { done_today: 1 });

    await state().skipSuggestion(payload().handful[0]);
    await settle();
    await toast().action!.onPress();

    expect(toast().message).toBe("Couldn't undo. Try again.");
    expect(writers.reopenHandfulPin).not.toHaveBeenCalled();
    expect(state().payload?.handful.map((h) => h.client_id)).toEqual(["c2"]);
  });
});

describe("holdSuggestion", () => {
  const until = () => new Date(Date.now() + 3_600_000);

  it("Later holds the slot: the card moves to Later, isn't counted done, and Undo only takes the hold off", async () => {
    useNextUpStore.setState({ payload: payload({ done_today: 1 }) });
    writers.writeSuggestionHold.mockResolvedValue({ ok: true, message: "Sam Lee will come back later." });
    writers.resumeSuggestions.mockResolvedValue({ ok: true, message: "Suggestions are back on for this client." });
    let answer!: (v: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => { answer = resolve; }));
    const at = until();

    await expect(state().holdSuggestion({ client_id: "c1", client_name: "Sam Lee" }, "later", at, "in_an_hour")).resolves.toBe(true);

    const [, uid, args, today] = writers.writeSuggestionHold.mock.calls[0];
    expect(uid).toBe("u1");
    expect(args).toEqual({ clientId: "c1", clientName: "Sam Lee", kind: "later", until: at });
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(state().payload?.handful.map((h) => h.client_id)).toEqual(["c2"]);
    expect(state().payload?.snoozed).toEqual([{ client_id: "c1", client_name: "Sam Lee", until: at.toISOString(), phone: "5065550101" }]);
    expect(state().payload?.done_today).toBe(1);
    expect(toast().message).toBe("Sam Lee is back in an hour.");

    // The server agrees; the Undo's own refetch doesn't land here.
    answer(ok(state().payload));
    await settle();
    fetchMock.mockReturnValue(new Promise(() => {}));
    await toast().action!.onPress();
    expect(writers.resumeSuggestions).toHaveBeenCalledWith(expect.anything(), "u1", "c1");
    expect(writers.reopenHandfulPin).not.toHaveBeenCalled();
    expect(state().payload?.handful.map((h) => h.client_id)).toEqual(["c1", "c2"]);
    expect(state().payload?.snoozed).toEqual([]);
  });

  it("a Later a running Stop blocked writes nothing: the card stays, the writer's words show, no Undo, and the server is asked again", async () => {
    useNextUpStore.setState({ payload: payload() });
    writers.writeSuggestionHold.mockResolvedValue({
      ok: true, alreadySaved: true, stoppedUntil: "2027-01-19T04:00:00.000Z",
      message: "Suggestions for Sam Lee are already stopped until January 19.",
    });
    // The server knows about the Stop: its answer no longer lists them (fix 6).
    answerWithout("c1");

    await expect(state().holdSuggestion({ client_id: "c1", client_name: "Sam Lee" }, "later", until(), "in_an_hour")).resolves.toBe(false);

    expect(state().payload).toEqual(payload());
    expect(toast().message).toBe("Suggestions for Sam Lee are already stopped until January 19.");
    expect(toast().action).toBeUndefined();
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(state().payload?.handful.map((h) => h.client_id)).toEqual(["c2"]);
  });

  it("Stop frees the slot (counted done); Undo resumes and reopens today's pin", async () => {
    useNextUpStore.setState({ payload: payload({ done_today: 1 }) });
    writers.writeSuggestionHold.mockResolvedValue({ ok: true, message: "Suggestions for Sam Lee are stopped until January 19." });
    writers.resumeSuggestions.mockResolvedValue({ ok: true, message: "Suggestions are back on for this client." });
    writers.reopenHandfulPin.mockResolvedValue({ ok: true, message: "Back on today's list." });
    answerWithout("c1", { done_today: 2 });

    await state().holdSuggestion({ client_id: "c1", client_name: "Sam Lee" }, "stop", new Date(Date.now() + 90 * 86_400_000), "3_months");

    expect(state().payload?.handful.map((h) => h.client_id)).toEqual(["c2"]);
    expect(state().payload?.done_today).toBe(2);
    expect(toast().message).toBe("No suggestions for Sam Lee for 3 months.");

    await settle();
    fetchMock.mockReturnValue(new Promise(() => {}));
    await toast().action!.onPress();
    expect(writers.resumeSuggestions).toHaveBeenCalledWith(expect.anything(), "u1", "c1");
    expect(writers.reopenHandfulPin).toHaveBeenCalledWith(expect.anything(), "u1", "c1");
    expect(state().payload?.done_today).toBe(1);
  });
});

describe("moveToHangar", () => {
  it("archives through core, drops the card, and Undo brings them back and reopens the pin", async () => {
    const changed = vi.fn();
    onNextUpClientChange(changed);
    useNextUpStore.setState({ payload: payload() });
    writers.writeClientToHangar.mockResolvedValue({ ok: true, message: "Sam Lee moved to the Hangar.", id: "c1" });
    writers.restoreClientFromHangar.mockResolvedValue({ ok: true, message: "Sam Lee is back from the Hangar." });
    writers.reopenHandfulPin.mockResolvedValue({ ok: true, message: "Back on today's list." });
    answerWithout("c1", { done_today: 2 });

    await expect(state().moveToHangar("c1", "Sam Lee")).resolves.toBe(true);

    expect(writers.writeClientToHangar).toHaveBeenCalledWith(expect.anything(), "u1", { clientId: "c1", clientName: "Sam Lee" });
    expect(state().payload?.handful.map((h) => h.client_id)).toEqual(["c2"]);
    expect(toast().message).toBe("Sam Lee moved to the Hangar.");
    expect(changed).toHaveBeenCalledWith("c1", "changed");

    await settle();
    fetchMock.mockReturnValue(new Promise(() => {}));
    await toast().action!.onPress();
    expect(writers.restoreClientFromHangar).toHaveBeenCalledWith(expect.anything(), "u1", { clientId: "c1", clientName: "Sam Lee" });
    expect(writers.reopenHandfulPin).toHaveBeenCalledWith(expect.anything(), "u1", "c1");
    expect(state().payload?.handful.map((h) => h.client_id)).toEqual(["c1", "c2"]);
  });

  it("a refusal shows the writer's words and keeps the card", async () => {
    useNextUpStore.setState({ payload: payload() });
    writers.writeClientToHangar.mockResolvedValue({ ok: false, message: "Sam Lee is already in the Hangar." });

    await expect(state().moveToHangar("c1", "Sam Lee")).resolves.toBe(false);

    expect(state().payload).toEqual(payload());
    expect(toast().message).toBe("Sam Lee is already in the Hangar.");
  });
});

describe("logTalkedTo", () => {
  it("logs the contact through core with no description, drops the card and tells the data store", async () => {
    const changed = vi.fn();
    onNextUpClientChange(changed);
    useNextUpStore.setState({ payload: payload({ done_today: 1 }) });
    writers.writeContactActivity.mockResolvedValue({ ok: true, message: "Logged call on Sam Lee for 2026-10-19.", id: "a1" });
    fetchMock.mockReturnValue(new Promise(() => {}));

    await expect(state().logTalkedTo("c1", "Sam Lee", "meeting")).resolves.toBe(true);

    const [, uid, args, today] = writers.writeContactActivity.mock.calls[0];
    expect(uid).toBe("u1");
    expect(args).toEqual({ clientId: "c1", clientName: "Sam Lee", type: "meeting", description: "" });
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(state().payload?.handful.map((h) => h.client_id)).toEqual(["c2"]);
    expect(state().payload?.done_today).toBe(2);
    expect(changed).toHaveBeenCalledWith("c1", "contacted");
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(toast().message).toBe("Logged your meeting with Sam Lee.");
  });

  it("offline: nothing changes and the toast says to try again", async () => {
    useNextUpStore.setState({ payload: payload() });
    writers.writeContactActivity.mockResolvedValue({ ok: false, offline: true, message: "Couldn't log the activity: Network request failed." });

    await expect(state().logTalkedTo("c1", "Sam Lee", "call")).resolves.toBe(false);

    expect(state().payload).toEqual(payload());
    expect(toast().message).toBe("No connection. Try again.");
  });
});

describe("resumeSuggestion and unsnoozeCard", () => {
  it("resumeSuggestion takes the holds off and asks the server again", async () => {
    writers.resumeSuggestions.mockResolvedValue({ ok: true, message: "Suggestions are back on for this client." });
    fetchMock.mockResolvedValue(ok(payload()));

    await expect(state().resumeSuggestion("c1")).resolves.toBe(true);

    expect(writers.resumeSuggestions).toHaveBeenCalledWith(expect.anything(), "u1", "c1");
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("unsnoozeCard brings a phone-only card back", () => {
    const ahead = new Date(Date.now() + 60_000).toISOString();
    state().snoozeCard("briefing:2026-10-19", ahead);
    state().unsnoozeCard("briefing:2026-10-19");
    expect(state().localSnoozes).toEqual({});
    expect(JSON.parse(mem.get("next_up_local_snoozes") as string)).toEqual({});
  });
});
