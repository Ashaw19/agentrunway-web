/**
 * apps/mobile/lib/flight-crew/chat-client.ts
 *
 * Mobile client for the web `/api/chat` endpoint. Wraps:
 *   - Bearer-token auth (Supabase access token via lib/supabase)
 *   - Streaming response handling using XHR onprogress (RN's most reliable
 *     streaming primitive — `fetch().body.getReader()` is unstable on
 *     Android + Expo Go as of RN 0.81)
 *   - Parsing the Vercel AI SDK data-stream protocol (`0:` text deltas,
 *     `9:` tool-call starts, `b:` approval-required) via lib/flight-crew/stream
 *   - Offline detection (returns a typed offline error so the UI can
 *     render a graceful "online-only" state without queueing — Phase A
 *     does not queue chat sends per the spec)
 *
 * See:
 *   - memory/project_mobile_parity_audit_2026-05-26.md (gap #1)
 *   - apps/web/app/api/chat/route.ts (server contract)
 *   - apps/mobile/lib/flight-crew/stream.ts (parser)
 *
 * Tool approvals (prefix `b:`) on mobile: Phase A surfaces a single
 * inline notice that the action requires the web app — does NOT attempt
 * to render the approval card. Approval-gated mutations are out of scope
 * for Phase A per the audit. The model's text continues to render around
 * the approval marker so the conversation doesn't break.
 */

import { supabase } from "@/lib/supabase";
import { useOfflineQueueStore } from "@/stores/offline-queue";
import type { Persona } from "./personas";
import { parseDataStreamChunk } from "./stream";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://agentrunway.ca";

/** Wire-format message sent to /api/chat. Mirrors the web client's shape. */
export interface WireMessage {
  role: "user" | "assistant";
  content: string;
}

export type ChatErrorCode =
  | "offline"
  | "unauthorized"
  | "rate_limited"
  | "server_error"
  | "network_error"
  | "aborted";

export class ChatError extends Error {
  code: ChatErrorCode;
  status?: number;
  constructor(code: ChatErrorCode, message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export interface StreamHandlers {
  /** Fires every time a new text delta arrives. Receives the FULL accumulated
   *  text (not just the delta) for easy state-setting in the UI. */
  onText: (fullText: string) => void;
  /** Fires when a tool-call start (`9:`) is seen. */
  onToolStart?: (toolName: string) => void;
  /** Fires when an approval-required event (`b:`) is seen. Phase A renders
   *  a single inline notice; full approval UI is web-only. */
  onApprovalRequired?: (toolName: string, description: string) => void;
}

export interface ChatRequest {
  messages: WireMessage[];
  persona: Persona;
  /** Current screen route — server uses for grounding. Optional. */
  currentPage?: string;
  /** AbortSignal so the UI can cancel an in-flight request. */
  signal?: AbortSignal;
}

/**
 * Send a chat turn and stream the response. Resolves with the final
 * accumulated text once the stream completes; rejects with `ChatError`
 * on offline / auth / network / server / abort.
 */
export async function streamChat(
  req: ChatRequest,
  handlers: StreamHandlers,
): Promise<string> {
  // ── Offline check ──────────────────────────────────────────────────────
  // Phase A is online-only by design — we don't queue chat sends because
  // the model's response depends on real-time data lookups. If offline,
  // we fail fast and the UI shows the graceful state. We read the existing
  // mobile-wide network-status store (driven by `hooks/useNetworkStatus`)
  // instead of adding another NetInfo subscription.
  if (!useOfflineQueueStore.getState().isOnline) {
    throw new ChatError("offline", "Chat is online-only — try again when connected.");
  }

  // ── Auth ────────────────────────────────────────────────────────────────
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) {
    throw new ChatError("unauthorized", "Sign in to chat with the Flight Crew.");
  }

  // ── Stream via XHR ──────────────────────────────────────────────────────
  // RN's XHR is the most reliable streaming primitive: `onprogress` fires
  // with `responseText` containing the full accumulated body so far. We
  // track the consumed length and parse only the new tail on each tick.
  return await new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let consumed = 0;
    let fullText = "";
    let approvalSeen = false;

    const onAbort = () => {
      try { xhr.abort(); } catch {}
      reject(new ChatError("aborted", "Request cancelled"));
    };
    if (req.signal) {
      if (req.signal.aborted) { onAbort(); return; }
      req.signal.addEventListener("abort", onAbort);
    }

    xhr.onprogress = () => {
      const text = xhr.responseText ?? "";
      if (text.length <= consumed) return;
      const tail = text.slice(consumed);
      consumed = text.length;
      const parsed = parseDataStreamChunk(tail);
      if (parsed.text) {
        fullText += parsed.text;
        handlers.onText(fullText);
      }
      if (parsed.toolName && handlers.onToolStart) {
        handlers.onToolStart(parsed.toolName);
      }
      if (parsed.approval && !approvalSeen) {
        approvalSeen = true;
        handlers.onApprovalRequired?.(
          parsed.approval.toolName,
          parsed.approval.description,
        );
      }
    };

    xhr.onload = () => {
      if (req.signal) req.signal.removeEventListener("abort", onAbort);
      // Drain any remaining tail not seen by onprogress (covers small responses
      // that complete before onprogress fires on some platforms).
      const text = xhr.responseText ?? "";
      if (text.length > consumed) {
        const tail = text.slice(consumed);
        consumed = text.length;
        const parsed = parseDataStreamChunk(tail);
        if (parsed.text) {
          fullText += parsed.text;
          handlers.onText(fullText);
        }
        if (parsed.approval && !approvalSeen) {
          approvalSeen = true;
          handlers.onApprovalRequired?.(
            parsed.approval.toolName,
            parsed.approval.description,
          );
        }
      }

      if (xhr.status === 401) {
        reject(new ChatError("unauthorized", "Session expired — sign in again.", 401));
        return;
      }
      if (xhr.status === 429) {
        reject(new ChatError("rate_limited", "Too many messages — wait a moment.", 429));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new ChatError(
          "server_error",
          xhr.responseText || "The Flight Crew is unavailable right now.",
          xhr.status,
        ));
        return;
      }
      resolve(fullText);
    };

    xhr.onerror = () => {
      if (req.signal) req.signal.removeEventListener("abort", onAbort);
      reject(new ChatError("network_error", "Couldn't reach the Flight Crew."));
    };

    xhr.ontimeout = () => {
      if (req.signal) req.signal.removeEventListener("abort", onAbort);
      reject(new ChatError("network_error", "The Flight Crew took too long to respond."));
    };

    xhr.open("POST", `${API_URL}/api/chat`, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
    // 120s aligns with the route's maxDuration.
    xhr.timeout = 120_000;
    xhr.send(JSON.stringify({
      messages: req.messages,
      persona: req.persona,
      currentPage: req.currentPage ?? "/mobile/chat",
    }));
  });
}
