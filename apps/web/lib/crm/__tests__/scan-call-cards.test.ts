import { describe, it, expect } from "vitest";
import {
  weekStartKey,
  quarterStartKey,
  quietLeadCandidates,
  sphereCandidates,
  scanCallCardScore,
  callReasonFor,
  callCardCopy,
  QUIET_LEAD_DAYS,
  SPHERE_DAYS,
} from "../scan-call-cards";

/**
 * Flight Control Scan came back empty for Andrew (2026-10-07) although 2 of
 * his 8 active leads/clients hadn't heard from him in 30+ days and 157
 * contacts had nothing Scan could key on. Two call-first card types fix it:
 *
 *   - lead_going_quiet: Boarding / In-Flight, 14+ days since last contact
 *     (the dashboard briefing's stale threshold). Strong signal. Dismiss = a
 *     week (key = Monday).
 *   - sphere_check_in: Cruising, no deal ever, 90+ days since contact.
 *     Backfill only, max 2 per scan. Dismiss = a quarter.
 *
 * Neither is ever drafted as an email.
 */

const NOW = new Date("2026-10-07T16:00:00Z"); // Wed Oct 7, 13:00 Atlantic
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe("dismiss keys (Atlantic time)", () => {
  it("week key is that week's Monday", () => {
    expect(weekStartKey(NOW)).toBe("2026-10-05");
    // Sunday evening Atlantic is still the previous week.
    expect(weekStartKey(new Date("2026-10-12T02:00:00Z"))).toBe("2026-10-05");
    expect(weekStartKey(new Date("2026-10-12T16:00:00Z"))).toBe("2026-10-12");
  });

  it("quarter key is the quarter's first day", () => {
    expect(quarterStartKey(NOW)).toBe("2026-10-01");
    expect(quarterStartKey(new Date("2026-02-14T16:00:00Z"))).toBe("2026-01-01");
  });
});

describe("quietLeadCandidates", () => {
  const clients = [
    { id: "quiet",     status: "in_flight", last_contact_at: daysAgo(31), created_at: daysAgo(200) },
    { id: "fresh",     status: "boarding",  last_contact_at: daysAgo(3),  created_at: daysAgo(200) },
    { id: "edge",      status: "boarding",  last_contact_at: daysAgo(QUIET_LEAD_DAYS), created_at: daysAgo(200) },
    { id: "never",     status: "boarding",  last_contact_at: null,        created_at: daysAgo(20) },
    { id: "brandnew",  status: "boarding",  last_contact_at: null,        created_at: daysAgo(2) },
    { id: "scheduled", status: "scheduled", last_contact_at: daysAgo(60), created_at: daysAgo(200) },
    { id: "cruising",  status: "cruising",  last_contact_at: daysAgo(60), created_at: daysAgo(200) },
    { id: "sentmail",  status: "in_flight", last_contact_at: daysAgo(40), created_at: daysAgo(200) },
  ];
  const out = quietLeadCandidates(clients, new Set(["sentmail"]), NOW);
  const byId = Object.fromEntries(out.map((c) => [c.client_id, c]));

  it("picks Boarding / In-Flight clients quiet for 14+ days", () => {
    expect(Object.keys(byId).sort()).toEqual(["edge", "never", "quiet"]);
  });

  it("uses when they were added when no contact was ever logged", () => {
    expect(byId.never.context).toMatchObject({ never_contacted: true, days_quiet: 20 });
  });

  it("skips clients contacted recently by any route (e.g. a Flight Control send)", () => {
    expect(byId.sentmail).toBeUndefined();
  });

  it("keys the occurrence to the week so a dismissal lasts a week", () => {
    expect(byId.quiet).toMatchObject({ opportunity_type: "lead_going_quiet", trigger_date: "2026-10-05" });
    expect(byId.quiet.context).toMatchObject({ status: "in_flight", days_quiet: 31, never_contacted: false });
  });
});

describe("sphereCandidates", () => {
  const clients = [
    { id: "old",      status: "cruising", last_contact_at: daysAgo(400), created_at: daysAgo(900) },
    { id: "older",    status: "cruising", last_contact_at: null,         created_at: daysAgo(700) },
    { id: "recent",   status: "cruising", last_contact_at: daysAgo(SPHERE_DAYS - 1), created_at: daysAgo(900) },
    { id: "past",     status: "cruising", last_contact_at: daysAgo(500), created_at: daysAgo(900) },
    { id: "boarding", status: "boarding", last_contact_at: daysAgo(500), created_at: daysAgo(900) },
  ];
  const out = sphereCandidates(clients, new Set(["past"]), new Set(), NOW);

  it("takes Cruising contacts with no deal and 90+ days since contact, longest first", () => {
    expect(out.map((c) => c.client_id)).toEqual(["older", "old"]);
  });

  it("keys the occurrence to the quarter so a dismissal lasts a quarter", () => {
    expect(out[0]).toMatchObject({ opportunity_type: "sphere_check_in", trigger_date: "2026-10-01" });
    expect(out[0].context).toMatchObject({ never_contacted: true });
  });

  it("never includes past clients (they have their own cards)", () => {
    expect(out.some((c) => c.client_id === "past")).toBe(false);
  });
});

describe("scanCallCardScore", () => {
  it("ranks a quiet lead as a strong signal, a quiet active deal higher", () => {
    expect(scanCallCardScore("lead_going_quiet", { status: "boarding", days_quiet: 15 })).toBe(60);
    expect(scanCallCardScore("lead_going_quiet", { status: "in_flight", days_quiet: 31 })).toBe(75);
  });

  it("keeps sphere below idle past clients (38) so it only backfills", () => {
    expect(scanCallCardScore("sphere_check_in", {})).toBe(30);
  });

  it("leaves other types to the main scorer", () => {
    expect(scanCallCardScore("idle_client", {})).toBeNull();
  });
});

describe("callReasonFor", () => {
  it("explains each call-only card by its own reason", () => {
    expect(callReasonFor("lead_going_quiet", "email")).toBe("personal_check_in");
    expect(callReasonFor("sphere_check_in", "email")).toBe("sphere");
    expect(callReasonFor("idle_client", "call")).toBe("casl_lapsed");
    expect(callReasonFor("idle_client", "email")).toBeNull();
  });
});

describe("callCardCopy", () => {
  it("writes plain copy for both types without em dashes", () => {
    const lead = callCardCopy("lead_going_quiet", { status: "in_flight", days_quiet: 31, never_contacted: false })!;
    const sphere = callCardCopy("sphere_check_in", { days_since_contact: 400, never_contacted: false })!;
    for (const c of [lead, sphere]) {
      for (const v of Object.values(c)) {
        expect(v.length).toBeGreaterThan(0);
        expect(v).not.toContain("—");
      }
    }
    expect(lead.label).toContain("31 days");
    expect(sphere.label).toContain("13 months");
  });

  it("is null for other types", () => {
    expect(callCardCopy("birthday", {})).toBeNull();
  });
});
