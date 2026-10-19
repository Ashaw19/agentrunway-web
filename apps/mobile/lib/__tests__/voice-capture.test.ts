/**
 * The phone's voice capture, run for real (lib/voice-capture.ts and the
 * offline queue's replay, stores/offline-queue.ts). Mocked: the expo native
 * modules (expo-file-system, expo-audio), saved storage (lib/mmkv) and the
 * network (lib/supabase's client over an in-memory database, and fetch).
 * Every row is synthetic.
 *
 * What this holds:
 *   - the recording is deleted when transcription answers, however it answers,
 *     and a recording left by a killed app is swept at launch
 *   - with no connection at all, Confirm queues every item (it never asks
 *     the server who is signed in), and the queued activity keeps the day
 *     it happened
 *   - a save the database took but whose reply was lost is replayed without
 *     saving the expense or the deal twice
 *   - a queued new client that meanwhile matches a client added elsewhere
 *     takes its queued activity and task with it
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type Row } from "../../../../packages/core/lib/__tests__/helpers/capture-fake-db";
import type { ProposedWrite } from "@agent-runway/core/lib/capture/types";
// vi.mock calls below are hoisted above these imports, so these load the mocks.
import {
  MAX_RECORDING_SECONDS,
  VOICE_RECORDING_OPTIONS,
  saveCapture,
  sweepLeftoverRecordings,
  transcribeRecording,
} from "../voice-capture";
import { useOfflineQueueStore } from "../../stores/offline-queue";
import { useDataStore } from "../../stores/data-store";
import { useToastStore } from "../../stores/toast-store";

// ── Expo modules ─────────────────────────────────────────────────────────────

// vi.mock factories run before this file's own code: what they share is hoisted.
const { files, join, net, fetchMock, USER } = vi.hoisted(() => {
  const USER = "00000000-0000-4000-8000-0000000000f1";
  return {
    USER,
    files: new Set<string>(),
    join: (parts: unknown[]) => parts.map((p) => (typeof p === "string" ? p : (p as { uri: string }).uri)).join("/"),
    fetchMock: vi.fn(),
    net: {
      db: null as unknown as { from: (table: string) => unknown },
      getUser: vi.fn(async (): Promise<unknown> => ({ data: { user: { id: USER } } })),
      getSession: vi.fn(async (): Promise<unknown> => ({ data: { session: { access_token: "t", user: { id: USER } } } })),
    },
  };
});

vi.mock("expo-file-system", () => {
  class File {
    uri: string;
    constructor(...parts: unknown[]) { this.uri = join(parts); }
    get exists() { return files.has(this.uri); }
    get name() { return this.uri.split("/").pop() ?? ""; }
    delete() { if (!files.delete(this.uri)) throw new Error("no such file"); }
  }
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) { this.uri = join(parts); }
    get exists() { return [...files].some((f) => f.startsWith(`${this.uri}/`)); }
    list() { return [...files].filter((f) => f.slice(0, f.lastIndexOf("/")) === this.uri).map((f) => new File(f)); }
  }
  return { File, Directory, Paths: { cache: new Directory("file:///cache") } };
});
vi.mock("expo-audio", () => ({
  AudioQuality: { MIN: 0, LOW: 32, MEDIUM: 64, HIGH: 96, MAX: 127 },
  IOSOutputFormat: { MPEG4AAC: "aac " },
  getRecordingPermissionsAsync: vi.fn(),
  requestRecordingPermissionsAsync: vi.fn(),
  setAudioModeAsync: vi.fn(),
}));

// ── Saved storage (MMKV) ─────────────────────────────────────────────────────

vi.mock("../mmkv", () => {
  const mem = new Map<string, string | number>();
  return {
    isStorageReady: () => true,
    initStorage: async () => {},
    storage: {
      getString: (k: string) => (typeof mem.get(k) === "string" ? (mem.get(k) as string) : undefined),
      getNumber: (k: string) => (typeof mem.get(k) === "number" ? (mem.get(k) as number) : undefined),
      set: (k: string, v: string | number) => void mem.set(k, v),
      delete: (k: string) => void mem.delete(k),
    },
    mmkvStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  };
});

// ── The network: Supabase over an in-memory database ─────────────────────────

vi.mock("../supabase", () => ({
  supabase: {
    from: (table: string) => net.db.from(table),
    auth: { getUser: () => net.getUser(), getSession: () => net.getSession() },
  },
}));

vi.stubGlobal("fetch", fetchMock);


// ── Fixtures ─────────────────────────────────────────────────────────────────

const TODAY = "2026-10-18";
const SAM = "00000000-0000-4000-8000-000000000001";
const ALL_TABLES = ["clients", "contact_activities", "contact_tasks", "mileage_logs", "receipt_expenses", "transactions", "pipeline_deals", "client_memory_profiles"];

const seedRows = (): Record<string, Row[]> => ({
  clients: [{ id: SAM, user_id: USER, name: "Sam Lee", name_search: "sam lee", status: "boarding", archived_at: null }],
});

const choice = (extra: Record<string, unknown>) => ({
  spoken: null, candidates: [], selectedId: null, newClientWriteId: null, newClientOffer: null, noClient: false, optional: false, ...extra,
});

/** A showing note: the activity, an expense and a closed deal. */
function showingNote(): ProposedWrite[] {
  return [
    {
      id: "w1", tool: "logContactActivity", intent: "log_activity", include: true, warnings: [],
      client: choice({ spoken: "Sam", selectedId: SAM }),
      args: { clientId: SAM, clientName: "Sam Lee", type: "showing", description: "Second showing at 12 Elm" },
    },
    { id: "w2", tool: "logExpense", intent: "new_expense", include: true, warnings: [], args: { vendor: "Irving", amount: 64.4, taxAmount: 8.4, categoryKey: "vehicle_fuel", expenseDate: TODAY } },
    { id: "w3", tool: "recordTransaction", intent: "new_transaction", include: true, warnings: [], args: { address: "7 Birch Lane", clientName: "Pat Roy", side: "buyer", closeDate: TODAY, salePrice: 450000, commissionPct: 2.5 } },
  ];
}

beforeEach(() => {
  files.clear();
  fetchMock.mockReset();
  net.getUser.mockReset();
  net.getUser.mockImplementation(async () => ({ data: { user: { id: USER } } }));
  net.getSession.mockReset();
  net.getSession.mockImplementation(async () => ({ data: { session: { access_token: "t", user: { id: USER } } } }));
  useOfflineQueueStore.setState({ queue: [], failed: [], pendingCount: 0, failedCount: 0, _processing: false });
  // The screens' re-read is not under test here.
  useDataStore.setState({ fetchAll: vi.fn(async () => {}), _clientActivitiesFetchedAt: {} });
});

// ── Audio ────────────────────────────────────────────────────────────────────

describe("the recording", () => {
  const URI = "file:///cache/ExpoAudio/recording-abc.m4a";

  it("is deleted once transcription answers", async () => {
    files.add(URI);
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ transcript: "Called Sam" }) });
    await expect(transcribeRecording(URI)).resolves.toBe("Called Sam");
    expect(files.has(URI)).toBe(false);
  });

  it("is deleted when there is no connection", async () => {
    files.add(URI);
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));
    await expect(transcribeRecording(URI)).rejects.toThrow(/No connection/);
    expect(files.has(URI)).toBe(false);
  });

  it("is deleted when the server refuses it", async () => {
    files.add(URI);
    fetchMock.mockResolvedValue({ ok: false, status: 413, json: async () => ({ error: "Recording too large" }) });
    await expect(transcribeRecording(URI)).rejects.toThrow(/too large/);
    expect(files.has(URI)).toBe(false);
  });

  it("is deleted when nothing was heard", async () => {
    files.add(URI);
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ transcript: "  " }) });
    await expect(transcribeRecording(URI)).rejects.toThrow(/No speech/);
    expect(files.has(URI)).toBe(false);
  });

  it("left behind by a killed app is swept at launch, and nothing else is", () => {
    files.add("file:///cache/ExpoAudio/recording-1.m4a");
    files.add("file:///cache/ExpoAudio/recording-2.m4a");
    files.add("file:///cache/Audio/recording-3.m4a");
    files.add("file:///cache/ExpoAudio/not-ours.json");
    expect(sweepLeftoverRecordings()).toBe(3);
    expect([...files]).toEqual(["file:///cache/ExpoAudio/not-ours.json"]);
    expect(sweepLeftoverRecordings()).toBe(0);
  });

  it("is small: 3 minutes fits well under the transcribe route's 4 MB limit", () => {
    expect(VOICE_RECORDING_OPTIONS).toMatchObject({ extension: ".m4a", numberOfChannels: 1, bitRate: 32000 });
    expect(MAX_RECORDING_SECONDS).toBe(180);
    expect((VOICE_RECORDING_OPTIONS.bitRate / 8) * MAX_RECORDING_SECONDS).toBeLessThan(1024 * 1024);
  });
});

// ── Saving with no connection ────────────────────────────────────────────────

describe("Confirm with no connection", () => {
  it("queues every item without asking the server who is signed in, and they sync once", async () => {
    const { db, tables, options } = fakeDb(seedRows(), { offline: ALL_TABLES });
    net.db = db;
    net.getUser.mockImplementation(async () => { throw new TypeError("Network request failed"); });

    const results = await saveCapture(showingNote(), { today: TODAY });
    expect(results.map((r) => r.status)).toEqual(["queued", "queued", "queued"]);
    expect(net.getUser).not.toHaveBeenCalled();
    const queued = useOfflineQueueStore.getState().queue;
    expect(queued.map((m) => m.type)).toEqual(["captureWrite", "captureWrite", "captureWrite"]);
    // Each carries its row id; the activity carries the day it happened.
    expect(queued.every((m) => typeof m.payload.id === "string")).toBe(true);
    expect(queued[0].payload.args.activityDate).toBe(TODAY);

    // Back online, a day later.
    options.offline = [];
    net.getUser.mockImplementation(async () => ({ data: { user: { id: USER } } }));
    await useOfflineQueueStore.getState().processQueue();
    expect(useOfflineQueueStore.getState().queue).toEqual([]);
    expect(tables.contact_activities).toHaveLength(1);
    expect(tables.contact_activities[0].activity_date).toBe(`${TODAY}T12:00:00.000Z`);
    expect(tables.receipt_expenses).toHaveLength(1);
    expect(tables.transactions).toHaveLength(1);
  });

  it("uses the signed-in user from the app (no stored-session read) when the card passes it", async () => {
    const { db } = fakeDb(seedRows());
    net.db = db;
    const results = await saveCapture(showingNote().slice(1, 2), { today: TODAY, userId: USER });
    expect(results[0].status).toBe("saved");
    expect(net.getSession).not.toHaveBeenCalled();
    expect(net.getUser).not.toHaveBeenCalled();
  });

  it("with no session at all, says to sign in and saves nothing", async () => {
    const { db, writes } = fakeDb(seedRows());
    net.db = db;
    net.getSession.mockResolvedValueOnce({ data: { session: null } } as never);
    const results = await saveCapture(showingNote(), { today: TODAY });
    expect(results.every((r) => r.status === "failed" && /Sign in/.test(r.message))).toBe(true);
    expect(writes).toEqual([]);
  });
});

describe("a save the database took, with the reply lost", () => {
  it("is replayed without saving the expense or the deal twice", async () => {
    const { db, tables, options } = fakeDb(seedRows(), { lostReplies: ["contact_activities", "receipt_expenses", "transactions"] });
    net.db = db;
    const results = await saveCapture(showingNote(), { today: TODAY, userId: USER });
    // The phone saw a dropped connection, so it queued them...
    expect(results.map((r) => r.status)).toEqual(["queued", "queued", "queued"]);
    // ...but the database already has each one.
    expect(tables.receipt_expenses).toHaveLength(1);

    options.lostReplies = [];
    await useOfflineQueueStore.getState().processQueue();
    expect(useOfflineQueueStore.getState().queue).toEqual([]);
    expect(useOfflineQueueStore.getState().failed).toEqual([]);
    expect(tables.contact_activities).toHaveLength(1);
    expect(tables.receipt_expenses).toHaveLength(1);
    expect(tables.transactions).toHaveLength(1);
  });
});

describe("a queued new client", () => {
  it("that matches a client added meanwhile takes its queued activity and task to that client", async () => {
    const { db, tables, options } = fakeDb(seedRows(), { offline: ALL_TABLES });
    net.db = db;
    const note: ProposedWrite[] = [
      { id: "w1", tool: "createClient", intent: "new_client", include: true, warnings: [], args: { name: "Dana Whitfield", phone: "506-555-0143" } },
      {
        id: "w2", tool: "createContactTask", intent: "create_task", include: true, warnings: [],
        client: choice({ spoken: "Dana", newClientWriteId: "w1", newClientOffer: "w1", optional: true }),
        args: { title: "Send Dana the listings", dueDate: "2026-10-20", priority: "normal", clientName: "Dana Whitfield" },
      },
      {
        id: "w3", tool: "logContactActivity", intent: "log_activity", include: true, warnings: [],
        client: choice({ spoken: "Dana", newClientWriteId: "w1" }),
        args: { clientId: "", clientName: "Dana Whitfield", type: "meeting", description: "Met at the open house" },
      },
    ];
    const results = await saveCapture(note, { today: TODAY, userId: USER });
    expect(results.map((r) => r.status)).toEqual(["queued", "queued", "queued"]);

    // Meanwhile Dana was added on the web.
    const DANA = "00000000-0000-4000-8000-0000000000d4";
    tables.clients.push({ id: DANA, user_id: USER, name: "Dana Whitfield", name_search: "dana whitfield", status: "boarding", archived_at: null });
    options.offline = [];
    await useOfflineQueueStore.getState().processQueue();

    expect(useOfflineQueueStore.getState().queue).toEqual([]);
    expect(tables.clients.filter((c) => c.name === "Dana Whitfield")).toHaveLength(1);
    expect(tables.contact_tasks[0]).toMatchObject({ client_id: DANA, title: "Send Dana the listings" });
    expect(tables.contact_activities[0]).toMatchObject({ client_id: DANA, type: "meeting" });
  });

  it("whose name is in the Hangar goes onto the archived client, says so, and doesn't fail ten replays", async () => {
    const ARCHIVED = "00000000-0000-4000-8000-0000000000a9";
    const { db, tables, options } = fakeDb({
      clients: [{ id: ARCHIVED, user_id: USER, name: "Dana Whitfield", name_search: "dana whitfield", status: "cruising", archived_at: "2026-01-02T00:00:00Z" }],
    }, { offline: ALL_TABLES });
    net.db = db;
    const note: ProposedWrite[] = [
      { id: "w1", tool: "createClient", intent: "new_client", include: true, warnings: [], args: { name: "Dana Whitfield" } },
      {
        id: "w2", tool: "createContactTask", intent: "create_task", include: true, warnings: [],
        client: choice({ spoken: "Dana", newClientWriteId: "w1", newClientOffer: "w1", optional: true }),
        args: { title: "Call Dana", dueDate: "2026-10-20", priority: "normal", clientName: "Dana Whitfield" },
      },
    ];
    expect((await saveCapture(note, { today: TODAY, userId: USER })).map((r) => r.status)).toEqual(["queued", "queued"]);
    options.offline = [];
    await useOfflineQueueStore.getState().processQueue();

    expect(useOfflineQueueStore.getState().queue).toEqual([]);
    expect(useOfflineQueueStore.getState().failed).toEqual([]);
    expect(tables.clients).toHaveLength(1);
    expect(tables.contact_tasks[0]).toMatchObject({ client_id: ARCHIVED, title: "Call Dana" });
    expect(useToastStore.getState().message).toMatch(/Dana Whitfield is in the Hangar/);
  });
});
