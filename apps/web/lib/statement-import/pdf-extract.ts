/**
 * A PDF bank or card statement read by Claude, with the document passed as
 * a native PDF (the import-history route's path: `type: "file"`,
 * application/pdf), and strict structured output. The values are then
 * checked in code (validate-extraction.ts): Haiku first; when its lines
 * don't add up to the statement's printed totals, or it fails, Sonnet reads
 * the same PDF once, and the attempt that reconciles (or keeps more lines
 * with fewer problems) is used.
 *
 * The PDF holds the account number and the agent's name and address. The
 * model is told not to return them, and every description is scrubbed in
 * code regardless. The file is not stored. Nothing here logs a description
 * or an amount.
 */
import { generateObject } from "ai";
import { z } from "zod";
import { models } from "@/lib/ai/provider";
import { statementAiHeaders } from "./ai-headers";
import type { StatementKind } from "@/lib/import/bank-csv/parse";
import {
  MISMATCH_WARNING_START,
  UNVERIFIED_WARNING,
  validatePdfExtraction,
  type ExtractedPdfStatement,
  type ValidatedPdfStatement,
} from "./validate-extraction";

export const PdfStatementSchema = z.object({
  institution: z.string().nullable(),
  kind: z.enum(["bank", "credit_card"]).nullable(),
  period_start: z.string().nullable(),
  period_end: z.string().nullable(),
  currency: z.string().nullable(),
  opening_balance: z.number().nullable(),
  closing_balance: z.number().nullable(),
  total_out: z.number().nullable(),
  total_in: z.number().nullable(),
  lines: z.array(
    z.object({
      date: z.string(),
      posted_date: z.string().nullable(),
      description: z.string(),
      amount: z.number(),
      direction: z.enum(["out", "in"]),
    }),
  ),
});

export const PDF_STATEMENT_PROMPT = `This PDF is a Canadian bank account or credit card statement. Read its transaction list.

Return:
- institution: the bank or card issuer's name (e.g. "RBC", "TD", "American Express"), or null.
- kind: "bank" for a chequing or savings account, "credit_card" for a card, or null.
- period_start and period_end: the statement period as YYYY-MM-DD, or null if not printed.
- currency: the statement's currency as printed (e.g. "CAD").
- opening_balance and closing_balance: the previous and new balance as printed, positive numbers, or null.
- total_out: the printed total of purchases, charges, withdrawals and fees for the period; total_in: the printed total of payments, credits, refunds and deposits. Null when not printed. Do not add them up yourself.
- lines: every transaction in the transaction list, in the order printed, each with:
  - date: the transaction date as YYYY-MM-DD. When the statement prints only month and day, take the year from the statement period (a December line on a statement ending in January is the earlier year).
  - posted_date: the posting date as YYYY-MM-DD when a separate one is printed, else null.
  - description: the merchant or description exactly as printed.
  - amount: the amount as a positive number.
  - direction: "out" for money leaving the account or added to a card balance (purchases, withdrawals, fees, interest charged); "in" for money coming in or reducing a card balance (payments, refunds, credits, deposits).

Rules:
- Copy only what is printed. Never invent, estimate, merge or split lines. If a value is unreadable, leave that line out.
- Do not include balance lines, subtotals, totals, interest-rate tables, rewards summaries or minimum-payment notices as lines.
- Leave out account numbers, card numbers and the cardholder's name and address everywhere, including in descriptions.
- Amounts in Canadian dollars only. For a foreign purchase, use the Canadian-dollar amount charged.
- If the document is not a bank or credit card statement, return an empty lines list.`;

async function readOnce(
  model: typeof models.fast,
  pdfBase64: string,
  userId: string,
): Promise<ExtractedPdfStatement> {
  const { object } = await generateObject({
    model,
    schema: PdfStatementSchema,
    messages: [
      {
        role: "user",
        content: [
          { type: "file", data: `data:application/pdf;base64,${pdfBase64}`, mediaType: "application/pdf" },
          { type: "text", text: PDF_STATEMENT_PROMPT },
        ],
      },
    ],
    temperature: 0,
    maxOutputTokens: 32000,
    headers: statementAiHeaders(userId, "statement-import-pdf"),
    providerOptions: { anthropic: { structuredOutputMode: "outputFormat" } },
  });
  return object as ExtractedPdfStatement;
}

/**
 * Which of two checked readings to keep: one that reconciles with the
 * printed totals, else one that works with more lines and fewer problems.
 * A mismatch found by either reading is never dropped: if the kept reading
 * didn't reconcile and the other one found the totals and a mismatch, the
 * kept one is marked a mismatch too, with that warning and those totals.
 */
export function betterReading(a: ValidatedPdfStatement | null, b: ValidatedPdfStatement | null): ValidatedPdfStatement | null {
  if (!a) return b;
  if (!b) return a;
  let best: ValidatedPdfStatement;
  let other: ValidatedPdfStatement;
  if (a.ok !== b.ok) [best, other] = a.ok ? [a, b] : [b, a];
  else if ((a.verification === "reconciled") !== (b.verification === "reconciled")) [best, other] = a.verification === "reconciled" ? [a, b] : [b, a];
  else if (a.warnings.length !== b.warnings.length) [best, other] = a.warnings.length < b.warnings.length ? [a, b] : [b, a];
  else [best, other] = a.lines.length >= b.lines.length ? [a, b] : [b, a];

  if (best.ok && best.verification !== "reconciled" && other.verification === "mismatch" && best.verification !== "mismatch") {
    const carried = other.warnings.filter((w) => w.startsWith(MISMATCH_WARNING_START));
    return {
      ...best,
      verification: "mismatch",
      reconciled: false,
      warnings: [...best.warnings.filter((w) => w !== UNVERIFIED_WARNING), ...carried],
      statedTotalOut: best.statedTotalOut ?? other.statedTotalOut,
      statedTotalIn: best.statedTotalIn ?? other.statedTotalIn,
      openingBalance: best.openingBalance ?? other.openingBalance,
      closingBalance: best.closingBalance ?? other.closingBalance,
    };
  }
  return best;
}

export async function extractPdfStatement(
  pdfBase64: string,
  userId: string,
  todayISO: string,
  kindHint: StatementKind | null,
): Promise<ValidatedPdfStatement> {
  let first: ValidatedPdfStatement | null = null;
  try {
    first = validatePdfExtraction(await readOnce(models.fast, pdfBase64, userId), todayISO, kindHint);
    if (first.ok && first.verification === "reconciled") return first;
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode;
    console.warn(`[statement-import] PDF read (fast) failed, status ${status ?? "n/a"}`);
  }
  let second: ValidatedPdfStatement | null = null;
  try {
    second = validatePdfExtraction(await readOnce(models.default, pdfBase64, userId), todayISO, kindHint);
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode;
    console.warn(`[statement-import] PDF read (default) failed, status ${status ?? "n/a"}`);
  }
  const best = betterReading(first, second);
  if (best) return best;
  return {
    ok: false,
    error: "The PDF could not be read right now. Try again in a moment, or upload the CSV export from the bank's website.",
    institution: null, kind: null, periodStart: null, periodEnd: null, lines: [], warnings: [], reconciled: null, verification: "unverified",
    statedTotalOut: null, statedTotalIn: null, openingBalance: null, closingBalance: null,
  };
}
