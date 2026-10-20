/**
 * What the phone dashboard reads beyond the main refresh (stores/data-store.ts):
 * the next 14 days of showings and listing appointments, today's trip count,
 * the last 60 days of activity dates (the streak and the done-today count read
 * them), and the Runway Score's reading from a week before the saved one.
 * Mocked: saved storage (lib/mmkv), the signed-in session and the database
 * (lib/supabase, a small in-memory stand-in that applies the filters the store
 * sends), and fetch. The clock is faked at 10:00 on 2026-10-19 on the phone.
 * Every row is synthetic.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// The vi.mock calls below are hoisted over these imports, so they load the mocks.
import { useDataStore, type UserSettings } from "../../stores/data-store";
import { useNextUpStore } from "../../stores/next-up-store";
import { useOfflineQueueStore } from "../../stores/offline-queue";
import { useToastStore } from "../../stores/toast-store";

// ── Mocks ────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
type Filter = { op: "eq" | "gte" | "lte" | "in" | "is"; col: string; value: unknown };
interface Query {
  table: string;
  select?: string;
  selectOptions?: { count?: string; head?: boolean };
  filters: Filter[];
  order: { col: string; ascending: boolean }[];
  limit?: number;
  range?: [number, number];
  single?: boolean;
  write?: { op: "insert" | "update"; row: Row };
}
type Reply = { data: unknown; error: { message: string; code?: string } | null; count?: number | null };

const { mem, net, fetchMock } = vi.hoisted(() => ({
  mem: new Map<string, string | number>(),
  fetchMock: vi.fn(),
  net: {
    tables: {} as Record<string, Row[]>,
    /** A table's reply, instead of reading `tables` (a failure, or a write held open). */
    override: {} as Record<string, (q: Query) => Reply | Promise<Reply>>,
    log: [] as Query[],
    session: { access_token: "tok-1", user: { id: "u1" } } as unknown,
  },
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

vi.mock("../supabase", () => {
  const apply = (rows: Row[], q: Query) => {
    // ISO dates and timestamps are all in one format here, so text order is time order.
    const cmp = (a: unknown, b: unknown) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
    let out = rows.filter((r) =>
      q.filters.every((f) => {
        const v = r[f.col];
        if (f.op === "eq") return v === f.value;
        if (f.op === "is") return (v ?? null) === f.value;
        if (f.op === "in") return (f.value as unknown[]).includes(v);
        if (v == null) return false;
        return f.op === "gte" ? cmp(v, f.value) >= 0 : cmp(v, f.value) <= 0;
      }),
    );
    for (const o of [...q.order].reverse()) {
      out = [...out].sort((a, b) => cmp(a[o.col], b[o.col]) * (o.ascending ? 1 : -1));
    }
    return out;
  };

  const reply = async (q: Query): Promise<Reply> => {
    net.log.push(q);
    const custom = net.override[q.table];
    if (custom) return custom(q);
    if (q.write) {
      return { data: q.single ? q.write.row : [q.write.row], error: null };
    }
    const matched = apply(net.tables[q.table] ?? [], q);
    const count = matched.length;
    if (q.selectOptions?.head) return { data: null, error: null, count };
    const page = q.range ? matched.slice(q.range[0], q.range[1] + 1) : matched.slice(0, q.limit ?? matched.length);
    const withCount = q.selectOptions?.count === "exact" ? { count } : {};
    if (q.single) {
      return page[0]
        ? { data: page[0], error: null, ...withCount }
        : { data: null, error: { code: "PGRST116", message: "no rows" }, ...withCount };
    }
    return { data: page, error: null, ...withCount };
  };

  const builder = (table: string) => {
    const q: Query = { table, filters: [], order: [] };
    const b = {
      select(columns?: string, options?: Query["selectOptions"]) { q.select = columns; q.selectOptions = options; return b; },
      eq(col: string, value: unknown) { q.filters.push({ op: "eq", col, value }); return b; },
      gte(col: string, value: unknown) { q.filters.push({ op: "gte", col, value }); return b; },
      lte(col: string, value: unknown) { q.filters.push({ op: "lte", col, value }); return b; },
      in(col: string, value: unknown[]) { q.filters.push({ op: "in", col, value }); return b; },
      is(col: string, value: unknown) { q.filters.push({ op: "is", col, value }); return b; },
      or() { return b; },
      order(col: string, o?: { ascending?: boolean }) { q.order.push({ col, ascending: o?.ascending !== false }); return b; },
      limit(n: number) { q.limit = n; return b; },
      range(from: number, to: number) { q.range = [from, to]; return b; },
      single() { q.single = true; return b; },
      maybeSingle() { q.single = true; return b; },
      insert(row: Row) { q.write = { op: "insert", row }; return b; },
      update(row: Row) { q.write = { op: "update", row }; return b; },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return reply(q).then(resolve, reject);
      },
    };
    return b;
  };

  return {
    supabase: {
      from: (table: string) => builder(table),
      auth: {
        getSession: async () => ({ data: { session: net.session } }),
        getUser: async () => ({ data: { user: net.session ? { id: "u1" } : null } }),
      },
    },
  };
});

vi.stubGlobal("fetch", fetchMock);

// ── Fixtures ─────────────────────────────────────────────────────────────────

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).toISOString();
const SAM = "00000000-0000-4000-8000-000000000001";
const PAT = "00000000-0000-4000-8000-000000000002";

const snapshot = (savedAt: string | undefined) => ({
  score: 71,
  month: "2026-10",
  ...(savedAt ? { updated_at: savedAt } : {}),
});

const settings = (savedAt: string | undefined): UserSettings =>
  ({ user_id: "u1", subscription_tier: "pro", runway_score_snapshot: snapshot(savedAt) }) as unknown as UserSettings;

const EXTRAS = { schedule: [], tripsLoggedToday: 0, recentActivityDates: [], scoreCompare: null };

const store = () => useDataStore.getState();
const queriesOn = (table: string) => net.log.filter((q) => q.table === table);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(new Date(2026, 9, 19, 10, 0, 0));
  mem.clear();
  net.tables = {};
  net.override = {};
  net.log = [];
  net.session = { access_token: "tok-1", user: { id: "u1" } };
  fetchMock.mockReset();
  useDataStore.setState({
    ...EXTRAS,
    settings: settings(at(2026, 10, 18, 9)),
    clients: [],
    outreachQueue: [],
    outreachReadyCount: 0,
    lastFetched: null,
    _clientActivitiesFetchedAt: {},
    clientActivities: {},
  });
  useOfflineQueueStore.setState({ queue: [], failed: [], pendingCount: 0, failedCount: 0, _processing: false, isOnline: true });
  useToastStore.setState({ message: null });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── fetchDashboardExtras ─────────────────────────────────────────────────────

describe("fetchDashboardExtras: the schedule", () => {
  it("lists showings and active appointments from today through 14 days out", async () => {
    net.tables.property_showings = [
      { user_id: "u1", client_id: SAM, showing_date: "2026-10-19" },
      { user_id: "u1", client_id: PAT, showing_date: "2026-11-02" }, // day 14
      { user_id: "u1", client_id: SAM, showing_date: "2026-11-03" }, // day 15
      { user_id: "u1", client_id: SAM, showing_date: "2026-10-18" }, // yesterday
      { user_id: "u2", client_id: SAM, showing_date: "2026-10-20" }, // someone else's
    ];
    net.tables.listing_appointments = [
      { user_id: "u1", client_id: PAT, appointment_date: "2026-10-21", status: "scheduled" },
      { user_id: "u1", client_id: null, appointment_date: "2026-10-19", status: "active" },
      { user_id: "u1", client_id: SAM, appointment_date: "2026-10-20", status: "sold" },
      { user_id: "u1", client_id: SAM, appointment_date: "2026-10-20", status: "lost" },
      { user_id: "u1", client_id: SAM, appointment_date: "2026-11-09", status: "scheduled" },
    ];

    await store().fetchDashboardExtras();

    expect(store().schedule).toEqual([
      { kind: "showing", client_id: SAM, date: "2026-10-19" },
      { kind: "appointment", client_id: null, date: "2026-10-19" },
      { kind: "appointment", client_id: PAT, date: "2026-10-21" },
      { kind: "showing", client_id: PAT, date: "2026-11-02" },
    ]);
  });

  it("keeps the last schedule when a read fails", async () => {
    const before = [{ kind: "showing" as const, client_id: SAM, date: "2026-10-20" }];
    useDataStore.setState({ schedule: before });
    net.override.listing_appointments = async () => ({ data: null, error: { message: "TypeError: Network request failed" } });

    await store().fetchDashboardExtras();

    expect(store().schedule).toEqual(before);
  });
});

describe("fetchDashboardExtras: trips today", () => {
  it("counts today's mileage rows without reading them", async () => {
    net.tables.mileage_logs = [
      { user_id: "u1", trip_date: "2026-10-19" },
      { user_id: "u1", trip_date: "2026-10-19" },
      { user_id: "u1", trip_date: "2026-10-18" },
      { user_id: "u2", trip_date: "2026-10-19" },
    ];

    await store().fetchDashboardExtras();

    expect(store().tripsLoggedToday).toBe(2);
    expect(queriesOn("mileage_logs")[0].selectOptions).toMatchObject({ count: "exact", head: true });
  });

  it("keeps the last count when the read fails", async () => {
    useDataStore.setState({ tripsLoggedToday: 3 });
    net.override.mileage_logs = async () => ({ data: null, error: { message: "boom" }, count: null });

    await store().fetchDashboardExtras();

    expect(store().tripsLoggedToday).toBe(3);
  });
});

describe("fetchDashboardExtras: activity dates", () => {
  it("reads the last 60 days, from midnight on the phone, and nobody else's", async () => {
    net.tables.contact_activities = [
      { id: "a1", user_id: "u1", activity_date: at(2026, 10, 19, 9) },
      { id: "a2", user_id: "u1", activity_date: at(2026, 8, 20, 0, 30) }, // inside: 60 days back
      { id: "a3", user_id: "u1", activity_date: at(2026, 8, 19, 23, 30) }, // 61 days back
      { id: "a4", user_id: "u2", activity_date: at(2026, 10, 19, 9) },
    ];

    await store().fetchDashboardExtras();

    expect([...store().recentActivityDates].sort()).toEqual([at(2026, 8, 20, 0, 30), at(2026, 10, 19, 9)].sort());
    const since = queriesOn("contact_activities")[0].filters.find((f) => f.op === "gte" && f.col === "activity_date");
    expect(since?.value).toBe(new Date(2026, 7, 20).toISOString());
  });

  it("reads every page, past the server's 1,000-row cap", async () => {
    net.tables.contact_activities = Array.from({ length: 1200 }, (_, i) => ({
      id: `a${String(i).padStart(4, "0")}`,
      user_id: "u1",
      activity_date: new Date(2026, 9, 19, 8, 0, 0, i).toISOString(),
    }));
    // The server hands back at most 1,000 rows a request, whatever was asked.
    const all = net.tables.contact_activities;
    net.override.contact_activities = async (q) => ({
      data: all.slice(q.range![0], Math.min(q.range![1] + 1, q.range![0] + 1000)),
      error: null,
      count: all.length,
    });

    await store().fetchDashboardExtras();

    expect(store().recentActivityDates).toHaveLength(1200);
    expect(queriesOn("contact_activities").length).toBeGreaterThanOrEqual(2);
  });

  it("keeps the last dates when the read fails", async () => {
    useDataStore.setState({ recentActivityDates: [at(2026, 10, 18)] });
    net.override.contact_activities = async () => ({ data: null, error: { message: "boom" } });

    await store().fetchDashboardExtras();

    expect(store().recentActivityDates).toEqual([at(2026, 10, 18)]);
  });
});

describe("fetchDashboardExtras: the score a week before", () => {
  it("is the latest history row at least 7 days older than the saved score", async () => {
    // Saved 2026-10-18, so the row must be on or before 2026-10-11.
    net.tables.runway_score_history = [
      { user_id: "u1", captured_on: "2026-10-12", score: 65 }, // 6 days older: too new
      { user_id: "u1", captured_on: "2026-10-11", score: 62 },
      { user_id: "u1", captured_on: "2026-10-04", score: 55 },
      { user_id: "u2", captured_on: "2026-10-10", score: 90 },
    ];

    await store().fetchDashboardExtras();

    expect(store().scoreCompare).toEqual({ captured_on: "2026-10-11", score: 62 });
  });

  it("is null when no row is old enough", async () => {
    net.tables.runway_score_history = [{ user_id: "u1", captured_on: "2026-10-12", score: 65 }];
    useDataStore.setState({ scoreCompare: { captured_on: "2026-09-01", score: 40 } });

    await store().fetchDashboardExtras();

    expect(store().scoreCompare).toBeNull();
  });

  it("measures the week from the day the score was saved, on the phone's calendar", async () => {
    // Saved at 10 pm on 2026-10-18 phone time, which is already the 19th in UTC.
    useDataStore.setState({ settings: settings(at(2026, 10, 18, 22, 30)) });
    net.tables.runway_score_history = [{ user_id: "u1", captured_on: "2026-10-11", score: 62 }];

    await store().fetchDashboardExtras();

    expect(store().scoreCompare).toEqual({ captured_on: "2026-10-11", score: 62 });
  });

  it("is null, with no history read, when the score has no save time", async () => {
    useDataStore.setState({ settings: settings(undefined), scoreCompare: { captured_on: "2026-10-01", score: 50 } });

    await store().fetchDashboardExtras();

    expect(store().scoreCompare).toBeNull();
    expect(queriesOn("runway_score_history")).toHaveLength(0);
  });

  it("keeps the last comparison when the read fails", async () => {
    useDataStore.setState({ scoreCompare: { captured_on: "2026-10-01", score: 50 } });
    net.override.runway_score_history = async () => ({ data: null, error: { message: "boom" } });

    await store().fetchDashboardExtras();

    expect(store().scoreCompare).toEqual({ captured_on: "2026-10-01", score: 50 });
  });
});

describe("fetchDashboardExtras: when it can't run", () => {
  it("reads nothing with no session", async () => {
    net.session = null;
    await store().fetchDashboardExtras();
    expect(net.log).toHaveLength(0);
  });

  it("never throws, whatever the database does", async () => {
    for (const table of ["property_showings", "listing_appointments", "mileage_logs", "contact_activities", "runway_score_history"]) {
      net.override[table] = async () => { throw new TypeError("Network request failed"); };
    }
    await expect(store().fetchDashboardExtras()).resolves.toBeUndefined();
  });
});

// ── The cache ────────────────────────────────────────────────────────────────

describe("the offline copy", () => {
  it("is version 10 and holds the outreach queue and the four extras", async () => {
    net.tables.property_showings = [{ user_id: "u1", client_id: SAM, showing_date: "2026-10-20" }];
    net.tables.mileage_logs = [{ user_id: "u1", trip_date: "2026-10-19" }];
    net.tables.contact_activities = [{ id: "a1", user_id: "u1", activity_date: at(2026, 10, 19, 9) }];
    net.tables.runway_score_history = [{ user_id: "u1", captured_on: "2026-10-04", score: 55 }];
    useDataStore.setState({ outreachQueue: [{ id: "o1", client_id: SAM, opportunity_type: "text_message", channel: "sms", status: "ready" } as never] });

    await store().fetchDashboardExtras();

    expect(mem.get("data_store_cache_version")).toBe(10);
    const saved = JSON.parse(mem.get("data_store_cache") as string);
    expect(saved).toMatchObject({
      schedule: [{ kind: "showing", client_id: SAM, date: "2026-10-20" }],
      tripsLoggedToday: 1,
      recentActivityDates: [at(2026, 10, 19, 9)],
      scoreCompare: { captured_on: "2026-10-04", score: 55 },
    });
    expect(saved.outreachQueue).toHaveLength(1);
  });

  it("comes back on hydrate, with the ready-text count worked out from the queue", async () => {
    net.tables.mileage_logs = [{ user_id: "u1", trip_date: "2026-10-19" }];
    net.tables.property_showings = [{ user_id: "u1", client_id: SAM, showing_date: "2026-10-20" }];
    net.tables.contact_activities = [{ id: "a1", user_id: "u1", activity_date: at(2026, 10, 19, 9) }];
    net.tables.runway_score_history = [{ user_id: "u1", captured_on: "2026-10-04", score: 55 }];
    useDataStore.setState({
      outreachQueue: [
        { id: "o1", client_id: SAM, status: "ready" },
        { id: "o2", client_id: PAT, status: "draft" },
      ] as never,
    });
    await store().fetchDashboardExtras();
    useDataStore.setState({ ...EXTRAS, outreachQueue: [], outreachReadyCount: 0, lastFetched: null });

    store().hydrate();

    expect(store().schedule).toHaveLength(1);
    expect(store().tripsLoggedToday).toBe(1);
    expect(store().recentActivityDates).toEqual([at(2026, 10, 19, 9)]);
    expect(store().scoreCompare).toEqual({ captured_on: "2026-10-04", score: 55 });
    expect(store().outreachQueue).toHaveLength(2);
    expect(store().outreachReadyCount).toBe(1);
  });

  it("does not carry yesterday's trip count into a new day", async () => {
    net.tables.mileage_logs = [{ user_id: "u1", trip_date: "2026-10-19" }, { user_id: "u1", trip_date: "2026-10-19" }];
    await store().fetchDashboardExtras();
    expect(store().tripsLoggedToday).toBe(2);
    useDataStore.setState({ ...EXTRAS, lastFetched: null });

    // The next morning, offline: the saved count was for the 19th.
    vi.setSystemTime(new Date(2026, 9, 20, 8, 0, 0));
    store().hydrate();

    expect(store().tripsLoggedToday).toBe(0);
  });
});

// ── The streak and the day's count ───────────────────────────────────────────

describe("contactStreak and todayActivityCount", () => {
  it("read the recent activity dates, with no client's activity list loaded", () => {
    useDataStore.setState({
      clientActivities: {},
      recentActivityDates: [at(2026, 10, 19, 9), at(2026, 10, 19, 22, 30), at(2026, 10, 18, 14), at(2026, 10, 16, 14)],
    });

    expect(store().todayActivityCount()).toBe(2);
    expect(store().contactStreak()).toBe(2);
  });

  it("are 0 with no dates, and a streak that last ran the day before yesterday is 0", () => {
    useDataStore.setState({ recentActivityDates: [] });
    expect(store().todayActivityCount()).toBe(0);
    expect(store().contactStreak()).toBe(0);

    useDataStore.setState({ recentActivityDates: [at(2026, 10, 17, 9), at(2026, 10, 16, 9)] });
    expect(store().contactStreak()).toBe(0);
  });
});

describe("a logged activity", () => {
  const activity = { client_id: SAM, type: "call" as const, description: "Checked in", activity_date: at(2026, 10, 19, 9, 30) };

  it("is on the recent dates the moment it is sent, before the database answers", async () => {
    let answer!: (r: Reply) => void;
    net.override.contact_activities = () => new Promise<Reply>((resolve) => { answer = resolve; });
    useDataStore.setState({ recentActivityDates: [at(2026, 10, 18, 9)] });

    const saving = store().addActivity(activity);
    await vi.waitFor(() => expect(queriesOn("contact_activities").some((q) => q.write)).toBe(true));
    expect(store().recentActivityDates).toEqual([activity.activity_date, at(2026, 10, 18, 9)]);
    expect(store().todayActivityCount()).toBe(1);

    answer({ data: null, error: null });
    await expect(saving).resolves.toBe(true);
    expect(store().recentActivityDates).toHaveLength(2);
  });

  it("is taken back off when the database refuses it", async () => {
    net.override.contact_activities = async () => ({ data: null, error: { code: "23514", message: "check violation" } });
    useDataStore.setState({ recentActivityDates: [at(2026, 10, 18, 9)] });

    await expect(store().addActivity(activity)).resolves.toBe(false);

    expect(store().recentActivityDates).toEqual([at(2026, 10, 18, 9)]);
  });

  it("stays on the dates when it is only waiting to sync (no connection)", async () => {
    net.override.contact_activities = async () => ({ data: null, error: { message: "TypeError: Network request failed" } });

    await expect(store().addActivity(activity)).resolves.toBe(false);

    expect(store().recentActivityDates).toEqual([activity.activity_date]);
    expect(useOfflineQueueStore.getState().queue).toHaveLength(1);
  });

  it("from a quick log is counted the same way", async () => {
    net.override.contact_activities = async () => ({ data: null, error: null });

    await expect(store().quickLogActivity(SAM, "call")).resolves.toBe(true);

    expect(store().recentActivityDates).toEqual([new Date().toISOString()]);
  });

  it("from a text sent in Messages is counted", async () => {
    useDataStore.setState({ outreachQueue: [{ id: "o1", client_id: SAM, status: "ready" } as never] });
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });

    await expect(store().markTexted("o1", "Hi Sam")).resolves.toBe(true);

    expect(store().recentActivityDates).toEqual([new Date().toISOString()]);
    expect(store().outreachQueue).toEqual([]);
  });

  it("from a checklist attempt is counted", async () => {
    net.tables.clients = [{ id: SAM, user_id: "u1", status: "boarding" }];
    const task = { id: "t1", client_id: SAM, title: "Call Sam", due_date: "2026-10-19" } as never;

    await expect(store().rescheduleTaskAfterAttempt(task, "call", "No answer")).resolves.toBe(true);

    expect(store().recentActivityDates).toEqual([new Date().toISOString()]);
  });
});

// ── After a refresh ──────────────────────────────────────────────────────────

describe("draftTexts: the Next up tag (R32)", () => {
  const created = { ok: true, status: 200, json: async () => ({ results: [{ status: "created", clientId: SAM, clientName: "Sam Lee", queueItemId: "q-1" }] }) };
  const sentBody = () => JSON.parse(String((fetchMock.mock.calls[0][1] as { body: string }).body));

  it("a Next up card's Text sends source next_up, so the text is skipped once the client is handled", async () => {
    fetchMock.mockResolvedValue(created);
    const r = await store().draftTexts([SAM], "check_in", "New lead, first contact", { source: "next_up" });
    expect(r).toEqual({ results: [{ status: "created", clientId: SAM, clientName: "Sam Lee", queueItemId: "q-1" }] });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/mobile\/outreach\/draft-texts$/);
    expect(sentBody()).toEqual({ client_ids: [SAM], purpose: "check_in", note: "New lead, first contact", source: "next_up" });
  });

  it("the Clients screen's texts carry no source", async () => {
    fetchMock.mockResolvedValue(created);
    await store().draftTexts([SAM, PAT], "market_update", null);
    expect(sentBody()).toEqual({ client_ids: [SAM, PAT], purpose: "market_update" });
  });
});

describe("fetchAll", () => {
  beforeEach(() => {
    net.tables.user_settings = [{ user_id: "u1", subscription_tier: "pro", runway_score_snapshot: snapshot(at(2026, 10, 18, 9)) }];
  });

  it("loads the extras and the Next up payload in the background once the refresh succeeds", async () => {
    const extras = vi.fn(async () => {});
    const briefing = vi.fn(async () => {});
    const nextUp = vi.fn(async () => {});
    useDataStore.setState({ fetchDashboardExtras: extras, fetchBriefing: briefing });
    useNextUpStore.setState({ fetchNextUp: nextUp });

    await store().fetchAll();

    expect(briefing).toHaveBeenCalledTimes(1);
    expect(extras).toHaveBeenCalledTimes(1);
    expect(nextUp).toHaveBeenCalledTimes(1);
  });

  it("loads neither when a read failed", async () => {
    const extras = vi.fn(async () => {});
    const nextUp = vi.fn(async () => {});
    useDataStore.setState({ fetchDashboardExtras: extras, fetchBriefing: vi.fn(async () => {}) });
    useNextUpStore.setState({ fetchNextUp: nextUp });
    net.override.transactions = async () => ({ data: null, error: { message: "TypeError: Network request failed" } });

    const refreshing = store().fetchAll();
    await vi.advanceTimersByTimeAsync(2_000); // the retry's wait
    await refreshing;

    expect(extras).not.toHaveBeenCalled();
    expect(nextUp).not.toHaveBeenCalled();
  });
});
