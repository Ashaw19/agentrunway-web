/**
 * Later and Stop holds (00188) in both detector paths, and the day's pinned
 * handful (next_up_handful) in Scan:
 *
 *   - Scan (getTopOpportunities): a client on Later or Stop gets no card. A
 *     Stop still lets a consent-lapsing notice through (the CASL ask has a
 *     deadline). A hold ends at its `until`. Pinned clients rank first;
 *     clients on Later keep their slot (reservedSlots), so the list is
 *     shorter by one for each; clients done for today are left out.
 *   - Nightly drafter (detectAndDraftForUser): nothing is queued for a
 *     client on Later or Stop, and they are queued again once Later ends.
 *
 * Synthetic rows only.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({
  models: { default: "test-default", fallback: "test-fallback" },
  aiCallHeaders: () => ({}),
}));
// The route module's request-handling imports; not exercised here.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(), rateLimitHeaders: vi.fn() }));
vi.mock("@/lib/require-pro", () => ({ requirePro: vi.fn() }));

import { detectAndDraftForUser, getTopOpportunities } from "@/app/api/ai/detect-opportunities/route";
import { loadNextUpHandful } from "@/lib/crm/next-up-handful";
import { fakeSupabase, type Row } from "./helpers/fake-supabase";

const USER = "user-1";
const NOW = "2026-10-19T15:00:00Z";           // Mon Oct 19 2026, 12:00 ADT
const TONIGHT = "2026-10-19T22:00:00Z";       // 19:00 ADT
const IN_3_MONTHS = "2027-01-19T04:00:00Z";   // Atlantic midnight starting Jan 19

function clientRow(id: string, name: string, over: Row = {}): Row {
  return {
    id, user_id: USER, archived_at: null,
    name, first_name: name.split(" ")[0], last_name: name.split(" ")[1] ?? "",
    city: "Saint John", province_region: "NB", birthdate: null,
    communication_tone: "friendly", first_contacted_at: null, last_contact_at: null,
    created_at: "2020-01-01T12:00:00Z",
    tags: [], notes: null, status: "cruising", timeframe: null,
    property_interest: null, property_interest_type: null,
    scheduled_for: null, scheduled_phrase: null,
    email_opt_out_at: null, sms_opt_out_at: null,
    ...over,
  };
}

/** A birthday six days out: a card in Scan and a queued row at night. */
const BIRTHDAY = "1985-10-25";

function deal(clientId: string, close_date: string, n = 1): Row {
  return {
    id: `rec-${clientId}-${n}`, user_id: USER, client_id: clientId,
    address: `${n} Elm St`, close_date, gci: 9000, side: "buyer",
    property_use: "primary_residence", condition_date: null, condition_status: "firmed",
  };
}

function hold(clientId: string, kind: "later" | "stop", until: string, over: Row = {}): Row {
  return {
    id: `hold-${clientId}-${kind}`, user_id: USER, client_id: clientId,
    opportunity_type: "any", trigger_date: "2026-10-19", kind, until,
    dismissed_at: "2026-10-19T14:00:00Z", ...over,
  };
}

function tables(clients: Row[], extra: Record<string, Row[]> = {}): Record<string, Row[]> {
  return {
    clients,
    user_settings: [{
      user_id: USER, display_name: "Andrew Shaw", email_signature: "", ai_voice_guide: null,
      brokerage_name: "REAL Broker", phone: "506-555-0100", mailing_address: "123 Main St, Saint John NB E2L 1A1",
    }],
    client_records: [],
    client_memory_profiles: [],
    client_record_co_parties: [],
    outreach_queue: [],
    client_email_consents: [],
    flight_control_dismissals: [],
    next_up_handful: [],
    ...extra,
  };
}

async function scan(t: Record<string, Row[]>, opts?: Parameters<typeof getTopOpportunities>[2]) {
  const { client } = fakeSupabase(t);
  return getTopOpportunities(USER, client, opts);
}

/** The rows the nightly run sends to the outreach_queue upsert. */
async function nightly(t: Record<string, Row[]>): Promise<Row[]> {
  const { client, writes } = fakeSupabase(t);
  await detectAndDraftForUser(USER, client);
  const upsert = writes.find((w) => w.table === "outreach_queue" && w.op === "upsert");
  return (upsert?.payload as Row[] | undefined) ?? [];
}

let savedKeys: Record<string, string | undefined>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  savedKeys = { a: process.env.ANTHROPIC_API_KEY, g: process.env.GROQ_API_KEY };
  // No AI key: detect and queue only, no drafting calls.
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GROQ_API_KEY;
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (savedKeys.a !== undefined) process.env.ANTHROPIC_API_KEY = savedKeys.a;
  if (savedKeys.g !== undefined) process.env.GROQ_API_KEY = savedKeys.g;
});

describe("Scan honours Later and Stop", () => {
  it("Scan hides a stopped client but still shows their consent-lapsing card", async () => {
    // c1's implied consent from a 2024-11-15 purchase lapses 2026-11-15:
    // the ask is due now. c2 has only a birthday. c3 is not stopped.
    const t = tables(
      [
        clientRow("c1", "Sam Lee", { birthdate: BIRTHDAY }),
        clientRow("c2", "Ana Roy", { birthdate: BIRTHDAY }),
        clientRow("c3", "Kim Day", { birthdate: BIRTHDAY }),
      ],
      {
        client_records: [deal("c1", "2024-11-15")],
        flight_control_dismissals: [hold("c1", "stop", IN_3_MONTHS), hold("c2", "stop", IN_3_MONTHS)],
      },
    );
    const cards = await scan(t);
    expect(cards.map((c) => `${c.client_id}:${c.opportunity_type}`).sort())
      .toEqual(["c1:consent_lapsing", "c3:birthday"]);

    // Without the Stops all three are there.
    const open = await scan({ ...t, flight_control_dismissals: [] });
    expect(open.map((c) => c.client_id).sort()).toEqual(["c1", "c2", "c3"]);
  });

  it("a client on Later is hidden until the Later ends, and back at that moment", async () => {
    const t = tables(
      [clientRow("c1", "Sam Lee", { birthdate: BIRTHDAY }), clientRow("c2", "Ana Roy", { birthdate: BIRTHDAY })],
      { flight_control_dismissals: [hold("c1", "later", TONIGHT)] },
    );
    expect((await scan(t)).map((c) => c.client_id)).toEqual(["c2"]);
    // A Later hides the consent-lapsing card too.
    const lapsing = tables([clientRow("c1", "Sam Lee")], {
      client_records: [deal("c1", "2024-11-15")],
      flight_control_dismissals: [hold("c1", "later", TONIGHT)],
    });
    expect(await scan(lapsing)).toEqual([]);
    // The holds are read at `now` (the option), and end at `until`.
    expect((await scan(t, { now: new Date(TONIGHT) })).map((c) => c.client_id).sort()).toEqual(["c1", "c2"]);
    expect((await scan(t, { now: new Date("2026-10-19T21:59:59Z") })).map((c) => c.client_id)).toEqual(["c2"]);
  });

  it("a hold that has ended hides nothing, and a skip still hides only its occurrence", async () => {
    const t = tables([clientRow("c1", "Sam Lee", { birthdate: BIRTHDAY })], {
      flight_control_dismissals: [
        hold("c1", "stop", "2026-10-19T14:59:59Z"),
        { id: "s1", user_id: USER, client_id: "c1", opportunity_type: "birthday", trigger_date: "2025-10-25", kind: "skip", until: null },
      ],
    });
    expect((await scan(t)).map((c) => `${c.client_id}:${c.opportunity_type}:${c.trigger_date}`)).toEqual(["c1:birthday:2026-10-25"]);
    // Skipping this year's birthday leaves the client's other card (a sphere check-in).
    const skipped = tables([clientRow("c1", "Sam Lee", { birthdate: BIRTHDAY })], {
      flight_control_dismissals: [
        { id: "s1", user_id: USER, client_id: "c1", opportunity_type: "birthday", trigger_date: "2026-10-25", kind: "skip", until: null },
      ],
    });
    expect((await scan(skipped)).map((c) => `${c.client_id}:${c.opportunity_type}`)).toEqual(["c1:sphere_check_in"]);
  });
});

describe("Scan and the day's handful", () => {
  const six = () => ["c1", "c2", "c3", "c4", "c5", "c6"].map((id) => clientRow(id, `Client ${id}`, { birthdate: BIRTHDAY }));

  it("pinned clients come first, in pin order", async () => {
    const t = tables([
      clientRow("c1", "Sam Lee", { birthdate: BIRTHDAY }),
      // An idle past client scores below a birthday.
      clientRow("c2", "Ana Roy"),
    ], { client_records: [deal("c2", "2024-01-10")] });
    const unpinned = await scan(t);
    expect(unpinned.map((c) => c.client_id)).toEqual(["c1", "c2"]);
    const pinned = await scan(t, { pinnedClientIds: ["c2"] });
    // The primary card still leads Scan; the pin decides who is on it.
    expect(pinned.map((c) => c.client_id).sort()).toEqual(["c1", "c2"]);
    const one = await scan(t, { pinnedClientIds: ["c2"], reservedSlots: 4 });
    expect(one.map((c) => c.client_id)).toEqual(["c2"]);
  });

  it("each slot held by a Later leaves one card fewer, floored at none", async () => {
    const t = tables(six());
    expect(await scan(t)).toHaveLength(5);
    expect(await scan(t, { reservedSlots: 1 })).toHaveLength(4);
    expect(await scan(t, { reservedSlots: 5 })).toHaveLength(0);
    expect(await scan(t, { reservedSlots: 7 })).toHaveLength(0);
    // A count that isn't a number reserves nothing (and never lifts the cap).
    expect(await scan(t, { reservedSlots: Number.NaN })).toHaveLength(5);
    expect(await scan(t, { reservedSlots: -2 })).toHaveLength(5);
  });

  it("clients done for today are left out, and the slot goes to the next one", async () => {
    const cards = await scan(tables(six()), { excludeClientIds: ["c1", "c2"] });
    expect(cards.map((c) => c.client_id).sort()).toEqual(["c3", "c4", "c5", "c6"]);
  });
});

describe("the day's handful, through Flight Control", () => {
  const pinRow = (client: string, rank: number, added_at = "2026-10-19T12:00:00Z"): Row => ({
    id: `pin-${client}`, user_id: USER, client_id: client, opportunity_type: "birthday", trigger_date: "2026-10-25",
    rank, added_at, handled_at: null, handled_how: null,
  });
  const six = () => ["c1", "c2", "c3", "c4", "c5", "c6"].map((id) => clientRow(id, `Client ${id}`, { birthdate: BIRTHDAY }));

  it("a later pin reserves its slot: 4 cards when 1 pinned client is on Later", async () => {
    const { client, writes } = fakeSupabase(tables(six(), {
      next_up_handful: [pinRow("c1", 0)],
      flight_control_dismissals: [hold("c1", "later", TONIGHT)],
    }));
    const out = await loadNextUpHandful(USER, client, { now: new Date(NOW) });
    expect(out.opportunities).toHaveLength(4);
    expect(out.opportunities.map((o) => o.client_id)).not.toContain("c1");
    expect(out.snoozed).toEqual([{ client_id: "c1", client_name: "Client c1", until: TONIGHT }]);
    // The Later pin isn't closed; the four picks are pinned around its rank.
    const pins = writes.filter((w) => w.table === "next_up_handful");
    expect(pins.every((w) => w.op === "insert")).toBe(true);
    expect(pins.map((w) => (w.payload as Row).rank)).toEqual([1, 2, 3, 4]);
  });

  it("an untouched pinned client keeps their card over a newcomer", async () => {
    // c6 was pinned yesterday for a quiet past client (idle, scores 38); five
    // birthdays (70) are in their window today.
    const clients = [...six().slice(0, 5), clientRow("c6", "Client c6")];
    const t = tables(clients, {
      client_records: [deal("c6", "2024-01-10")],
      next_up_handful: [{ ...pinRow("c6", 0, "2026-10-18T12:00:00Z"), opportunity_type: "idle_client", trigger_date: "2026-10-01" }],
    });
    const unpinned = await scan(t);
    expect(unpinned.map((c) => c.client_id)).not.toContain("c6");
    const { client } = fakeSupabase(t);
    const out = await loadNextUpHandful(USER, client, { now: new Date(NOW) });
    expect(out.opportunities).toHaveLength(5);
    expect(out.opportunities.map((o) => o.client_id)).toContain("c6");
  });

  it("a client contacted today isn't picked again today, and the slot goes to the next one", async () => {
    // A birthday card survives a recent contact, so without the day's rule
    // c1 would come straight back as a new pin.
    const clients = six().map((c) => (c.id === "c1" ? { ...c, last_contact_at: "2026-10-19T14:00:00Z" } : c));
    const { client, writes } = fakeSupabase(tables(clients, { next_up_handful: [pinRow("c1", 0)] }));
    const out = await loadNextUpHandful(USER, client, { now: new Date(NOW) });
    expect(out.doneToday).toBe(1);
    expect(out.opportunities.map((o) => o.client_id).sort()).toEqual(["c2", "c3", "c4", "c5", "c6"]);
    const pins = writes.filter((w) => w.table === "next_up_handful");
    expect(pins.filter((w) => w.op === "update").map((w) => w.payload))
      .toEqual([{ handled_at: "2026-10-19T14:00:00Z", handled_how: "contacted" }]);
    expect(pins.filter((w) => w.op === "insert").map((w) => (w.payload as Row).client_id)).not.toContain("c1");
  });

  it("a stopped pinned client closes as stopped and frees the slot", async () => {
    const { client, writes } = fakeSupabase(tables(six(), {
      next_up_handful: [pinRow("c1", 0)],
      flight_control_dismissals: [hold("c1", "stop", IN_3_MONTHS)],
    }));
    const out = await loadNextUpHandful(USER, client, { now: new Date(NOW) });
    expect(out.opportunities).toHaveLength(5);
    expect(out.opportunities.map((o) => o.client_id)).not.toContain("c1");
    expect(out.doneToday).toBe(1);
    expect(writes.filter((w) => w.table === "next_up_handful" && w.op === "update").map((w) => w.payload))
      .toEqual([{ handled_at: "2026-10-19T14:00:00Z", handled_how: "stopped" }]);
    // Today's unsent Next up text for c1, if one was drafted, is marked skipped.
    expect(writes.filter((w) => w.table === "outreach_queue").map((w) => w.payload)).toEqual([{ status: "skipped" }]);
  });
});

describe("nightly drafter honours Later and Stop", () => {
  const queuedFor = (rows: Row[], clientId: string) => rows.filter((r) => r.client_id === clientId).map((r) => r.opportunity_type);

  it("the nightly drafter queues nothing for a client on Later or Stop, and drafts again once Later has passed", async () => {
    const t = tables(
      [
        clientRow("c1", "Sam Lee", { birthdate: BIRTHDAY }),
        clientRow("c2", "Ana Roy", { birthdate: BIRTHDAY }),
        clientRow("c3", "Kim Day", { birthdate: BIRTHDAY }),
      ],
      { flight_control_dismissals: [hold("c1", "later", TONIGHT), hold("c2", "stop", IN_3_MONTHS)] },
    );
    const now = await nightly(t);
    expect(queuedFor(now, "c1")).toEqual([]);
    expect(queuedFor(now, "c2")).toEqual([]);
    expect(queuedFor(now, "c3")).toEqual(["birthday"]);

    vi.setSystemTime(new Date(TONIGHT));
    const later = await nightly(t);
    expect(queuedFor(later, "c1")).toEqual(["birthday"]);
    expect(queuedFor(later, "c2")).toEqual([]);
  });

  it("a Stop still lets the consent request be queued", async () => {
    const t = tables([clientRow("c1", "Sam Lee")], {
      client_records: [deal("c1", "2024-11-15")],
      flight_control_dismissals: [hold("c1", "stop", IN_3_MONTHS)],
    });
    expect(queuedFor(await nightly(t), "c1")).toEqual(["consent_lapsing"]);
    const later = { ...t, flight_control_dismissals: [hold("c1", "later", TONIGHT)] };
    expect(queuedFor(await nightly(later), "c1")).toEqual([]);
  });
});
