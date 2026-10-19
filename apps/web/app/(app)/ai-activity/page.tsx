import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  actionView,
  aiActivitySince,
  countAIFailures,
  loadAIActivity,
} from "@agent-runway/core/lib/ai-activity-load";
import { AI_UNDO_WINDOW_DAYS } from "@agent-runway/core/lib/ai-activity";
import { AiActivityContent } from "./ai-activity-content";

export const dynamic = "force-dynamic";

/**
 * AI activity: what Flight Crew changed in the agent's records (with Undo)
 * and every AI call Agent Runway made for them, from the AI run ledger
 * (migration 00182). The last 30 days, the undo window. Only words reach
 * the browser, never the ledger's row images.
 */
export default async function AiActivityPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const now = new Date();
  const [snapshot, failures] = await Promise.all([
    // Totals count every call in the window, paged past the API's 1,000-row
    // cap; `truncated` says when a limit cut a list short.
    loadAIActivity(supabase, user.id, { since: aiActivitySince("30d", now), recentRuns: 100 }),
    countAIFailures(supabase, user.id, now),
  ]);
  if (snapshot.error) console.error("[ai-activity] ledger read failed:", snapshot.error);

  return (
    <AiActivityContent
      actions={snapshot.actions.map((a) => actionView(a, now))}
      runs={snapshot.runs}
      summary={snapshot.summary}
      failures={failures}
      truncated={snapshot.truncated}
      loadFailed={snapshot.error !== null}
      windowDays={AI_UNDO_WINDOW_DAYS}
    />
  );
}
