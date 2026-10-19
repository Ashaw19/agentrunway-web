/**
 * The model's estimate for statement lines the rules (classify.ts) could not
 * place. Claude Haiku with strict structured output: the item key is an enum
 * of RECEIPT_CATEGORY_GROUPS' keys, so it can't name a key that doesn't
 * exist. Structured output does not enforce number ranges, so the
 * likelihood is clamped in code, and every index is checked against the
 * batch. A failed call leaves the lines unestimated; it never blocks the
 * import. Nothing here logs a description or an amount.
 */
import { generateObject } from "ai";
import { z } from "zod";
import { validateTaxCopy } from "@agent-runway/core/tax-copy";
import { PERSONAL_LIKELIHOOD_BELOW } from "@agent-runway/core/engines/statement-import-engine";
import { models } from "@/lib/ai/provider";
import { statementAiHeaders } from "./ai-headers";
import { RECEIPT_CATEGORY_GROUPS, RECEIPT_CATEGORY_KEYS, isReceiptCategoryKey, type ReceiptCategoryKey } from "@/lib/types/receipt";
import type { ClassifyInput, LineClassification } from "./classify";

/** Lines per model call. */
export const MODEL_BATCH_SIZE = 100;

const KEY_ENUM = RECEIPT_CATEGORY_KEYS as [ReceiptCategoryKey, ...ReceiptCategoryKey[]];

export const ModelClassificationSchema = z.object({
  lines: z.array(
    z.object({
      index: z.number().int(),
      category_key: z.enum(KEY_ENUM).nullable(),
      business_likelihood: z.number(),
      reason: z.string(),
    }),
  ),
});

export type ModelClassificationOutput = z.infer<typeof ModelClassificationSchema>;

const ITEM_GUIDE = RECEIPT_CATEGORY_GROUPS
  .map((g) => `${g.group}: ${g.items.map((i) => `${i.key} (${i.label})`).join(", ")}`)
  .join("\n");

function buildPrompt(batch: readonly ClassifyInput[]): string {
  const rows = batch
    .map((l, i) => `${i}\t${l.direction === "out" ? "charge" : "credit"}\t${l.amount.toFixed(2)}\t${(l.merchant ?? "").slice(0, 60)}\t${l.description.slice(0, 120)}`)
    .join("\n");
  return [
    "These are lines from a Canadian bank or credit-card statement belonging to a self-employed real estate agent.",
    "For each line, estimate:",
    "- category_key: the expense item it would be filed under, from the list below, or null when no item fits or it is not a business expense (personal spending, transfers, payments).",
    "- business_likelihood: from 0 to 1, how likely the charge is a business expense for a real estate agent, judged from the merchant alone. Groceries, clothing, personal subscriptions and household shopping are low. Board dues, advertising, listing photography, signs, CRM and office software are high. Restaurants and coffee are in between.",
    "- reason: at most 12 words describing what the merchant is. Describe; never tell anyone what to do.",
    "Use each line's index as given. Return one entry per line. Do not add lines.",
    "",
    "Expense items:",
    ITEM_GUIDE,
    "",
    "Lines (index, charge or credit, amount, merchant, description):",
    rows,
  ].join("\n");
}

function cleanReason(reason: string, key: ReceiptCategoryKey | null): string {
  const r = reason.replace(/\s+/g, " ").trim().slice(0, 160);
  const fallback = key ? "Estimated from the merchant name." : "No business category estimated from the merchant name.";
  if (!r) return fallback;
  if (validateTaxCopy(r).some((d) => d.level === "error")) return fallback;
  return /[.!?]$/.test(r) ? r : `${r}.`;
}

/**
 * Turn one model response into classifications, keyed by the index within
 * the batch. Out-of-range or repeated indexes are dropped; keys are checked
 * again; the likelihood is clamped to 0..1.
 */
export function readModelClassifications(output: ModelClassificationOutput, batchSize: number): Map<number, LineClassification> {
  const out = new Map<number, LineClassification>();
  for (const entry of output.lines) {
    if (!Number.isInteger(entry.index) || entry.index < 0 || entry.index >= batchSize || out.has(entry.index)) continue;
    const key = entry.category_key && isReceiptCategoryKey(entry.category_key) ? entry.category_key : null;
    const raw = Number(entry.business_likelihood);
    const likelihood = Number.isFinite(raw) ? Math.round(Math.min(1, Math.max(0, raw)) * 100) / 100 : null;
    const personal = likelihood !== null && likelihood < PERSONAL_LIKELIHOOD_BELOW;
    out.set(entry.index, {
      suggestedCategoryKey: key,
      categorySource: key ? "model" : null,
      businessLikelihood: likelihood,
      likelihoodReason: cleanReason(entry.reason, key),
      status: personal ? "skipped" : "pending",
      skipReason: personal ? "personal" : null,
    });
  }
  return out;
}

/**
 * Estimates for `lines` (the ones the rules left), in order; null where the
 * model gave none. Returns all nulls with no AI key or on any failure.
 */
export async function classifyWithModel(
  lines: readonly ClassifyInput[],
  userId: string,
): Promise<(LineClassification | null)[]> {
  const results: (LineClassification | null)[] = lines.map(() => null);
  if (lines.length === 0 || !process.env.ANTHROPIC_API_KEY) return results;

  for (let start = 0; start < lines.length; start += MODEL_BATCH_SIZE) {
    const batch = lines.slice(start, start + MODEL_BATCH_SIZE);
    try {
      const { object } = await generateObject({
        model: models.fast,
        schema: ModelClassificationSchema,
        prompt: buildPrompt(batch),
        temperature: 0,
        maxOutputTokens: 8000,
        headers: statementAiHeaders(userId, "statement-import-classify"),
        providerOptions: { anthropic: { structuredOutputMode: "outputFormat" } },
      });
      for (const [i, c] of readModelClassifications(object, batch.length)) results[start + i] = c;
    } catch (err) {
      // Status only: never the lines.
      const status = (err as { statusCode?: number; status?: number })?.statusCode ?? (err as { status?: number })?.status;
      console.warn(`[statement-import] classification batch failed (status ${status ?? "n/a"}, ${batch.length} lines)`);
    }
  }
  return results;
}
