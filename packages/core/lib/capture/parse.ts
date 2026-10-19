/**
 * The extraction model's JSON, checked field by field.
 *
 * The model is asked for one JSON object (apps/web/lib/voice/extract-prompt.ts):
 *
 *   { "transcript_cleaned": "...", "intents": [ { "intent": "log_activity", ... }, ... ] }
 *
 * Nothing it says is trusted as typed: strings are trimmed and capped at the
 * database limits, numbers parsed ("$1,250" is 1250), enums checked, and an
 * intent missing what it needs is dropped with a plain-words reason. Dates
 * stay as spoken here; proposals.ts resolves them in Atlantic time.
 *
 * Structured outputs don't enforce minimums or maximums, so every range is
 * checked in code.
 */

import { FIELD_LIMITS } from "../../validation/input-guards";
import type { ActivityType, TaskPriority } from "../../types/database";
import {
  CAPTURE_CONTACT_TYPES,
  CAPTURE_DEAL_STAGES,
  CAPTURE_INTENTS,
  CAPTURE_LEAD_SOURCES,
  CAPTURE_PRIORITIES,
  CAPTURE_SIDES,
  type CaptureContactType,
  type CaptureDealStage,
  type CaptureIntentKind,
  type CaptureLeadSource,
  type CaptureSide,
  type ParsedCapture,
  type RawCaptureIntent,
  type RawSpokenDate,
} from "./types";

/** At most this many intents per note; a 3-minute note rarely holds more. */
export const MAX_CAPTURE_INTENTS = 8;

/** The extraction reply wasn't a JSON object at all. */
export class CaptureParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaptureParseError";
  }
}

export interface ParseCaptureOptions {
  /** Whether an expense item key is real (web: isReceiptCategoryKey). Unknown keys are cleared. */
  isExpenseCategoryKey?: (key: string) => boolean;
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** A trimmed string capped at `max`, or null for anything blank. */
export function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  if (!s || /^(null|none|n\/a|unknown)$/i.test(s)) return null;
  return s.slice(0, max);
}

/** A finite number from a number or a money-ish string ("$1,250.50"), else null. */
export function cleanNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.replace(/[$,\s]/g, "").replace(/km$/i, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase() as T;
  return allowed.includes(s) ? s : null;
}

function spokenDate(o: Obj, spokenKey: string, isoKey: string): RawSpokenDate {
  const iso = typeof o[isoKey] === "string" ? String(o[isoKey]).trim() : null;
  return {
    spoken: cleanText(o[spokenKey], 80),
    iso: iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null,
  };
}

const CONTACT_TYPE_WORDS: Array<[RegExp, CaptureContactType]> = [
  [/^(phone|phoned|phone call|voicemail|called)$/, "call"],
  [/^(sms|texted|message|messaged|imessage)$/, "text"],
  [/^(e-mail|emailed)$/, "email"],
  [/^(showed|viewing|tour|toured|open house|walkthrough)$/, "showing"],
  [/^(visit|in person|in-person|coffee|lunch|appointment|consult|consultation)$/, "meeting"],
];

/** The activity type said, with common words mapped; an in-person meeting otherwise. */
function contactTypeOf(v: unknown): CaptureContactType {
  const exact = oneOf(v, CAPTURE_CONTACT_TYPES);
  if (exact) return exact;
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return CONTACT_TYPE_WORDS.find(([re]) => re.test(s))?.[1] ?? "meeting";
}

/** Strip a markdown fence or prose around the JSON object. */
function jsonText(raw: string): string {
  const fenced = raw.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  if (fenced.startsWith("{")) return fenced;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return start >= 0 && end > start ? raw.slice(start, end + 1) : fenced;
}

const LABEL: Record<CaptureIntentKind, string> = {
  log_activity: "an activity",
  note: "a note",
  create_task: "a Checklist item",
  update_deal: "a deal change",
  log_trip: "a trip",
  new_expense: "an expense",
  new_client: "a new client",
  new_transaction: "a closed deal",
};

/**
 * One intent, checked. Returns the intent, or a reason it was dropped.
 * Exported for tests.
 */
export function parseIntent(
  o: unknown,
  options: ParseCaptureOptions = {},
): { intent: RawCaptureIntent } | { dropped: string } {
  if (!isObj(o)) return { dropped: "Part of the reply wasn't readable." };
  const kind = oneOf(o.intent, CAPTURE_INTENTS);
  if (!kind) {
    return { dropped: typeof o.intent === "string" && o.intent !== "unknown"
      ? `Something heard as "${String(o.intent).slice(0, 40)}" isn't something Agent Runway can save.`
      : "Part of the note didn't match anything Agent Runway can save." };
  }
  const name = (key: string) => cleanText(o[key], FIELD_LIMITS.clientName);
  const deal = cleanText(o.deal, FIELD_LIMITS.address);

  switch (kind) {
    case "log_activity": {
      const summary = cleanText(o.summary, FIELD_LIMITS.description);
      if (!summary) return { dropped: `Skipped ${LABEL[kind]} with nothing said about it.` };
      // No name said is kept: on a client's profile it is that client, and
      // otherwise the card asks who it was.
      const clientName = name("client_name");
      const activityType = contactTypeOf(o.activity_type);
      return { intent: { intent: kind, clientName, deal, activityType, summary, date: spokenDate(o, "date_spoken", "date") } };
    }
    case "note": {
      const summary = cleanText(o.summary ?? o.text, FIELD_LIMITS.description);
      if (!summary) return { dropped: `Skipped ${LABEL[kind]} with nothing in it.` };
      return { intent: { intent: kind, clientName: name("client_name"), deal, summary } };
    }
    case "create_task": {
      const title = cleanText(o.title, FIELD_LIMITS.taskTitle);
      if (!title) return { dropped: `Skipped ${LABEL[kind]} with no title.` };
      const priority: TaskPriority = oneOf(o.priority, CAPTURE_PRIORITIES) ?? "normal";
      return {
        intent: {
          intent: kind, title, clientName: name("client_name"),
          due: spokenDate(o, "due_spoken", "due_date"), priority,
          notes: cleanText(o.notes, FIELD_LIMITS.notes),
        },
      };
    }
    case "update_deal": {
      const rawStage = typeof o.stage === "string" ? o.stage.trim().toLowerCase() : null;
      const stage: CaptureDealStage | null = oneOf(rawStage, CAPTURE_DEAL_STAGES);
      const closeDate = spokenDate(o, "close_date_spoken", "close_date");
      const clientName = name("client_name");
      if (rawStage === "closed" || rawStage === "sold") {
        return { dropped: "A deal heard as closed wasn't moved: closing records the sale, so use Close on the deal (Deals screen) or the Closing Day prompt." };
      }
      if (rawStage === "lost" || rawStage === "collapsed" || rawStage === "fell through") {
        return { dropped: "A deal heard as lost wasn't changed: marking a deal lost takes a reason, on the Deals screen." };
      }
      if (!stage && !closeDate.spoken && !closeDate.iso) return { dropped: `Skipped ${LABEL[kind]} with no stage or close date.` };
      return { intent: { intent: kind, deal, clientName, stage, closeDate } };
    }
    case "log_trip": {
      const km = cleanNumber(o.km);
      const purpose = cleanText(o.purpose, FIELD_LIMITS.description);
      const to = cleanText(o.to, FIELD_LIMITS.address);
      if (km === null && !purpose && !to) return { dropped: `Skipped ${LABEL[kind]} with no distance or destination.` };
      return {
        intent: {
          intent: kind,
          km: km !== null && km > 0 ? Math.round(km * 10) / 10 : null,
          from: cleanText(o.from, FIELD_LIMITS.address),
          to, purpose, date: spokenDate(o, "date_spoken", "date"),
        },
      };
    }
    case "new_expense": {
      const amount = cleanNumber(o.amount);
      const vendor = cleanText(o.vendor, FIELD_LIMITS.vendor);
      const description = cleanText(o.description, FIELD_LIMITS.description);
      if (amount === null && !vendor && !description) return { dropped: `Skipped ${LABEL[kind]} with no amount or vendor.` };
      const key = typeof o.category_key === "string" ? o.category_key.trim() : null;
      const categoryKey = key && (options.isExpenseCategoryKey ? options.isExpenseCategoryKey(key) : true) ? key : null;
      const tax = cleanNumber(o.tax_amount);
      return {
        intent: {
          intent: kind, categoryKey,
          amount: amount !== null && amount > 0 ? Math.round(amount * 100) / 100 : null,
          // Only as stated, and never more than the total.
          taxAmount: tax !== null && tax >= 0 && (amount === null || tax <= amount) ? Math.round(tax * 100) / 100 : null,
          vendor, description, date: spokenDate(o, "date_spoken", "date"),
        },
      };
    }
    case "new_client": {
      const fullName = name("full_name");
      if (!fullName) return { dropped: `Skipped ${LABEL[kind]} with no name.` };
      const side = oneOf(o.side, ["buyer", "seller"] as const);
      const leadSource: CaptureLeadSource | null = oneOf(o.lead_source, CAPTURE_LEAD_SOURCES);
      return {
        intent: {
          intent: kind, fullName,
          email: cleanText(o.email, FIELD_LIMITS.email),
          phone: cleanText(o.phone, FIELD_LIMITS.phone),
          city: cleanText(o.city, FIELD_LIMITS.address),
          side, leadSource, notes: cleanText(o.notes, FIELD_LIMITS.notes),
        },
      };
    }
    case "new_transaction": {
      const address = cleanText(o.address, FIELD_LIMITS.address);
      const salePrice = cleanNumber(o.sale_price);
      const gci = cleanNumber(o.gci);
      if (!address && salePrice === null && gci === null) return { dropped: `Skipped ${LABEL[kind]} with no address or price.` };
      const pct = cleanNumber(o.commission_pct);
      // A percentage from 1 to 10 (2.5 for 2.5%). 0.025 is a fraction and 25
      // is no commission an agent is paid: neither is guessed at. A fraction
      // read as a percentage made GCI about $100 on a $450,000 sale.
      const pctOk = pct !== null && pct >= 1 && pct <= 10;
      const side: CaptureSide | null = oneOf(o.side, CAPTURE_SIDES);
      return {
        intent: {
          intent: kind, address, clientName: name("client_name"), side,
          closeDate: spokenDate(o, "close_date_spoken", "close_date"),
          salePrice: salePrice !== null && salePrice > 0 ? salePrice : null,
          commissionPct: pctOk ? pct : null,
          commissionUnclear: pct !== null && pct !== 0 && !pctOk ? pct : null,
          gci: gci !== null && gci > 0 ? gci : null,
          notes: cleanText(o.notes, FIELD_LIMITS.notes),
        },
      };
    }
  }
}

/**
 * The model's reply (raw text or an already-parsed object), checked.
 * Throws CaptureParseError only when it isn't a JSON object at all.
 */
export function parseCaptureExtraction(raw: unknown, options: ParseCaptureOptions = {}): ParsedCapture {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(jsonText(raw));
    } catch {
      throw new CaptureParseError("The reply wasn't JSON.");
    }
  }
  if (!isObj(data)) throw new CaptureParseError("The reply wasn't a JSON object.");

  const transcriptCleaned = cleanText(data.transcript_cleaned, 10_000) ?? "";
  const list = Array.isArray(data.intents) ? data.intents : [];
  const intents: RawCaptureIntent[] = [];
  const dropped: string[] = [];
  for (const item of list) {
    const r = parseIntent(item, options);
    if ("intent" in r) intents.push(r.intent);
    else dropped.push(r.dropped);
  }
  if (intents.length > MAX_CAPTURE_INTENTS) {
    dropped.push(`Only the first ${MAX_CAPTURE_INTENTS} things heard are listed. Record the rest as a second note.`);
    intents.length = MAX_CAPTURE_INTENTS;
  }
  return { transcriptCleaned, intents, dropped };
}

/** The activity type a raw intent logs as. */
export function activityTypeFor(intent: RawCaptureIntent): ActivityType | null {
  if (intent.intent === "log_activity") return intent.activityType;
  if (intent.intent === "note") return "note";
  return null;
}
