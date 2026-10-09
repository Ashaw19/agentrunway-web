/**
 * Website → Agent Runway: what one event from the agent's own website means
 * for the CRM. Pure (no I/O); the route in app/api/inbound/website executes
 * the plan.
 *
 * Andrew (2026-10-09): leads from andrew.agentrunway.ca used to reach the CRM
 * only through a CSV he downloaded and imported. Now the site POSTs each
 * sign-up, contact message and unsubscribe here as it happens.
 *
 * Rules (they match the site's own CSV export, lib/agent-runway-export.ts in
 * that repo, so nothing changes meaning when the CSV is retired):
 *   - New person: a client tagged "Website: <source>", lead source "Website".
 *     Warm sources (a message, a valuation request, an open house sign-in, a
 *     saved listing alert) start in Boarding. Light ones (market letter, home
 *     report, guide, footer sign-up) start in Scheduled.
 *   - Known person (same email, else same phone): nothing about them is
 *     overwritten. A missing email or phone is filled in and the tag added.
 *   - Every event leaves a NOTE on their Activity tab. A note is not contact
 *     (00171), so it never hides them from Flight Control.
 *   - Warm events also put "Contact <name>" on the Checklist, unless they
 *     already have an open item. Never for an open house visitor who already
 *     has an agent, and never for someone in the Hangar.
 *   - Consent the site recorded (exact wording, time, IP) is kept per kind.
 *   - Unsubscribing from ALL site email sets clients.email_opt_out_at, and
 *     every email drafter then treats them as call-only. A fresh sign-up after
 *     that clears it, which is the site's own rule.
 */

import { z } from "zod";

export const CONSENT_KINDS = ["alerts", "market_letter", "home_report", "open_house", "guide", "other"] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];

export const LEAD_SOURCES = [
  "contact", "valuation", "open_house", "alerts", "home_report", "market_letter", "guide", "newsletter",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

const iso = z.string().datetime({ offset: true });

const contactSchema = z.object({
  name:  z.string().trim().max(120).optional(),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  phone: z.string().trim().max(40).optional(),
});

const leadSchema = z.object({
  type:        z.literal("lead"),
  event_id:    z.string().min(8).max(200),
  occurred_at: iso.optional(),
  source:      z.enum(LEAD_SOURCES),
  contact:     contactSchema,
  /** Contact form topic: general | buying | selling. */
  topic:       z.string().max(40).optional(),
  message:     z.string().max(4000).optional(),
  address:     z.string().max(300).optional(),
  /** One line from the site, e.g. the saved search ("Rothesay, up to $600K, 4+ bed"). */
  detail:      z.string().max(500).optional(),
  open_house:  z.object({
    listing_address: z.string().max(300).optional(),
    has_agent:       z.boolean().nullable().optional(),
    timeline:        z.string().max(80).nullable().optional(),
  }).optional(),
  consent: z.object({
    kind: z.enum(CONSENT_KINDS),
    text: z.string().min(10).max(1000),
    at:   iso,
    ip:   z.string().max(64).optional(),
  }).optional(),
});

const unsubscribeSchema = z.object({
  type:        z.literal("unsubscribe"),
  event_id:    z.string().min(8).max(200),
  occurred_at: iso.optional(),
  /** "all" = every email from the site. Otherwise the one kind they stopped. */
  scope:       z.union([z.literal("all"), z.enum(CONSENT_KINDS)]),
  contact:     contactSchema,
});

export const websiteEventSchema = z.discriminatedUnion("type", [leadSchema, unsubscribeSchema]);
export type WebsiteEvent = z.infer<typeof websiteEventSchema>;
export type WebsiteLeadEvent = z.infer<typeof leadSchema>;

export const SOURCE_LABEL: Record<LeadSource, string> = {
  contact:       "Contact form",
  valuation:     "Home value request",
  open_house:    "Open house",
  alerts:        "Listing alert",
  home_report:   "Home report",
  market_letter: "Market letter",
  guide:         "Guide download",
  newsletter:    "Market letter",
};

const KIND_LABEL: Record<ConsentKind, string> = {
  alerts:        "listing alerts",
  market_letter: "monthly market letter",
  home_report:   "monthly home report",
  open_house:    "open house follow-up emails",
  guide:         "guide emails",
  other:         "website emails",
};

/** Sources that start someone in Boarding and earn a Checklist item. */
const WARM: ReadonlySet<LeadSource> = new Set(["contact", "valuation", "open_house", "alerts"]);

/** The person the event matched, as the route found them. */
export interface MatchedClient {
  id:               string;
  name:             string;
  email:            string | null;
  phone:            string | null;
  tags:             string[] | null;
  archived_at:      string | null;
  email_opt_out_at: string | null;
  hasOpenChecklistItem: boolean;
}

export interface NewClientFields {
  name:        string;
  first_name:  string | null;
  last_name:   string | null;
  name_search: string;
  email:       string | null;
  phone:       string | null;
  status:      "boarding" | "scheduled";
  lead_source: "Website";
  tags:        string[];
}

export interface EventPlan {
  /** Create this client (no match). */
  create?:   NewClientFields;
  /** Patch the matched client (only fields that change). */
  patch?:    Partial<{ email: string; phone: string; tags: string[]; email_opt_out_at: string | null; email_opt_out_source: string | null }>;
  /** The note for their Activity tab. */
  note?:     string;
  /** A "Contact <name>" Checklist item. */
  checklist?: { title: string; notes: string; priority: "normal" | "high" };
  /** Express consent to store. */
  consent?:  { kind: ConsentKind; text: string; at: string; ip: string | null };
  /** Consents to mark withdrawn: one kind, or all of them. */
  withdraw?: ConsentKind | "all";
  /** Nothing to do (an unsubscribe for someone not in the CRM). */
  skip?:     "no_client" | "no_contact";
  occurredAt: string;
}

/** Digits only, last 10: "(506) 650-1242" and "+1 506 650 1242" match. */
export function phoneKey(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : null;
}

/** "Sam Porter" → first/last; an email stands in when no name was given. */
export function splitName(name: string | undefined, email: string | undefined): { name: string; first: string | null; last: string | null } {
  const n = (name ?? "").replace(/\s+/g, " ").trim();
  if (!n) return { name: email ?? "Website visitor", first: null, last: null };
  const parts = n.split(" ");
  return { name: n, first: parts[0], last: parts.length > 1 ? parts.slice(1).join(" ") : null };
}

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** The Activity-tab note for a lead. Plain sentences, no em dashes. */
export function leadNote(e: WebsiteLeadEvent): string {
  const msg = e.message?.trim() ? ` Message: "${clip(e.message.trim(), 1500)}"` : "";
  switch (e.source) {
    case "contact": {
      const topic = e.topic === "buying" ? " about buying" : e.topic === "selling" ? " about selling" : "";
      return `Website: sent you a message${topic}.${e.address ? ` Property: ${e.address}.` : ""}${msg}`;
    }
    case "valuation":
      return `Website: asked what their home is worth${e.address ? ` (${e.address})` : ""}.${msg}`;
    case "open_house": {
      const oh = e.open_house ?? {};
      const agent = oh.has_agent === true ? " Already has a REALTOR®." : oh.has_agent === false ? " No REALTOR® yet." : "";
      const when = oh.timeline ? ` Timeline: ${oh.timeline}.` : "";
      return `Website: signed in at your open house${oh.listing_address ? ` at ${oh.listing_address}` : ""}.${agent}${when}`;
    }
    case "alerts":
      return `Website: saved a listing alert${e.detail ? ` (${clip(e.detail, 200)})` : ""}.`;
    case "home_report":
      return `Website: asked for a monthly home report${e.address ? ` on ${e.address}` : ""}.`;
    case "market_letter":
    case "newsletter":
      return "Website: joined your monthly market letter.";
    case "guide":
      return `Website: downloaded ${e.detail ? `the ${clip(e.detail, 80)}` : "a guide"}.`;
  }
}

function checklistFor(e: WebsiteLeadEvent, name: string): EventPlan["checklist"] | undefined {
  if (!WARM.has(e.source)) return undefined;
  if (e.source === "open_house" && e.open_house?.has_agent === true) return undefined;
  const why =
    e.source === "contact"    ? `They sent a message from your website${e.topic && e.topic !== "general" ? ` about ${e.topic}` : ""}.`
    : e.source === "valuation" ? `They asked what their home is worth${e.address ? ` (${e.address})` : ""}.`
    : e.source === "open_house" ? `They signed in at your open house${e.open_house?.listing_address ? ` at ${e.open_house.listing_address}` : ""}.`
    : `They saved a listing alert on your website${e.detail ? ` (${clip(e.detail, 120)})` : ""}.`;
  const priority = e.source === "valuation" || (e.source === "contact" && e.topic === "selling") ? "high" : "normal";
  return { title: `Contact ${name}`, notes: why, priority };
}

/**
 * The plan for one event against the client it matched (or null).
 * `now` is only the fallback when the site sent no occurred_at.
 */
export function planWebsiteEvent(e: WebsiteEvent, match: MatchedClient | null, now: Date = new Date()): EventPlan {
  const occurredAt = e.occurred_at ?? now.toISOString();
  const email = e.contact.email;
  const phone = e.contact.phone?.trim() || undefined;

  if (e.type === "unsubscribe") {
    if (!match) return { skip: "no_client", occurredAt };
    const label = e.scope === "all" ? "all your website emails" : `your ${KIND_LABEL[e.scope]}`;
    const plan: EventPlan = {
      occurredAt,
      withdraw: e.scope,
      note: e.scope === "all"
        ? "Website: unsubscribed from all your website emails. Agent Runway won't draft emails to them now; a call is the way to reach them."
        : `Website: stopped ${label}.`,
    };
    if (e.scope === "all" && !match.email_opt_out_at) {
      plan.patch = { email_opt_out_at: occurredAt, email_opt_out_source: "website" };
    }
    return plan;
  }

  if (!email && !phoneKey(phone)) return { skip: "no_contact", occurredAt };

  const tag = `Website: ${SOURCE_LABEL[e.source]}`;
  const consent = e.consent ? { kind: e.consent.kind, text: e.consent.text, at: e.consent.at, ip: e.consent.ip ?? null } : undefined;
  const note = leadNote(e);

  if (!match) {
    const n = splitName(e.contact.name, email);
    return {
      occurredAt,
      note,
      consent,
      create: {
        name:        n.name,
        first_name:  n.first,
        last_name:   n.last,
        name_search: n.name.toLowerCase().trim(),
        email:       email ?? null,
        phone:       phone ?? null,
        status:      WARM.has(e.source) ? "boarding" : "scheduled",
        lead_source: "Website",
        tags:        [tag],
      },
      checklist: checklistFor(e, n.name),
    };
  }

  const patch: NonNullable<EventPlan["patch"]> = {};
  if (email && !match.email) patch.email = email;
  if (phone && !match.phone) patch.phone = phone;
  const tags = match.tags ?? [];
  if (!tags.includes(tag)) patch.tags = [...tags, tag];
  // A fresh opt-in after a global unsubscribe lifts it (the site's own rule).
  // Compared as instants: the DB returns +00:00, the site sends Z.
  if (consent && match.email_opt_out_at && Date.parse(consent.at) > Date.parse(match.email_opt_out_at)) {
    patch.email_opt_out_at = null;
    patch.email_opt_out_source = null;
  }

  const archived = Boolean(match.archived_at);
  return {
    occurredAt,
    note,
    consent,
    patch: Object.keys(patch).length > 0 ? patch : undefined,
    checklist: archived || match.hasOpenChecklistItem ? undefined : checklistFor(e, match.name),
  };
}
