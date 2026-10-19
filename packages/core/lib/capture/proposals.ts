/**
 * Parsed intents → proposed writes in the Flight Crew tools' argument shapes,
 * and the confirm-card helpers every surface shares: pick a client or deal,
 * check a write, save the confirmed ones.
 *
 * Dates: activities, trips and expenses look back ("Thursday" was the last
 * one) and default to today; tasks and close dates look ahead. A date nobody
 * said, or one the words couldn't fix, carries a warning so the card shows
 * it for checking.
 */

import type { DbClient } from "../db-client";
import { toNameSearch } from "../client-identity";
import { addDaysISO } from "../local-date";
import { applyCaptureWrite, newRecordId, type CaptureWriteCall, type WriteOutcome } from "../record-writers";
import { isIsoDay, pickDate, shortDayLabel, type PickedDate } from "./dates";
import {
  nameScore,
  rankClientCandidates,
  rankDealCandidates,
  searchClients,
  searchDeals,
  soleMatch,
} from "./resolve";
import {
  CAPTURE_DEAL_STAGES,
  type CaptureContext,
  type CaptureProposal,
  type CaptureTool,
  type CaptureToolArgs,
  type ClientCandidate,
  type ClientChoice,
  type DealCandidate,
  type DealChoice,
  type ParsedCapture,
  type ProposedWrite,
  type ProposedWriteOf,
  type RawCaptureIntent,
} from "./types";

// ── Lookups ──────────────────────────────────────────────────────────────────

/** Name and deal search results for every name a note mentions. Keys: clientKey / dealKey. */
export interface CaptureLookups {
  clients: Record<string, ClientCandidate[]>;
  deals: Record<string, DealCandidate[]>;
  /** The client the capture was recorded from, checked to be the user's own. */
  context: { id: string; name: string } | null;
}

export const clientKey = (spoken: string) => toNameSearch(spoken);
export const dealKey = (spoken: string) => toNameSearch(spoken);

/** Every client name and deal reference the intents mention. */
export function mentionedNames(parsed: ParsedCapture): { clients: string[]; deals: string[] } {
  const clients = new Set<string>();
  const deals = new Set<string>();
  for (const i of parsed.intents) {
    switch (i.intent) {
      case "log_activity":
      case "note":
        if (i.clientName) clients.add(i.clientName);
        if (i.deal) deals.add(i.deal);
        break;
      case "create_task":
        if (i.clientName) clients.add(i.clientName);
        break;
      case "update_deal":
        if (i.deal) deals.add(i.deal);
        if (i.clientName) deals.add(i.clientName);
        break;
      case "new_client":
        if (i.fullName) clients.add(i.fullName);
        break;
      case "new_transaction":
        if (i.address) deals.add(i.address);
        if (i.clientName) deals.add(i.clientName);
        break;
      default:
        break;
    }
  }
  return { clients: [...clients], deals: [...deals] };
}

/** Run the searches a note needs, with the user's own client (RLS). */
export async function loadCaptureLookups(
  db: DbClient,
  userId: string,
  parsed: ParsedCapture,
  context: CaptureContext = {},
): Promise<CaptureLookups> {
  const names = mentionedNames(parsed);
  const lookups: CaptureLookups = { clients: {}, deals: {}, context: null };

  if (context.clientId) {
    const { data } = await db
      .from("clients")
      .select("id, name")
      .eq("id", context.clientId)
      .eq("user_id", userId)
      .maybeSingle();
    if (data) {
      lookups.context = { id: data.id as string, name: data.name as string };
      // A task or deal change said on this profile with no name is about this client.
      if (!names.deals.some((d) => dealKey(d) === dealKey(lookups.context!.name))) names.deals.push(lookups.context.name);
    }
  }

  for (const spoken of names.clients) {
    const key = clientKey(spoken);
    if (key in lookups.clients) continue;
    lookups.clients[key] = rankClientCandidates(spoken, await searchClients(db, userId, spoken));
  }
  for (const spoken of names.deals) {
    const key = dealKey(spoken);
    if (key in lookups.deals) continue;
    lookups.deals[key] = rankDealCandidates(spoken, await searchDeals(db, userId, spoken));
  }
  return lookups;
}

// ── Choices ──────────────────────────────────────────────────────────────────

function contextCandidate(ctx: { id: string; name: string }): ClientCandidate {
  return { id: ctx.id, name: ctx.name, status: null, lastContactAt: null, match: "context" };
}

interface NewClientRef {
  writeId: string;
  name: string;
}

/** Who a write is about. `optional` for a task (a to-do may have no client). */
function clientChoiceFor(
  spoken: string | null,
  lookups: CaptureLookups,
  newClients: NewClientRef[],
  optional: boolean,
): ClientChoice {
  const base: ClientChoice = {
    spoken, candidates: [], selectedId: null, newClientWriteId: null, newClientOffer: null, noClient: false, optional,
  };
  const ctx = lookups.context;
  if (!spoken) {
    if (ctx) return { ...base, candidates: [contextCandidate(ctx)], selectedId: ctx.id };
    return base;
  }
  const candidates = [...(lookups.clients[clientKey(spoken)] ?? [])];
  const newOffer = newClients.find((n) => nameScore(spoken, n.name) >= 2) ?? null;

  // Said on a client's profile and their name fits: that client.
  if (ctx && nameScore(spoken, ctx.name) >= 2) {
    const rest = candidates.filter((c) => c.id !== ctx.id);
    return { ...base, candidates: [contextCandidate(ctx), ...rest], selectedId: ctx.id, newClientOffer: newOffer?.writeId ?? null };
  }
  const strong = candidates.filter((c) => c.match === "exact" || c.match === "word");
  if (newOffer && strong.length === 0) {
    // The person this note adds as a new client.
    return { ...base, candidates, newClientWriteId: newOffer.writeId, newClientOffer: newOffer.writeId };
  }
  return { ...base, candidates, selectedId: newOffer ? null : soleMatch(spoken, candidates), newClientOffer: newOffer?.writeId ?? null };
}

function dealChoiceFor(spoken: string | null, lookups: CaptureLookups): DealChoice {
  if (!spoken) return { spoken: null, candidates: [], selectedId: null };
  const candidates = lookups.deals[dealKey(spoken)] ?? [];
  return { spoken, candidates, selectedId: soleMatch(spoken, candidates) };
}

/** "12 Elm St — Sarah Johnson" for an approval card and the deal row. */
export function dealDescription(d: Pick<DealCandidate, "address" | "clientName"> | null, fallback: string | null): string {
  if (!d) return fallback ?? "";
  return [d.address, d.clientName].filter(Boolean).join(" — ") || (fallback ?? "");
}

function selectedClient(choice: ClientChoice): ClientCandidate | null {
  return choice.candidates.find((c) => c.id === choice.selectedId) ?? null;
}

function selectedDeal(choice: DealChoice): DealCandidate | null {
  return choice.candidates.find((c) => c.id === choice.selectedId) ?? null;
}

/** When an activity names only a deal: the client on that deal. */
function clientFromDeal(deal: DealChoice, base: ClientChoice): ClientChoice {
  const pick = selectedDeal(deal);
  if (pick?.clientId) {
    return { ...base, candidates: [{ id: pick.clientId, name: pick.clientName, status: null, lastContactAt: null, match: "deal" }], selectedId: pick.clientId };
  }
  const seen = new Set<string>();
  const candidates: ClientCandidate[] = [];
  for (const d of deal.candidates) {
    if (d.clientId && !seen.has(d.clientId)) {
      seen.add(d.clientId);
      candidates.push({ id: d.clientId, name: d.clientName, status: null, lastContactAt: null, match: "deal" });
    }
  }
  return { ...base, candidates };
}

// ── Building ─────────────────────────────────────────────────────────────────

function dateWarnings(picked: PickedDate, today: string, kind: "past" | "future", what: string): string[] {
  const out: string[] = [];
  if (picked.source === "default") out.push(`No ${what} was said, so it is set to today.`);
  if (picked.source === "model") out.push(`Check the ${what}: ${shortDayLabel(picked.date!)}.`);
  if (picked.date && kind === "past" && picked.date > today) out.push(`The ${what} is in the future.`);
  if (picked.date && kind === "future" && picked.date < today) out.push(`The ${what} has already passed.`);
  if (picked.date && Math.abs(Date.parse(picked.date) - Date.parse(today)) > 400 * 86_400_000) {
    out.push(`The ${what} is more than a year from today.`);
  }
  return out;
}

/** Drop optional fields left undefined, so args read as the tool would get them. Required "" stays. */
const omitEmpty = <T extends Record<string, unknown>>(o: T): T => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null) out[k] = v;
  return out as T;
};

function write<T extends CaptureTool>(
  id: string,
  tool: T,
  intent: RawCaptureIntent["intent"],
  args: CaptureToolArgs[T],
  extra: Partial<Pick<ProposedWriteOf<T>, "client" | "deal" | "warnings" | "include">> = {},
): ProposedWrite {
  return { id, tool, intent, args, include: extra.include ?? true, client: extra.client, deal: extra.deal, warnings: extra.warnings ?? [] } as ProposedWrite;
}

export interface BuildProposalInput {
  transcript: string;
  parsed: ParsedCapture;
  /** Atlantic YYYY-MM-DD. */
  today: string;
  lookups: CaptureLookups;
}

/** The proposed writes for a parsed note. Pure: the searches are already in `lookups`. */
export function buildCaptureProposal({ transcript, parsed, today, lookups }: BuildProposalInput): CaptureProposal {
  const writes: ProposedWrite[] = [];
  const notes = [...parsed.dropped];
  let n = 0;
  const nextId = () => `w${++n}`;

  // New clients first, so the rest of the note can point at them.
  const newClients: NewClientRef[] = [];
  for (const i of parsed.intents) {
    if (i.intent !== "new_client" || !i.fullName) continue;
    const id = nextId();
    const existing = (lookups.clients[clientKey(i.fullName)] ?? []).filter((c) => c.match === "exact");
    const warnings = existing.length > 0
      ? [`A client named ${existing[0].name} is already on file. This is off so they aren't added twice.`]
      : [];
    if (existing.length === 0) newClients.push({ writeId: id, name: i.fullName });
    writes.push(write(id, "createClient", i.intent, omitEmpty({
      name: i.fullName,
      email: i.email ?? undefined,
      phone: i.phone ?? undefined,
      city: i.city ?? undefined,
      side: i.side ?? undefined,
      leadSource: i.leadSource ?? undefined,
      notes: i.notes ?? undefined,
    }) as CaptureToolArgs["createClient"], { include: existing.length === 0, warnings }));
  }

  for (const i of parsed.intents) {
    switch (i.intent) {
      case "new_client":
        break;

      case "log_activity":
      case "note": {
        const deal = dealChoiceFor(i.deal, lookups);
        let client = clientChoiceFor(i.clientName, lookups, newClients, false);
        if (!i.clientName && i.deal) client = clientFromDeal(deal, client);
        const picked: PickedDate = i.intent === "log_activity"
          ? pickDate(i.date, today, "past", today)
          : { date: today, source: "spoken" };
        const warnings = i.intent === "log_activity"
          ? dateWarnings(picked, today, "past", "activity date").filter((w) => !w.startsWith("No activity date"))
          : [];
        const chosen = selectedClient(client);
        const newName = client.newClientWriteId ? newClients.find((c) => c.writeId === client.newClientWriteId)?.name : null;
        writes.push(write(nextId(), "logContactActivity", i.intent, omitEmpty({
          clientId: chosen?.id ?? "",
          clientName: chosen?.name ?? newName ?? i.clientName ?? "",
          type: i.intent === "note" ? "note" : i.activityType,
          description: i.summary,
          activityDate: picked.date && picked.date !== today ? picked.date : undefined,
        }) as CaptureToolArgs["logContactActivity"], { client, deal: i.deal ? deal : undefined, warnings }));
        break;
      }

      case "create_task": {
        const client = clientChoiceFor(i.clientName, lookups, newClients, true);
        const picked = pickDate(i.due, today, "future", today);
        const chosen = selectedClient(client);
        const newName = client.newClientWriteId ? newClients.find((c) => c.writeId === client.newClientWriteId)?.name : null;
        writes.push(write(nextId(), "createContactTask", i.intent, omitEmpty({
          clientId: chosen?.id,
          clientName: chosen?.name ?? newName ?? i.clientName ?? undefined,
          title: i.title,
          dueDate: picked.date ?? today,
          priority: i.priority,
          notes: i.notes ?? undefined,
        }) as CaptureToolArgs["createContactTask"], { client, warnings: dateWarnings(picked, today, "future", "due date") }));
        break;
      }

      case "update_deal": {
        const spoken = i.deal ?? i.clientName ?? lookups.context?.name ?? null;
        const deal = dealChoiceFor(spoken, lookups);
        const pick = selectedDeal(deal);
        const description = dealDescription(pick, spoken);
        if (i.stage && (CAPTURE_DEAL_STAGES as readonly string[]).includes(i.stage)) {
          writes.push(write(nextId(), "updatePipelineDealStage", i.intent, {
            dealId: pick?.id ?? "", dealDescription: description, stage: i.stage,
          }, { deal }));
        }
        if (i.closeDate.spoken || i.closeDate.iso) {
          const picked = pickDate(i.closeDate, today, "future", null);
          if (picked.date) {
            writes.push(write(nextId(), "updatePipelineDealCloseDate", i.intent, {
              dealId: pick?.id ?? "", dealDescription: description, closeDate: picked.date,
            }, { deal, warnings: dateWarnings(picked, today, "future", "close date") }));
          } else {
            notes.push(`The close date "${i.closeDate.spoken}" wasn't clear, so it wasn't changed.`);
          }
        }
        break;
      }

      case "log_trip": {
        const picked = pickDate(i.date, today, "past", today);
        const warnings = dateWarnings(picked, today, "past", "trip date").filter((w) => !w.startsWith("No trip date"));
        if (i.km === null) warnings.unshift("Add the kilometres driven.");
        writes.push(write(nextId(), "logMileage", i.intent, omitEmpty({
          tripDate: picked.date ?? today,
          km: i.km ?? 0,
          description: i.purpose ?? (i.to ? `Trip to ${i.to}` : "Business trip"),
          fromLocation: i.from ?? undefined,
          toLocation: i.to ?? undefined,
        }) as CaptureToolArgs["logMileage"], { warnings }));
        break;
      }

      case "new_expense": {
        const picked = pickDate(i.date, today, "past", today);
        const warnings = dateWarnings(picked, today, "past", "expense date").filter((w) => !w.startsWith("No expense date"));
        if (i.amount === null) warnings.unshift("Add the amount.");
        if (!i.categoryKey) warnings.push("Pick the expense category.");
        if (!i.vendor) warnings.push("Add who it was paid to.");
        writes.push(write(nextId(), "logExpense", i.intent, omitEmpty({
          vendor: i.vendor ?? "",
          amount: i.amount ?? 0,
          taxAmount: i.taxAmount ?? undefined,
          categoryKey: i.categoryKey ?? "",
          expenseDate: picked.date ?? today,
          notes: i.description ?? undefined,
        }) as CaptureToolArgs["logExpense"], { warnings }));
        break;
      }

      case "new_transaction": {
        const picked = pickDate(i.closeDate, today, "past", today);
        const warnings = dateWarnings(picked, today, "past", "close date");
        if (!i.side) warnings.push("Check the side: set to buyer.");
        if (!i.salePrice && !i.gci) warnings.push("Add the sale price and commission, or the GCI.");
        // A deal still in the pipeline is recorded by closing it there
        // (one linked transaction). Recording it here too counts it twice.
        const matches = [
          ...(i.address ? lookups.deals[dealKey(i.address)] ?? [] : []),
          ...(i.clientName ? lookups.deals[dealKey(i.clientName)] ?? [] : []),
        ].filter((d) => d.match !== "partial");
        if (matches.length > 0) {
          warnings.unshift(`This looks like the pipeline deal ${dealDescription(matches[0], null)}. Close that deal on the Deals screen to record it once; this is off so it isn't counted twice.`);
        }
        writes.push(write(nextId(), "recordTransaction", i.intent, omitEmpty({
          address: i.address ?? "",
          clientName: i.clientName ?? "",
          side: i.side ?? "buyer",
          closeDate: picked.date ?? today,
          salePrice: i.salePrice ?? undefined,
          commissionPct: i.commissionPct ?? undefined,
          gciOverride: i.gci ?? undefined,
          notes: i.notes ?? undefined,
        }) as CaptureToolArgs["recordTransaction"], { warnings, include: matches.length === 0 }));
        break;
      }
    }
  }

  return { transcript, transcriptCleaned: parsed.transcriptCleaned || transcript, today, writes, notes };
}

/** Parsed note → proposal, with the searches it needs. */
export async function resolveCapture(
  db: DbClient,
  userId: string,
  input: { transcript: string; parsed: ParsedCapture; today: string; context?: CaptureContext },
): Promise<CaptureProposal> {
  const lookups = await loadCaptureLookups(db, userId, input.parsed, input.context);
  return buildCaptureProposal({ transcript: input.transcript, parsed: input.parsed, today: input.today, lookups });
}

// ── Picking on the card ──────────────────────────────────────────────────────

export type ClientPick =
  | { kind: "existing"; candidate: ClientCandidate }
  | { kind: "new"; writeId: string; name: string }
  | { kind: "none" };

function withClient(w: ProposedWrite, choice: ClientChoice, pick: ClientPick): ProposedWrite {
  const client: ClientChoice = { ...choice };
  if (pick.kind === "existing") {
    if (!client.candidates.some((c) => c.id === pick.candidate.id)) client.candidates = [pick.candidate, ...client.candidates];
    client.selectedId = pick.candidate.id;
    client.newClientWriteId = null;
    client.noClient = false;
  } else if (pick.kind === "new") {
    client.selectedId = null;
    client.newClientWriteId = pick.writeId;
    client.noClient = false;
  } else {
    client.selectedId = null;
    client.newClientWriteId = null;
    client.noClient = true;
  }
  const name = pick.kind === "existing" ? pick.candidate.name : pick.kind === "new" ? pick.name : undefined;
  const id = pick.kind === "existing" ? pick.candidate.id : undefined;
  if (w.tool === "logContactActivity") {
    return { ...w, client, args: { ...w.args, clientId: id ?? "", clientName: name ?? w.args.clientName } };
  }
  if (w.tool === "createContactTask") {
    const args = { ...w.args, clientId: id, clientName: name };
    if (!id) delete args.clientId;
    if (!name) delete args.clientName;
    return { ...w, client, args };
  }
  return w;
}

/**
 * The agent picked who a write is about. Other writes that heard the same
 * name and have nobody picked yet get the same person, so "Sarah" is picked
 * once for the activity and the task.
 */
export function pickClient(writes: ProposedWrite[], writeId: string, pick: ClientPick): ProposedWrite[] {
  const target = writes.find((w) => w.id === writeId);
  if (!target?.client) return writes;
  const spoken = target.client.spoken ? clientKey(target.client.spoken) : null;
  return writes.map((w) => {
    if (!w.client) return w;
    if (w.id === writeId) return withClient(w, w.client, pick);
    const unpicked = !w.client.selectedId && !w.client.newClientWriteId && !w.client.noClient;
    if (pick.kind !== "none" && spoken && unpicked && w.client.spoken && clientKey(w.client.spoken) === spoken) {
      return withClient(w, w.client, pick);
    }
    return w;
  });
}

/** The agent picked the deal. Writes that heard the same deal get it too. */
export function pickDeal(writes: ProposedWrite[], writeId: string, candidate: DealCandidate): ProposedWrite[] {
  const target = writes.find((w) => w.id === writeId);
  if (!target?.deal) return writes;
  const spoken = target.deal.spoken ? dealKey(target.deal.spoken) : null;
  return writes.map((w) => {
    if (!w.deal) return w;
    const same = w.id === writeId || (spoken && !w.deal.selectedId && w.deal.spoken && dealKey(w.deal.spoken) === spoken);
    if (!same) return w;
    const deal: DealChoice = {
      ...w.deal,
      candidates: w.deal.candidates.some((c) => c.id === candidate.id) ? w.deal.candidates : [candidate, ...w.deal.candidates],
      selectedId: candidate.id,
    };
    const description = dealDescription(candidate, w.deal.spoken);
    if (w.tool === "updatePipelineDealStage" || w.tool === "updatePipelineDealCloseDate") {
      return { ...w, deal, args: { ...w.args, dealId: candidate.id, dealDescription: description } } as ProposedWrite;
    }
    if (w.tool === "logContactActivity" && w.client && !w.client.spoken && candidate.clientId) {
      const client = clientFromDeal(deal, w.client);
      return { ...w, deal, client, args: { ...w.args, clientId: candidate.clientId, clientName: candidate.clientName } };
    }
    return { ...w, deal } as ProposedWrite;
  });
}

// ── Checking and saving ──────────────────────────────────────────────────────

export interface CheckOptions {
  /** Whether an expense item key is real. Without it any non-empty key passes. */
  isExpenseCategoryKey?: (key: string) => boolean;
}

/** What still has to be filled in or picked before this write can be saved. Empty = ready. */
export function checkWrite(w: ProposedWrite, options: CheckOptions = {}): string[] {
  const p: string[] = [];
  const clientPicked = (c?: ClientChoice) => !!c && (!!c.selectedId || !!c.newClientWriteId);
  switch (w.tool) {
    case "logContactActivity":
      if (!clientPicked(w.client) && !w.args.clientId) p.push(w.client?.candidates.length ? "Pick which client." : "Pick the client.");
      if (!w.args.description.trim()) p.push("Add what happened.");
      if (w.args.activityDate !== undefined && !isIsoDay(w.args.activityDate)) p.push("Fix the date.");
      break;
    case "createContactTask":
      if (!w.args.title.trim()) p.push("Add a title.");
      if (!isIsoDay(w.args.dueDate)) p.push("Fix the due date.");
      if (w.client?.spoken && !clientPicked(w.client) && !w.client.noClient && !w.args.clientId) {
        p.push("Pick which client, or No client.");
      }
      break;
    case "updatePipelineDealStage":
      if (!w.args.dealId) p.push(w.deal?.candidates.length ? "Pick which deal." : "No matching deal in your pipeline.");
      if (!(CAPTURE_DEAL_STAGES as readonly string[]).includes(w.args.stage)) p.push("Pick the stage.");
      break;
    case "updatePipelineDealCloseDate":
      if (!w.args.dealId) p.push(w.deal?.candidates.length ? "Pick which deal." : "No matching deal in your pipeline.");
      if (!isIsoDay(w.args.closeDate)) p.push("Fix the close date.");
      break;
    case "logMileage":
      if (!(w.args.km > 0)) p.push("Add the kilometres.");
      if (!isIsoDay(w.args.tripDate)) p.push("Fix the trip date.");
      if (!w.args.description.trim()) p.push("Add the trip purpose.");
      break;
    case "logExpense":
      if (!(w.args.amount > 0)) p.push("Add the amount.");
      if (!w.args.vendor.trim()) p.push("Add who it was paid to.");
      if (!w.args.categoryKey || (options.isExpenseCategoryKey && !options.isExpenseCategoryKey(w.args.categoryKey))) p.push("Pick the category.");
      if (!isIsoDay(w.args.expenseDate)) p.push("Fix the date.");
      if (w.args.taxAmount !== undefined && w.args.taxAmount > w.args.amount) p.push("GST/HST is more than the total.");
      break;
    case "createClient":
      if (!w.args.name.trim()) p.push("Add the name.");
      break;
    case "recordTransaction":
      if (!w.args.address.trim()) p.push("Add the address.");
      if (!w.args.clientName.trim()) p.push("Add the client.");
      if (!isIsoDay(w.args.closeDate)) p.push("Fix the close date.");
      if (!w.args.salePrice && !w.args.gciOverride) p.push("Add the sale price or the GCI.");
      break;
  }
  return p;
}

export type SaveStatus = "saved" | "queued" | "failed" | "skipped";

export interface SaveResult {
  writeId: string;
  tool: CaptureTool;
  status: SaveStatus;
  message: string;
}

export interface SaveOptions {
  /** Today on the caller's calendar (atlanticISODate on a server, localISODate on a device). */
  today: string;
  /** Called for a write that couldn't reach the database; return true once it is queued (the phone). */
  queue?: (call: CaptureWriteCall) => boolean;
}

/**
 * Save the included writes, new clients first. Each goes through the
 * Flight Crew tool's writer (record-writers.ts). A write that names a new
 * client in this capture gets its id; if that client couldn't be added (and
 * wasn't queued), the write is not saved either. A new client whose name is
 * already on file is not added again: the writes that named them go on the
 * existing client.
 */
export async function applyCaptureWrites(
  db: DbClient,
  userId: string,
  writes: ProposedWrite[],
  options: SaveOptions,
): Promise<SaveResult[]> {
  const results: SaveResult[] = [];
  const newClientIds = new Map<string, { id: string; name: string } | null>();
  /** New clients waiting in the phone's queue: writes about them wait behind them. */
  const queuedClients = new Set<string>();
  const ordered = [...writes.filter((w) => w.tool === "createClient"), ...writes.filter((w) => w.tool !== "createClient")];

  const run = async (w: ProposedWrite, call: CaptureWriteCall): Promise<SaveResult> => {
    const outcome: WriteOutcome = await applyCaptureWrite(db, userId, call, options.today);
    if (outcome.ok) return { writeId: w.id, tool: w.tool, status: "saved", message: outcome.message };
    if (outcome.offline && options.queue?.(call)) {
      return { writeId: w.id, tool: w.tool, status: "queued", message: "Saved on this phone. It syncs when you're back online." };
    }
    return { writeId: w.id, tool: w.tool, status: "failed", message: outcome.message };
  };

  for (const w of ordered) {
    if (!w.include) {
      results.push({ writeId: w.id, tool: w.tool, status: "skipped", message: "Removed." });
      if (w.tool === "createClient") newClientIds.set(w.id, null);
      continue;
    }
    const problems = checkWrite(w);
    if (problems.length > 0) {
      results.push({ writeId: w.id, tool: w.tool, status: "failed", message: problems.join(" ") });
      if (w.tool === "createClient") newClientIds.set(w.id, null);
      continue;
    }

    if (w.tool === "createClient") {
      const id = newRecordId();
      const outcome = await applyCaptureWrite(db, userId, { tool: "createClient", args: w.args, id }, options.today);
      const dup = (outcome as { duplicateOf?: { id: string; name: string } }).duplicateOf;
      if (outcome.ok) {
        newClientIds.set(w.id, { id: outcome.id ?? id, name: w.args.name });
        results.push({ writeId: w.id, tool: w.tool, status: "saved", message: outcome.message });
      } else if (dup) {
        newClientIds.set(w.id, dup);
        results.push({ writeId: w.id, tool: w.tool, status: "skipped", message: `${dup.name} is already on file, so the rest of this note went on that client.` });
      } else if (outcome.offline && options.queue?.({ tool: "createClient", args: w.args, id })) {
        newClientIds.set(w.id, { id, name: w.args.name });
        queuedClients.add(w.id);
        results.push({ writeId: w.id, tool: w.tool, status: "queued", message: "Saved on this phone. It syncs when you're back online." });
      } else {
        newClientIds.set(w.id, null);
        results.push({ writeId: w.id, tool: w.tool, status: "failed", message: outcome.message });
      }
      continue;
    }

    // Point a write at the new client it names.
    let call: CaptureWriteCall = { tool: w.tool, args: w.args } as CaptureWriteCall;
    if ((w.tool === "logContactActivity" || w.tool === "createContactTask") && w.client?.newClientWriteId) {
      const made = newClientIds.get(w.client.newClientWriteId);
      if (!made) {
        results.push({ writeId: w.id, tool: w.tool, status: "failed", message: "Not saved: the new client it is about wasn't added." });
        continue;
      }
      call = { tool: w.tool, args: { ...w.args, clientId: made.id, clientName: made.name } } as CaptureWriteCall;
      if (queuedClients.has(w.client.newClientWriteId)) {
        // The client isn't in the database yet: queue this behind it.
        results.push(options.queue?.(call)
          ? { writeId: w.id, tool: w.tool, status: "queued", message: "Saved on this phone. It syncs when you're back online." }
          : { writeId: w.id, tool: w.tool, status: "failed", message: "Not saved: the new client it is about is still waiting to sync." });
        continue;
      }
    }
    results.push(await run(w, call));
  }

  // Report in the card's order.
  const order = new Map(writes.map((w, i) => [w.id, i]));
  return results.sort((a, b) => (order.get(a.writeId) ?? 0) - (order.get(b.writeId) ?? 0));
}

/** "2 saved, 1 not saved" for a toast. */
export function summarizeSave(results: SaveResult[]): { saved: number; queued: number; failed: number; text: string } {
  const saved = results.filter((r) => r.status === "saved").length;
  const queued = results.filter((r) => r.status === "queued").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const parts: string[] = [];
  if (saved) parts.push(`${saved} saved`);
  if (queued) parts.push(`${queued} waiting to sync`);
  if (failed) parts.push(`${failed} not saved`);
  return { saved, queued, failed, text: parts.join(", ") || "Nothing to save" };
}

/** A to-do due "tomorrow" etc. for a quick-pick row on the card. */
export function dueShortcuts(today: string): Array<{ label: string; date: string }> {
  return [
    { label: "Today", date: today },
    { label: "Tomorrow", date: addDaysISO(today, 1) },
    { label: "In a week", date: addDaysISO(today, 7) },
  ];
}
