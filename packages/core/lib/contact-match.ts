// "Fill in from Contacts": match the phone's address book to the agent's
// clients and propose the phone numbers, emails and birthdays the clients
// are missing. Runs on the phone; nothing here writes. The agent reviews every
// proposed change before the app saves it.
//
// Same-person rules come from client-identity.ts (the CSV importer and the
// duplicate tool use them too): names compare by clusterNameKey, phones by
// normalizePhone, emails by normalizeEmail.
//
// Matching, strongest first:
//   1. A phone number or email the client already has appears on exactly one
//      contact → that contact.
//   2. Otherwise the client's full name equals exactly one contact's name.
// Two or more candidates, or one contact claimed by two clients by name, is
// "ambiguous": shown to the agent, never filled in. Only empty fields are
// proposed; a different value in Contacts is reported, never overwritten.

import { clusterNameKey, normalizeEmail, normalizePhone, toNameSearch } from "./client-identity";

/**
 * The year stored for a birthday that has no year in Contacts. Apple uses
 * 1604 for the same thing (vCard exports), and Agent Runway's birthday logic
 * reads only the month and day, so reminders work. Show it with
 * `formatBirthdate`, never as a raw date.
 */
export const YEARLESS_BIRTH_YEAR = 1604;

export function isYearlessBirthdate(birthdate: string | null | undefined): boolean {
  return !!birthdate && birthdate.startsWith(`${YEARLESS_BIRTH_YEAR}-`);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "1985-03-21" → "Mar 21, 1985"; a yearless birthday → "Mar 21". */
export function formatBirthdate(birthdate: string): string {
  const [y, m, d] = birthdate.slice(0, 10).split("-").map(Number);
  const month = MONTHS[(m ?? 0) - 1];
  if (!month || !d) return birthdate;
  return isYearlessBirthdate(birthdate) || !y ? `${month} ${d}` : `${month} ${d}, ${y}`;
}

export type PhoneType = "mobile" | "home" | "work" | "other";

export interface DeviceContact {
  id: string;
  name: string;
  /** Company name; the display name of a business contact with no person name. */
  company?: string | null;
  /** True for a contact iOS files as a company rather than a person. */
  isCompany?: boolean;
  jobTitle?: string | null;
  department?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phones: { number: string; label?: string | null }[];
  emails: { email: string; label?: string | null }[];
  /** month 1–12; year missing when Contacts has none. */
  birthday?: { year?: number | null; month: number; day: number } | null;
}

export interface MatchableClient {
  id: string;
  name: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  secondary_phone?: string | null;
  email?: string | null;
  secondary_email?: string | null;
  birthdate?: string | null;
}

export type ContactField = "phone" | "email" | "birthdate";

export interface FieldUpdate {
  field: ContactField;
  /** The value to save (birthdate as YYYY-MM-DD). */
  value: string;
  /** How to show it: "(506) 555-0101 (mobile)", "Mar 21". */
  display: string;
  /** For a phone: the type to save alongside it. */
  phoneType?: PhoneType;
}

export interface ContactMatch {
  clientId: string;
  clientName: string;
  contactId: string;
  contactName: string;
  matchedBy: "phone" | "email" | "name";
  updates: FieldUpdate[];
  /** Values Contacts has that differ from what's on file: shown, not saved. */
  differences: string[];
}

export interface AmbiguousMatch {
  clientId: string;
  clientName: string;
  contactNames: string[];
}

export interface ContactMatchResult {
  /** Matches with at least one empty field to fill. */
  matches: ContactMatch[];
  ambiguous: AmbiguousMatch[];
  /** Clients matched to a contact with nothing to add. */
  upToDate: number;
}

export function phoneTypeFromLabel(label: string | null | undefined): PhoneType {
  const l = (label ?? "").toLowerCase();
  if (/mobile|iphone|cell/.test(l)) return "mobile";
  if (/home/.test(l)) return "home";
  if (/work|office/.test(l)) return "work";
  return "other";
}

function contactNameKeys(c: DeviceContact): string[] {
  const full = [c.firstName, c.lastName].filter((p) => p && p.trim()).join(" ");
  return [...new Set([c.name, full].filter((n) => n && n.trim()).map((n) => clusterNameKey(n)))];
}

function clientNameKeys(c: MatchableClient): string[] {
  const full = [c.first_name, c.last_name].filter((p) => p && p.trim()).join(" ");
  return [...new Set([c.name, full].filter((n) => n && n.trim()).map((n) => clusterNameKey(n)))];
}

export function isoBirthdate(b: NonNullable<DeviceContact["birthday"]>): string | null {
  const { month, day } = b;
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const year = b.year && b.year > 1800 ? b.year : YEARLESS_BIRTH_YEAR;
  const probe = new Date(year, month - 1, day);
  if (probe.getMonth() !== month - 1) return null; // Feb 30 and the like
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function proposeUpdates(client: MatchableClient, contact: DeviceContact): { updates: FieldUpdate[]; differences: string[] } {
  const updates: FieldUpdate[] = [];
  const differences: string[] = [];

  const onFilePhones = [client.phone, client.secondary_phone].map(normalizePhone).filter((p): p is string => !!p);
  const contactPhones = contact.phones.filter((p) => normalizePhone(p.number));
  if (!normalizePhone(client.phone)) {
    const best =
      contactPhones.find((p) => phoneTypeFromLabel(p.label) === "mobile" && !onFilePhones.includes(normalizePhone(p.number)!)) ??
      contactPhones.find((p) => !onFilePhones.includes(normalizePhone(p.number)!));
    if (best) {
      const type = phoneTypeFromLabel(best.label);
      updates.push({ field: "phone", value: best.number.trim(), display: `${best.number.trim()} (${type})`, phoneType: type });
    }
  } else {
    const other = contactPhones.filter((p) => !onFilePhones.includes(normalizePhone(p.number)!));
    if (other.length > 0) differences.push(`Contacts also has ${other.map((p) => p.number.trim()).join(", ")}`);
  }

  const onFileEmails = [client.email, client.secondary_email].map(normalizeEmail).filter((e): e is string => !!e);
  const contactEmails = contact.emails.filter((e) => normalizeEmail(e.email));
  if (!normalizeEmail(client.email)) {
    const best = contactEmails.find((e) => !onFileEmails.includes(normalizeEmail(e.email)!));
    if (best) updates.push({ field: "email", value: best.email.trim(), display: best.email.trim() });
  } else {
    const other = contactEmails.filter((e) => !onFileEmails.includes(normalizeEmail(e.email)!));
    if (other.length > 0) differences.push(`Contacts also has ${other.map((e) => e.email.trim()).join(", ")}`);
  }

  const bday = contact.birthday ? isoBirthdate(contact.birthday) : null;
  if (bday) {
    if (!client.birthdate) {
      updates.push({ field: "birthdate", value: bday, display: formatBirthdate(bday) });
    } else if (client.birthdate.slice(5, 10) !== bday.slice(5, 10)) {
      differences.push(`Contacts has a birthday of ${formatBirthdate(bday)}`);
    }
  }

  return { updates, differences };
}

export function matchContactsToClients(
  contacts: readonly DeviceContact[],
  clients: readonly MatchableClient[],
): ContactMatchResult {
  const byPhone = new Map<string, DeviceContact[]>();
  const byEmail = new Map<string, DeviceContact[]>();
  const byName = new Map<string, DeviceContact[]>();
  const add = (map: Map<string, DeviceContact[]>, key: string | null, c: DeviceContact) => {
    if (!key) return;
    const list = map.get(key) ?? [];
    if (!list.includes(c)) list.push(c);
    map.set(key, list);
  };
  for (const c of contacts) {
    for (const p of c.phones) add(byPhone, normalizePhone(p.number), c);
    for (const e of c.emails) add(byEmail, normalizeEmail(e.email), c);
    for (const k of contactNameKeys(c)) add(byName, k, c);
  }

  type Pick = { client: MatchableClient; contact: DeviceContact; matchedBy: ContactMatch["matchedBy"] };
  const picks: Pick[] = [];
  const ambiguous: AmbiguousMatch[] = [];

  for (const client of clients) {
    const strong = new Map<string, { contact: DeviceContact; by: "phone" | "email" }>();
    for (const p of [client.phone, client.secondary_phone]) {
      for (const c of byPhone.get(normalizePhone(p) ?? "") ?? []) strong.set(c.id, { contact: c, by: "phone" });
    }
    for (const e of [client.email, client.secondary_email]) {
      for (const c of byEmail.get(normalizeEmail(e) ?? "") ?? []) if (!strong.has(c.id)) strong.set(c.id, { contact: c, by: "email" });
    }
    if (strong.size === 1) {
      const [{ contact, by }] = [...strong.values()];
      picks.push({ client, contact, matchedBy: by });
      continue;
    }
    if (strong.size > 1) {
      ambiguous.push({ clientId: client.id, clientName: client.name, contactNames: [...strong.values()].map((s) => s.contact.name) });
      continue;
    }
    const named = new Map<string, DeviceContact>();
    for (const k of clientNameKeys(client)) for (const c of byName.get(k) ?? []) named.set(c.id, c);
    if (named.size === 1) {
      picks.push({ client, contact: [...named.values()][0], matchedBy: "name" });
    } else if (named.size > 1) {
      ambiguous.push({ clientId: client.id, clientName: client.name, contactNames: [...named.values()].map((c) => c.name) });
    }
  }

  // One contact matched by name to two clients (two "John Smith"s): neither
  // is safe to fill. A phone/email match stays: it's specific to the client.
  const nameClaims = new Map<string, number>();
  for (const p of picks) if (p.matchedBy === "name") nameClaims.set(p.contact.id, (nameClaims.get(p.contact.id) ?? 0) + 1);
  const matches: ContactMatch[] = [];
  let upToDate = 0;
  for (const p of picks) {
    if (p.matchedBy === "name" && (nameClaims.get(p.contact.id) ?? 0) > 1) {
      ambiguous.push({ clientId: p.client.id, clientName: p.client.name, contactNames: [p.contact.name] });
      continue;
    }
    const { updates, differences } = proposeUpdates(p.client, p.contact);
    if (updates.length === 0) {
      upToDate++;
      continue;
    }
    matches.push({
      clientId: p.client.id,
      clientName: p.client.name,
      contactId: p.contact.id,
      contactName: p.contact.name,
      matchedBy: p.matchedBy,
      updates,
      differences,
    });
  }

  matches.sort((a, b) => a.clientName.localeCompare(b.clientName));
  ambiguous.sort((a, b) => a.clientName.localeCompare(b.clientName));
  return { matches, ambiguous, upToDate };
}

// ── Import from Contacts ─────────────────────────────────────────────────────
// Every contact that isn't already a client, as a new client. "Already a
// client" is broader than the fill-in match above: ANY shared phone number,
// email or name (archived clients included, so someone marked do-not-contact
// isn't added back) means skip. Never a guess the other way: a contact that
// might be a client stays out.

/** clients.name is CHECK (char_length(name) <= 200). */
const MAX_NAME = 200;

export type ImportKind = "person" | "business" | "name_only";

export interface ImportCandidate {
  contactId: string;
  /**
   * Why this contact looks like a real estate agent (e.g. "Company: RE/MAX"),
   * or null. Agents are listed but left unticked: Andrew doesn't import other
   * agents as clients.
   */
  agentReason: string | null;
  name: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  phone_type: PhoneType;
  secondary_phone: string | null;
  secondary_phone_type: PhoneType;
  email: string | null;
  secondary_email: string | null;
  birthdate: string | null;
  kind: ImportKind;
}

export interface ImportPlan {
  candidates: ImportCandidate[];
  /** Contacts that match a client (by phone, email or name). */
  alreadyThere: number;
  /** Contacts with no name or company: a client needs a name. */
  noName: number;
  /** Later copies of a contact already in this plan (iCloud duplicates). */
  duplicates: number;
}

export function planContactImport(
  contacts: readonly DeviceContact[],
  clients: readonly MatchableClient[],
): ImportPlan {
  const phones = new Set<string>();
  const emails = new Set<string>();
  const names = new Set<string>();
  const addName = (n: string | null | undefined) => {
    if (n && n.trim()) {
      names.add(clusterNameKey(n));
      names.add(toNameSearch(n)); // the database's own unique key
    }
  };
  for (const c of clients) {
    for (const p of [c.phone, c.secondary_phone]) { const k = normalizePhone(p); if (k) phones.add(k); }
    for (const e of [c.email, c.secondary_email]) { const k = normalizeEmail(e); if (k) emails.add(k); }
    addName(c.name);
    addName([c.first_name, c.last_name].filter((p) => p && p.trim()).join(" "));
  }

  const plan: ImportPlan = { candidates: [], alreadyThere: 0, noName: 0, duplicates: 0 };
  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();
  const seenNames = new Set<string>();

  for (const c of contacts) {
    const personName = (c.name ?? "").trim() || [c.firstName, c.lastName].filter((p) => p && p.trim()).join(" ").trim();
    const company = (c.company ?? "").trim();
    const name = (c.isCompany ? company || personName : personName || company).slice(0, MAX_NAME).trim();
    if (!name) { plan.noName++; continue; }

    const phoneKeys = c.phones.map((p) => normalizePhone(p.number)).filter((k): k is string => !!k);
    const emailKeys = c.emails.map((e) => normalizeEmail(e.email)).filter((k): k is string => !!k);
    const nameKeys = [...new Set([clusterNameKey(name), toNameSearch(name), ...contactNameKeys(c)])];

    if (phoneKeys.some((k) => phones.has(k)) || emailKeys.some((k) => emails.has(k)) || nameKeys.some((k) => names.has(k))) {
      plan.alreadyThere++;
      continue;
    }
    if (phoneKeys.some((k) => seenPhones.has(k)) || emailKeys.some((k) => seenEmails.has(k)) || nameKeys.some((k) => seenNames.has(k))) {
      plan.duplicates++;
      continue;
    }
    phoneKeys.forEach((k) => seenPhones.add(k));
    emailKeys.forEach((k) => seenEmails.add(k));
    nameKeys.forEach((k) => seenNames.add(k));

    // Phones: a mobile number first, then one other distinct number.
    const distinctPhones: { number: string; type: PhoneType }[] = [];
    const ordered = [...c.phones].sort((a, b) =>
      Number(phoneTypeFromLabel(b.label) === "mobile") - Number(phoneTypeFromLabel(a.label) === "mobile"));
    for (const p of ordered) {
      const k = normalizePhone(p.number);
      if (k && !distinctPhones.some((d) => normalizePhone(d.number) === k)) {
        distinctPhones.push({ number: p.number.trim(), type: phoneTypeFromLabel(p.label) });
      }
    }
    const distinctEmails: string[] = [];
    for (const e of c.emails) {
      const k = normalizeEmail(e.email);
      if (k && !distinctEmails.some((d) => normalizeEmail(d) === k)) distinctEmails.push(e.email.trim());
    }

    const isBusiness = !!c.isCompany || (!personName && !!company);
    plan.candidates.push({
      contactId: c.id,
      agentReason: realEstateAgentReason(c),
      name,
      first_name: isBusiness ? null : (c.firstName?.trim() || null),
      last_name: isBusiness ? null : (c.lastName?.trim() || null),
      phone: distinctPhones[0]?.number ?? null,
      phone_type: distinctPhones[0]?.type ?? "mobile",
      secondary_phone: distinctPhones[1]?.number ?? null,
      secondary_phone_type: distinctPhones[1]?.type ?? "home",
      email: distinctEmails[0] ?? null,
      secondary_email: distinctEmails[1] ?? null,
      birthdate: c.birthday ? isoBirthdate(c.birthday) : null,
      kind: isBusiness ? "business" : distinctPhones.length === 0 && distinctEmails.length === 0 ? "name_only" : "person",
    });
  }
  plan.candidates.sort((a, b) => a.name.localeCompare(b.name));
  return plan;
}

// ── Other real estate agents ────────────────────────────────────────────────
// A contact whose company, job title, department, name or email points at a
// real estate brokerage is probably another agent, not a client. The general
// words ("real estate", "realty", "realtor", "brokerage") don't count when
// the same text names a partner trade (a real estate lawyer, a mortgage
// broker, a home inspector): those are referral partners, not agents. Brand
// names always count. A guess either way is the agent's to correct: agents
// are listed unticked, not hidden.

const strip = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const BRAND_PATTERNS: RegExp[] = [
  /\bre\s*\/\s*max\b/, /\bremax\b/, /\broyal\s*le\s*page\b/, /\bcentury\s*21\b/, /\bc21\b/,
  /\bcoldwell\s*banker\b/, /\bkeller\s*williams\b/, /\bexp\s*realty\b/, /\bsutton\s*group\b/,
  /\breal\s*broker(age)?\b/, /\bexit\s*realty\b/, /\bsotheby['\u2019]?s\b/, /\bengel\s*(&|and)\s*volkers\b/,
  /\bberkshire\s*hathaway\s*home\s*services\b/, /\bhomelife\b/, /\bright\s*at\s*home\s*realty\b/,
  /\bharvey\s*kalles\b/, /\bchestnut\s*park\b/, /\brealty\s*executives\b/, /\bpurplebricks\b/,
];
const ROLE_PATTERNS: RegExp[] = [
  /\brealtors?\b/, /\breal\s*estate\s*(agent|sales|associate|advisor|consultant)\b/,
  /\bbroker\s*of\s*record\b/, /\b(managing|associate|real\s*estate)\s*broker\b/, /\blisting\s*agent\b/,
  /\bcourtier\s*immobilier\b/,
];
const GENERAL_PATTERNS: RegExp[] = [/\breal\s*estate\b/, /\brealty\b/, /\bbrokerage\b/, /\bimmobilier\b/];
const PARTNER_TRADES = /\b(law|lawyer|lawyers|legal|notary|notaire|mortgage|mortgages|lender|lending|bank|appraiser|appraisal|inspector|inspection|inspections|insurance|staging|stager|photograph\w*|title)\b/;

const BRAND_DOMAIN_LABELS = new Set([
  "remax", "royallepage", "kw", "kwrealty", "exprealty", "century21", "c21", "coldwellbanker", "cbrealty",
  "suttongroup", "therealbrokerage", "realbroker", "joinreal", "onereal", "exitrealty", "sothebysrealty",
  "evrealestate", "engelvoelkers", "homelife", "purplebricks", "harveykalles", "chestnutpark",
]);

function textReason(label: string, raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const t = strip(value);
  if (BRAND_PATTERNS.some((r) => r.test(t)) || ROLE_PATTERNS.some((r) => r.test(t))) return `${label}: ${value}`;
  if (GENERAL_PATTERNS.some((r) => r.test(t)) && !PARTNER_TRADES.test(t)) return `${label}: ${value}`;
  return null;
}

/** Why a contact looks like a real estate agent, or null. */
export function realEstateAgentReason(c: DeviceContact): string | null {
  return (
    textReason("Company", c.company) ??
    textReason("Job title", c.jobTitle) ??
    textReason("Department", c.department) ??
    // Agents are often saved as "Jane Smith REALTOR®" or "Jane (RE/MAX)".
    (() => {
      const n = strip(c.name ?? "");
      return BRAND_PATTERNS.some((r) => r.test(n)) || ROLE_PATTERNS.some((r) => r.test(n)) ? `Name: ${c.name.trim()}` : null;
    })() ??
    (() => {
      for (const e of c.emails) {
        const domain = strip(e.email).split("@")[1];
        if (!domain) continue;
        const labels = domain.split(".");
        if (labels.some((l) => BRAND_DOMAIN_LABELS.has(l) || /realty|realestate|realtor/.test(l))) return `Email: @${domain}`;
      }
      return null;
    })()
  );
}
