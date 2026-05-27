/**
 * apps/mobile/lib/flight-crew/stream.ts
 *
 * Parses the Vercel AI SDK data-stream protocol emitted by `/api/chat`.
 * Mirrors the parser in `apps/web/components/ai-chat.tsx`
 * (`parseDataStreamChunk`).
 *
 * The wire format is line-delimited, where each line looks like:
 *   `<prefix>:<json-payload>\n`
 *
 * Prefixes we surface on mobile (Phase A):
 *   - `0` — text delta (payload is a JSON string)
 *   - `9` — tool-call start (payload is { toolName })
 *   - `b` — tool-call requires user approval (payload is the full approval
 *           record). Phase A renders a graceful notice and skips approval
 *           UI — tool execution that needs approval is a web-only flow.
 *
 * Other prefixes (a/e/d) are intentionally ignored.
 *
 * Why we don't use the Vercel AI SDK's React client on mobile:
 *   - The web ai-chat.tsx already hand-rolls the parser to drive a custom
 *     handoff auto-router. Mobile needs the same control surface, so we
 *     re-implement the parser instead of pulling a heavier dependency.
 *   - Keeps Phase A free of ai-sdk peer dependencies on the mobile side.
 *
 * See `memory/project_mobile_parity_audit_2026-05-26.md` gap #1.
 */

export interface ParsedChunk {
  /** Concatenated text deltas in this chunk. */
  text: string;
  /** Most recent tool-call start name, or null. */
  toolName: string | null;
  /** Approval-required payload, or null. */
  approval: {
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
    description: string;
  } | null;
}

/**
 * Parse a raw stream chunk (may contain multiple lines) into structured
 * deltas. Lines that don't match the protocol are silently skipped.
 */
export function parseDataStreamChunk(raw: string): ParsedChunk {
  let text = "";
  let toolName: string | null = null;
  let approval: ParsedChunk["approval"] = null;

  const lines = raw.split("\n");
  for (const line of lines) {
    if (!line) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx < 1) continue;
    const prefix = line.slice(0, colonIdx);
    const payload = line.slice(colonIdx + 1);

    if (prefix === "0") {
      try {
        text += JSON.parse(payload);
      } catch {
        /* skip malformed delta */
      }
    } else if (prefix === "9") {
      try {
        const parsed = JSON.parse(payload);
        if (parsed.toolName) toolName = parsed.toolName;
      } catch {
        /* skip */
      }
    } else if (prefix === "b") {
      try {
        const parsed = JSON.parse(payload);
        if (parsed.toolCallId && parsed.toolName) {
          approval = parsed;
        }
      } catch {
        /* skip */
      }
    }
  }

  return { text, toolName, approval };
}
