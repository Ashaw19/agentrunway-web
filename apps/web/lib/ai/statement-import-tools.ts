/**
 * Flight Crew (Navigator) tools for bank and credit-card statement imports
 * (Expenses → Imports). Spread into createAgentTools in tools.ts; Navigator
 * gets all five (createPersonaAgentTools).
 *
 *   listImportReviewLines   read   lines waiting for review, with estimates and duplicate flags
 *   draftLineCategories     read   a category and business likelihood for pending lines
 *   explainImportLine       read   why a line got its estimate, and what confirming it does
 *   matchReceiptToLine      write  a receipt on file is this card charge (approval card)
 *   confirmImportLines      write  add lines to the expense records, skip others (approval card)
 *
 * Information, not advice: estimates are described, never recommended; the
 * agent decides. A line for a charge already on file is linked, never added
 * twice (statement-import-engine, fn_confirm_statement_lines). GST/HST on an
 * added line is left empty: a statement does not show it.
 *
 * Tool results never echo more than the line's own merchant, date and amount.
 */
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  bulkConfirmExclusion,
  confirmationOutcome,
  findStatementDuplicates,
  PERSONAL_LIKELIHOOD_BELOW,
} from "@agent-runway/core/engines/statement-import-engine";
import {
  BUSINESS_EXPENSE_RULE,
  CANONICAL_TAX_DISCLAIMER,
  MEALS_ENTERTAINMENT_RULE,
  PERSONAL_EXPENSE_RULE,
  STATEMENT_DUPLICATE_NOTE,
  STATEMENT_GST_HST_NOTE,
  businessLikelihoodLabel,
} from "@agent-runway/core/tax-copy";
import { classifyByRules } from "@/lib/statement-import/classify";
import {
  REFUSAL_COPY,
  confirmStatementLines,
  loadActiveRecurring,
  loadLinesById,
  loadReceiptsBetween,
  loadStatementReview,
  matchReceiptToLine as matchReceiptToLineWrite,
  skipStatementLines,
  type StatementLineRow,
} from "@/lib/statement-import/server";
import { RECEIPT_CATEGORY_KEYS, receiptCategoryFullLabel } from "@/lib/types/receipt";

export const STATEMENT_IMPORT_APPROVAL_TOOLS = ["confirmImportLines", "matchReceiptToLine"] as const;

export const STATEMENT_IMPORT_APPROVAL_DESCRIPTIONS: Record<string, (args: Record<string, unknown>) => string> = {
  confirmImportLines: (args) => {
    const n = Array.isArray(args.lines) ? args.lines.length : 0;
    const k = Array.isArray(args.skipLineIds) ? args.skipLineIds.length : 0;
    const parts: string[] = [];
    if (n > 0) parts.push(`Confirm ${n} statement line${n === 1 ? "" : "s"} into your expenses (a line already on file is linked, not added again; GST/HST is left empty)`);
    if (k > 0) parts.push(`skip ${k} line${k === 1 ? "" : "s"} as not business`);
    return parts.join(", and ") || "Confirm statement lines";
  },
  matchReceiptToLine: (args) =>
    `Match ${args.receiptDescription ?? "the receipt"} to the card charge ${args.lineDescription ?? ""}. The charge then counts once, as that receipt.`.replace(/\s+\./, "."),
};

const money = (n: number | string | null | undefined) => `$${Number(n ?? 0).toFixed(2)}`;
const KEYS = RECEIPT_CATEGORY_KEYS as [string, ...string[]];

function lineLabel(l: Pick<StatementLineRow, "merchant" | "description" | "line_date" | "amount" | "direction">): string {
  return `${l.merchant || l.description} on ${l.line_date}, ${money(l.amount)}${l.direction === "in" ? " (money in)" : ""}`;
}

function categoryOf(l: StatementLineRow): string | null {
  return l.category_key ?? l.suggested_category_key ?? null;
}

function duplicateNote(l: StatementLineRow, receiptName: (id: string) => string, recurringName: (id: string) => string): string | null {
  if (l.duplicate_dismissed) return "marked as a different charge from the one on file";
  if (l.match_receipt_id) return `already on file: ${receiptName(l.match_receipt_id)}${l.match_method === "window" ? " (dated within 2 days)" : ""}`;
  if (l.recurring_expense_id) return `a charge from the Recurring Expenses list (${recurringName(l.recurring_expense_id)}, ${l.recurring_charge_date})`;
  switch (l.hold_reason) {
    case "other_import": return "held: could be the same charge as a line in another import of this period";
    case "near_match": return `held: close to a record on file${l.related_receipt_id ? ` (${receiptName(l.related_receipt_id)})` : ""} (a few days off, or the same merchant at a nearby amount)`;
    case "recurring_off_date": return "held: the same amount as a recurring expense charged a few days away";
    case "refund": return l.direction === "in" ? "a refund of a charge in the imports: refunds are not added; the charge it returns can be skipped" : "held: refunded later in the imports";
    case "recurring_changed": return "held: the recurring expense it was counted under changed";
    case "later_receipt": return `confirmed, and a receipt saved later could be the same charge (${l.related_receipt_id ? receiptName(l.related_receipt_id) : "a receipt"}): matchReceiptToLine replaces the statement copy`;
  }
  if (l.duplicate_candidate_count > 1) return "held: could be a charge already on file (more than one record fits)";
  return null;
}

export function createStatementImportTools(supabase: SupabaseClient, userId: string): ToolSet {
  return {
    listImportReviewLines: tool({
      description:
        "List bank and credit-card statement lines the agent imported on Expenses → Imports: the lines waiting for review by default, with each line's ID, merchant, date, amount, estimated category and business likelihood, and whether it matches a receipt or a recurring expense already on file. Also returns how many confirmed charges have no receipt on file and how many receipts have no statement line. Use before draftLineCategories, explainImportLine, matchReceiptToLine or confirmImportLines.",
      inputSchema: z.object({
        status: z.enum(["pending", "skipped", "confirmed", "all"]).default("pending").describe("Which lines; pending (waiting for review) by default"),
        statementId: z.string().uuid().optional().describe("One import only"),
        limit: z.number().int().min(1).max(200).default(60),
      }),
      execute: async ({ status, statementId, limit }) => {
        try {
          const review = await loadStatementReview(supabase, userId, statementId ? [statementId] : null);
          if (review.statements.length === 0) return "No statements imported yet. The agent can upload a bank or card statement (CSV, Excel or PDF) on Expenses → Imports.";
          const receiptById = new Map(review.receipts.map((r) => [r.id, r]));
          const recurringById = new Map(review.recurring.map((r) => [r.id, r]));
          const receiptName = (id: string) => {
            const r = receiptById.get(id);
            return r ? `${r.vendor ?? "receipt"} ${money(r.total_amount)} on ${r.expense_date ?? "no date"} (receipt ID ${r.id})` : `receipt ID ${id}`;
          };
          const recurringName = (id: string) => recurringById.get(id)?.name ?? "recurring expense";

          // Held lines: name the records that could be the charge.
          const held = review.lines.filter((l) => l.status === "pending" && (l.hold_reason || l.duplicate_candidate_count > 1) && !l.duplicate_dismissed);
          const heldCandidates = new Map<string, string[]>();
          if (held.length > 0) {
            const lines = review.lines.map((l) => ({ ...l, duplicate_dismissed: false }));
            const findings = findStatementDuplicates(lines, review.receipts, await loadActiveRecurring(supabase, userId));
            for (const h of held) {
              const f = findings.get(h.id);
              if (f?.kind === "ambiguous") heldCandidates.set(h.id, [...f.receiptIds.map(receiptName), ...f.recurringIds.map((id) => `recurring: ${recurringName(id)}`)]);
            }
          }

          const chosen = review.lines.filter((l) => status === "all" || l.status === status);
          const checked: Record<string, string> = {
            reconciled: "; PDF checked against its printed totals",
            mismatch: "; PDF lines don't add up to its printed totals: its lines are confirmed one at a time",
            unverified: "; PDF with no totals to check against: its lines are confirmed one at a time",
          };
          const header = review.statements.slice(0, 6).map((s) =>
            `• ${s.account_label} (${s.kind === "credit_card" ? "credit card" : "bank"}), ${s.period_start} to ${s.period_end}: ${s.pending_count} to review, ${s.confirmed_count} confirmed, ${s.skipped_count} skipped${checked[s.verification] ?? ""} (statement ID ${s.id})`,
          );
          const rows = chosen.slice(0, limit).map((l) => {
            const cat = categoryOf(l);
            const dup = duplicateNote(l, receiptName, recurringName);
            const candidates = heldCandidates.get(l.id);
            return [
              `- ${lineLabel(l)} [${l.status}${l.skip_reason ? `: ${l.skip_reason}` : ""}] line ID ${l.id}`,
              `  estimate: ${cat ? receiptCategoryFullLabel(cat) : "no category"}, ${businessLikelihoodLabel(l.business_likelihood)}${l.likelihood_reason ? `. ${l.likelihood_reason}` : ""}`,
              dup ? `  ${dup}` : null,
              candidates?.length ? `  could be: ${candidates.join("; ")}` : null,
              l.expense_deleted_at ? "  its expense was deleted, so it is back in review" : null,
            ].filter(Boolean).join("\n");
          });
          const recon = review.reconciliation;
          return [
            "Imported statements:",
            ...header,
            "",
            `${chosen.length} ${status === "all" ? "" : status + " "}line${chosen.length === 1 ? "" : "s"}${chosen.length > limit ? ` (showing ${limit})` : ""}:`,
            ...(rows.length ? rows : ["(none)"]),
            "",
            `Reconciliation: ${recon.chargesWithoutReceipt.length} confirmed charge${recon.chargesWithoutReceipt.length === 1 ? "" : "s"} with no receipt on file; ${recon.receiptsWithoutLine.length} receipt${recon.receiptsWithoutLine.length === 1 ? "" : "s"} in these periods with no statement line (paid another way, or on a statement not imported yet).`,
            STATEMENT_DUPLICATE_NOTE,
          ].join("\n");
        } catch {
          return "Couldn't load the imported statements right now.";
        }
      },
    }),

    draftLineCategories: tool({
      description:
        "Draft a category (an expense item key from the receipt form's list) and a business likelihood for statement lines waiting for review: the agent's own choice if set, the import's estimate, or a fresh estimate from the merchant name. Drafts only; nothing is saved. Lines with no fitting item are listed as such, never guessed. Pass the drafted keys to confirmImportLines once the agent agrees.",
      inputSchema: z.object({
        lineIds: z.array(z.string().uuid()).max(200).optional().describe("Lines to draft; all pending lines when left out"),
      }),
      execute: async ({ lineIds }) => {
        try {
          const lines = lineIds?.length
            ? await loadLinesById(supabase, userId, lineIds)
            : (await loadStatementReview(supabase, userId)).lines;
          const pending = lines.filter((l) => l.status === "pending" && l.direction === "out").slice(0, 200);
          if (pending.length === 0) return "No statement lines are waiting for review.";
          const drafts = pending.map((l) => {
            let key = categoryOf(l);
            let likelihood = l.business_likelihood;
            let basis = l.category_key ? "the agent's choice" : l.suggested_category_key ? "the import's estimate" : "";
            if (!key) {
              const fresh = classifyByRules({
                description: l.description, merchant: l.merchant, amount: Number(l.amount), direction: l.direction,
                sourceCategory: l.source_category, sourceBusiness: null,
              });
              if (fresh?.suggestedCategoryKey) {
                key = fresh.suggestedCategoryKey;
                likelihood = fresh.businessLikelihood;
                basis = "estimated from the merchant name";
              }
            }
            const outcome = confirmationOutcome(l, key);
            const bulk = bulkConfirmExclusion(l, null);
            const bulkNote = bulk === "expense_deleted" ? "; its expense was deleted earlier, so it is confirmed only on its own"
              : bulk === "low_likelihood" ? "; under 50% business, so a confirm of several lines leaves it out"
              : "";
            const when = outcome.action === "link_receipt" ? "already on file: confirming links it, nothing added"
              : outcome.action === "recurring" ? "a recurring charge: confirming adds nothing"
              : outcome.action === "refuse" && outcome.reason === "needs_decision" ? "held: could be a charge already on file"
              : null;
            return `- ${lineLabel(l)} (line ID ${l.id}): ${key ? `${key} = ${receiptCategoryFullLabel(key)}` : "no item fits; the agent picks one or skips it"}, ${businessLikelihoodLabel(likelihood)}${basis ? ` (${basis})` : ""}${likelihood != null && likelihood < PERSONAL_LIKELIHOOD_BELOW ? "; indicated as personal" : ""}${when ? `; ${when}` : ""}${bulkNote}`;
          });
          return [
            `Drafted categories for ${pending.length} line${pending.length === 1 ? "" : "s"} (nothing saved):`,
            ...drafts,
            "",
            "These are estimates from the merchant name. Whether a charge is a business expense is the agent's call.",
            PERSONAL_EXPENSE_RULE,
          ].join("\n");
        } catch {
          return "Couldn't draft categories right now.";
        }
      },
    }),

    explainImportLine: tool({
      description:
        "Explain one imported statement line: what the estimate is and why, whether it matches a receipt or recurring expense already on file, what confirming it would do to the expense records, and the CRA rules that apply. Information only.",
      inputSchema: z.object({ lineId: z.string().uuid() }),
      execute: async ({ lineId }) => {
        try {
          const [line] = await loadLinesById(supabase, userId, [lineId]);
          if (!line) return "That line isn't in the agent's imports.";
          const [receipts, recurring] = await Promise.all([
            loadReceiptsBetween(supabase, userId, line.line_date, line.line_date).catch(() => []),
            loadActiveRecurring(supabase, userId).catch(() => []),
          ]);
          const matched = line.match_receipt_id
            ? (receipts.find((r) => r.id === line.match_receipt_id) ?? null)
            : null;
          const cat = categoryOf(line);
          const outcome = confirmationOutcome(line);
          const recurringName = recurring.find((r) => r.id === line.recurring_expense_id)?.name;
          const doing =
            outcome.action === "create" ? `Confirming adds it to the expense records as ${receiptCategoryFullLabel(outcome.categoryKey)}, ${money(line.amount)} on ${line.line_date}, with GST/HST empty.`
            : outcome.action === "link_receipt" ? `It is already on file${matched ? ` as ${matched.vendor ?? "a receipt"} (${money(matched.total_amount)} on ${matched.expense_date})` : ""}. Confirming links the two; nothing is added.`
            : outcome.action === "recurring" ? `It is a charge from the Recurring Expenses list${recurringName ? ` (${recurringName})` : ""}, which already counts it on its date. Confirming adds nothing.`
            : `Confirming it now would not add it: ${REFUSAL_COPY[outcome.reason]}`;
          const rules = [BUSINESS_EXPENSE_RULE, PERSONAL_EXPENSE_RULE];
          if (cat && (cat.startsWith("meals_") || cat.startsWith("ent_"))) rules.push(MEALS_ENTERTAINMENT_RULE);
          return [
            `${lineLabel(line)}. Status: ${line.status}${line.skip_reason ? ` (${line.skip_reason})` : ""}.`,
            `As printed: ${line.description}.`,
            `Estimate: ${cat ? receiptCategoryFullLabel(cat) : "no category"}, ${businessLikelihoodLabel(line.business_likelihood)}.${line.likelihood_reason ? ` ${line.likelihood_reason}` : ""}${line.category_source === "agent" ? " The agent chose this category." : ""}`,
            doing,
            STATEMENT_GST_HST_NOTE,
            ...rules,
            CANONICAL_TAX_DISCLAIMER,
          ].join("\n");
        } catch {
          return "Couldn't explain that line right now.";
        }
      },
    }),

    matchReceiptToLine: tool({
      description:
        "Match a receipt already on file (from searchExpenses or listImportReviewLines) to an imported card or bank charge: the receipt becomes the record of that charge, so it counts once and keeps the GST/HST printed on it. If the charge had already been added from the statement, that copy is removed. Gated by the approval card.",
      inputSchema: z.object({
        lineId: z.string().uuid(),
        receiptId: z.string().uuid(),
        lineDescription: z.string().describe("The charge, for the approval card (e.g. 'Shell on 2026-09-10, $54.20')"),
        receiptDescription: z.string().describe("The receipt, for the approval card (e.g. 'the Shell receipt of $54.20')"),
      }),
      needsApproval: true,
      execute: async ({ lineId, receiptId, lineDescription, receiptDescription }) => {
        try {
          const result = await matchReceiptToLineWrite(supabase, lineId, receiptId);
          if (!result.ok) return `Not matched: ${REFUSAL_COPY[result.reason]}`;
          return `✓ Matched ${receiptDescription} to ${lineDescription}. The charge counts once, as that receipt${result.replacedReceiptId ? "; the copy added from the statement was removed" : ""}.`;
        } catch {
          return "Couldn't match them right now. Nothing was changed.";
        }
      },
    }),

    confirmImportLines: tool({
      description:
        "Confirm imported statement lines into the agent's expense records, each with an expense item key (from draftLineCategories, or the line's own estimate when left out), and optionally skip others as not business. A line for a charge already on file (a receipt or a recurring expense) is linked, never added a second time; a held line (another import's copy, a near miss, a refund) is refused. Several lines at once leaves out lines whose expense was deleted, lines under 50% business (unless the agent chose the category on the Imports tab), and lines from a PDF that didn't check out: confirm those one at a time. GST/HST is left empty on added lines (a statement does not show it). Only lines the agent has agreed to. Gated by the approval card.",
      inputSchema: z.object({
        lines: z.array(z.object({
          lineId: z.string().uuid(),
          categoryKey: z.enum(KEYS).optional().describe("Expense item key; the line's estimate when left out"),
        })).max(200).default([]),
        skipLineIds: z.array(z.string().uuid()).max(200).optional().describe("Lines the agent says are not business"),
      }),
      needsApproval: true,
      execute: async ({ lines, skipLineIds }) => {
        try {
          const parts: string[] = [];
          if (lines.length > 0) {
            const result = await confirmStatementLines(supabase, userId, lines.map((l) => ({ id: l.lineId, categoryKey: l.categoryKey ?? null })));
            parts.push(`✓ ${result.created.length} added to the expense records, ${result.linked.length + result.recurring.length} already on file and linked (not added again).`);
            if (result.refused.length > 0) {
              parts.push(`${result.refused.length} not confirmed:`);
              for (const r of result.refused.slice(0, 20)) parts.push(`- line ${r.id}: ${REFUSAL_COPY[r.reason]}`);
            }
          }
          if (skipLineIds?.length) {
            const n = await skipStatementLines(supabase, userId, skipLineIds);
            parts.push(`${n} line${n === 1 ? "" : "s"} skipped as not business.`);
          }
          if (parts.length === 0) return "No lines were given, so nothing changed.";
          parts.push("Expense totals, the T2125 lines and the GST/HST helper include the added lines. GST/HST on them is empty: a statement does not show it, so no input tax credit is counted for them.");
          return parts.join("\n");
        } catch {
          return "Couldn't confirm those lines right now. Nothing was added.";
        }
      },
    }),
  };
}
