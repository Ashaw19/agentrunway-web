/**
 * Statement Import Engine: bank and credit-card statement lines checked
 * against the expenses already on file. Created 2026-10-18 (migration 00185).
 *
 * CANONICAL for four decisions, so the web upload, the Imports tab, Flight
 * Crew and the MCP server can't disagree:
 *
 *   1. Is a statement line a charge that is already recorded?
 *      (`findStatementDuplicates`) A charge counts once. It is already in the
 *      totals when a receipt for it is on file (receipt_expenses), or when the
 *      Recurring Expenses list charges it on that date (recurring charges count
 *      on their dates with nothing to confirm: recurring-expense-engine). Two
 *      passes, the same as the Director Cockpit's bank reconciliation:
 *        pass 1: same day, amount within $0.02            (confidence 1.0)
 *        pass 2: within 2 days either side, same amount  (confidence 0.8)
 *      Exactly one candidate links. More than one is "ambiguous": the line is
 *      held for the agent to decide and never added on its own.
 *
 *   2. What confirming a line does (`confirmationOutcome`). The same branches,
 *      in the same order, as fn_confirm_statement_lines in migration 00185
 *      (statement-import-confirm-sql.test.ts holds them together): a line
 *      already recorded is linked, never added again.
 *
 *   3. The expense row a confirmed line becomes (`expenseRowForStatementLine`).
 *      It goes into receipt_expenses, the table every expense total reads, so
 *      the dashboard, the Expenses page, the T2125 lines, the GST34 helper and
 *      the MCP server pick it up through expense-totals-engine and
 *      t2125-expenses-engine with no change of their own.
 *
 *   4. The two reconciliation lists (`reconciliationLists`): card charges with
 *      no receipt, and receipts with no statement line.
 *
 * GST/HST: a statement line does not show the GST/HST inside a charge. The
 * row is saved with tax_amount empty (null), so no input tax credit is
 * claimed on it and nothing comes off the expense total (expense-totals-
 * engine). Never derived from a rate: insurance, most dues and out-of-province
 * purchases carry none. A line matched to a receipt is recorded by that
 * receipt, with the GST/HST printed on it.
 *
 * Information, not advice: whether a charge is a business expense is the
 * agent's call. The import estimates a category and a business likelihood;
 * nothing is added until the agent confirms.
 */

import { recurringChargeDatesBetween } from "./recurring-expense-engine";
import { addDaysISO, daysBetweenISO } from "../lib/local-date";
import type { RecurringExpense } from "../types/database";

// ── Shared vocabulary ─────────────────────────────────────────────────────

/** Money leaving the account (a purchase, a withdrawal, a fee) or coming in (a refund, a deposit, a card payment). */
export type StatementLineDirection = "out" | "in";

export type StatementLineStatus = "pending" | "confirmed" | "skipped";

/** Why a line was not added. `expense_deleted` never appears: that line goes back to pending. */
export type StatementSkipReason = "personal" | "transfer" | "payment" | "income" | "duplicate" | "user";

/** Amounts within this many dollars are the same charge (cards round FX and tips differently). */
export const DUPLICATE_AMOUNT_TOLERANCE = 0.02;

/** Pass 2 looks this many days either side of the line's date (posting lag). */
export const DUPLICATE_WINDOW_DAYS = 2;

/**
 * A near miss is held for the agent, never linked: the same amount a few
 * days further away than pass 2 looks (a debit that posts late), or a
 * record from the same merchant within this many days whose amount is
 * within NEAR_MATCH_AMOUNT_SHARE (a pre-tip restaurant receipt, a
 * subscription charged in US dollars and converted).
 */
export const NEAR_MATCH_DAYS = 5;
export const NEAR_MATCH_AMOUNT_SHARE = 0.25;

/**
 * A recurring expense of the same amount charged within this many days, but
 * outside the windows above, is held too: a lease or a subscription whose
 * charge day in the list is not the day the card shows.
 */
export const RECURRING_OFF_DATE_DAYS = 10;

/** Below this amount an off-date recurring look-alike is too common to flag. */
export const RECURRING_OFF_DATE_MIN_AMOUNT = 10;

/** A refund (money in) from the same merchant for the same amount within this many days of a purchase holds both. */
export const REFUND_WINDOW_DAYS = 90;

/**
 * A line whose estimated business likelihood is below this is treated as
 * personal-looking: it starts out skipped (the agent can include it).
 */
export const PERSONAL_LIKELIHOOD_BELOW = 0.35;

/**
 * "Confirm all" (and any confirm of several lines at once) adds a line only
 * at or above this likelihood, unless the agent chose its category. Lines
 * below it are confirmed one at a time.
 */
export const BULK_CONFIRM_MIN_LIKELIHOOD = 0.5;

const cents = (n: number | string | null | undefined): number => Math.round(Number(n ?? 0) * 100);
const sameAmount = (a: number | string | null | undefined, b: number | string | null | undefined): boolean =>
  Math.abs(cents(a) - cents(b)) <= Math.round(DUPLICATE_AMOUNT_TOLERANCE * 100);
const nearAmount = (a: number | string | null | undefined, b: number | string | null | undefined): boolean => {
  const x = Math.abs(Number(a ?? 0));
  const y = Math.abs(Number(b ?? 0));
  const larger = Math.max(x, y);
  return larger > 0 && Math.abs(x - y) <= larger * NEAR_MATCH_AMOUNT_SHARE;
};
const dayGap = (a: string, b: string): number => Math.abs(daysBetweenISO(a, b));

// ── 1. Duplicates ─────────────────────────────────────────────────────────

/** Why a line is held for the agent instead of linked or added. */
export type StatementHoldReason =
  /** More than one record fits, or one that is already reconciled with another statement line. */
  | "several"
  /** A line in another import looks like the same charge (two exports of one month). */
  | "other_import"
  /** Close but not exact: same amount a few days off, or the same merchant at a nearby amount. */
  | "near_match"
  /** A recurring expense of the same amount charged a few days away. */
  | "recurring_off_date"
  /** A refund from the same merchant for the same amount: the purchase and its refund. */
  | "refund"
  /** Set by the database: a receipt saved after this line was confirmed may be the same charge. */
  | "later_receipt"
  /** Set by the database: the recurring expense this charge was counted under changed. */
  | "recurring_changed";

export interface StatementLineForMatch {
  id: string;
  /** The import the line came from. Lines in different imports are compared with each other. */
  statement_id?: string | null;
  /** YYYY-MM-DD. */
  line_date: string;
  /** Always positive; `direction` carries the sign. */
  amount: number | string;
  direction: StatementLineDirection;
  status: StatementLineStatus;
  description?: string | null;
  merchant?: string | null;
  /** The agent said "not the same charge": never flagged again. */
  duplicate_dismissed?: boolean | null;
  /** Set on a line confirmed as a recurring charge: it holds that charge date. */
  recurring_expense_id?: string | null;
  recurring_charge_date?: string | null;
}

export interface ReceiptForMatch {
  id: string;
  expense_date: string | null;
  total_amount: number | string | null;
  vendor?: string | null;
  /** receipt_expenses.statement_line_id: the statement line it is already reconciled with. */
  statement_line_id?: string | null;
}

export type DuplicateMethod = "exact" | "window";

export type DuplicateFinding =
  | { kind: "none" }
  | { kind: "receipt"; receiptId: string; method: DuplicateMethod; confidence: number }
  | { kind: "recurring"; recurringId: string; chargeDate: string; method: DuplicateMethod; confidence: number }
  | {
      kind: "ambiguous";
      /** How many records could be this charge. */
      candidates: number;
      reason: Exclude<StatementHoldReason, "later_receipt" | "recurring_changed">;
      receiptIds: string[];
      recurringIds: string[];
      /** Statement lines (another import's copy, or the purchase a refund belongs to). */
      lineIds: string[];
    };

interface Candidate {
  key: string;
  kind: "receipt" | "recurring";
  id: string;
  date: string;
  amount: number | string;
  vendor: string;
  /** Reconciled with a statement line outside this batch: evidence only. */
  linkedElsewhere: boolean;
}

const WORD = /[a-z]{3,}/g;
/**
 * Words that say nothing about the merchant. fn_statement_merchant_words
 * (00185) holds the same list for the receipt trigger's near-miss test;
 * statement-import-confirm-sql.test.ts keeps the two equal.
 */
export const MERCHANT_STOP_WORDS: ReadonlySet<string> = new Set([
  "the", "and", "inc", "ltd", "llc", "com", "www", "pos", "purchase", "payment", "visa", "debit", "credit", "card",
  "store", "canada", "can", "sale", "pre", "authorized", "interac", "retail", "online", "bill", "pay", "refund",
  "return", "returned", "reversal", "mastercard", "amex", "tst", "fpos", "opos", "apos",
]);

function words(text: string | null | undefined): Set<string> {
  return new Set(((text ?? "").toLowerCase().match(WORD) ?? []).filter((w) => !MERCHANT_STOP_WORDS.has(w)));
}

function lineWords(line: { merchant?: string | null; description?: string | null }): Set<string> {
  return words(`${line.merchant ?? ""} ${line.description ?? ""}`);
}

/** Merchant words two texts share: the tie-break and the near-miss test. */
function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n;
}

const unique = (ids: string[]) => [...new Set(ids)];

/**
 * Which statement lines are charges already recorded, and which are held
 * for the agent.
 *
 * Pass every line of the statements involved, and the lines of other imports
 * dated around them, confirmed ones too: a confirmed line holds its receipt
 * and its recurring charge date, so a second identical charge on the same
 * day (two coffees) is not matched to the same record, and a line in another
 * import of the same month is seen.
 *
 * For a pending money-out line not marked "not the same charge", in order:
 *   1. a receipt this line already owns → that receipt
 *   2. pass 1 (same day) then pass 2 (2 days either side), amount within
 *      $0.02, over receipts and recurring charge dates: one fit links, more
 *      than one holds ("several")
 *   3. a refund of it (money in, same merchant and amount, within 90 days) → held
 *   4. the same charge in another import (amount within $0.02, 2 days) → held
 *   5. a near miss (see NEAR_MATCH_DAYS) in the records or another import → held
 * A pending money-in line that refunds a purchase is held with it.
 */
export function findStatementDuplicates(
  lines: readonly StatementLineForMatch[],
  receipts: readonly ReceiptForMatch[],
  recurring: readonly RecurringExpense[],
): Map<string, DuplicateFinding> {
  const findings = new Map<string, DuplicateFinding>();
  const batchIds = new Set(lines.map((l) => l.id));
  const dated = lines.filter((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.line_date));
  if (dated.length === 0) return findings;

  const dates = dated.map((l) => l.line_date).sort();
  const from = addDaysISO(dates[0], -RECURRING_OFF_DATE_DAYS);
  const to = addDaysISO(dates[dates.length - 1], RECURRING_OFF_DATE_DAYS);

  // Records already held by a line in this batch.
  const claimed = new Set<string>();
  const ownReceipt = new Map<string, string>(); // line id → receipt id
  for (const r of receipts) {
    if (r.statement_line_id && batchIds.has(r.statement_line_id)) {
      claimed.add(`receipt:${r.id}`);
      ownReceipt.set(r.statement_line_id, r.id);
    }
  }
  for (const l of lines) {
    if (l.status === "confirmed" && l.recurring_expense_id && l.recurring_charge_date) {
      claimed.add(`recurring:${l.recurring_expense_id}:${l.recurring_charge_date}`);
    }
  }

  const pool: Candidate[] = [];
  for (const r of receipts) {
    if (!r.expense_date || cents(r.total_amount) <= 0) continue;
    if (r.statement_line_id && batchIds.has(r.statement_line_id)) continue;
    pool.push({
      key: `receipt:${r.id}`,
      kind: "receipt",
      id: r.id,
      date: r.expense_date,
      amount: r.total_amount ?? 0,
      vendor: r.vendor ?? "",
      linkedElsewhere: Boolean(r.statement_line_id),
    });
  }
  for (const re of recurring) {
    for (const date of recurringChargeDatesBetween(re, from, to)) {
      const key = `recurring:${re.id}:${date}`;
      if (claimed.has(key)) continue;
      pool.push({ key, kind: "recurring", id: re.id, date, amount: re.amount, vendor: re.name ?? "", linkedElsewhere: false });
    }
  }
  const vendorWords = new Map(pool.map((c) => [c.key, words(c.vendor)]));
  const wordsOf = new Map(dated.map((l) => [l.id, lineWords(l)]));

  // Lines that count, or may: pending and confirmed (a skipped line is not in the totals).
  const live = dated.filter((l) => l.status === "pending" || l.status === "confirmed");

  const open = dated
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.status === "pending" && !line.duplicate_dismissed)
    .sort((a, b) => (a.line.line_date < b.line.line_date ? -1 : a.line.line_date > b.line.line_date ? 1 : a.index - b.index))
    .map(({ line }) => line);

  const hold = (
    line: StatementLineForMatch,
    reason: Extract<DuplicateFinding, { kind: "ambiguous" }>["reason"],
    found: { receipts?: Candidate[]; lines?: StatementLineForMatch[] },
  ) => {
    const receiptIds = unique((found.receipts ?? []).filter((c) => c.kind === "receipt").map((c) => c.id));
    const recurringIds = unique((found.receipts ?? []).filter((c) => c.kind === "recurring").map((c) => c.id));
    const lineIds = unique((found.lines ?? []).map((l) => l.id));
    findings.set(line.id, {
      kind: "ambiguous",
      candidates: receiptIds.length + recurringIds.length + lineIds.length,
      reason,
      receiptIds,
      recurringIds,
      lineIds,
    });
  };

  const free = (c: Candidate) => !claimed.has(c.key);
  const otherImport = (line: StatementLineForMatch, m: StatementLineForMatch) =>
    m.id !== line.id && Boolean(line.statement_id) && Boolean(m.statement_id) && m.statement_id !== line.statement_id && m.direction === line.direction;

  /** A purchase's refunds, or a refund's purchases. */
  const refundPartners = (line: StatementLineForMatch): StatementLineForMatch[] => {
    const mine = wordsOf.get(line.id) ?? new Set<string>();
    return live.filter((m) => {
      if (m.id === line.id || m.direction === line.direction || !sameAmount(m.amount, line.amount)) return false;
      if (overlap(mine, wordsOf.get(m.id) ?? new Set()) === 0) return false;
      const purchase = line.direction === "out" ? line : m;
      const refund = line.direction === "out" ? m : line;
      const gap = daysBetweenISO(purchase.line_date, refund.line_date);
      return gap >= 0 && gap <= REFUND_WINDOW_DAYS;
    });
  };

  // Money in: a refund of a purchase is held with it. Anything else gets no finding.
  for (const line of open.filter((l) => l.direction === "in")) {
    const partners = refundPartners(line);
    if (partners.length > 0) hold(line, "refund", { lines: partners });
  }

  const outs = open.filter((l) => l.direction === "out");

  // A pending line that already owns a receipt (a confirm that stopped half
  // way) is recorded by it.
  const unresolved: StatementLineForMatch[] = [];
  for (const line of outs) {
    const own = ownReceipt.get(line.id);
    if (own) findings.set(line.id, { kind: "receipt", receiptId: own, method: "exact", confidence: 1 });
    else unresolved.push(line);
  }

  const settle = (line: StatementLineForMatch, fits: Candidate[], method: DuplicateMethod): boolean => {
    if (fits.length === 0) return false;
    const usable = fits.filter((c) => !c.linkedElsewhere);
    let pick: Candidate | null = null;
    if (usable.length === 1 && fits.length === 1) {
      pick = usable[0];
    } else if (usable.length > 1 && usable.every((c) => c.kind === "receipt")) {
      // Same-day receipts of the same amount: the one whose vendor shares a
      // word with the line, when exactly one does.
      const mine = wordsOf.get(line.id) ?? new Set<string>();
      const scored = usable.map((c) => ({ c, score: overlap(mine, vendorWords.get(c.key) ?? new Set()) }));
      const best = Math.max(...scored.map((x) => x.score));
      const top = scored.filter((x) => x.score === best);
      if (best > 0 && top.length === 1 && fits.length === usable.length) pick = top[0].c;
    }
    if (pick) {
      claimed.add(pick.key);
      const confidence = method === "exact" ? 1 : 0.8;
      findings.set(
        line.id,
        pick.kind === "receipt"
          ? { kind: "receipt", receiptId: pick.id, method, confidence }
          : { kind: "recurring", recurringId: pick.id, chargeDate: pick.date, method, confidence },
      );
      return true;
    }
    hold(line, "several", { receipts: fits });
    return true;
  };

  // Pass 1: the same day.
  const afterPass1: StatementLineForMatch[] = [];
  for (const line of unresolved) {
    const fits = pool.filter((c) => free(c) && c.date === line.line_date && sameAmount(c.amount, line.amount));
    if (!settle(line, fits, "exact")) afterPass1.push(line);
  }

  // Pass 2: within two days either side.
  const afterPass2: StatementLineForMatch[] = [];
  for (const line of afterPass1) {
    const fits = pool.filter((c) =>
      free(c) && c.date !== line.line_date && sameAmount(c.amount, line.amount) && dayGap(line.line_date, c.date) <= DUPLICATE_WINDOW_DAYS,
    );
    if (!settle(line, fits, "window")) afterPass2.push(line);
  }

  // Nothing on file is exactly this charge. Hold it when something comes close.
  for (const line of afterPass2) {
    const refunds = refundPartners(line);
    if (refunds.length > 0) {
      hold(line, "refund", { lines: refunds });
      continue;
    }

    const twins = live.filter((m) => otherImport(line, m) && sameAmount(m.amount, line.amount) && dayGap(line.line_date, m.line_date) <= DUPLICATE_WINDOW_DAYS);
    if (twins.length > 0) {
      hold(line, "other_import", { lines: twins });
      continue;
    }

    const mine = wordsOf.get(line.id) ?? new Set<string>();
    const close = (amount: number | string, date: string, theirs: Set<string>) => {
      const gap = dayGap(line.line_date, date);
      if (gap > NEAR_MATCH_DAYS) return false;
      return sameAmount(amount, line.amount) || (overlap(mine, theirs) > 0 && nearAmount(amount, line.amount));
    };
    const nearRecords = pool.filter((c) => free(c) && close(c.amount, c.date, vendorWords.get(c.key) ?? new Set()));
    const nearLines = live.filter((m) => otherImport(line, m) && close(m.amount, m.line_date, wordsOf.get(m.id) ?? new Set()));
    if (nearRecords.length > 0 || nearLines.length > 0) {
      hold(line, nearLines.length > 0 && nearRecords.length === 0 ? "other_import" : "near_match", { receipts: nearRecords, lines: nearLines });
      continue;
    }

    if (Number(line.amount) >= RECURRING_OFF_DATE_MIN_AMOUNT) {
      const offDate = pool.filter((c) =>
        c.kind === "recurring" && free(c) && sameAmount(c.amount, line.amount) && dayGap(line.line_date, c.date) <= RECURRING_OFF_DATE_DAYS,
      );
      if (offDate.length > 0) {
        hold(line, "recurring_off_date", { receipts: offDate });
        continue;
      }
    }
    findings.set(line.id, { kind: "none" });
  }

  return findings;
}

/** How a line was linked to a record: by the two passes, or by the agent ("manual"). */
export type MatchMethod = DuplicateMethod | "manual";

/** The statement_lines columns a finding sets (the upload and every confirm write them). */
export interface DuplicateColumns {
  match_receipt_id: string | null;
  match_method: MatchMethod | null;
  match_confidence: number | null;
  recurring_expense_id: string | null;
  recurring_charge_date: string | null;
  duplicate_candidate_count: number;
  hold_reason: StatementHoldReason | null;
  /** The other import's line, or the purchase a refund belongs to (or the refund of a purchase). */
  related_line_id: string | null;
  /** A receipt that comes close (a near miss), or that was saved after the line was confirmed. */
  related_receipt_id: string | null;
}

/** Holds the database sets, which the duplicate check never clears on its own. */
const STICKY_HOLDS = new Set<string>(["recurring_changed", "later_receipt"]);

const NO_DUPLICATE: DuplicateColumns = {
  match_receipt_id: null,
  match_method: null,
  match_confidence: null,
  recurring_expense_id: null,
  recurring_charge_date: null,
  duplicate_candidate_count: 0,
  hold_reason: null,
  related_line_id: null,
  related_receipt_id: null,
};

export function duplicateColumns(finding: DuplicateFinding | undefined): DuplicateColumns {
  if (!finding || finding.kind === "none") return { ...NO_DUPLICATE };
  if (finding.kind === "receipt") {
    return { ...NO_DUPLICATE, match_receipt_id: finding.receiptId, match_method: finding.method, match_confidence: finding.confidence, duplicate_candidate_count: 1 };
  }
  if (finding.kind === "recurring") {
    return {
      ...NO_DUPLICATE,
      recurring_expense_id: finding.recurringId,
      recurring_charge_date: finding.chargeDate,
      match_method: finding.method,
      match_confidence: finding.confidence,
      duplicate_candidate_count: 1,
    };
  }
  // Held: nothing linked; the reason holds the line back.
  return {
    ...NO_DUPLICATE,
    duplicate_candidate_count: finding.candidates,
    hold_reason: finding.reason,
    related_line_id: finding.lineIds[0] ?? null,
    related_receipt_id: finding.receiptIds[0] ?? null,
  };
}

/**
 * The days to load receipts, recurring charges and other imports' lines for,
 * around a set of lines: the earliest line less RECURRING_OFF_DATE_DAYS (or
 * the refund window, for refunds) to the latest plus it. Null with no dated
 * line.
 */
export function duplicateSearchWindow(lines: readonly Pick<StatementLineForMatch, "line_date">[]): { from: string; to: string } | null {
  const dates = lines.map((l) => l.line_date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  if (dates.length === 0) return null;
  return { from: addDaysISO(dates[0], -RECURRING_OFF_DATE_DAYS), to: addDaysISO(dates[dates.length - 1], RECURRING_OFF_DATE_DAYS) };
}

/** The wider window for other imports' lines: a refund can come up to REFUND_WINDOW_DAYS after its purchase. */
export function relatedLinesWindow(lines: readonly Pick<StatementLineForMatch, "line_date">[]): { from: string; to: string } | null {
  const dates = lines.map((l) => l.line_date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  if (dates.length === 0) return null;
  return { from: addDaysISO(dates[0], -REFUND_WINDOW_DAYS), to: addDaysISO(dates[dates.length - 1], REFUND_WINDOW_DAYS) };
}

/**
 * The duplicate columns to write before a confirm, so the confirm acts on
 * what is on file now (a receipt scanned after the upload, a recurring
 * expense added or changed since, another import of the same month). Only
 * pending lines whose columns change are listed. Every surface that confirms
 * lines (the Imports tab, Flight Crew, the MCP server) loads the statements'
 * lines and the other imports' lines in `relatedLinesWindow`, the receipts
 * and recurring expenses in `duplicateSearchWindow`, writes these with
 * fn_set_statement_line_flags, then calls fn_confirm_statement_lines.
 */
export function duplicateFlagUpdates(
  lines: readonly (StatementLineForMatch & Partial<DuplicateColumns>)[],
  receipts: readonly ReceiptForMatch[],
  recurring: readonly RecurringExpense[],
): { id: string; columns: DuplicateColumns }[] {
  const findings = findStatementDuplicates(lines, receipts, recurring);
  const updates: { id: string; columns: DuplicateColumns }[] = [];
  for (const line of lines) {
    if (line.status !== "pending") continue;
    // A manual match stays as the agent made it.
    if (line.match_method === "manual" && line.match_receipt_id) continue;
    const finding = findings.get(line.id);
    // A money-in line with no refund partner, or a line the agent marked
    // "not the same charge": nothing on it.
    const next = finding ? duplicateColumns(finding) : { ...NO_DUPLICATE };
    // The database holds a line whose recurring expense changed: it stays
    // held until it links to a record again or the agent decides, so an
    // edited lease amount can't turn its old charges into new expenses.
    if (STICKY_HOLDS.has(line.hold_reason ?? "") && !next.match_receipt_id && !next.recurring_expense_id) continue;
    const keys = Object.keys(NO_DUPLICATE) as (keyof DuplicateColumns)[];
    const same = keys.every((k) => k === "match_confidence" || (line[k] ?? (k === "duplicate_candidate_count" ? 0 : null)) === next[k]);
    if (!same) updates.push({ id: line.id, columns: next });
  }
  return updates;
}

// ── 2. What confirming does ───────────────────────────────────────────────

export interface StatementLineForConfirm {
  status: StatementLineStatus;
  direction: StatementLineDirection;
  duplicate_dismissed?: boolean | null;
  match_receipt_id?: string | null;
  recurring_expense_id?: string | null;
  duplicate_candidate_count?: number | null;
  hold_reason?: string | null;
  category_key?: string | null;
  suggested_category_key?: string | null;
}

export type ConfirmRefusal =
  /** Already confirmed or skipped. */
  | "not_pending"
  /** Money in (a refund, a deposit, a card payment): not an expense. */
  | "not_a_charge"
  /** Held: it could be a charge already on file. Match it, or mark it "not the same charge". */
  | "needs_decision"
  /** No category chosen or estimated. */
  | "needs_category";

export type ConfirmOutcome =
  /** Added as a new expense (receipt_expenses row, source 'statement_import'). */
  | { action: "create"; categoryKey: string }
  /** Already recorded by this receipt: linked, nothing added. */
  | { action: "link_receipt"; receiptId: string }
  /** Already counted by the Recurring Expenses list on its charge date: nothing added. */
  | { action: "recurring"; recurringId: string }
  | { action: "refuse"; reason: ConfirmRefusal };

/**
 * What confirming this line does. Mirrors fn_confirm_statement_lines (00185)
 * branch for branch. The SQL also checks that the category is an expense
 * item key and that the matched receipt still exists.
 */
export function confirmationOutcome(
  line: StatementLineForConfirm,
  categoryOverride?: string | null,
): ConfirmOutcome {
  if (line.status !== "pending") return { action: "refuse", reason: "not_pending" };
  if (line.direction !== "out") return { action: "refuse", reason: "not_a_charge" };
  if (!line.duplicate_dismissed) {
    if (line.match_receipt_id) return { action: "link_receipt", receiptId: line.match_receipt_id };
    if (line.recurring_expense_id) return { action: "recurring", recurringId: line.recurring_expense_id };
    if (line.hold_reason || (line.duplicate_candidate_count ?? 0) > 1) return { action: "refuse", reason: "needs_decision" };
  }
  const categoryKey = categoryOverride || line.category_key || line.suggested_category_key || null;
  if (!categoryKey) return { action: "refuse", reason: "needs_category" };
  return { action: "create", categoryKey };
}

/** How an import was checked: a CSV or Excel export is read as written; a PDF is read by a model and checked against its own totals. */
export type StatementVerification = "not_applicable" | "reconciled" | "mismatch" | "unverified";

export type BulkExclusion =
  /** Confirming would refuse it anyway. */
  | "not_confirmable"
  /** Its expense was deleted earlier: add it back one at a time, if at all. */
  | "expense_deleted"
  /** Under BULK_CONFIRM_MIN_LIKELIHOOD and the agent didn't choose its category. */
  | "low_likelihood"
  /** From a PDF whose lines don't add up to its totals, or whose totals couldn't be read. */
  | "unverified_statement";

export interface StatementLineForBulk extends StatementLineForConfirm {
  business_likelihood?: number | string | null;
  category_source?: string | null;
  expense_deleted_at?: string | null;
}

/**
 * Whether a line may be confirmed as one of several at once ("Confirm all",
 * or a selection). A line that only links (a receipt or recurring charge
 * already on file) always may. A line that would add an expense may not when
 * its expense was deleted before, when it is under 50% business and the agent
 * didn't choose its category, or when its import is an unverified PDF. Those
 * are confirmed one at a time.
 *
 * `categoryOverride` is the category passed with the confirm (Flight Crew's or
 * the MCP client's draft): it decides whether the line would be added, as it
 * does in fn_confirm_statement_lines, but it is not the agent's own choice,
 * so the 50% rule still applies (only `category_source = 'agent'`, saved on
 * the Imports tab, lifts it).
 */
export function bulkConfirmExclusion(
  line: StatementLineForBulk,
  statementVerification: StatementVerification | string | null | undefined,
  categoryOverride?: string | null,
): BulkExclusion | null {
  const outcome = confirmationOutcome(line, categoryOverride);
  if (outcome.action === "refuse") return "not_confirmable";
  if (outcome.action !== "create") return null;
  if (line.expense_deleted_at) return "expense_deleted";
  if (statementVerification === "mismatch" || statementVerification === "unverified") return "unverified_statement";
  const likelihood = line.business_likelihood == null ? null : Number(line.business_likelihood);
  if (line.category_source !== "agent" && (likelihood == null || !Number.isFinite(likelihood) || likelihood < BULK_CONFIRM_MIN_LIKELIHOOD)) {
    return "low_likelihood";
  }
  return null;
}

/** Why a line is left out of a confirm of several, in the confirm's refusal words. */
export type BulkConfirmRefusal =
  | ConfirmRefusal
  | "not_found"
  | "bulk_expense_deleted"
  | "bulk_low_likelihood"
  | "bulk_unverified_statement";

/**
 * One line of a confirm of several lines (after the duplicate check has run):
 * null when it goes to fn_confirm_statement_lines, else why it is left out.
 * A line confirming would refuse is refused here with that reason: on a bulk
 * confirm nothing is left for the database to decide, so a category passed
 * with the confirm can never carry a line past the bulk rules. A line that
 * wasn't loaded (not the agent's, or gone) is not_found.
 */
export function bulkConfirmRefusal(
  line: StatementLineForBulk | null | undefined,
  statementVerification: StatementVerification | string | null | undefined,
  categoryOverride?: string | null,
): BulkConfirmRefusal | null {
  if (!line) return "not_found";
  const outcome = confirmationOutcome(line, categoryOverride);
  if (outcome.action === "refuse") return outcome.reason;
  const why = bulkConfirmExclusion(line, statementVerification, categoryOverride);
  return why && why !== "not_confirmable" ? `bulk_${why}` : null;
}

// ── 3. The expense row ────────────────────────────────────────────────────

export interface StatementLineForExpense {
  id: string;
  line_date: string;
  amount: number | string;
  description: string;
  merchant?: string | null;
}

export interface StatementExpenseRow {
  vendor: string;
  expense_date: string;
  total_amount: number;
  /** Not shown on a statement: left empty, never derived from a rate. */
  tax_amount: null;
  subtotal: null;
  currency: "CAD";
  category_key: string;
  notes: string;
  source: "statement_import";
  statement_line_id: string;
}

/** Vendor names are cut to this length, as the receipt form's field is. */
export const STATEMENT_VENDOR_MAX = 120;

/** The note on an expense added from a statement line. */
export function statementExpenseNote(accountLabel: string | null | undefined): string {
  const label = (accountLabel ?? "").trim();
  return label ? `From statement import, ${label}` : "From statement import";
}

/**
 * The receipt_expenses row a confirmed line becomes (without user_id). The
 * SQL in fn_confirm_statement_lines inserts these same columns.
 */
export function expenseRowForStatementLine(
  line: StatementLineForExpense,
  categoryKey: string,
  accountLabel: string | null | undefined,
): StatementExpenseRow {
  const vendor = ((line.merchant ?? "").trim() || line.description.trim()).slice(0, STATEMENT_VENDOR_MAX);
  return {
    vendor,
    expense_date: line.line_date,
    total_amount: Math.round(Number(line.amount) * 100) / 100,
    tax_amount: null,
    subtotal: null,
    currency: "CAD",
    category_key: categoryKey,
    notes: statementExpenseNote(accountLabel),
    source: "statement_import",
    statement_line_id: line.id,
  };
}

// ── 4. Reconciliation lists ───────────────────────────────────────────────

export interface StatementForRecon {
  id: string;
  period_start: string;
  period_end: string;
  account_label?: string | null;
}

export interface StatementLineForRecon {
  id: string;
  statement_id: string;
  line_date: string;
  amount: number | string;
  direction: StatementLineDirection;
  status: StatementLineStatus;
  description?: string | null;
  merchant?: string | null;
  recurring_expense_id?: string | null;
}

export interface ReceiptForRecon {
  id: string;
  expense_date: string | null;
  total_amount: number | string | null;
  vendor?: string | null;
  receipt_path?: string | null;
  source?: string | null;
  statement_line_id?: string | null;
}

export interface ChargeWithoutReceipt {
  line: StatementLineForRecon;
  /** The expense that records the charge. */
  receiptId: string;
  /**
   * statement_copy: the expense was added from the statement line itself
   * no_document:    matched to an expense that has no receipt image or file
   */
  reason: "statement_copy" | "no_document";
}

export interface ReconciliationLists {
  /** Confirmed card or bank charges whose expense has no receipt image or file on record. */
  chargesWithoutReceipt: ChargeWithoutReceipt[];
  /**
   * Expenses dated inside an imported statement's period that no statement
   * line was reconciled with: paid another way (cash, another card), or on a
   * statement not imported yet. Expenses added from a statement are never
   * in it.
   */
  receiptsWithoutLine: ReceiptForRecon[];
  /** Confirmed charges counted by the Recurring Expenses list (left out of the first list). */
  recurringCharges: number;
}

export function reconciliationLists(
  statements: readonly StatementForRecon[],
  lines: readonly StatementLineForRecon[],
  receipts: readonly ReceiptForRecon[],
): ReconciliationLists {
  const receiptByLine = new Map<string, ReceiptForRecon>();
  for (const r of receipts) if (r.statement_line_id) receiptByLine.set(r.statement_line_id, r);

  const chargesWithoutReceipt: ChargeWithoutReceipt[] = [];
  let recurringCharges = 0;
  for (const line of lines) {
    if (line.status !== "confirmed" || line.direction !== "out") continue;
    const receipt = receiptByLine.get(line.id);
    if (!receipt) {
      if (line.recurring_expense_id) recurringCharges++;
      continue;
    }
    if (receipt.receipt_path) continue;
    chargesWithoutReceipt.push({
      line,
      receiptId: receipt.id,
      reason: receipt.source === "statement_import" ? "statement_copy" : "no_document",
    });
  }
  chargesWithoutReceipt.sort((a, b) => (a.line.line_date < b.line.line_date ? -1 : a.line.line_date > b.line.line_date ? 1 : 0));

  const periods = statements.filter((s) => s.period_start && s.period_end);
  const inAPeriod = (date: string) => periods.some((s) => date >= s.period_start && date <= s.period_end);
  const receiptsWithoutLine = receipts
    .filter((r) =>
      r.expense_date !== null &&
      cents(r.total_amount) > 0 &&
      !r.statement_line_id &&
      r.source !== "statement_import" &&
      inAPeriod(r.expense_date),
    )
    .sort((a, b) => ((a.expense_date ?? "") < (b.expense_date ?? "") ? -1 : (a.expense_date ?? "") > (b.expense_date ?? "") ? 1 : 0));

  return { chargesWithoutReceipt, receiptsWithoutLine, recurringCharges };
}
