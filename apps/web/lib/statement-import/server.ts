/**
 * Statement import, the database side: staging an upload, the duplicate
 * check before every confirm, confirm / skip / match / back to review, and
 * the reads the Imports tab and Flight Crew show. Used by
 * /api/statement-import and the Navigator tools (lib/ai/statement-import-
 * tools.ts), with the caller's own Supabase client: row level security
 * applies to every read and write.
 *
 * The decisions are the engine's (statement-import-engine): which lines are
 * charges already on file, what confirming does, the reconciliation lists.
 * The writes that must happen together (confirm, match, back to review) are
 * the RPC functions in migration 00185.
 *
 * Nothing here logs a description or an amount.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  bulkConfirmExclusion,
  confirmationOutcome,
  duplicateFlagUpdates,
  duplicateSearchWindow,
  reconciliationLists,
  relatedLinesWindow,
  type ConfirmRefusal,
  type DuplicateColumns,
  type ReconciliationLists,
} from "@agent-runway/core/engines/statement-import-engine";
import type { ImportedStatement, RecurringExpense, StatementLine } from "@agent-runway/core/types/database";
import { fetchAllIn, fetchAllRows } from "@/lib/supabase/fetch-all";
import { isReceiptCategoryKey } from "@/lib/types/receipt";

export const STATEMENT_LINE_COLUMNS =
  "id, statement_id, line_date, posted_date, description, merchant, amount, direction, source_category, suggested_category_key, category_key, category_source, business_likelihood, likelihood_reason, status, skip_reason, match_receipt_id, match_method, match_confidence, recurring_expense_id, recurring_charge_date, duplicate_candidate_count, hold_reason, related_line_id, related_receipt_id, duplicate_dismissed, expense_deleted_at, confirmed_at";

export const IMPORTED_STATEMENT_COLUMNS =
  "id, kind, source_format, institution, account_label, file_name, period_start, period_end, stated_total_out, stated_total_in, opening_balance, closing_balance, verification, warnings, status, line_count, pending_count, confirmed_count, skipped_count, created_at";

export type StatementLineRow = Omit<StatementLine, "user_id" | "fingerprint" | "created_at" | "updated_at">;
export type ImportedStatementRow = Omit<ImportedStatement, "user_id" | "file_hash" | "updated_at">;

export interface ReceiptRow {
  id: string;
  vendor: string | null;
  expense_date: string | null;
  total_amount: number | null;
  tax_amount: number | null;
  category_key: string | null;
  receipt_path: string | null;
  source: string | null;
  statement_line_id: string | null;
}

const RECEIPT_COLUMNS = "id, vendor, expense_date, total_amount, tax_amount, category_key, receipt_path, source, statement_line_id";

// ── Reads ──────────────────────────────────────────────────────────────────

export async function loadStatements(supabase: SupabaseClient, userId: string): Promise<ImportedStatementRow[]> {
  const { data, error } = await supabase
    .from("imported_statements")
    .select(IMPORTED_STATEMENT_COLUMNS)
    .eq("user_id", userId)
    .order("period_end", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`imported_statements: ${error.code ?? "read failed"}`);
  return (data ?? []) as ImportedStatementRow[];
}

/** Every line of these statements (paged: a year's export passes 1,000 lines). */
export async function loadLinesOfStatements(supabase: SupabaseClient, userId: string, statementIds: readonly string[]): Promise<StatementLineRow[]> {
  if (statementIds.length === 0) return [];
  const { data, error } = await fetchAllIn<string, StatementLineRow>(statementIds, (chunk, from, to) =>
    supabase
      .from("statement_lines")
      .select(STATEMENT_LINE_COLUMNS)
      .eq("user_id", userId)
      .in("statement_id", chunk)
      .order("line_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (error) throw new Error(`statement_lines: ${error.code ?? "read failed"}`);
  return data;
}

export async function loadLinesById(supabase: SupabaseClient, userId: string, lineIds: readonly string[]): Promise<StatementLineRow[]> {
  if (lineIds.length === 0) return [];
  const { data, error } = await fetchAllIn<string, StatementLineRow>(lineIds, (chunk, from, to) =>
    supabase
      .from("statement_lines")
      .select(STATEMENT_LINE_COLUMNS)
      .eq("user_id", userId)
      .in("id", chunk)
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (error) throw new Error(`statement_lines: ${error.code ?? "read failed"}`);
  return data;
}

/** Every line of the agent's imports dated from `from` to `to` (paged): other imports of the same month, refunds. */
export async function loadLinesBetween(supabase: SupabaseClient, userId: string, from: string, to: string): Promise<StatementLineRow[]> {
  const { data, error } = await fetchAllRows<StatementLineRow>((a, b) =>
    supabase
      .from("statement_lines")
      .select(STATEMENT_LINE_COLUMNS)
      .eq("user_id", userId)
      .gte("line_date", from)
      .lte("line_date", to)
      .order("id", { ascending: true })
      .range(a, b),
  );
  if (error) throw new Error(`statement_lines: ${error.code ?? "read failed"}`);
  return data;
}

/** The agent's receipts dated from `from` to `to` (paged). */
export async function loadReceiptsBetween(supabase: SupabaseClient, userId: string, from: string, to: string): Promise<ReceiptRow[]> {
  const { data, error } = await fetchAllRows<ReceiptRow>((a, b) =>
    supabase
      .from("receipt_expenses")
      .select(RECEIPT_COLUMNS)
      .eq("user_id", userId)
      .gte("expense_date", from)
      .lte("expense_date", to)
      .order("id", { ascending: true })
      .range(a, b),
  );
  if (error) throw new Error(`receipt_expenses: ${error.code ?? "read failed"}`);
  return data;
}

export async function loadActiveRecurring(supabase: SupabaseClient, userId: string): Promise<RecurringExpense[]> {
  const { data, error } = await supabase
    .from("recurring_expenses")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(1000);
  if (error) throw new Error(`recurring_expenses: ${error.code ?? "read failed"}`);
  return (data ?? []) as RecurringExpense[];
}

/** How many charges wait for review (the phone shows this; review is on the web). */
export async function pendingLineCount(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("statement_lines")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "pending")
    .eq("direction", "out");
  if (error) throw new Error(`statement_lines: ${error.code ?? "count failed"}`);
  return count ?? 0;
}

export interface StatementReview {
  statements: ImportedStatementRow[];
  lines: StatementLineRow[];
  /** Receipts the lines are linked or matched to, and the ones in the statements' periods. */
  receipts: ReceiptRow[];
  /** Active recurring expenses (the duplicate check and the "recurring charge" labels). */
  recurring: RecurringExpense[];
  reconciliation: ReconciliationLists;
}

/**
 * What the Imports tab shows: every statement, the lines of the chosen ones
 * (all, by default), the receipts around them, and the two reconciliation
 * lists.
 */
export async function loadStatementReview(
  supabase: SupabaseClient,
  userId: string,
  statementIds?: readonly string[] | null,
): Promise<StatementReview> {
  const statements = await loadStatements(supabase, userId);
  const chosen = statementIds && statementIds.length > 0 ? statements.filter((s) => statementIds.includes(s.id)) : statements;
  const lines = await loadLinesOfStatements(supabase, userId, chosen.map((s) => s.id));
  const periodFrom = chosen.map((s) => s.period_start).sort()[0];
  const periodTo = chosen.map((s) => s.period_end).sort().reverse()[0];
  const window = duplicateSearchWindow(lines);
  const from = [periodFrom, window?.from].filter(Boolean).sort()[0];
  const to = [periodTo, window?.to].filter(Boolean).sort().reverse()[0];
  const receipts = from && to ? await loadReceiptsBetween(supabase, userId, from, to) : [];
  const recurring = await loadActiveRecurring(supabase, userId);
  return {
    statements,
    lines,
    receipts,
    recurring,
    reconciliation: reconciliationLists(chosen, lines, receipts),
  };
}

// ── The duplicate check before a confirm ───────────────────────────────────

/**
 * Write the duplicate check's results (duplicateFlagUpdates) in one
 * statement per 2,000 lines: fn_set_statement_line_flags, pending lines of
 * the caller's only.
 */
export async function writeDuplicateFlags(
  supabase: SupabaseClient,
  updates: readonly { id: string; columns: DuplicateColumns }[],
): Promise<number> {
  let written = 0;
  for (let i = 0; i < updates.length; i += 2000) {
    const chunk = updates.slice(i, i + 2000).map((u) => ({ id: u.id, ...u.columns }));
    const { data, error } = await supabase.rpc("fn_set_statement_line_flags", { p_updates: chunk });
    if (error) throw new Error(`fn_set_statement_line_flags: ${error.code ?? "failed"}`);
    written += Number(data ?? 0);
  }
  return written;
}

/**
 * Re-check the lines of these statements against what is on file now (the
 * receipts, the recurring charges, and every other import's lines around
 * them), and write the columns that changed. Returns how many changed.
 */
export async function refreshDuplicateFlags(supabase: SupabaseClient, userId: string, statementIds: readonly string[]): Promise<number> {
  const own = await loadLinesOfStatements(supabase, userId, statementIds);
  const window = duplicateSearchWindow(own);
  const linesWindow = relatedLinesWindow(own);
  if (!window || !linesWindow) return 0;
  const [receipts, recurring, around] = await Promise.all([
    loadReceiptsBetween(supabase, userId, window.from, window.to),
    loadActiveRecurring(supabase, userId),
    loadLinesBetween(supabase, userId, linesWindow.from, linesWindow.to),
  ]);
  const ownIds = new Set(own.map((l) => l.id));
  const lines = [...own, ...around.filter((l) => !ownIds.has(l.id))];
  // Pending lines of other imports in the window can change too (the other
  // side of a twin or a refund): they are written as well.
  return writeDuplicateFlags(supabase, duplicateFlagUpdates(lines, receipts, recurring));
}

// ── Writes ─────────────────────────────────────────────────────────────────

export interface ConfirmItem {
  id: string;
  /** An expense item key; leave out to use the line's own category or estimate. */
  categoryKey?: string | null;
}

export type ConfirmRefusalReason =
  | ConfirmRefusal
  | "not_found"
  | "unknown_category"
  /** Left out of a confirm of several lines; each can be confirmed on its own. */
  | "bulk_expense_deleted"
  | "bulk_low_likelihood"
  | "bulk_unverified_statement";

export interface ConfirmResult {
  created: { id: string; receipt_id: string }[];
  linked: { id: string; receipt_id: string }[];
  recurring: { id: string; recurring_expense_id: string }[];
  refused: { id: string; reason: ConfirmRefusalReason }[];
}

/**
 * Confirm lines: the duplicate check runs again first, then
 * fn_confirm_statement_lines links the lines already on file and adds the
 * rest to the expense records. Several lines at once is a bulk confirm:
 * lines that would add an expense are left out when their expense was
 * deleted before, when they are under 50% business (unless the agent chose
 * the category), or when their import is a PDF that didn't check out
 * (bulkConfirmExclusion). One line is confirmed as asked.
 */
export async function confirmStatementLines(supabase: SupabaseClient, userId: string, items: readonly ConfirmItem[]): Promise<ConfirmResult> {
  const result: ConfirmResult = { created: [], linked: [], recurring: [], refused: [] };
  const valid: ConfirmItem[] = [];
  for (const item of items) {
    if (item.categoryKey && !isReceiptCategoryKey(item.categoryKey)) result.refused.push({ id: item.id, reason: "unknown_category" });
    else valid.push(item);
  }
  if (valid.length === 0) return result;

  const before = await loadLinesById(supabase, userId, valid.map((i) => i.id));
  const statementIds = [...new Set(before.map((l) => l.statement_id))];
  // The duplicate check first: a line that now links to a record is never
  // left out of a bulk confirm (linking adds nothing).
  await refreshDuplicateFlags(supabase, userId, statementIds);

  let send = valid;
  if (valid.length > 1) {
    const lines = await loadLinesById(supabase, userId, valid.map((i) => i.id));
    const { data: stmts, error: stErr } = await supabase
      .from("imported_statements")
      .select("id, verification")
      .eq("user_id", userId)
      .in("id", statementIds);
    if (stErr) throw new Error(`imported_statements: ${stErr.code ?? "read failed"}`);
    const verification = new Map((stmts ?? []).map((st: { id: string; verification: string }) => [st.id, st.verification]));
    const byId = new Map(lines.map((l) => [l.id, l]));
    send = [];
    for (const item of valid) {
      const line = byId.get(item.id);
      // A category passed with the confirm (Flight Crew's draft) is not the
      // agent's own choice: only one saved on the Imports tab counts as that.
      const why = line ? bulkConfirmExclusion(line, verification.get(line.statement_id)) : null;
      if (why && why !== "not_confirmable") result.refused.push({ id: item.id, reason: `bulk_${why}` as ConfirmRefusalReason });
      else send.push(item);
    }
    if (send.length === 0) return result;
  }

  const { data, error } = await supabase.rpc("fn_confirm_statement_lines", {
    p_lines: send.map((i) => ({ id: i.id, category_key: i.categoryKey ?? null })),
  });
  if (error) throw new Error(`fn_confirm_statement_lines: ${error.code ?? "failed"}`);
  const out = (data ?? {}) as Partial<ConfirmResult>;
  result.created.push(...(out.created ?? []));
  result.linked.push(...(out.linked ?? []));
  result.recurring.push(...(out.recurring ?? []));
  result.refused.push(...(out.refused ?? []));
  return result;
}

/** What confirming these lines would do now, without writing (the confirm screen's summary). */
export function previewConfirmation(lines: readonly StatementLineRow[], categoryOverrides: Record<string, string | null | undefined> = {}) {
  const counts = { create: 0, link: 0, recurring: 0, held: 0, refused: 0 };
  for (const line of lines) {
    const o = confirmationOutcome(line, categoryOverrides[line.id]);
    if (o.action === "create") counts.create++;
    else if (o.action === "link_receipt") counts.link++;
    else if (o.action === "recurring") counts.recurring++;
    else if (o.reason === "needs_decision") counts.held++;
    else counts.refused++;
  }
  return counts;
}

export async function skipStatementLines(supabase: SupabaseClient, userId: string, lineIds: readonly string[]): Promise<number> {
  if (lineIds.length === 0) return 0;
  const { data, error } = await supabase
    .from("statement_lines")
    .update({ status: "skipped", skip_reason: "user" })
    .eq("user_id", userId)
    .eq("status", "pending")
    .in("id", lineIds as string[])
    .select("id");
  if (error) throw new Error(`statement_lines: ${error.code ?? "update failed"}`);
  return data?.length ?? 0;
}

export async function reopenStatementLines(supabase: SupabaseClient, lineIds: readonly string[]): Promise<{ reopened: number; expenses_removed: number }> {
  if (lineIds.length === 0) return { reopened: 0, expenses_removed: 0 };
  const { data, error } = await supabase.rpc("fn_reopen_statement_lines", { p_line_ids: lineIds });
  if (error) throw new Error(`fn_reopen_statement_lines: ${error.code ?? "failed"}`);
  return data as { reopened: number; expenses_removed: number };
}

export async function setStatementLinesCategory(supabase: SupabaseClient, userId: string, lineIds: readonly string[], categoryKey: string): Promise<number> {
  if (!isReceiptCategoryKey(categoryKey)) throw new Error("unknown_category");
  if (lineIds.length === 0) return 0;
  const { data, error } = await supabase
    .from("statement_lines")
    .update({ category_key: categoryKey, category_source: "agent" })
    .eq("user_id", userId)
    .eq("status", "pending")
    .in("id", lineIds as string[])
    .select("id");
  if (error) throw new Error(`statement_lines: ${error.code ?? "update failed"}`);
  return data?.length ?? 0;
}

/** "Not the same charge": the line is added as its own expense when confirmed. */
export async function markNotDuplicate(supabase: SupabaseClient, userId: string, lineIds: readonly string[]): Promise<number> {
  if (lineIds.length === 0) return 0;
  const { data, error } = await supabase
    .from("statement_lines")
    .update({
      duplicate_dismissed: true,
      match_receipt_id: null,
      match_method: null,
      match_confidence: null,
      recurring_expense_id: null,
      recurring_charge_date: null,
      duplicate_candidate_count: 0,
      hold_reason: null,
      related_line_id: null,
      related_receipt_id: null,
    })
    .eq("user_id", userId)
    .eq("status", "pending")
    .in("id", lineIds as string[])
    .select("id");
  if (error) throw new Error(`statement_lines: ${error.code ?? "update failed"}`);
  return data?.length ?? 0;
}

/**
 * "Keep both": a receipt saved after this line was confirmed is a different
 * charge. The flag goes; nothing else changes.
 */
export async function keepLaterReceipt(supabase: SupabaseClient, userId: string, lineIds: readonly string[]): Promise<number> {
  if (lineIds.length === 0) return 0;
  const { data, error } = await supabase
    .from("statement_lines")
    .update({ hold_reason: null, related_receipt_id: null })
    .eq("user_id", userId)
    .eq("hold_reason", "later_receipt")
    .in("id", lineIds as string[])
    .select("id");
  if (error) throw new Error(`statement_lines: ${error.code ?? "update failed"}`);
  return data?.length ?? 0;
}

export type MatchRefusal = "line_not_found" | "not_a_charge" | "receipt_not_found" | "receipt_linked_elsewhere" | "counted_by_recurring";

export async function matchReceiptToLine(
  supabase: SupabaseClient,
  lineId: string,
  receiptId: string,
): Promise<{ ok: true; replacedReceiptId: string | null } | { ok: false; reason: MatchRefusal }> {
  const { data, error } = await supabase.rpc("fn_match_statement_line", { p_line_id: lineId, p_receipt_id: receiptId });
  if (error) throw new Error(`fn_match_statement_line: ${error.code ?? "failed"}`);
  const out = (data ?? {}) as { ok?: boolean; reason?: MatchRefusal; replaced_receipt_id?: string | null };
  if (out.ok) return { ok: true, replacedReceiptId: out.replaced_receipt_id ?? null };
  return { ok: false, reason: out.reason ?? "line_not_found" };
}

/** Remove an import: its staged lines go; expenses already confirmed stay. */
export async function removeStatement(supabase: SupabaseClient, userId: string, statementId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("imported_statements")
    .delete()
    .eq("user_id", userId)
    .eq("id", statementId)
    .select("id");
  if (error) throw new Error(`imported_statements: ${error.code ?? "delete failed"}`);
  return (data?.length ?? 0) > 0;
}

/** Plain-language reasons, for the Imports tab, Flight Crew and the MCP server. */
export const REFUSAL_COPY: Record<ConfirmRefusalReason | MatchRefusal, string> = {
  not_found: "That line isn't in your imports.",
  not_pending: "That line was already confirmed or skipped.",
  not_a_charge: "That line is money in (a payment, refund or deposit), not an expense.",
  needs_decision: "More than one record on file could be this charge. Match it to one, or mark it as a different charge.",
  needs_category: "That line has no category yet. Choose one to add it.",
  unknown_category: "That category isn't one of your expense items.",
  line_not_found: "That line isn't in your imports.",
  receipt_not_found: "That receipt isn't on file.",
  receipt_linked_elsewhere: "That receipt is already matched to another statement line.",
  counted_by_recurring: "That charge is counted by your Recurring Expenses list. A receipt for it would count it a second time.",
  bulk_expense_deleted: "Its expense was deleted earlier. Confirm it on its own to add it again.",
  bulk_low_likelihood: "It is under 50% business by the estimate. Confirm it on its own, or choose its category on the Imports tab first.",
  bulk_unverified_statement: "Its PDF couldn't be checked against the statement's totals. Confirm its lines one at a time.",
};
