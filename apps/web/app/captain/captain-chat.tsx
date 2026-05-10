"use client";

/**
 * CaptainChat
 * ───────────
 * Public-facing streaming chat widget for the /captain page.
 * Captain runs in "public mode": no user data, no tool calls, pure AR product
 * knowledge + lead qualification.
 *
 * Streaming: fetch + ReadableStream + TextDecoder. Uses toTextStreamResponse()
 * on the server so chunks arrive as raw text — no prefix protocol needed.
 *
 * Lead capture: after the 2nd bot response a CASL-compliant email form slides
 * in above the input. On submit, posts to /api/subscribe (source: captain_chat).
 * Contact record write happens only on explicit checkbox consent.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, X, CheckCircle2 } from "lucide-react";
import { Tailfin } from "@/components/icons/brand-icons";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id:      string;
  role:    "user" | "assistant";
  content: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CAPTAIN_GREETING =
  "I'm Captain — Agent Runway's AI advisor for Canadian real estate agents. " +
  "What's the biggest challenge in your business right now?";

const CASL_CONSENT_LANGUAGE =
  "I agree to receive updates and marketing communications from Agent Runway. " +
  "I can unsubscribe at any time.";

let msgIdCounter = 0;
function nextId(): string {
  return `msg-${++msgIdCounter}-${Date.now()}`;
}

// ── Stream note ───────────────────────────────────────────────────────────────
// The API returns toTextStreamResponse() which emits raw text chunks (no prefix
// protocol). Chunks are accumulated directly via TextDecoder.

// ── Component ─────────────────────────────────────────────────────────────────

export function CaptainChat() {
  const [messages, setMessages] = useState<Message[]>([
    { id: "captain-greeting", role: "assistant", content: CAPTAIN_GREETING },
  ]);
  const [input,   setInput]   = useState("");
  const [loading, setLoading] = useState(false);

  // ── Lead capture form state ────────────────────────────────────────────────
  const [showLeadForm,   setShowLeadForm]   = useState(false);
  const [formDismissed,  setFormDismissed]  = useState(false);
  const [leadName,       setLeadName]       = useState("");
  const [leadEmail,      setLeadEmail]      = useState("");
  const [leadConsent,    setLeadConsent]    = useState(false);
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const [leadSubmitted,  setLeadSubmitted]  = useState(false);
  const [leadError,      setLeadError]      = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLInputElement>(null);
  const messagesRef    = useRef<Message[]>(messages);

  // Keep ref in sync with state (avoids stale closure in handleSend)
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Auto-scroll on new content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Show lead form after the 2nd bot message (one full exchange)
  const botCount = messages.filter((m) => m.role === "assistant").length;
  useEffect(() => {
    if (botCount >= 2 && !formDismissed && !leadSubmitted) {
      setShowLeadForm(true);
    }
  }, [botCount, formDismissed, leadSubmitted]);

  // ── Send a message ─────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: Message   = { id: nextId(), role: "user",      content: trimmed };
    const assistantId        = nextId();
    const placeholderMsg: Message = { id: assistantId, role: "assistant", content: "" };

    setInput("");
    setLoading(true);
    setMessages((prev) => [...prev, userMsg, placeholderMsg]);

    const history = [...messagesRef.current, userMsg].map(({ role, content }) => ({ role, content }));

    try {
      const res = await fetch("/api/captain-intake", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ messages: history }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `HTTP ${res.status}`);
      }

      const reader  = res.body?.getReader();
      const decoder = new TextDecoder();
      let   text    = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (chunk) {
            text += chunk;
            const captured = text;
            setMessages((prev) => [
              ...prev.slice(0, -1),
              { id: assistantId, role: "assistant", content: captured },
            ]);
          }
        }
      }

      if (!text) {
        setMessages((prev) => [
          ...prev.slice(0, -1),
          {
            id: assistantId, role: "assistant",
            content: "Sorry, something went wrong. Please try again.",
          },
        ]);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const userFacing = errMsg.toLowerCase().includes("429")
        ? "You've sent a lot of messages — please try again in an hour."
        : "Something went wrong. Please try again.";
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { id: assistantId, role: "assistant", content: userFacing },
      ]);
    } finally {
      setLoading(false);
      // Re-focus input after response
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, loading]);

  // ── Submit on Enter (no shift) ─────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // ── Lead form submit ───────────────────────────────────────────────────────
  async function handleLeadSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!leadEmail.trim() || !leadConsent) return;
    setLeadSubmitting(true);
    setLeadError("");
    try {
      const res = await fetch("/api/subscribe", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email:            leadEmail.trim(),
          name:             leadName.trim() || undefined,
          source:           "captain_chat",
          consent:          true,
          consent_language: CASL_CONSENT_LANGUAGE,
          form_url:         window.location.href,
        }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setLeadError(data.error ?? "Something went wrong — please try again.");
      } else {
        setLeadSubmitted(true);
        setShowLeadForm(false);
      }
    } catch {
      setLeadError("Network error — please try again.");
    } finally {
      setLeadSubmitting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden"
         style={{ height: "580px" }}>

      {/* ── Header ── */}
      <div className="flex items-center gap-3 border-b border-slate-800 bg-slate-900/80 px-5 py-3.5 backdrop-blur">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600">
          <Tailfin className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Captain</p>
          <p className="text-[11px] text-emerald-400">● Online · Agent Runway advisor</p>
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn("flex gap-2.5", message.role === "user" ? "flex-row-reverse" : "flex-row")}
          >
            {message.role === "assistant" && (
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600">
                <Tailfin className="h-3.5 w-3.5 text-white" />
              </div>
            )}
            <div
              className={cn(
                "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                message.role === "user"
                  ? "rounded-tr-sm bg-blue-600 text-white"
                  : "rounded-tl-sm bg-slate-800 text-slate-100",
                // Empty placeholder while streaming
                message.role === "assistant" && !message.content && "min-h-[36px]",
              )}
            >
              {message.content || (
                message.role === "assistant" && loading && (
                  <span className="flex items-center gap-1 py-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" />
                  </span>
                )
              )}
            </div>
          </div>
        ))}

        {/* Success confirmation after lead submit */}
        {leadSubmitted && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-700/40 bg-emerald-900/30 px-4 py-2.5 text-sm text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            You&apos;re on the list! We&apos;ll follow up shortly with next steps.
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Lead capture form (appears after 2nd bot reply) ── */}
      {showLeadForm && !leadSubmitted && (
        <div className="border-t border-slate-700/60 bg-slate-800/70 px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-white">
              Try Agent Runway free
            </p>
            <button
              onClick={() => { setShowLeadForm(false); setFormDismissed(true); }}
              className="rounded p-0.5 text-slate-500 hover:text-slate-300"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <form onSubmit={handleLeadSubmit} className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="First name (optional)"
                value={leadName}
                onChange={(e) => setLeadName(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-700 px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <input
                type="email"
                placeholder="Email address *"
                value={leadEmail}
                onChange={(e) => setLeadEmail(e.target.value)}
                required
                className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-700 px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <label className="flex cursor-pointer items-start gap-2 text-[11px] text-slate-400">
              <input
                type="checkbox"
                checked={leadConsent}
                onChange={(e) => setLeadConsent(e.target.checked)}
                required
                className="mt-0.5 h-3 w-3 shrink-0 accent-blue-500"
              />
              {CASL_CONSENT_LANGUAGE}
            </label>
            {leadError && (
              <p className="text-[11px] text-red-400">{leadError}</p>
            )}
            <button
              type="submit"
              disabled={!leadEmail.trim() || !leadConsent || leadSubmitting}
              className="w-full rounded-lg bg-blue-600 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {leadSubmitting ? "Saving…" : "Get started free →"}
            </button>
          </form>
        </div>
      )}

      {/* ── Input ── */}
      <div className="flex items-center gap-2 border-t border-slate-800 bg-slate-900 px-4 py-3">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Captain anything about Agent Runway…"
          disabled={loading}
          className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          aria-label="Message"
          autoFocus
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Send message"
        >
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin text-white" />
            : <Send className="h-4 w-4 text-white" />
          }
        </button>
      </div>

    </div>
  );
}
