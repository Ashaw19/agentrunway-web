/**
 * The client memory prompt dates every event on its Atlantic day (2026-10-13).
 *
 * The prompt opens with "Today's date" in Atlantic time and asks the model to
 * judge recency from it. Activities, last contact and outreach history were
 * printed as raw timestamps (`2026-10-10T01:00:00+00:00` for a call made on
 * Oct 9 at 10 pm), so an evening call read as made the next day, and on the
 * evening itself as made tomorrow.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({
  models: { default: "test-default", fallback: "test-fallback" },
  aiCallHeaders: () => ({}),
}));

import { buildMemoryPrompt } from "../client-memory-engine";

const OCT9_10PM_ADT = "2026-10-10T01:00:00+00:00"; // Fri Oct 9 2026, 22:00 ADT
const DEC31_10PM_AST = "2027-01-01T02:00:00+00:00"; // Thu Dec 31 2026, 22:00 AST

type MemoryData = Parameters<typeof buildMemoryPrompt>[0];

function data(over: Partial<MemoryData> = {}): MemoryData {
  return {
    client: {
      name: "Sam Lee", email: null, phone: null, status: "boarding",
      city: "Saint John", province_region: "NB", tags: [], notes: null,
      lead_source: null, birthdate: null, communication_tone: "friendly",
      timeframe: null, property_interest: null, property_interest_type: "buy",
      last_contact_at: OCT9_10PM_ADT,
    },
    transactions: [],
    activities: [
      { type: "call", description: "Evening call", activity_date: OCT9_10PM_ADT },
      { type: "text", description: "New Year's Eve text", activity_date: DEC31_10PM_AST },
    ],
    showings: [],
    listing_appointments: [],
    tasks: [],
    outreach_history: [
      { opportunity_type: "new_client_welcome", status: "sent", ai_subject: "Welcome", created_at: OCT9_10PM_ADT },
      { opportunity_type: "seasonal_yearend", status: "ready", ai_subject: null, created_at: DEC31_10PM_AST },
    ],
    existing_memory: null,
    client_notes: [],
    ...over,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("buildMemoryPrompt: timestamps are printed as Atlantic dates", () => {
  it("dates an evening activity on the day it happened", () => {
    const prompt = buildMemoryPrompt(data());
    expect(prompt).toContain("- [2026-10-09] call: Evening call");
    expect(prompt).toContain("- [2026-12-31] text: New Year's Eve text");
  });

  it("dates the last contact on the day it happened", () => {
    expect(buildMemoryPrompt(data())).toContain("- Last Contact: 2026-10-09\n");
  });

  it("still says never when there has been no contact", () => {
    const d = data();
    expect(buildMemoryPrompt({ ...d, client: { ...d.client, last_contact_at: null } })).toContain("- Last Contact: never\n");
  });

  it("dates outreach history on the day it was drafted", () => {
    const prompt = buildMemoryPrompt(data());
    expect(prompt).toContain("- [2026-10-09] new_client_welcome — sent — \"Welcome\"");
    expect(prompt).toContain("- [2026-12-31] seasonal_yearend — ready");
  });

  it("hands the model no raw timestamp", () => {
    expect(buildMemoryPrompt(data())).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });

  it("never dates an event after the prompt's own today", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T01:30:00Z")); // Oct 9, 22:30 ADT
    const prompt = buildMemoryPrompt(data({ activities: [{ type: "call", description: "Evening call", activity_date: OCT9_10PM_ADT }], outreach_history: [] }));
    expect(prompt).toContain("Today's date: 2026-10-09");
    expect(prompt).not.toContain("2026-10-10");
  });
});
