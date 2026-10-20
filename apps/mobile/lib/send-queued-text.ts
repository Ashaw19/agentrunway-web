/**
 * Sending a queued text: the Outreach screen's Send on a text and the
 * dashboard's Text button both come here (moved from the Outreach screen's
 * handleSendText, unchanged in what it decides).
 *
 *   1  a number to text, and a phone that can text
 *   2  CASL: the server's last-moment check (/api/mobile/outreach/text-check,
 *      the consent ledger) before Messages opens. No token, no answer or
 *      anything but a clear yes keeps Messages shut (fails closed). A refusal
 *      that means the text can't go (no consent, no longer queued) takes it
 *      off the phone's queue.
 *   3  iOS Messages opens with the text. Nothing goes until the agent presses
 *      Send there.
 *   4  Messages says it was sent: the text is marked sent and a Text activity
 *      is logged, once (markTexted). Cancelled: nothing is written and the
 *      text stays queued. Unknown: the agent is asked.
 *
 * Plain function over its dependencies, so lib/__tests__ can run it; the app
 * passes the real ones (lib/queued-text-deps.ts).
 */

import { textCheckOutcome } from "@agent-runway/core/lib/queued-text-check";
import type { OutreachItem } from "../stores/data-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://agentrunway.ca";

/** The queue row's parts a send reads. */
export type QueuedText = Pick<OutreachItem, "id" | "final_body" | "ai_body" | "context" | "clients">;

export type SendQueuedTextResult = "sent" | "cancelled" | "refused" | "failed";

export interface SendQueuedTextDeps {
  /** The signed-in user's access token, or null. */
  getToken: () => Promise<string | null>;
  fetchFn: typeof fetch;
  /** expo-sms. */
  sms: {
    isAvailableAsync(): Promise<boolean>;
    sendSMSAsync(to: string[], body: string): Promise<{ result: string }>;
  };
  /** The data store's markTexted: marks the row sent and logs a Text activity. */
  markTexted(id: string, body: string): Promise<boolean>;
  alert(title: string, message: string): void;
  /** Takes a text the check refused for good off the phone's queue. */
  dropFromQueue?(id: string): void;
  /** Asks a yes/no question (Messages couldn't tell whether the text went). No ask: taken as no. */
  ask?(title: string, message: string, yes: string, no: string): Promise<boolean>;
}

/** The number a queued text goes to: the one it was drafted for, else the client's. */
export function textPhone(item: Pick<QueuedText, "context" | "clients">): string | null {
  const drafted = item.context?.phone;
  return (typeof drafted === "string" && drafted.trim()) || item.clients?.phone?.trim() || null;
}

/** The server's consent answer for this text: HTTP status (null when there was none) and body. */
async function checkConsent(item: QueuedText, deps: SendQueuedTextDeps): Promise<{ status: number | null; body: unknown }> {
  let token: string | null = null;
  try {
    token = await deps.getToken();
  } catch {
    token = null;
  }
  if (!token) return { status: null, body: null };
  try {
    const res = await deps.fetchFn(`${API_URL}/api/mobile/outreach/text-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ outreach_id: item.id }),
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } catch {
    return { status: null, body: null };
  }
}

export async function sendQueuedText(item: QueuedText, deps: SendQueuedTextDeps): Promise<SendQueuedTextResult> {
  const phone = textPhone(item);
  const name = item.clients?.name ?? "this client";
  if (!phone) {
    deps.alert("No Phone Number", `${name} doesn't have a phone number on file. Add one in Clients first.`);
    return "failed";
  }
  const body = item.final_body || item.ai_body || "";
  try {
    if (!(await deps.sms.isAvailableAsync())) {
      deps.alert("Texting Unavailable", "This device can't send text messages.");
      return "failed";
    }

    // CASL: the text was drafted earlier. Ask the server whether it may still
    // go out (unsubscribed, implied consent lapsed, archived) before Messages
    // opens. No answer means no text.
    const { status, body: answer } = await checkConsent(item, deps);
    const check = textCheckOutcome(status, answer);
    if (!check.send) {
      if (check.removeFromQueue) deps.dropFromQueue?.(item.id);
      deps.alert(check.title, check.message);
      return "refused";
    }

    const { result } = await deps.sms.sendSMSAsync([phone], body);
    const record = async () => {
      const ok = await deps.markTexted(item.id, body);
      if (!ok) {
        deps.alert("Not Logged", `The text went out, but Agent Runway couldn't log it on ${name}'s history. Pull down to refresh and try again.`);
      }
    };
    if (result === "sent") {
      await record();
      return "sent";
    }
    if (result === "unknown") {
      const went = deps.ask
        ? await deps.ask("Did You Send It?", `Agent Runway couldn't tell whether the text to ${name} was sent.`, "Yes, Sent", "Not Sent")
        : false;
      if (!went) return "cancelled";
      await record();
      return "sent";
    }
    // "cancelled": the agent closed Messages without sending; the text stays queued.
    return "cancelled";
  } catch (err) {
    console.error("Text send failed:", err);
    deps.alert("Couldn't Open Messages", "Please try again.");
    return "failed";
  }
}
