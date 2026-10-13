import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { McpTool } from "./index.ts";
import { atlanticISODate } from "../../_shared/core/lib/local-date.ts";

/**
 * A timestamptz as the agent's calendar day (as in tools/crm.ts). The raw
 * value is UTC: a message sent at 10 pm Atlantic reads as sent tomorrow.
 */
const atlanticDay = (ts: string | null | undefined) =>
  ts ? atlanticISODate(new Date(ts)) : null;

export function getOutreachTools(supabase: SupabaseClient, userId: string): McpTool[] {
  return [
    // ── get_flight_control_priorities ────────────────────────────────────
    {
      name: "get_flight_control_priorities",
      description:
        "Returns the agent's Flight Control outreach queue — clients that need follow-up action. Includes AI-drafted messages awaiting review (status='ready') and pending detections (status='draft').",
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["draft", "ready", "sent", "skipped"],
            description: "Filter by outreach status. Default: returns 'draft' and 'ready' items.",
          },
          limit: { type: "number", description: "Maximum records to return (default 20, max 100)." },
        },
        additionalProperties: false,
      },
      annotations: {
        title: "Flight Control Priorities",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (args) => {
        const { status, limit = 20 } = args as { status?: string; limit?: number };
        const cap = Math.min(limit, 100);

        let query = supabase
          .from("outreach_queue")
          .select("id, client_id, opportunity_type, trigger_date, status, ai_subject, final_subject, sent_at, clients(name, status, email)")
          .eq("user_id", userId)
          .order("trigger_date", { ascending: false })
          .limit(cap);

        if (status) {
          query = query.eq("status", status);
        } else {
          query = query.in("status", ["draft", "ready"]);
        }

        const { data, error } = await query;
        if (error) throw error;

        const items = (data ?? []).map((item) => ({
          id: item.id,
          client_name: (item.clients as Record<string, string> | null)?.name ?? "Unknown",
          client_status: (item.clients as Record<string, string> | null)?.status,
          opportunity_type: item.opportunity_type,
          trigger_date: item.trigger_date,
          outreach_status: item.status,
          has_draft: !!item.ai_subject,
          subject_preview: item.final_subject ?? item.ai_subject ?? null,
          sent_at: atlanticDay(item.sent_at as string | null),
        }));

        const readyCount = (data ?? []).filter((i) => i.status === "ready").length;
        const draftCount = (data ?? []).filter((i) => i.status === "draft").length;

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              total: items.length,
              ready_to_send: readyCount,
              pending_ai_draft: draftCount,
              filter: status ?? "draft+ready",
              items,
            }, null, 2),
          }],
        };
      },
    },
  ];
}
