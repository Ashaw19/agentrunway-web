"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Briefcase, Send, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * DirectorChatDock — embedded chat surface for the Director persona.
 *
 * Mounts as a floating action button at the bottom-right of every cockpit
 * page; expands into a panel on click. Streams responses from
 * /api/cockpit/director-chat. Read-only across the entire chat surface — the
 * route's tools never write.
 *
 * Conversation state is per-session (in-memory). No persistence yet — the
 * cockpit is single-user single-session, and Andrew's question pattern so far
 * has been "ask once, read, close." If repeat-question patterns emerge,
 * persistence is a separate follow-up build (a corp_director_chat_messages
 * table + a /messages GET endpoint).
 */

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTED_OPENERS = [
  "What's our current HST owing position?",
  "Summarize today's brief entries.",
  "How much SR&ED-eligible expense have we logged YTD?",
  "What's open in the inbox right now?",
];

export function DirectorChatDock() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;

      setError(null);
      const next: ChatMessage[] = [
        ...messages,
        { role: "user", content: trimmed },
        { role: "assistant", content: "" },
      ];
      setMessages(next);
      setInput("");
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/cockpit/director-chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: next
              .filter((m, i) => !(i === next.length - 1 && m.role === "assistant"))
              .map((m) => ({ role: m.role, content: m.content })),
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw new Error(`Director chat failed (${res.status}): ${detail || "no body"}`);
        }
        if (!res.body) throw new Error("Empty response body");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.role === "assistant") {
              copy[copy.length - 1] = { role: "assistant", content: acc };
            }
            return copy;
          });
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setMessages((prev) => {
          const copy = [...prev];
          if (copy.length > 0 && copy[copy.length - 1].role === "assistant" && !copy[copy.length - 1].content) {
            copy.pop();
          }
          return copy;
        });
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, streaming],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open Director chat"
          className="fixed right-4 bottom-4 z-30 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/15 px-4 py-2.5 text-[13px] font-medium text-amber-200 shadow-lg shadow-amber-500/10 backdrop-blur-md transition-all hover:bg-amber-500/25 hover:shadow-amber-500/20 sm:right-6 sm:bottom-6"
        >
          <Briefcase className="h-4 w-4" aria-hidden />
          Ask Director
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Director chat"
          className="fixed inset-x-2 bottom-2 z-30 flex h-[70vh] max-h-[640px] flex-col overflow-hidden rounded-2xl border border-amber-500/25 bg-[oklch(0.20_0.04_262)] shadow-2xl shadow-black/40 backdrop-blur-md sm:right-6 sm:bottom-6 sm:left-auto sm:w-[420px]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-amber-500/20 bg-[oklch(0.18_0.04_262/0.85)] px-4 py-3">
            <div className="inline-flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/15 ring-1 ring-inset ring-amber-500/25">
                <Briefcase className="h-3.5 w-3.5 text-amber-300" aria-hidden />
              </span>
              <div className="flex flex-col leading-tight">
                <span className="text-foreground text-[13px] font-semibold">Director</span>
                <span className="text-muted-foreground/70 text-[10px] tracking-wide uppercase">
                  AR Inc. operator brain
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close Director chat"
              className="text-muted-foreground hover:text-foreground inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white/5"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-[13px] leading-relaxed"
          >
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-muted-foreground/80 text-[12px]">
                  Internal operator chat for Agent Runway Inc. Read-only across the corporate ledger and reporting views.
                </p>
                <div className="space-y-1.5">
                  {SUGGESTED_OPENERS.map((opener) => (
                    <button
                      key={opener}
                      type="button"
                      onClick={() => void sendMessage(opener)}
                      className="text-muted-foreground hover:text-foreground hover:border-amber-500/30 hover:bg-amber-500/[0.04] block w-full rounded-md border border-white/5 bg-white/[0.02] px-3 py-2 text-left text-[12px] transition-colors"
                    >
                      {opener}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[88%] rounded-lg px-3 py-2 whitespace-pre-wrap",
                    m.role === "user"
                      ? "bg-blue-600/15 text-foreground border border-blue-500/20"
                      : "border border-amber-500/15 bg-amber-500/[0.04] text-foreground",
                  )}
                >
                  {m.content || (
                    <span className="text-muted-foreground/70 inline-flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                      thinking
                    </span>
                  )}
                </div>
              </div>
            ))}
            {error && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
                {error}
              </div>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={handleSubmit}
            className="flex items-end gap-2 border-t border-amber-500/15 bg-[oklch(0.18_0.04_262/0.65)] px-3 py-3"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Director something operator-shaped…"
              rows={1}
              className="text-foreground placeholder:text-muted-foreground/50 flex-1 resize-none rounded-md border border-white/10 bg-black/20 px-3 py-2 text-[13px] focus:border-amber-500/40 focus:outline-none"
              disabled={streaming}
            />
            {streaming ? (
              <button
                type="button"
                onClick={stop}
                className="inline-flex h-9 items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 px-3 text-[12px] text-red-300 hover:bg-red-500/20"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                aria-label="Send"
                disabled={!input.trim()}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-amber-500/30 bg-amber-500/15 text-amber-200 transition-colors hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="h-4 w-4" aria-hidden />
              </button>
            )}
          </form>
        </div>
      )}
    </>
  );
}
