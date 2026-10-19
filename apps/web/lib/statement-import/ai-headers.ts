/**
 * Headers for the statement import's model calls (reading a PDF, estimating
 * categories). Calls go straight to Anthropic; the AI run ledger (00182)
 * records the user, the feature and the token counts from these headers,
 * and keeps no prompt or response text, so a statement's lines stay out of
 * it.
 */
import { aiCallHeaders } from "@/lib/ai/provider";

export function statementAiHeaders(userId: string, feature: "statement-import-pdf" | "statement-import-classify"): Record<string, string> {
  return aiCallHeaders({ userId, feature });
}
