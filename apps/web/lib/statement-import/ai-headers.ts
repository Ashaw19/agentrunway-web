/**
 * Headers for the statement import's model calls (reading a PDF, estimating
 * categories). A statement is personal spending: while the Helicone proxy is
 * on (HELICONE_API_KEY set), Helicone is told to keep no copy of the request
 * or the response, only the per-user cost attribution. PR #362 removes the
 * proxy, and calls then go straight to Anthropic; this file is the one place
 * to update when it lands (heliconeHeaders becomes aiCallHeaders, and the
 * omit headers go).
 */
import { heliconeHeaders } from "@/lib/ai/provider";

export function statementAiHeaders(userId: string, feature: "statement-import-pdf" | "statement-import-classify"): Record<string, string> {
  return {
    ...heliconeHeaders({ userId, feature }),
    ...(process.env.HELICONE_API_KEY ? { "Helicone-Omit-Request": "true", "Helicone-Omit-Response": "true" } : {}),
  };
}
