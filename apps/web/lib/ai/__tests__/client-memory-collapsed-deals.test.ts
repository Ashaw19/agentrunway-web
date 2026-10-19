/**
 * A collapsed deal never closed, so the client memory profile can't call it
 * a closed deal (Andrew, 2026-10-13).
 *
 * The memory engine read every client_records row into
 * "## Transaction History (N closed deals)", GCI included, without selecting
 * condition_status. Flight Crew then "remembered" a purchase that fell
 * through, and the nightly drafter reads that summary.
 *
 * Same rule as the CRM totals, the briefing and Flight Control: a deal counts
 * unless condition_status is 'collapsed', and a deal with no close date still
 * counts. A collapsed deal isn't dropped from the prompt. It is listed apart
 * as fell through, without its GCI, so the profile can still speak to what
 * the client went through.
 *
 * Driven through gatherClientData so the column-projecting fake fails the
 * test if the fetch stops selecting condition_status.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({
  models: { default: "test-default", fallback: "test-fallback" },
  aiCallHeaders: () => ({}),
}));

import { buildMemoryPrompt, gatherClientData } from "../client-memory-engine";
import { dealFieldFeedsMemory } from "../client-memory-deals";
import { fakeSupabase, type Row } from "./helpers/fake-supabase";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const USER = "user-1";
const CLIENT = "client-1";

const CLOSED: Row = {
  id: "rec-1", user_id: USER, client_id: CLIENT,
  address: "1 Elm St", close_date: "2024-06-14", gci: 9000,
  side: "buyer", source: "referral", condition_status: "firmed",
};

const COLLAPSED: Row = {
  id: "rec-2", user_id: USER, client_id: CLIENT,
  address: "2 Oak Ave", close_date: "2025-10-10", gci: 12345,
  side: "buyer", source: "referral", condition_status: "collapsed",
};

/** History imports don't always carry a close date or a condition status. */
const UNDATED: Row = {
  id: "rec-3", user_id: USER, client_id: CLIENT,
  address: "3 Pine Rd", close_date: null, gci: 7500,
  side: "seller", source: null, condition_status: "pending",
};

function tables(records: Row[], previousSummary?: string): Record<string, Row[]> {
  return {
    clients: [{
      id: CLIENT, user_id: USER, name: "Sam Lee", email: null, phone: null,
      status: "cruising", city: "Saint John", province_region: "NB", tags: [],
      notes: null, lead_source: "referral", birthdate: null,
      communication_tone: "friendly", timeframe: null, property_interest: null,
      property_interest_type: "buy", last_contact_at: null,
    }],
    client_records: records,
    client_memory_profiles: previousSummary
      ? [{ user_id: USER, client_id: CLIENT, memory_summary: previousSummary, structured_facts: {} }]
      : [],
  };
}

async function memoryPrompt(records: Row[], previousSummary?: string): Promise<string> {
  const { client } = fakeSupabase(tables(records, previousSummary));
  const data = await gatherClientData(client, USER, CLIENT);
  if (!data) throw new Error("fixture client not found");
  return buildMemoryPrompt(data);
}

/** One "## Heading" section of the prompt, heading included. "" when absent. */
function section(prompt: string, heading: string): string {
  const start = prompt.indexOf(`## ${heading}`);
  if (start === -1) return "";
  const next = prompt.indexOf("\n## ", start + 1);
  return next === -1 ? prompt.slice(start) : prompt.slice(start, next);
}

// ── Prompt ───────────────────────────────────────────────────────────────────

describe("client memory prompt — collapsed deals", () => {
  it("counts only the deals that closed", async () => {
    const prompt = await memoryPrompt([CLOSED, COLLAPSED]);
    expect(prompt).toContain("## Transaction History (1 closed deal)");
  });

  it("keeps a collapsed deal out of the closed-deal list", async () => {
    const closed = section(await memoryPrompt([CLOSED, COLLAPSED]), "Transaction History");
    expect(closed).toContain("1 Elm St");
    expect(closed).not.toContain("2 Oak Ave");
  });

  it("lists a collapsed deal apart, as one that fell through and never closed", async () => {
    const fellThrough = section(await memoryPrompt([CLOSED, COLLAPSED]), "Deals That Fell Through");
    expect(fellThrough).toContain("2 Oak Ave");
    expect(fellThrough).toContain("never closed");
    expect(fellThrough).not.toContain("1 Elm St");
  });

  it("never shows a collapsed deal's GCI", async () => {
    const prompt = await memoryPrompt([CLOSED, COLLAPSED]);
    expect(prompt).toContain("GCI $9,000");
    expect(prompt).not.toContain("12,345");
  });

  it("shows no closed deals for a client whose only deal collapsed", async () => {
    const prompt = await memoryPrompt([COLLAPSED]);
    expect(prompt).not.toContain("## Transaction History");
    expect(section(prompt, "Deals That Fell Through")).toContain("2 Oak Ave");
  });

  it("still counts a deal with no close date", async () => {
    const closed = section(await memoryPrompt([UNDATED, COLLAPSED]), "Transaction History");
    expect(closed).toContain("(1 closed deal)");
    expect(closed).toContain("date unknown");
    expect(closed).toContain("3 Pine Rd");
  });

  it("has no fell-through section when nothing collapsed", async () => {
    const prompt = await memoryPrompt([CLOSED, UNDATED]);
    expect(prompt).toContain("## Transaction History (2 closed deals)");
    expect(prompt).not.toContain("## Deals That Fell Through");
  });

  it("says the data outranks an earlier summary that called the deal closed", async () => {
    const earlier = section(
      await memoryPrompt([COLLAPSED], "Sam bought 2 Oak Ave in 2025."),
      "Previous Memory Summary",
    );
    expect(earlier).toContain("Sam bought 2 Oak Ave in 2025.");
    expect(earlier).toContain("the data above is correct");
  });
});

// ── Stale trigger ────────────────────────────────────────────────────────────

describe("dealFieldFeedsMemory", () => {
  it("is true for the deal status, so marking a deal Collapsed outdates the profile", () => {
    expect(dealFieldFeedsMemory("condition_status")).toBe(true);
  });

  it("is false for a field the memory prompt never reads", () => {
    expect(dealFieldFeedsMemory("bedrooms")).toBe(false);
  });
});
