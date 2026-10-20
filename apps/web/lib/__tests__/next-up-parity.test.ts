/**
 * The always-on-top counts agree across surfaces: /api/next-up's `urgent`
 * (buildNextUpPayload, read by Flight Crew and MCP) and the phone's stack
 * (core buildNextUp) find the same new leads, deal deadlines and overdue
 * tasks on the same rows. Both run the core rules in lib/next-up/rules; this
 * pins that neither side filters differently around them (the server's
 * queries, the phone's active-deal input). Synthetic rows only.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const { getTopOpportunities } = vi.hoisted(() => ({ getTopOpportunities: vi.fn() }));

vi.mock("@/app/api/ai/detect-opportunities/route", () => ({ getTopOpportunities }));
vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({ models: { default: "m", fallback: "f" }, aiCallHeaders: () => ({}) }));

import { buildNextUpPayload } from "@/lib/crm/next-up-payload";
import { activePipelineDeals } from "@agent-runway/core/types/database";
import { STACK_LIMIT, buildNextUp, type NextUpInput } from "@agent-runway/core/lib/next-up/build";
import { timeBand } from "@agent-runway/core/lib/next-up/rules";
import { atlanticHour, atlanticISODate } from "@agent-runway/core/lib/local-date";
import { fakeSupabase, type Row } from "../ai/__tests__/helpers/fake-supabase";

const USER = "user-1";
const NOW = new Date("2026-10-19T18:00:00Z"); // Mon Oct 19 2026, 15:00 ADT
const TODAY = "2026-10-19";

function client(id: string, name: string, over: Row = {}): Row {
  return {
    id, user_id: USER, name, status: "cruising", archived_at: null,
    created_at: "2024-01-01T12:00:00Z", last_contact_at: "2025-06-01T12:00:00Z",
    phone: "(506) 555-0101", phone_type: "mobile", secondary_phone: null, secondary_phone_type: null,
    email_opt_out_at: null, sms_opt_out_at: null,
    ...over,
  };
}
const boarding = (id: string, created_at: string, over: Row = {}) =>
  client(id, `Lead ${id}`, { status: "boarding", last_contact_at: null, created_at, ...over });

const clients: Row[] = [
  boarding("lead-1h", "2026-10-19T17:00:00Z"),
  boarding("lead-47h", "2026-10-17T19:00:00Z"),
  boarding("lead-48h", "2026-10-17T18:00:00Z"),             // exactly 48 hours: no longer new
  boarding("lead-49h", "2026-10-17T17:00:00Z"),
  boarding("lead-called", "2026-10-19T10:00:00Z", { last_contact_at: "2026-10-19T12:00:00Z" }),
  boarding("lead-archived", "2026-10-19T10:00:00Z", { archived_at: "2026-10-19T11:00:00Z" }),
  client("lead-inflight", "Busy Lead", { status: "in_flight", last_contact_at: null, created_at: "2026-10-19T10:00:00Z" }),
  client("c-cond", "Carl Cond"),
  client("c-other-user", "Not Mine", { user_id: "user-2", status: "boarding", last_contact_at: null, created_at: "2026-10-19T10:00:00Z" }),
];

const task = (id: string, due_date: string, over: Row = {}): Row =>
  ({ id, user_id: USER, client_id: null, title: id, due_date, completed_at: null, ...over });
const tasks: Row[] = [
  task("t-yesterday", "2026-10-18"),
  task("t-last-week", "2026-10-10", { client_id: "c-cond" }),
  task("t-today", TODAY),
  task("t-tomorrow", "2026-10-20"),
  task("t-done", "2026-10-17", { completed_at: "2026-10-18T12:00:00Z" }),
  task("t-other-user", "2026-10-18", { user_id: "user-2" }),
];

const deal = (id: string, stage: string, expected_close_date: string | null, user_id = USER): Row =>
  ({ id, user_id, stage, expected_close_date, address: `${id} St`, client_name: null });
const pipeline: Row[] = [
  deal("d-today", "conditional", TODAY),
  deal("d-in-7", "firm", "2026-10-26"),
  deal("d-in-8", "firm", "2026-10-27"),
  deal("d-closed", "closed", "2026-10-20"),
  deal("d-lost", "lost", "2026-10-21"),
  deal("d-past", "offer", "2026-10-18"),
  deal("d-undated", "lead", null),
  deal("d-other-user", "firm", "2026-10-21", "user-2"),
];

// Each record its own client, so no deadline shares a card (one card a client).
const record = (id: string, condition_date: string | null, condition_status: string | null, user_id = USER): Row =>
  ({ id, user_id, client_id: `c-${id}`, address: `${id} Ave`, close_date: null, condition_date, condition_status });
const clientRecords: Row[] = [
  record("r-in-7", "2026-10-26", "pending"),
  record("r-firmed", "2026-10-21", "firmed"),
  record("r-waived", "2026-10-22", "waived"),
  record("r-collapsed", "2026-10-21", "collapsed"),
  record("r-in-8", "2026-10-27", "pending"),
  record("r-past", "2026-10-18", "pending"),
  record("r-other-user", "2026-10-21", "pending", "user-2"),
];

beforeEach(() => {
  getTopOpportunities.mockReset();
  getTopOpportunities.mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Next up parity: /api/next-up and the phone's stack", () => {
  it("urgent counts equal the new leads, deal deadlines and overdue tasks buildNextUp finds on the same rows", async () => {
    const { client: sb } = fakeSupabase({
      clients, contact_tasks: tasks, pipeline_deals: pipeline, client_records: clientRecords,
      next_up_handful: [], flight_control_dismissals: [], outreach_queue: [], user_settings: [],
    });
    const payload = await buildNextUpPayload(USER, sb as SupabaseClient, { persist: false, now: NOW });

    // The phone holds the user's own rows, and passes active deals only.
    const mine = (rows: Row[]) => rows.filter((r) => r.user_id === USER);
    const input: NextUpInput = {
      now: NOW, today: atlanticISODate(NOW), band: timeBand(atlanticHour(NOW)),
      clients:       mine(clients) as unknown as NextUpInput["clients"],
      tasks:         mine(tasks) as unknown as NextUpInput["tasks"],
      pipeline:      activePipelineDeals(mine(pipeline) as { stage: string }[]) as unknown as NextUpInput["pipeline"],
      clientRecords: mine(clientRecords) as unknown as NextUpInput["clientRecords"],
      undatedReceipts: 0, outreachReady: [], payload, schedule: [],
      tripsLoggedToday: 0, briefingCount: 0,
      localSnoozes: {}, voiceNoteDoneOn: null,
    };
    expect(input.today).toBe(TODAY);
    const view = buildNextUp(input);
    // Under the cap, so the stack holds every always-on-top card.
    expect(view.stack.length).toBeLessThan(STACK_LIMIT);

    const found = {
      new_leads:      view.stack.filter((c) => c.kind === "new_lead").length,
      overdue_tasks:  view.stack.find((c) => c.kind === "overdue_tasks")?.count ?? 0,
      deal_deadlines: view.stack.filter((c) => c.kind === "deal_deadline").length,
    };
    expect(payload.urgent).toEqual(found);
    // And the fixture exercises each count.
    expect(found).toEqual({ new_leads: 2, overdue_tasks: 2, deal_deadlines: 3 });
    // Every new-lead card has its CASL-checked text status, in the stack's order (R31).
    expect(payload.new_leads.map((l) => l.client_id))
      .toEqual(view.stack.filter((c) => c.kind === "new_lead").map((c) => c.clientId));
    for (const c of view.stack.filter((x) => x.kind === "new_lead")) expect(c.text).toEqual({ status: "draftable" });
  });
});
