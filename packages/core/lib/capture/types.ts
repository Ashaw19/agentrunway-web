/**
 * Capture: a spoken or pasted note (after a showing or a call) turned into
 * proposed writes that the agent confirms before anything is saved.
 *
 * Surfaces: the iPhone app's hold-to-record button, the web voice button,
 * Flight Crew's captureNote tool and the MCP capture_note tool. All of them
 * share this pipeline:
 *
 *   transcript ─► extraction (model, apps/web/lib/voice/extract.ts)
 *              ─► parseCaptureExtraction (validate, Atlantic dates)  parse.ts
 *              ─► resolveCapture (client and deal name search)       resolve.ts
 *              ─► CaptureProposal: ProposedWrite[]                   proposals.ts
 *              ─► the agent edits, picks, removes, then confirms
 *              ─► applyCaptureWrites (one writer per tool)           ../record-writers.ts
 *
 * Every ProposedWrite carries the argument shape of an existing Flight Crew
 * write tool (apps/web/lib/ai/tools.ts), so chat, MCP, web and phone save
 * through the same writer.
 *
 * Deno note: the MCP edge function imports this file through its generated
 * copy of core, which cannot resolve a bare package import. Keep imports
 * relative (and type-only where possible).
 */

import type { ActivityType, TaskPriority } from "../../types/database";

// ── Intents ──────────────────────────────────────────────────────────────────

/**
 * What one note can contain. A 20-second note after a showing often holds
 * several: "Showed 12 Elm to Sarah, she wants to write Thursday, follow up
 * Wednesday, drove 18 km" is an activity, a task and a trip.
 *
 * EXTENSION POINT. To add an intent:
 *   1. add it here and to RawCaptureIntent below,
 *   2. describe it in the extraction prompt (apps/web/lib/voice/extract-prompt.ts),
 *   3. validate it in parse.ts (parseIntent),
 *   4. map it to a write tool in proposals.ts (writesForIntent), adding the
 *      tool to CaptureToolArgs and a writer to record-writers.ts if it is new.
 * Planned:
 *   - record_consent: the CASL consent ledger's recordConsent tool ("she said
 *     yes to the market emails"). Args = that tool's shape, Dispatcher lane.
 *   - log_trip odometer fields (vehicle logbook): odometer_start/odometer_end
 *     on RawLogTrip, carried into LogMileageArgs (odometerStart, odometerEnd:
 *     the writer and the logMileage tool take them since the logbook PR).
 */
export const CAPTURE_INTENTS = [
  "log_activity",
  "note",
  "create_task",
  "update_deal",
  "log_trip",
  "new_expense",
  "new_client",
  "new_transaction",
] as const;
export type CaptureIntentKind = (typeof CAPTURE_INTENTS)[number];

/** Activity types a capture can log as contact (a memo is the `note` intent). */
export const CAPTURE_CONTACT_TYPES = ["call", "text", "email", "showing", "meeting", "offer"] as const;
export type CaptureContactType = (typeof CAPTURE_CONTACT_TYPES)[number];

/**
 * Pipeline stages a capture can move a deal to. Not `closed`: closing records
 * the sale (a linked transaction, recordPipelineDealClose), which the Deals
 * screen's Close and the Closing Day prompt do. Not `lost` either: that takes
 * a reason (fn_mark_opportunity_lost).
 */
export const CAPTURE_DEAL_STAGES = ["lead", "showing", "offer", "conditional", "firm"] as const;
export type CaptureDealStage = (typeof CAPTURE_DEAL_STAGES)[number];

export const CAPTURE_PRIORITIES = ["low", "normal", "high"] as const satisfies readonly TaskPriority[];

export const CAPTURE_SIDES = ["buyer", "seller", "both"] as const;
export type CaptureSide = (typeof CAPTURE_SIDES)[number];

/** createClient's lead sources (the Flight Crew tool's enum). */
export const CAPTURE_LEAD_SOURCES = [
  "referral", "sphere", "open_house", "online", "sign_call",
  "cold_call", "door_knock", "social_media", "repeat", "other",
] as const;
export type CaptureLeadSource = (typeof CAPTURE_LEAD_SOURCES)[number];

// ── What the extraction model returns (validated in parse.ts) ────────────────

/** A date as spoken ("Thursday", "next week") plus the model's own reading of it. */
export interface RawSpokenDate {
  /** The words used, e.g. "Thursday". Resolved in Atlantic time by dates.ts. */
  spoken: string | null;
  /** The model's YYYY-MM-DD, used only when the words can't be resolved. */
  iso: string | null;
}

export interface RawLogActivity {
  intent: "log_activity";
  clientName: string | null;
  /** A deal named instead of (or as well as) a person: "the Elm Street showing". */
  deal: string | null;
  activityType: CaptureContactType;
  summary: string;
  date: RawSpokenDate;
}

export interface RawNote {
  intent: "note";
  clientName: string | null;
  deal: string | null;
  summary: string;
}

export interface RawCreateTask {
  intent: "create_task";
  title: string;
  clientName: string | null;
  due: RawSpokenDate;
  priority: TaskPriority;
  notes: string | null;
}

export interface RawUpdateDeal {
  intent: "update_deal";
  deal: string | null;
  clientName: string | null;
  stage: CaptureDealStage | null;
  closeDate: RawSpokenDate;
}

export interface RawLogTrip {
  intent: "log_trip";
  km: number | null;
  from: string | null;
  to: string | null;
  purpose: string | null;
  date: RawSpokenDate;
  // EXTENSION POINT (vehicle logbook): odometerStart / odometerEnd.
}

export interface RawNewExpense {
  intent: "new_expense";
  categoryKey: string | null;
  amount: number | null;
  /** GST/HST only when the speaker states it. Never worked out from a rate. */
  taxAmount: number | null;
  vendor: string | null;
  description: string | null;
  date: RawSpokenDate;
}

export interface RawNewClient {
  intent: "new_client";
  fullName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  side: "buyer" | "seller" | null;
  leadSource: CaptureLeadSource | null;
  notes: string | null;
}

export interface RawNewTransaction {
  intent: "new_transaction";
  address: string | null;
  clientName: string | null;
  side: CaptureSide | null;
  closeDate: RawSpokenDate;
  salePrice: number | null;
  /** A percentage, 2.5 for 2.5%. */
  commissionPct: number | null;
  gci: number | null;
  notes: string | null;
}

export type RawCaptureIntent =
  | RawLogActivity
  | RawNote
  | RawCreateTask
  | RawUpdateDeal
  | RawLogTrip
  | RawNewExpense
  | RawNewClient
  | RawNewTransaction;

export interface ParsedCapture {
  transcriptCleaned: string;
  intents: RawCaptureIntent[];
  /** Plain-words notes on what was dropped and why. */
  dropped: string[];
}

// ── Write tools: the Flight Crew tools' argument shapes ──────────────────────

/** logContactActivity */
export interface LogContactActivityArgs {
  clientId: string;
  clientName: string;
  type: ActivityType;
  description: string;
  /** YYYY-MM-DD. Left out for today (the activity is stamped now). */
  activityDate?: string;
}

/** createContactTask */
export interface CreateContactTaskArgs {
  clientId?: string;
  clientName?: string;
  title: string;
  dueDate: string;
  priority: TaskPriority;
  notes?: string;
}

/** updatePipelineDealStage */
export interface UpdatePipelineDealStageArgs {
  dealId: string;
  dealDescription: string;
  stage: CaptureDealStage;
}

/** updatePipelineDealCloseDate */
export interface UpdatePipelineDealCloseDateArgs {
  dealId: string;
  dealDescription: string;
  closeDate: string;
}

/** logMileage. Vehicle and odometer fields: CRA's vehicle logbook (migration 00184). */
export interface LogMileageArgs {
  tripDate: string;
  /** Km driven. 0 with both odometer readings given: worked out from them. */
  km: number;
  description: string;
  fromLocation?: string;
  toLocation?: string;
  /** Short purpose ("Client showing"). Defaults to the description. */
  purpose?: string;
  /** Odometer at the start and end of the trip, in km. */
  odometerStart?: number;
  odometerEnd?: number;
  /** The agent's vehicle. Omitted: the default vehicle (defaultVehicleId). */
  vehicleId?: string;
  notes?: string;
}

/** logExpense */
export interface LogExpenseArgs {
  vendor: string;
  /** Total paid, GST/HST included. */
  amount: number;
  /** Only as stated. */
  taxAmount?: number;
  categoryKey: string;
  expenseDate: string;
  notes?: string;
}

/** createClient. A capture fills name, email, phone, city, side, leadSource and notes. */
export interface CreateClientArgs {
  name: string;
  email?: string;
  phone?: string;
  city?: string;
  buyerTargetArea?: string;
  status?: "boarding" | "scheduled" | "in_flight" | "cruising";
  propertyInterest?: number;
  propertyInterestType?: "budget" | "listing";
  side?: "buyer" | "seller";
  timeframe?: "asap" | "1_3_months" | "3_6_months" | "6_12_months" | "12_plus" | "unknown";
  leadSource?: CaptureLeadSource;
  notes?: string;
}

/** recordTransaction */
export interface RecordTransactionArgs {
  address: string;
  clientName: string;
  side: CaptureSide;
  closeDate: string;
  commissionPaidDate?: string;
  salePrice?: number;
  /** A percentage, 2.5 for 2.5%. */
  commissionPct?: number;
  gciOverride?: number;
  notes?: string;
}

export interface CaptureToolArgs {
  logContactActivity: LogContactActivityArgs;
  createContactTask: CreateContactTaskArgs;
  updatePipelineDealStage: UpdatePipelineDealStageArgs;
  updatePipelineDealCloseDate: UpdatePipelineDealCloseDateArgs;
  logMileage: LogMileageArgs;
  logExpense: LogExpenseArgs;
  createClient: CreateClientArgs;
  recordTransaction: RecordTransactionArgs;
}
export type CaptureTool = keyof CaptureToolArgs;

export const CAPTURE_TOOLS = [
  "createClient",
  "logContactActivity",
  "createContactTask",
  "updatePipelineDealStage",
  "updatePipelineDealCloseDate",
  "logMileage",
  "logExpense",
  "recordTransaction",
] as const satisfies readonly CaptureTool[];

/** Which Flight Crew persona owns each write (apps/web/lib/ai/tools.ts partition). */
export const CAPTURE_TOOL_CREW: Record<CaptureTool, "dispatcher" | "navigator"> = {
  createClient: "dispatcher",
  logContactActivity: "dispatcher",
  createContactTask: "dispatcher",
  updatePipelineDealStage: "dispatcher",
  updatePipelineDealCloseDate: "dispatcher",
  logMileage: "navigator",
  logExpense: "navigator",
  recordTransaction: "navigator",
};

// ── Name resolution ──────────────────────────────────────────────────────────

export interface ClientCandidate {
  id: string;
  name: string;
  status: string | null;
  lastContactAt: string | null;
  /**
   * exact: the full name said; word: every word said is a word of the name;
   * partial: only part of it; context: recorded from this client's profile;
   * deal: the client on the deal that was named.
   */
  match: "exact" | "word" | "partial" | "context" | "deal";
}

export interface ClientChoice {
  /** The name as said, or null when none was. */
  spoken: string | null;
  /** Ranked: best match first, then the most recently contacted. */
  candidates: ClientCandidate[];
  /**
   * Set only when exactly one client fits, or the agent picked one. When
   * several match it stays null and the card shows a picker: nothing
   * defaults to the first match.
   */
  selectedId: string | null;
  /** Chosen: this person is the new client this capture adds (that createClient write's id). */
  newClientWriteId: string | null;
  /** Offered on the picker: a new client in this capture whose name fits. */
  newClientOffer: string | null;
  /** The agent chose "No client" (a task only). */
  noClient: boolean;
  /** True for a task, which can be a to-do with no client. */
  optional: boolean;
}

export interface DealCandidate {
  id: string;
  address: string;
  clientName: string;
  clientId: string | null;
  stage: string;
  expectedCloseDate: string | null;
  match: "exact" | "word" | "partial";
}

export interface DealChoice {
  spoken: string | null;
  candidates: DealCandidate[];
  selectedId: string | null;
}

// ── Proposal ─────────────────────────────────────────────────────────────────

export interface ProposedWriteOf<T extends CaptureTool> {
  /** "w1", "w2", ... unique within the proposal. */
  id: string;
  tool: T;
  intent: CaptureIntentKind;
  args: CaptureToolArgs[T];
  /** Off = not saved. Removing a write on the card turns it off. */
  include: boolean;
  client?: ClientChoice;
  deal?: DealChoice;
  /** Plain-words things to check before saving (a date nobody said, a likely duplicate). */
  warnings: string[];
}

export type ProposedWrite = { [T in CaptureTool]: ProposedWriteOf<T> }[CaptureTool];

export interface CaptureProposal {
  transcript: string;
  transcriptCleaned: string;
  /** The Atlantic calendar day relative dates were read from. */
  today: string;
  writes: ProposedWrite[];
  /** Things heard that won't be saved, and why. */
  notes: string[];
}

/** The client a capture was started from (the iPhone client profile). */
export interface CaptureContext {
  clientId?: string | null;
  clientName?: string | null;
}
