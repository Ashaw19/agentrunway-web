/**
 * A note to proposed writes, on the server: the one path behind
 * /api/voice-extract (iPhone and web voice buttons, and the MCP capture_note
 * tool, which calls that route) and Flight Crew's captureNote tool.
 *
 *   extractCapture   the model reads the note (Haiku, lib/voice/extract-prompt.ts),
 *                    core checks its reply (parseCaptureExtraction)
 *   proposeCapture   + client and deal name search, Atlantic dates
 *                    (core resolveCapture) → CaptureProposal
 *
 * Nothing here writes. The writes are made after the agent confirms, through
 * core record-writers (the Flight Crew tools' writers).
 */

import { generateText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { models, heliconeHeaders } from "@/lib/ai/provider";
import { isReceiptCategoryKey } from "@/lib/types/receipt";
import { atlanticISODate } from "@agent-runway/core/lib/local-date";
import { parseCaptureExtraction } from "@agent-runway/core/lib/capture/parse";
import { resolveCapture } from "@agent-runway/core/lib/capture/proposals";
import type { CaptureContext, CaptureProposal, ParsedCapture } from "@agent-runway/core/lib/capture/types";
import { buildExtractPrompt } from "./extract-prompt";

/** Longest note read, in characters (about 15 minutes of speech). */
export const MAX_TRANSCRIPT_CHARS = 10_000;

export interface ExtractOptions {
  userId: string;
  /** Atlantic YYYY-MM-DD; defaults to today there. */
  today?: string;
  contextClientName?: string | null;
  /** Which surface asked, for the model call's tag. */
  feature?: string;
}

/** The weekday name of a YYYY-MM-DD, independent of the server's zone. */
function weekdayName(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** The model's reading of a note, checked. Throws CaptureParseError when the reply isn't JSON. */
export async function extractCapture(transcript: string, options: ExtractOptions): Promise<ParsedCapture> {
  const today = options.today ?? atlanticISODate();
  const { text } = await generateText({
    model: models.fast,
    prompt: buildExtractPrompt({ transcript, today, weekday: weekdayName(today), contextClientName: options.contextClientName }),
    temperature: 0.1,
    maxOutputTokens: 2000,
    headers: heliconeHeaders({ userId: options.userId, feature: options.feature ?? "voice-extract" }),
  });
  return parseCaptureExtraction(text, { isExpenseCategoryKey: isReceiptCategoryKey });
}

export interface ProposeOptions {
  context?: CaptureContext;
  feature?: string;
  /** Atlantic YYYY-MM-DD; defaults to today there. */
  today?: string;
}

/**
 * A note to proposed writes. `supabase` is the user's own client (cookie or
 * token-scoped), so the name search sees only their clients and deals.
 */
export async function proposeCapture(
  supabase: SupabaseClient,
  userId: string,
  transcript: string,
  options: ProposeOptions = {},
): Promise<CaptureProposal> {
  const today = options.today ?? atlanticISODate();
  let contextClientName: string | null = null;
  if (options.context?.clientId) {
    const { data } = await supabase
      .from("clients")
      .select("name")
      .eq("id", options.context.clientId)
      .eq("user_id", userId)
      .maybeSingle();
    contextClientName = (data?.name as string | undefined) ?? null;
  }
  const parsed = await extractCapture(transcript, { userId, today, contextClientName, feature: options.feature });
  return resolveCapture(supabase, userId, { transcript, parsed, today, context: options.context });
}
