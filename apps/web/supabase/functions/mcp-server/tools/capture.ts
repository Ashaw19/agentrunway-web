import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { McpTool } from "./index.ts";
import { atlanticISODate } from "../../_shared/core/lib/local-date.ts";
import { EXPENSE_KEY_TO_T2125 } from "../../_shared/core/engines/t2125-engine.ts";
import { applyCaptureWrites, checkWrite, summarizeSave } from "../../_shared/core/lib/capture/proposals.ts";
import { CAPTURE_TOOLS, CAPTURE_TOOL_CREW, type CaptureTool, type ProposedWrite } from "../../_shared/core/lib/capture/types.ts";

/**
 * Note capture over MCP: the mirror of Flight Crew's captureNote and the
 * iPhone and web voice buttons.
 *
 *   capture_note         (read-only) the note goes to the web app's
 *                        /api/voice-extract with the caller's own session
 *                        token, so the same model, prompt, name search and
 *                        Atlantic dates produce the same proposed writes as on
 *                        the phone. Nothing is saved.
 *   save_captured_note   (write) the writes the agent approved, saved through
 *                        core record-writers: the same writers the Flight Crew
 *                        tools, the web and the phone use.
 *
 * The client's tool approval prompt on save_captured_note is the approval
 * step. The model call stays in the web app, which logs it with every other
 * model call; this function never holds a model key.
 */

/** Where the web app runs. Set AGENT_RUNWAY_APP_URL to point at a preview deploy. Read per call (tests run without Deno). */
function appUrl(): string {
  return (Deno.env.get("AGENT_RUNWAY_APP_URL") ?? "https://agentrunway.ca").replace(/\/+$/, "");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_WRITES = 12;

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** One write as the caller sends it back: a capture_note item, possibly edited. */
interface SubmittedWrite {
  id?: string;
  tool: CaptureTool;
  args: Record<string, unknown>;
  /** The id of a createClient item in this same call that this write is about. */
  new_client_ref?: string;
}

function toProposedWrite(w: SubmittedWrite, index: number): ProposedWrite {
  const id = w.id && typeof w.id === "string" ? w.id : `w${index + 1}`;
  const client = w.new_client_ref
    ? {
        spoken: null, candidates: [], selectedId: null, newClientWriteId: w.new_client_ref,
        newClientOffer: w.new_client_ref, noClient: false, optional: w.tool === "createContactTask",
      }
    : undefined;
  return { id, tool: w.tool, intent: "note", include: true, warnings: [], args: w.args, client } as unknown as ProposedWrite;
}

/** Ids must be the agent's own; the writers check ownership too, but a made-up id is refused here first. */
function idProblems(w: SubmittedWrite): string[] {
  const out: string[] = [];
  for (const key of ["clientId", "dealId"]) {
    const v = w.args[key];
    if (v !== undefined && v !== "" && !(typeof v === "string" && UUID.test(v))) out.push(`${key} is not an id from capture_note or get_clients.`);
  }
  if (w.tool === "logExpense" && typeof w.args.categoryKey === "string" && !Object.hasOwn(EXPENSE_KEY_TO_T2125, w.args.categoryKey)) {
    out.push(`categoryKey "${w.args.categoryKey}" is not an expense item.`);
  }
  return out;
}

export function getCaptureTools(supabase: SupabaseClient, userId: string, accessToken: string): McpTool[] {
  return [
    // ── capture_note ─────────────────────────────────────────────────────
    {
      name: "capture_note",
      description:
        "Turns a note the agent pastes (after a call or a showing; a transcript from Apple's call recording or Notes) into proposed writes, the same way the Agent Runway iPhone app's voice button does: activities on the right client, Checklist follow-ups with dates, deal stage and close-date changes, trips, expenses, new clients and closed deals. Saves NOTHING. Each item comes back with its tool and args. When a name fits several clients, every candidate is listed and nothing is picked: ask the agent which one. Show the agent the list, let them change or drop items, then call save_captured_note with the approved ones.",
      inputSchema: {
        type: "object",
        properties: {
          transcript: { type: "string", description: "The note or transcript, exactly as the agent gave it (up to 10,000 characters)." },
          client_id: { type: "string", description: "Only when the agent says the note is about one client (an id from get_clients)." },
        },
        required: ["transcript"],
        additionalProperties: false,
      },
      annotations: {
        title: "Read a Note into Proposed Changes",
        readOnlyHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      handler: async (args) => {
        const a = args as { transcript?: string; client_id?: string };
        const transcript = (a.transcript ?? "").trim();
        if (!transcript) return { ...text("A transcript is required."), isError: true };
        const context = a.client_id && UUID.test(a.client_id) ? { clientId: a.client_id } : undefined;

        const res = await fetch(`${appUrl()}/api/voice-extract`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ transcript, context }),
        });
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        if (!res.ok) {
          return { ...text(`Couldn't read the note: ${String(body.error ?? res.status)}`), isError: true };
        }
        const writes = (Array.isArray(body.writes) ? body.writes : []) as ProposedWrite[];
        const items = writes.map((w) => ({
          id: w.id,
          tool: w.tool,
          crew: CAPTURE_TOOL_CREW[w.tool],
          proposed_on: w.include,
          args: w.args,
          // Who / which deal: candidates are ranked, and selected only when exactly one fits.
          client: w.client
            ? {
                heard: w.client.spoken,
                selected_id: w.client.selectedId,
                new_client_ref: w.client.newClientWriteId,
                // The agent's calendar day, not the UTC timestamp.
                candidates: w.client.candidates.map((c) => ({ id: c.id, name: c.name, last_contact_day: c.lastContactAt ? atlanticISODate(new Date(c.lastContactAt)) : null })),
              }
            : undefined,
          deal: w.deal
            ? { heard: w.deal.spoken, selected_id: w.deal.selectedId, candidates: w.deal.candidates.map((d) => ({ id: d.id, address: d.address, client: d.clientName, stage: d.stage })) }
            : undefined,
          still_needed: checkWrite(w),
          check: w.warnings,
        }));
        return text(JSON.stringify({
          saved: false,
          today: body.today,
          transcript_cleaned: body.transcriptCleaned,
          items,
          not_proposed: body.notes ?? [],
          next_step: "Show the agent these items in plain words. For an item with candidates and no selected_id, ask the agent which one (never pick the first) and put its id in args.clientId / args.dealId. Fill anything in still_needed. Drop items the agent doesn't want, and items with proposed_on false unless they ask. Then call save_captured_note with the approved items: { id, tool, args, new_client_ref }.",
        }, null, 2));
      },
    },

    // ── save_captured_note ───────────────────────────────────────────────
    {
      name: "save_captured_note",
      description:
        "Saves the items from capture_note that the agent approved, through the same writers the Agent Runway app uses: activities (a note is not counted as contact), Checklist items, deal stage and expected close date, trips, expenses (GST/HST only as stated), new clients (never a name already on file) and closed deals. New clients are saved first; an item with new_client_ref is saved on that new client. Each item is checked; one that is missing something is not saved and the reply says why.",
      inputSchema: {
        type: "object",
        properties: {
          writes: {
            type: "array",
            maxItems: MAX_WRITES,
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "The item id from capture_note (w1, w2, ...)." },
                tool: { type: "string", enum: [...CAPTURE_TOOLS] },
                args: { type: "object", description: "The item's args, as approved." },
                new_client_ref: { type: "string", description: "The id of a createClient item in this call that this item is about." },
              },
              required: ["tool", "args"],
              additionalProperties: false,
            },
          },
        },
        required: ["writes"],
        additionalProperties: false,
      },
      annotations: {
        title: "Save Approved Note Items",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      handler: async (args) => {
        const list = (isObj(args) && Array.isArray(args.writes) ? args.writes : []) as unknown[];
        if (list.length === 0) return { ...text("No items to save."), isError: true };
        if (list.length > MAX_WRITES) return { ...text(`At most ${MAX_WRITES} items per call.`), isError: true };

        const submitted: SubmittedWrite[] = [];
        const refused: Array<{ id: string; tool: string; status: "failed"; message: string }> = [];
        list.forEach((raw, i) => {
          const w = raw as SubmittedWrite;
          const id = typeof w?.id === "string" ? w.id : `w${i + 1}`;
          if (!isObj(w) || !(CAPTURE_TOOLS as readonly string[]).includes(String(w.tool)) || !isObj(w.args)) {
            refused.push({ id, tool: String((w as { tool?: unknown })?.tool ?? "?"), status: "failed", message: "Not a capture item: needs a tool and args." });
            return;
          }
          const problems = idProblems(w);
          if (problems.length > 0) {
            refused.push({ id, tool: w.tool, status: "failed", message: problems.join(" ") });
            return;
          }
          submitted.push({ ...w, id });
        });

        const results = await applyCaptureWrites(
          supabase,
          userId,
          submitted.map((w, i) => toProposedWrite(w, i)),
          { today: atlanticISODate() },
        );
        const all = [...results.map((r) => ({ id: r.writeId, tool: r.tool, status: r.status, message: r.message })), ...refused];
        const summary = summarizeSave(results);
        return text(JSON.stringify({
          summary: refused.length > 0 ? `${summary.text}, ${refused.length} refused` : summary.text,
          results: all,
        }, null, 2));
      },
    },
  ];
}
