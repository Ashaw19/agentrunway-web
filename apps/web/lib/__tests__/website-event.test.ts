import { describe, it, expect } from "vitest";
import {
  phoneKey,
  planWebsiteEvent,
  splitName,
  websiteEventSchema,
  type MatchedClient,
  type WebsiteEvent,
} from "../inbound/website-event";
import { generateInboundKey, hashInboundKey, keyFromAuthHeader } from "../inbound/keys";

/**
 * Website leads (Andrew, 2026-10-09): his site posts each sign-up, message
 * and unsubscribe to /api/inbound/website. These are the rules for what
 * one event does to the CRM.
 */

const NOW = new Date("2026-10-09T15:00:00Z");

function lead(over: Partial<Extract<WebsiteEvent, { type: "lead" }>> = {}): WebsiteEvent {
  return websiteEventSchema.parse({
    type: "lead", event_id: "evt-0001-abc", occurred_at: "2026-10-09T14:00:00Z",
    source: "contact", topic: "selling", message: "Thinking of listing in the spring.",
    contact: { name: "Sam  Porter", email: "Sam.Porter@Example.com", phone: "(506) 555-0100" },
    ...over,
  });
}

function known(over: Partial<MatchedClient> = {}): MatchedClient {
  return {
    id: "c1", name: "Sam Porter", email: "sam.porter@example.com", phone: null, tags: ["VIP"],
    archived_at: null, email_opt_out_at: null, hasOpenChecklistItem: false, ...over,
  };
}

describe("event schema", () => {
  it("lower-cases the email and rejects unknown sources", () => {
    expect((lead().contact.email)).toBe("sam.porter@example.com");
    expect(websiteEventSchema.safeParse({ type: "lead", event_id: "evt-0001-abc", source: "spam", contact: {} }).success).toBe(false);
  });
});

describe("a new person", () => {
  it("becomes a Boarding client tagged with the source, with a note and a Checklist item", () => {
    const p = planWebsiteEvent(lead(), null, NOW);
    expect(p.create).toMatchObject({
      name: "Sam Porter", first_name: "Sam", last_name: "Porter", name_search: "sam porter",
      email: "sam.porter@example.com", phone: "(506) 555-0100",
      status: "boarding", lead_source: "Website", tags: ["Website: Contact form"],
    });
    expect(p.note).toBe('Website: sent you a message about selling. Message: "Thinking of listing in the spring."');
    expect(p.checklist).toEqual({
      title: "Contact Sam Porter", priority: "high",
      notes: "They sent a message from your website about selling.",
    });
    expect(p.occurredAt).toBe("2026-10-09T14:00:00Z");
  });

  it("starts light sign-ups in Scheduled with no Checklist item", () => {
    const p = planWebsiteEvent(lead({
      source: "market_letter", topic: undefined, message: undefined, contact: { email: "reader@example.com" },
      consent: { kind: "market_letter", text: "Yes, email me the monthly market letter.", at: "2026-10-09T14:00:00Z", ip: "1.2.3.4" },
    }), null, NOW);
    expect(p.create).toMatchObject({ name: "reader@example.com", status: "scheduled", tags: ["Website: Market letter"] });
    expect(p.checklist).toBeUndefined();
    expect(p.consent).toEqual({ kind: "market_letter", text: "Yes, email me the monthly market letter.", at: "2026-10-09T14:00:00Z", ip: "1.2.3.4" });
  });

  it("never puts an open house visitor with an agent on the Checklist", () => {
    const withAgent = planWebsiteEvent(lead({
      source: "open_house", topic: undefined, message: undefined,
      open_house: { listing_address: "10 Queensbury Dr", has_agent: true, timeline: "3 to 6 months" },
    }), null, NOW);
    expect(withAgent.checklist).toBeUndefined();
    expect(withAgent.note).toBe("Website: signed in at your open house at 10 Queensbury Dr. Already has a REALTOR®. Timeline: 3 to 6 months.");

    const noAgent = planWebsiteEvent(lead({
      source: "open_house", topic: undefined, message: undefined, open_house: { has_agent: false },
    }), null, NOW);
    expect(noAgent.checklist?.title).toBe("Contact Sam Porter");
  });

  it("makes a valuation request high priority", () => {
    const p = planWebsiteEvent(lead({ source: "valuation", topic: undefined, address: "12 Elm St" }), null, NOW);
    expect(p.checklist?.priority).toBe("high");
    expect(p.note).toContain("asked what their home is worth (12 Elm St)");
  });

  it("ignores an event with no way to reach anyone", () => {
    const p = planWebsiteEvent(lead({ contact: { name: "No Contact" } }), null, NOW);
    expect(p.skip).toBe("no_contact");
  });
});

describe("someone already in the CRM", () => {
  it("is never overwritten: only a missing phone and the new tag are added", () => {
    const p = planWebsiteEvent(lead(), known(), NOW);
    expect(p.create).toBeUndefined();
    expect(p.patch).toEqual({ phone: "(506) 555-0100", tags: ["VIP", "Website: Contact form"] });
  });

  it("gets no second Checklist item, and none at all from the Hangar", () => {
    expect(planWebsiteEvent(lead(), known({ hasOpenChecklistItem: true }), NOW).checklist).toBeUndefined();
    const archived = planWebsiteEvent(lead(), known({ archived_at: "2026-01-01T00:00:00Z" }), NOW);
    expect(archived.checklist).toBeUndefined();
    expect(archived.note).toBeDefined();
  });

  it("a fresh sign-up after a global unsubscribe lifts the opt-out (the site's own rule)", () => {
    const optedOut = known({ email_opt_out_at: "2026-09-01T12:00:00+00:00" });
    const p = planWebsiteEvent(lead({
      source: "alerts", topic: undefined, message: undefined,
      consent: { kind: "alerts", text: "Yes, email me when a home matching this search is listed.", at: "2026-10-09T14:00:00Z" },
    }), optedOut, NOW);
    expect(p.patch).toMatchObject({ email_opt_out_at: null, email_opt_out_source: null });
  });

  it("an older consent doesn't lift a newer opt-out", () => {
    const optedOut = known({ email_opt_out_at: "2026-10-09T16:00:00+00:00" });
    const p = planWebsiteEvent(lead({
      source: "alerts", topic: undefined, message: undefined,
      consent: { kind: "alerts", text: "Yes, email me when a home matching this search is listed.", at: "2026-10-09T14:00:00Z" },
    }), optedOut, NOW);
    expect(p.patch?.email_opt_out_at).toBeUndefined();
  });
});

describe("unsubscribes", () => {
  const unsub = (scope: string): WebsiteEvent => websiteEventSchema.parse({
    type: "unsubscribe", event_id: "evt-0002-abc", occurred_at: "2026-10-09T14:30:00Z",
    scope, contact: { email: "sam.porter@example.com" },
  });

  it("from everything: opt out of email, withdraw every consent, note it", () => {
    const p = planWebsiteEvent(unsub("all"), known(), NOW);
    expect(p.patch).toEqual({ email_opt_out_at: "2026-10-09T14:30:00Z", email_opt_out_source: "website" });
    expect(p.withdraw).toBe("all");
    expect(p.note).toContain("unsubscribed from all your website emails");
  });

  it("from one list: withdraw that kind only, no opt-out", () => {
    const p = planWebsiteEvent(unsub("market_letter"), known(), NOW);
    expect(p.patch).toBeUndefined();
    expect(p.withdraw).toBe("market_letter");
    expect(p.note).toBe("Website: stopped your monthly market letter.");
  });

  it("never creates a client", () => {
    expect(planWebsiteEvent(unsub("all"), null, NOW)).toEqual({ skip: "no_client", occurredAt: "2026-10-09T14:30:00Z" });
  });
});

describe("matching helpers", () => {
  it("matches phones on their last 10 digits", () => {
    expect(phoneKey("(506) 650-1242")).toBe("5066501242");
    expect(phoneKey("+1 506 650 1242")).toBe("5066501242");
    expect(phoneKey("650-1242")).toBeNull();
  });

  it("splits names and falls back to the email", () => {
    expect(splitName("  Mary  Ann Smith ", undefined)).toEqual({ name: "Mary Ann Smith", first: "Mary", last: "Ann Smith" });
    expect(splitName("", "x@y.ca")).toEqual({ name: "x@y.ca", first: null, last: null });
  });

  it("writes notes without em dashes", () => {
    for (const src of ["contact", "valuation", "open_house", "alerts", "home_report", "market_letter", "guide"] as const) {
      const p = planWebsiteEvent(lead({ source: src, detail: "buyer's guide" }), null, NOW);
      expect(p.note).not.toContain("—");
    }
  });
});

describe("inbound keys", () => {
  it("are long, prefixed, and stored only as a hash", () => {
    const { key, prefix, hash } = generateInboundKey();
    expect(key.startsWith("arw_site_")).toBe(true);
    expect(key.length).toBeGreaterThan(50);
    expect(prefix).toBe(key.slice(0, 15));
    expect(hash).toBe(hashInboundKey(key));
    expect(hash).not.toContain(key.slice(9));
  });

  it("only a Bearer arw_site_ key is accepted", () => {
    const { key } = generateInboundKey();
    expect(keyFromAuthHeader(`Bearer ${key}`)).toBe(key);
    expect(keyFromAuthHeader(key)).toBeNull();
    expect(keyFromAuthHeader("Bearer sk_live_123")).toBeNull();
    expect(keyFromAuthHeader(null)).toBeNull();
  });
});
