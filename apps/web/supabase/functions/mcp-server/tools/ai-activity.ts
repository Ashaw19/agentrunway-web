import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { McpTool } from "./index.ts";
import {
  aiActivityPeriodLabel,
  aiActivityReport,
  aiActivitySince,
  countAIFailures,
  loadAIActivity,
  type AIActivityPeriod,
} from "../../_shared/core/lib/ai-activity-load.ts";

/**
 * The AI run ledger (migration 00182), read through the agent's own token
 * (RLS): what Flight Crew changed in their records and which AI calls ran.
 * Same queries and wording as Flight Crew's getAIActivity
 * (packages/core/lib/ai-activity-load.ts). Read only: undo is in the app.
 */
export function getAiActivityTools(supabase: SupabaseClient, userId: string): McpTool[] {
  return [
    // ── get_ai_activity ──────────────────────────────────────────────────
    {
      name: "get_ai_activity",
      description:
        "What Agent Runway's in-app AI (Flight Crew) changed in the agent's records, each change with its time and whether it can still be undone in the app, plus the AI calls that ran (count, failures, estimated cost by feature). Never includes prompts or replies. Undo is done in the app (AI activity page, iPhone app, or Flight Crew chat).",
      inputSchema: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: ["today", "7d", "30d"],
            description: "today (Atlantic time), the last 7 days, or the last 30 days. Default today.",
          },
        },
        additionalProperties: false,
      },
      annotations: {
        title: "AI Activity",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (args) => {
        const raw = (args as { period?: unknown } | null)?.period;
        const period: AIActivityPeriod = raw === "7d" || raw === "30d" ? raw : "today";
        const [snap, failures] = await Promise.all([
          loadAIActivity(supabase, userId, { since: aiActivitySince(period), writeLimit: 200, recentRuns: 0 }),
          countAIFailures(supabase, userId),
        ]);
        if (snap.error && snap.actions.length === 0 && snap.runs.length === 0) {
          throw new Error(`AI activity could not be read: ${snap.error}`);
        }
        return {
          content: [{ type: "text" as const, text: aiActivityReport(snap, failures, { periodLabel: aiActivityPeriodLabel(period) }) }],
        };
      },
    },
  ];
}
