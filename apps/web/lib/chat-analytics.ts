/**
 * Chat Analytics Logger
 *
 * Tracks AI assistant interactions for the daily self-improvement audit.
 * Logs: topic classification results, whether playbooks/diagnostics fired,
 * and resolution signals (follow-up count indicates unresolved issues).
 *
 * Privacy: Only stores first 120 chars of message (enough for topic analysis,
 * not enough for PII). Never stores full conversations or financial data.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import type { TroubleshootingTopic } from "./troubleshooting-classifier";

interface ChatAnalyticsEntry {
  userId: string;
  message: string;
  primaryTopic: TroubleshootingTopic;
  secondaryTopic: TroubleshootingTopic | null;
  classifierScore: number;
  hadDiagnostics: boolean;
  hadPlaybook: boolean;
  followUpCount: number;
  sessionMessageCount: number;
  currentPage: string | null;
  wasEscalation?: boolean;
}

/**
 * Log a chat interaction for analytics. Fire-and-forget — never blocks the response.
 */
export async function logChatAnalytics(
  supabase: SupabaseClient,
  entry: ChatAnalyticsEntry,
): Promise<void> {
  try {
    // Truncate message to 120 chars — enough for topic analysis, strips PII
    const preview = entry.message.slice(0, 120).replace(/\n/g, " ").trim();

    await supabase.from("chat_analytics").insert({
      user_id: entry.userId,
      message_preview: preview,
      primary_topic: entry.primaryTopic,
      secondary_topic: entry.secondaryTopic,
      classifier_score: entry.classifierScore,
      had_diagnostics: entry.hadDiagnostics,
      had_playbook: entry.hadPlaybook,
      follow_up_count: entry.followUpCount,
      session_message_count: entry.sessionMessageCount,
      current_page: entry.currentPage,
      was_escalation: entry.wasEscalation ?? false,
    });
  } catch {
    // Analytics logging should never break the chat flow
  }
}

/**
 * Count how many consecutive recent messages were about the same topic.
 * High follow-up count = user likely didn't get a satisfactory answer.
 */
export function countTopicFollowUps(
  messages: { role: string; content: string }[],
  classifyFn: (msg: string) => TroubleshootingTopic,
  currentTopic: TroubleshootingTopic,
): number {
  let count = 0;
  // Walk backwards through user messages
  const userMessages = messages.filter((m) => m.role === "user").reverse();
  for (const msg of userMessages.slice(1)) {
    // Skip current message (index 0)
    const topic = classifyFn(String(msg.content));
    if (topic === currentTopic) {
      count++;
    } else {
      break; // Different topic = end of streak
    }
  }
  return count;
}
