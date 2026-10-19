/**
 * The approval card for Flight Crew's undoAIChange, built on the server from
 * the ledger, never from the model's words.
 *
 * The model passes a toolCallId (and a description, which is ignored). The
 * card shows the change that toolCallId really names, what undoing it will
 * do, and when it was made; the card's args carry that action's fingerprint,
 * and undoAIChange refuses unless the action still has exactly that
 * fingerprint when the agent approves. A model that picks the wrong change
 * can't get "Logged an expense" approved while a client is deleted.
 */

import {
  actionFingerprint,
  actionUndoBlocker,
  describeAction,
  undoConsequences,
} from "@agent-runway/core/lib/ai-activity";
import { formatAiActivityTime } from "@agent-runway/core/lib/ai-activity-load";
import { loadAIAction, type UndoClient } from "@agent-runway/core/lib/ai-undo";

/** The args key the card carries the fingerprint in. Set here only, never by the model. */
export const UNDO_FINGERPRINT_ARG = "shownFingerprint";

export interface UndoApprovalCard {
  description: string;
  args: Record<string, unknown>;
}

export async function undoApprovalCard(
  client: UndoClient,
  userId: string,
  modelArgs: Record<string, unknown>,
  now: Date = new Date(),
): Promise<UndoApprovalCard> {
  const toolCallId = typeof modelArgs.toolCallId === "string" ? modelArgs.toolCallId : "";
  // Whatever the model wrote is dropped: the card and the undo use the ledger.
  const args: Record<string, unknown> = { toolCallId };
  if (!toolCallId) return { description: "Undo a Flight Crew change: no change was named, so approving does nothing.", args };
  try {
    const { action } = await loadAIAction(client, userId, toolCallId);
    if (!action) return { description: "Undo a Flight Crew change: that change wasn't found, so approving does nothing.", args };
    const blocker = actionUndoBlocker(action, now);
    if (blocker) {
      return { description: `Undo "${describeAction(action)}": ${blocker} Approving does nothing.`, args };
    }
    const effects = undoConsequences(action);
    const description =
      `Undo "${describeAction(action)}" (${formatAiActivityTime(action.createdAt)}). ` +
      (effects.length ? `${effects.join(". ")}.` : "Nothing left to put back.");
    return { description, args: { ...args, [UNDO_FINGERPRINT_ARG]: actionFingerprint(action) } };
  } catch {
    return { description: "Undo a Flight Crew change: it couldn't be looked up, so approving does nothing.", args };
  }
}
