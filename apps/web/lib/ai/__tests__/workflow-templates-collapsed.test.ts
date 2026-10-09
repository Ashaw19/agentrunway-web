/**
 * Flight Plan "anniversary" template eligibility skips collapsed deals
 * (Andrew, 2026-10-06).
 *
 * The anniversary template is offered to clients with a closed deal on
 * record. A collapsed deal never closed, so a client whose only deal
 * collapsed must not be offered a home-anniversary note. Pinned here on the
 * Flight Crew getWorkflowTemplates tool; the CRM client panel uses
 * hasClosedDeal from lib/crm/contactable-records.ts for the same check.
 */

import { describe, expect, it } from "vitest";
import { createAgentTools } from "../tools";
import { hasClosedDeal } from "@/lib/crm/contactable-records";
import { fakeSupabase, type Row } from "./helpers/fake-supabase";

const USER = "user-1";
const CLIENT = "00000000-0000-4000-8000-000000000001";

function tables(conditionStatus: string): Record<string, Row[]> {
  return {
    clients: [{ id: CLIENT, user_id: USER, archived_at: null, name: "Sam Lee", first_name: "Sam", last_name: "Lee", status: "cruising" }],
    client_records: [{ id: "rec-1", user_id: USER, client_id: CLIENT, close_date: "2025-10-10", condition_status: conditionStatus }],
    workflow_templates: [
      { id: "t-1", name: "Closing day", trigger_event: "closing_day", is_active: true },
      { id: "t-2", name: "Home anniversary", trigger_event: "anniversary", is_active: true },
    ],
    workflow_drafts: [],
  };
}

async function listTemplates(conditionStatus: string): Promise<string> {
  const { client } = fakeSupabase(tables(conditionStatus));
  const tools = createAgentTools(client, USER);
  const execute = tools.getWorkflowTemplates.execute as (input: { client_id: string }, opts: unknown) => Promise<string>;
  return execute({ client_id: CLIENT }, { toolCallId: "t", messages: [] });
}

describe("getWorkflowTemplates — anniversary eligibility", () => {
  it("offers the anniversary template when the client's deal closed", async () => {
    expect(await listTemplates("firmed")).toContain("Home anniversary");
  });

  it("doesn't offer it when the client's only deal collapsed", async () => {
    const out = await listTemplates("collapsed");
    expect(out).toContain("Closing day");
    expect(out).not.toContain("Home anniversary");
  });
});

describe("hasClosedDeal", () => {
  it("is true for a deal with a close date that didn't collapse", () => {
    expect(hasClosedDeal([{ close_date: "2025-10-10", condition_status: "firmed" }])).toBe(true);
    expect(hasClosedDeal([{ close_date: "2025-10-10", condition_status: null }])).toBe(true);
  });

  it("is false for a collapsed deal or one with no close date", () => {
    expect(hasClosedDeal([
      { close_date: "2025-10-10", condition_status: "collapsed" },
      { close_date: null, condition_status: "pending" },
    ])).toBe(false);
  });
});
