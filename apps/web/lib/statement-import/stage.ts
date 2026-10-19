/**
 * Parsed statement lines → statement_lines rows: a fingerprint per line, the
 * category and likelihood estimate, and the duplicate check against what is
 * already on file. Pure apart from hashing; the upload route writes the rows.
 */
import { createHash, randomUUID } from "node:crypto";
import {
  duplicateColumns,
  findStatementDuplicates,
  type ReceiptForMatch,
  type StatementLineForMatch,
} from "@agent-runway/core/engines/statement-import-engine";
import type { RecurringExpense } from "@agent-runway/core/types/database";
import type { ParsedStatementLine } from "@/lib/import/bank-csv/parse";
import type { LineClassification } from "./classify";

/** Lower-case letters and digits only, for comparing descriptions. */
export function normalizeDescription(description: string): string {
  return description.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}

/** The account part of a fingerprint: the label, letters and digits only. */
export function accountKey(accountLabel: string): string {
  return normalizeDescription(accountLabel) || "account";
}

/**
 * One fingerprint per line: SHA-256 of account, date, amount in cents,
 * direction, description, and how many identical lines came before it in
 * the file (two $2.15 coffees on one day are two lines). The same charge in
 * the same file, or in an overlapping export of the same account, always
 * gets the same fingerprint, so importing it again never stages it twice.
 */
export function fingerprintLines(lines: readonly ParsedStatementLine[], accountLabel: string): string[] {
  const account = accountKey(accountLabel);
  const seen = new Map<string, number>();
  return lines.map((l) => {
    const base = `${account}|${l.date}|${Math.round(l.amount * 100)}|${l.direction}|${normalizeDescription(l.description)}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return createHash("sha256").update(`${base}|${n}`).digest("hex");
  });
}

/** SHA-256 of a file's bytes, hex. */
export function fileHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export interface StatementLineInsert {
  id: string;
  user_id: string;
  statement_id: string;
  line_date: string;
  posted_date: string | null;
  description: string;
  merchant: string | null;
  amount: number;
  direction: "out" | "in";
  fingerprint: string;
  source_category: string | null;
  suggested_category_key: string | null;
  category_source: string | null;
  business_likelihood: number | null;
  likelihood_reason: string | null;
  status: "pending" | "skipped";
  skip_reason: string | null;
  match_receipt_id: string | null;
  match_method: string | null;
  match_confidence: number | null;
  recurring_expense_id: string | null;
  recurring_charge_date: string | null;
  duplicate_candidate_count: number;
  hold_reason: string | null;
  related_line_id: string | null;
  related_receipt_id: string | null;
}

export interface BuildRowsInput {
  userId: string;
  statementId: string;
  lines: readonly ParsedStatementLine[];
  fingerprints: readonly string[];
  classifications: readonly LineClassification[];
  /** The agent's receipts around the lines' dates (with statement_line_id). */
  receipts: readonly ReceiptForMatch[];
  /** The agent's active recurring expenses. */
  recurring: readonly RecurringExpense[];
  /**
   * Lines already staged around these dates, in any import (loaded with
   * relatedLinesWindow): another export of the same month, a purchase a
   * refund belongs to.
   */
  existingLines?: readonly StatementLineForMatch[];
  /** Ids, for tests; random otherwise. */
  newId?: () => string;
}

/**
 * The rows to stage. Every money-out line is checked for a duplicate,
 * including those that start out skipped: a receipt on file for a
 * personal-looking charge says it was a business one, so that line goes to
 * review instead (and is linked when confirmed, never added twice).
 */
export function buildLineRows(input: BuildRowsInput): StatementLineInsert[] {
  const newId = input.newId ?? randomUUID;
  const ids = input.lines.map(() => newId());
  const findings = findStatementDuplicates(
    [
      ...input.lines.map((l, i) => ({
        id: ids[i],
        statement_id: input.statementId,
        line_date: l.date,
        amount: l.amount,
        direction: l.direction,
        status: "pending" as const,
        description: l.description,
        merchant: l.merchant,
      })),
      ...(input.existingLines ?? []),
    ],
    input.receipts,
    input.recurring,
  );

  return input.lines.map((l, i) => {
    const c = input.classifications[i];
    const finding = findings.get(ids[i]);
    const dup = duplicateColumns(finding);
    const onFile = finding?.kind === "receipt" || finding?.kind === "recurring";
    const refund = finding?.kind === "ambiguous" && finding.reason === "refund";
    // A personal-looking charge with a receipt on file, and a refund of a
    // charge on file, go to review instead of starting skipped.
    const reopen = (onFile && c.status === "skipped" && c.skipReason === "personal") || (refund && c.status === "skipped");
    return {
      id: ids[i],
      user_id: input.userId,
      statement_id: input.statementId,
      line_date: l.date,
      posted_date: l.postedDate,
      description: l.description,
      merchant: l.merchant,
      amount: l.amount,
      direction: l.direction,
      fingerprint: input.fingerprints[i],
      source_category: l.sourceCategory,
      suggested_category_key: c.suggestedCategoryKey,
      category_source: c.categorySource,
      business_likelihood: c.businessLikelihood,
      likelihood_reason: !reopen
        ? c.likelihoodReason
        : refund
          ? "A refund of a charge in your imports. Refunds are not added; the charge it returns can be skipped, or both kept."
          : "A receipt or recurring expense on file matches this charge.",
      status: reopen ? "pending" : c.status,
      skip_reason: reopen ? null : c.skipReason,
      ...dup,
    };
  });
}
