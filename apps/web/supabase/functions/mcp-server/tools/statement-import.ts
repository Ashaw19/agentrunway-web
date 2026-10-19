import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { McpTool, McpToolResult } from "./index.ts";
import { CANONICAL_TAX_DISCLAIMER } from "../lib/constants.ts";
import {
  bulkConfirmExclusion,
  confirmationOutcome,
  duplicateFlagUpdates,
  duplicateSearchWindow,
  findStatementDuplicates,
  reconciliationLists,
  relatedLinesWindow,
  PERSONAL_LIKELIHOOD_BELOW,
} from "../../_shared/core/engines/statement-import-engine.ts";
import { isReceiptCategoryKey } from "../../_shared/core/lib/expense-items.ts";
import {
  STATEMENT_DUPLICATE_NOTE,
  STATEMENT_GST_HST_NOTE,
  businessLikelihoodLabel,
} from "../../_shared/core/tax-copy/statement-import.ts";
import { BUSINESS_EXPENSE_RULE, MEALS_ENTERTAINMENT_RULE, PERSONAL_EXPENSE_RULE } from "../../_shared/core/tax-copy/cra-rules.ts";
import type { RecurringExpense } from "../../_shared/core/types/database.ts";

// Statement imports (Expenses → Imports), the Connector's mirror of Flight
// Crew's Navigator tools (apps/web/lib/ai/statement-import-tools.ts). The
// decisions are statement-import-engine's (which lines are charges already
// on file, what confirming does, the reconciliation lists); the writes that
// must happen together are fn_confirm_statement_lines and
// fn_match_statement_line (migration 00185). The user's own JWT: row level
// security applies. A charge already on file is linked, never added twice.
// GST/HST on a line added from a statement is left empty. Information, not
// advice: estimates are described, the agent decides.

const LINE_COLUMNS =
  "id, statement_id, line_date, description, merchant, amount, direction, source_category, suggested_category_key, category_key, category_source, business_likelihood, likelihood_reason, status, skip_reason, match_receipt_id, match_method, match_confidence, recurring_expense_id, recurring_charge_date, duplicate_candidate_count, hold_reason, related_line_id, related_receipt_id, duplicate_dismissed, expense_deleted_at";
const STATEMENT_COLUMNS = "id, kind, institution, account_label, period_start, period_end, verification, status, line_count, pending_count, confirmed_count, skipped_count, warnings";
const RECEIPT_COLUMNS = "id, vendor, expense_date, total_amount, tax_amount, category_key, receipt_path, source, statement_line_id";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 1000;

interface LineRow {
  id: string;
  statement_id: string;
  line_date: string;
  description: string;
  merchant: string | null;
  amount: number;
  direction: "out" | "in";
  source_category: string | null;
  suggested_category_key: string | null;
  category_key: string | null;
  category_source: string | null;
  business_likelihood: number | null;
  likelihood_reason: string | null;
  status: "pending" | "confirmed" | "skipped";
  skip_reason: string | null;
  match_receipt_id: string | null;
  match_method: "exact" | "window" | "manual" | null;
  match_confidence: number | null;
  recurring_expense_id: string | null;
  recurring_charge_date: string | null;
  duplicate_candidate_count: number;
  hold_reason: string | null;
  related_line_id: string | null;
  related_receipt_id: string | null;
  duplicate_dismissed: boolean;
  expense_deleted_at: string | null;
}

interface StatementRow {
  id: string;
  kind: string;
  institution: string | null;
  account_label: string;
  period_start: string;
  period_end: string;
  verification: string;
  status: string;
  line_count: number;
  pending_count: number;
  confirmed_count: number;
  skipped_count: number;
  warnings: string[];
}

interface ReceiptRow {
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

const REFUSALS: Record<string, string> = {
  not_found: "That line isn't in your imports.",
  not_pending: "That line was already confirmed or skipped.",
  not_a_charge: "That line is money in (a payment, refund or deposit), not an expense.",
  needs_decision: "More than one record on file could be this charge. Match it to one, or mark it as a different charge on Expenses → Imports.",
  needs_category: "That line has no category yet. Choose one to add it.",
  unknown_category: "That category isn't one of your expense items.",
  line_not_found: "That line isn't in your imports.",
  receipt_not_found: "That receipt isn't on file.",
  receipt_linked_elsewhere: "That receipt is already matched to another statement line.",
  counted_by_recurring: "That charge is counted by your Recurring Expenses list. A receipt for it would count it a second time.",
  bulk_expense_deleted: "Its expense was deleted earlier. Confirm it on its own to add it again.",
  bulk_low_likelihood: "It is under 50% business by the estimate. Confirm it on its own, or choose its category on Expenses → Imports first.",
  bulk_unverified_statement: "Its PDF couldn't be checked against the statement's totals. Confirm its lines one at a time.",
};

const HOLDS: Record<string, string> = {
  several: "more than one record on file could be this charge",
  other_import: "could be the same charge as a line in another import of this period",
  near_match: "close to a record on file (a few days off, or the same merchant at a nearby amount)",
  recurring_off_date: "the same amount as a recurring expense charged a few days away",
  refund: "a purchase and its refund: refunds are not added; the purchase can be skipped, or both kept",
  later_receipt: "a receipt saved after this line was confirmed could be the same charge: match_receipt_to_line replaces the statement copy",
  recurring_changed: "the recurring expense it was counted under changed: check it again",
};

const ok = (payload: unknown): McpToolResult => ({ content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] });
const round2 = (n: number) => Math.round(n * 100) / 100;

async function loadStatements(supabase: SupabaseClient, userId: string): Promise<StatementRow[]> {
  const { data, error } = await supabase
    .from("imported_statements")
    .select(STATEMENT_COLUMNS)
    .eq("user_id", userId)
    .order("period_end", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as StatementRow[];
}

/** Every line of these statements, page by page (an export can pass 1,000 lines). */
async function loadLines(supabase: SupabaseClient, userId: string, column: "statement_id" | "id", values: string[]): Promise<LineRow[]> {
  const out: LineRow[] = [];
  for (let i = 0; i < values.length; i += 200) {
    const chunk = values.slice(i, i + 200);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("statement_lines")
        .select(LINE_COLUMNS)
        .eq("user_id", userId)
        .in(column, chunk)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const got = (data ?? []) as LineRow[];
      out.push(...got);
      if (got.length < PAGE) break;
    }
  }
  return out;
}

async function loadLinesBetween(supabase: SupabaseClient, userId: string, from: string, to: string): Promise<LineRow[]> {
  const out: LineRow[] = [];
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await supabase
      .from("statement_lines")
      .select(LINE_COLUMNS)
      .eq("user_id", userId)
      .gte("line_date", from)
      .lte("line_date", to)
      .order("id", { ascending: true })
      .range(start, start + PAGE - 1);
    if (error) throw error;
    const got = (data ?? []) as LineRow[];
    out.push(...got);
    if (got.length < PAGE) break;
  }
  return out;
}

async function loadReceipts(supabase: SupabaseClient, userId: string, from: string, to: string): Promise<ReceiptRow[]> {
  const out: ReceiptRow[] = [];
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await supabase
      .from("receipt_expenses")
      .select(RECEIPT_COLUMNS)
      .eq("user_id", userId)
      .gte("expense_date", from)
      .lte("expense_date", to)
      .order("id", { ascending: true })
      .range(start, start + PAGE - 1);
    if (error) throw error;
    const got = (data ?? []) as ReceiptRow[];
    out.push(...got);
    if (got.length < PAGE) break;
  }
  return out;
}

async function loadRecurring(supabase: SupabaseClient, userId: string): Promise<RecurringExpense[]> {
  const { data, error } = await supabase
    .from("recurring_expenses")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as RecurringExpense[];
}

function lineView(l: LineRow, receipts: Map<string, ReceiptRow>, recurring: Map<string, RecurringExpense>) {
  const category = l.category_key ?? l.suggested_category_key;
  const receipt = l.match_receipt_id ? receipts.get(l.match_receipt_id) : undefined;
  const outcome = confirmationOutcome(l);
  return {
    line_id: l.id,
    statement_id: l.statement_id,
    date: l.line_date,
    merchant: l.merchant ?? l.description,
    description: l.description,
    amount: round2(Number(l.amount)),
    direction: l.direction,
    status: l.status,
    skip_reason: l.skip_reason,
    category_key: category,
    category_chosen_by_agent: l.category_source === "agent",
    business_likelihood: l.business_likelihood,
    business_likelihood_label: businessLikelihoodLabel(l.business_likelihood),
    estimate_reason: l.likelihood_reason,
    already_on_file:
      l.duplicate_dismissed ? null
      : receipt ? { kind: "receipt", receipt_id: receipt.id, vendor: receipt.vendor, amount: receipt.total_amount, date: receipt.expense_date }
      : l.recurring_expense_id ? { kind: "recurring_expense", recurring_expense_id: l.recurring_expense_id, name: recurring.get(l.recurring_expense_id)?.name ?? null, charge_date: l.recurring_charge_date }
      : null,
    held_as_possible_duplicate: !l.duplicate_dismissed && (Boolean(l.hold_reason) || l.duplicate_candidate_count > 1),
    hold: l.duplicate_dismissed || !l.hold_reason ? null : { reason: l.hold_reason, means: HOLDS[l.hold_reason] ?? l.hold_reason, related_line_id: l.related_line_id, related_receipt_id: l.related_receipt_id },
    expense_was_deleted: Boolean(l.expense_deleted_at) && l.status === "pending",
    confirming_would:
      outcome.action === "create" ? "add it to the expense records (GST/HST empty)"
      : outcome.action === "link_receipt" ? "link it to the receipt on file; nothing added"
      : outcome.action === "recurring" ? "mark it as the recurring charge; nothing added"
      : `not add it: ${REFUSALS[outcome.reason] ?? outcome.reason}`,
  };
}

export function getStatementImportTools(supabase: SupabaseClient, userId: string): McpTool[] {
  return [
    // ── list_import_review_lines ─────────────────────────────────────────
    {
      name: "list_import_review_lines",
      description:
        "Lists the bank and credit-card statement lines the agent imported on Expenses → Imports (pending review by default): each line's ID, date, merchant, amount, estimated expense item and business likelihood, whether it matches a receipt or recurring expense already on file, and what confirming it would do. Also returns the imported statements and the two reconciliation lists (confirmed charges with no receipt on file; receipts in an imported period with no statement line). A charge already on file is linked on confirm, never added twice.",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pending", "skipped", "confirmed", "all"], description: "Which lines (default pending)." },
          statement_id: { type: "string", description: "One import only." },
          limit: { type: "number", description: "At most this many lines (default 100, max 500)." },
        },
        additionalProperties: false,
      },
      annotations: { title: "Statement Lines to Review", readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      handler: async (args) => {
        const a = (args ?? {}) as { status?: string; statement_id?: string; limit?: number };
        const status = a.status ?? "pending";
        const limit = Math.min(500, Math.max(1, Math.floor(Number(a.limit ?? 100)) || 100));
        const statements = await loadStatements(supabase, userId);
        const chosen = a.statement_id ? statements.filter((s) => s.id === a.statement_id) : statements;
        const lines = await loadLines(supabase, userId, "statement_id", chosen.map((s) => s.id));
        const window = duplicateSearchWindow(lines);
        const periodFrom = chosen.map((s) => s.period_start).sort()[0];
        const periodTo = chosen.map((s) => s.period_end).sort().reverse()[0];
        const from = [periodFrom, window?.from].filter(Boolean).sort()[0];
        const to = [periodTo, window?.to].filter(Boolean).sort().reverse()[0];
        const [receipts, recurring] = await Promise.all([
          from && to ? loadReceipts(supabase, userId, from, to) : Promise.resolve([] as ReceiptRow[]),
          loadRecurring(supabase, userId),
        ]);
        const receiptById = new Map(receipts.map((r) => [r.id, r]));
        const recurringById = new Map(recurring.map((r) => [r.id, r]));
        const findings = findStatementDuplicates(lines.map((l) => ({ ...l, duplicate_dismissed: false })), receipts, recurring);
        const selected = lines.filter((l) => status === "all" || l.status === status);
        const recon = reconciliationLists(chosen, lines, receipts);
        return ok({
          statements: chosen.map((s) => ({
            statement_id: s.id, account: s.account_label, kind: s.kind, institution: s.institution,
            period_start: s.period_start, period_end: s.period_end,
            checked_against_printed_totals: s.verification,
            to_review: s.pending_count, confirmed: s.confirmed_count, skipped: s.skipped_count, notes: s.warnings,
          })),
          count: selected.length,
          lines: selected.slice(0, limit).map((l) => {
            const view = lineView(l, receiptById, recurringById);
            const f = view.held_as_possible_duplicate ? findings.get(l.id) : undefined;
            return f?.kind === "ambiguous" ? { ...view, could_be: { receipt_ids: f.receiptIds, recurring_expense_ids: f.recurringIds } } : view;
          }),
          reconciliation: {
            charges_with_no_receipt: recon.chargesWithoutReceipt.slice(0, 100).map((c) => ({
              line_id: c.line.id, date: c.line.line_date, merchant: c.line.merchant ?? c.line.description, amount: round2(Number(c.line.amount)),
              expense_id: c.receiptId, reason: c.reason === "statement_copy" ? "added from the statement line" : "the expense has no receipt image or file",
            })),
            receipts_with_no_statement_line: recon.receiptsWithoutLine.slice(0, 100).map((r) => ({
              receipt_id: r.id, date: r.expense_date, vendor: r.vendor, amount: r.total_amount,
            })),
            recurring_charges_confirmed: recon.recurringCharges,
          },
          note: STATEMENT_DUPLICATE_NOTE,
        });
      },
    },

    // ── draft_line_categories ────────────────────────────────────────────
    {
      name: "draft_line_categories",
      description:
        "Drafts an expense item key and business likelihood for statement lines waiting for review: the agent's own choice when set, else the import's estimate (from the merchant name, the bank's labels or Claude). Nothing is saved. Lines with no estimate are listed as such, never guessed. Pass the keys to confirm_import_lines once the agent agrees. Business or personal is the agent's call.",
      inputSchema: {
        type: "object",
        properties: {
          line_ids: { type: "array", items: { type: "string" }, description: "Lines to draft (default: all pending)." },
        },
        additionalProperties: false,
      },
      annotations: { title: "Draft Line Categories", readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      handler: async (args) => {
        const a = (args ?? {}) as { line_ids?: string[] };
        const ids = (a.line_ids ?? []).filter((id) => UUID.test(id)).slice(0, 500);
        const lines = ids.length > 0
          ? await loadLines(supabase, userId, "id", ids)
          : await loadLines(supabase, userId, "statement_id", (await loadStatements(supabase, userId)).map((s) => s.id));
        const pending = lines.filter((l) => l.status === "pending" && l.direction === "out").slice(0, 500);
        return ok({
          saved: false,
          drafts: pending.map((l) => {
            const key = l.category_key ?? l.suggested_category_key;
            return {
              line_id: l.id,
              date: l.line_date,
              merchant: l.merchant ?? l.description,
              amount: round2(Number(l.amount)),
              category_key: key,
              basis: l.category_key ? "the agent's choice" : key ? "the import's estimate" : "no item estimated; the agent picks one or skips the line",
              business_likelihood: l.business_likelihood,
              business_likelihood_label: businessLikelihoodLabel(l.business_likelihood),
              indicated_as_personal: l.business_likelihood != null && l.business_likelihood < PERSONAL_LIKELIHOOD_BELOW,
              left_out_of_a_bulk_confirm: bulkConfirmExclusion(l, null),
              reason: l.likelihood_reason,
            };
          }),
          note: "Estimates from the merchant name. Whether a charge is a business expense is the agent's call.",
          rule: PERSONAL_EXPENSE_RULE,
        });
      },
    },

    // ── explain_import_line ──────────────────────────────────────────────
    {
      name: "explain_import_line",
      description:
        "Explains one imported statement line: its estimate and why, whether it matches a receipt or recurring expense already on file, what confirming it would do to the expense records, why GST/HST is left empty, and the CRA rules that apply. Information only.",
      inputSchema: {
        type: "object",
        properties: { line_id: { type: "string", description: "The statement line ID." } },
        required: ["line_id"],
        additionalProperties: false,
      },
      annotations: { title: "Explain Statement Line", readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      handler: async (args) => {
        const a = (args ?? {}) as { line_id?: string };
        if (!a.line_id || !UUID.test(a.line_id)) throw new Error("line_id must be a statement line ID.");
        const [line] = await loadLines(supabase, userId, "id", [a.line_id]);
        if (!line) return ok({ found: false, message: REFUSALS.line_not_found });
        const [receipts, recurring] = await Promise.all([
          loadReceipts(supabase, userId, line.line_date, line.line_date),
          loadRecurring(supabase, userId),
        ]);
        const view = lineView(line, new Map(receipts.map((r) => [r.id, r])), new Map(recurring.map((r) => [r.id, r])));
        const key = line.category_key ?? line.suggested_category_key ?? "";
        const rules = [BUSINESS_EXPENSE_RULE, PERSONAL_EXPENSE_RULE];
        if (key.startsWith("meals_") || key.startsWith("ent_")) rules.push(MEALS_ENTERTAINMENT_RULE);
        return ok({ found: true, ...view, gst_hst: STATEMENT_GST_HST_NOTE, cra_rules: rules, disclaimer: CANONICAL_TAX_DISCLAIMER });
      },
    },

    // ── match_receipt_to_line ────────────────────────────────────────────
    {
      name: "match_receipt_to_line",
      description:
        "Matches a receipt already on file to an imported card or bank charge: the receipt becomes the record of that charge, so it counts once and keeps the GST/HST printed on it. If the charge had already been added from the statement (the statement copy, no receipt image), that copy is removed. Refused when the receipt is matched to another line, or when the charge is counted by a recurring expense. Only with the agent's go-ahead.",
      inputSchema: {
        type: "object",
        properties: {
          line_id: { type: "string", description: "The statement line ID (list_import_review_lines)." },
          receipt_id: { type: "string", description: "The receipt ID (list_import_review_lines or get_expenses)." },
        },
        required: ["line_id", "receipt_id"],
        additionalProperties: false,
      },
      annotations: { title: "Match Receipt to Statement Line", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      handler: async (args) => {
        const a = (args ?? {}) as { line_id?: string; receipt_id?: string };
        if (!a.line_id || !UUID.test(a.line_id) || !a.receipt_id || !UUID.test(a.receipt_id)) {
          throw new Error("line_id and receipt_id must both be IDs.");
        }
        const { data, error } = await supabase.rpc("fn_match_statement_line", { p_line_id: a.line_id, p_receipt_id: a.receipt_id });
        if (error) throw error;
        const out = (data ?? {}) as { ok?: boolean; reason?: string; replaced_receipt_id?: string | null };
        if (!out.ok) return ok({ matched: false, reason: out.reason, message: REFUSALS[out.reason ?? ""] ?? "Not matched." });
        return ok({ matched: true, line_id: a.line_id, receipt_id: a.receipt_id, statement_copy_removed: Boolean(out.replaced_receipt_id) });
      },
    },

    // ── confirm_import_lines ─────────────────────────────────────────────
    {
      name: "confirm_import_lines",
      description:
        "Confirms imported statement lines into the agent's expense records, each with an expense item key (the line's own estimate when left out), and optionally skips others as not business. Before confirming, every line is checked again against the receipts and recurring expenses on file: a line for a charge already on file is linked, never added a second time, and one that could match more than one record is held. A held line (another import's copy, a near miss, a refund) is refused. Several lines at once leaves out lines whose expense was deleted, lines under 50% business (unless the agent chose the category on Expenses → Imports), and lines from a PDF that couldn't be checked against its totals: confirm those one at a time. GST/HST is left empty on added lines (a statement does not show it), so no input tax credit is counted for them. Only lines the agent has agreed to.",
      inputSchema: {
        type: "object",
        properties: {
          lines: {
            type: "array",
            items: {
              type: "object",
              properties: {
                line_id: { type: "string" },
                category_key: { type: "string", description: "Expense item key, e.g. vehicle_fuel. Optional." },
              },
              required: ["line_id"],
              additionalProperties: false,
            },
            description: "Lines to confirm (at most 500).",
          },
          skip_line_ids: { type: "array", items: { type: "string" }, description: "Lines the agent says are not business." },
        },
        additionalProperties: false,
      },
      annotations: { title: "Confirm Statement Lines", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      handler: async (args) => {
        const a = (args ?? {}) as { lines?: { line_id?: string; category_key?: string }[]; skip_line_ids?: string[] };
        const items = (a.lines ?? []).filter((l) => l.line_id && UUID.test(l.line_id)).slice(0, 500);
        const skips = (a.skip_line_ids ?? []).filter((id) => UUID.test(id)).slice(0, 500);
        const result: Record<string, unknown> = {};

        if (items.length > 0) {
          const refusedEarly: { line_id: string; reason: string; message: string }[] = [];
          // The same key check as the web (isReceiptCategoryKey).
          let send = items.filter((i) => {
            if (i.category_key && !isReceiptCategoryKey(i.category_key)) {
              refusedEarly.push({ line_id: i.line_id!, reason: "unknown_category", message: REFUSALS.unknown_category });
              return false;
            }
            return true;
          });
          const touched = await loadLines(supabase, userId, "id", send.map((i) => i.line_id!));
          const statementIds = [...new Set(touched.map((l) => l.statement_id))];

          // The duplicate check again, on what is on file now: receipts,
          // recurring charges, and every other import's lines around them.
          const own = await loadLines(supabase, userId, "statement_id", statementIds);
          const window = duplicateSearchWindow(own);
          const linesWindow = relatedLinesWindow(own);
          if (window && linesWindow) {
            const [receipts, recurring, around] = await Promise.all([
              loadReceipts(supabase, userId, window.from, window.to),
              loadRecurring(supabase, userId),
              loadLinesBetween(supabase, userId, linesWindow.from, linesWindow.to),
            ]);
            const ownIds = new Set(own.map((l) => l.id));
            const updates = duplicateFlagUpdates([...own, ...around.filter((l) => !ownIds.has(l.id))], receipts, recurring);
            for (let k = 0; k < updates.length; k += 2000) {
              const chunk = updates.slice(k, k + 2000).map((u) => ({ id: u.id, ...u.columns }));
              const { error } = await supabase.rpc("fn_set_statement_line_flags", { p_updates: chunk });
              if (error) throw error;
            }
          }

          // Several at once is a bulk confirm (bulkConfirmExclusion), as on the
          // web, judged after the check: a line that now links is never left out.
          if (send.length > 1) {
            const fresh = await loadLines(supabase, userId, "id", send.map((i) => i.line_id!));
            const { data: stmts, error: stErr } = await supabase
              .from("imported_statements")
              .select("id, verification")
              .eq("user_id", userId)
              .in("id", statementIds);
            if (stErr) throw stErr;
            const verification = new Map(((stmts ?? []) as { id: string; verification: string }[]).map((st) => [st.id, st.verification]));
            const byId = new Map(fresh.map((l) => [l.id, l]));
            send = send.filter((i) => {
              const line = byId.get(i.line_id!);
              const why = line ? bulkConfirmExclusion(line, verification.get(line.statement_id)) : null;
              if (why && why !== "not_confirmable") {
                refusedEarly.push({ line_id: i.line_id!, reason: `bulk_${why}`, message: REFUSALS[`bulk_${why}`] });
                return false;
              }
              return true;
            });
          }

          if (send.length > 0) {
            const { data, error } = await supabase.rpc("fn_confirm_statement_lines", {
              p_lines: send.map((i) => ({ id: i.line_id, category_key: i.category_key ?? null })),
            });
            if (error) throw error;
            const out = (data ?? {}) as { created?: unknown[]; linked?: unknown[]; recurring?: unknown[]; refused?: { id: string; reason: string }[] };
            result.added_to_expenses = out.created?.length ?? 0;
            result.already_on_file_linked = (out.linked?.length ?? 0) + (out.recurring?.length ?? 0);
            refusedEarly.push(...(out.refused ?? []).map((r) => ({ line_id: r.id, reason: r.reason, message: REFUSALS[r.reason] ?? r.reason })));
          } else {
            result.added_to_expenses = 0;
            result.already_on_file_linked = 0;
          }
          result.not_confirmed = refusedEarly;
        }
        if (skips.length > 0) {
          const { data, error } = await supabase
            .from("statement_lines")
            .update({ status: "skipped", skip_reason: "user" })
            .eq("user_id", userId)
            .eq("status", "pending")
            .in("id", skips)
            .select("id");
          if (error) throw error;
          result.skipped = data?.length ?? 0;
        }
        result.gst_hst = STATEMENT_GST_HST_NOTE;
        result.disclaimer = CANONICAL_TAX_DISCLAIMER;
        return ok(result);
      },
    },
  ];
}
