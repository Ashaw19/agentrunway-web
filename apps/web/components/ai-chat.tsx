"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, X, Send, Bot, User, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAiChat } from "@/lib/ai-chat-context";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  financialContext: string;
}

/* ── Page-specific suggested questions ──────────────────────────── */

const DEFAULT_SUGGESTIONS = [
  "Am I on pace to hit my annual goal?",
  "How much should I set aside for taxes?",
  "What's my biggest business risk right now?",
  "How does my performance compare to other agents?",
];

const PAGE_SUGGESTIONS: Record<string, string[]> = {
  "/dashboard": [
    "Am I on pace to hit my annual goal?",
    "How is my Runway Score calculated?",
    "What's my biggest business risk right now?",
    "How much should I set aside for taxes?",
  ],
  "/transactions": [
    "What's my average deal size this year?",
    "How is GCI calculated?",
    "Am I on pace for my annual goal?",
    "How do pending vs closed deals differ?",
  ],
  "/expenses": [
    "What's a healthy expense ratio?",
    "How do CRA mileage deductions work?",
    "What expenses are tax-deductible?",
    "What is the meals deduction limit?",
  ],
  "/forecast": [
    "How are probability bands calculated?",
    "What should I set aside for taxes per deal?",
    "How does the 5-year projection work?",
    "What is my effective tax rate?",
  ],
  "/crm": [
    "What does each client status mean?",
    "How do client tiers work?",
    "What's a stale lead?",
    "How does speed-to-lead work?",
  ],
  "/reports": [
    "What is the T2125 form?",
    "How does CCA depreciation work?",
    "How is the home office deduction calculated?",
    "What does my benchmark percentile mean?",
  ],
  "/guide": [
    "Give me a quick overview of Agent Runway",
    "How do I add a new transaction?",
    "How does the tax engine work?",
    "What are the keyboard shortcuts?",
  ],
};

function buildInitialMessage(context: string): string {
  const gciMatch = context.match(/YTD GCI:\s*\$?([\d,]+)/);
  const goalMatch = context.match(/Annual GCI Goal:\s*\$?([\d,]+)/);
  const dealsMatch = context.match(/Closed Deals YTD:\s*(\d+)/);

  if (gciMatch && goalMatch) {
    const ytd = parseInt(gciMatch[1].replace(/,/g, ""));
    const goal = parseInt(goalMatch[1].replace(/,/g, ""));
    const pct = Math.round((ytd / goal) * 100);
    const deals = dealsMatch ? parseInt(dealsMatch[1]) : 0;
    return `Hey! I've got your numbers in front of me.\n\nYou're at ${pct}% of your annual goal with ${deals} deal${deals !== 1 ? "s" : ""} closed. ${pct >= 75 ? "You're killing it — let's make sure you finish strong." : pct >= 50 ? "You're past the halfway mark — solid position." : "There's ground to make up, but the year isn't over."}\n\nWhat do you want to dig into?`;
  }

  return "Hey! I'm your Agent Runway AI advisor. I have your live business data and I'm here to help you think through strategy, taxes, runway, or whatever's on your mind.\n\nWhat do you want to know?";
}

export function AiChat({ financialContext }: Props) {
  const pathname = usePathname();
  const { isOpen, setOpen, pendingQuestion, consumeQuestion } = useAiChat();

  const [initialMessage] = useState<Message>({
    role: "assistant",
    content: buildInitialMessage(financialContext),
  });
  const [messages, setMessages] = useState<Message[]>([initialMessage]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Pick page-specific suggestions
  const suggestions = PAGE_SUGGESTIONS[pathname] ?? DEFAULT_SUGGESTIONS;

  // Scroll to bottom on new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setUnread(0);
    }
  }, [messages, isOpen]);

  // Focus textarea when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 100);
      setUnread(0);
    }
  }, [isOpen]);

  const handleSend = useCallback(
    async (overrideText?: string) => {
      const trimmed = (overrideText ?? input).trim();
      if (!trimmed || loading) return;

      const userMessage: Message = { role: "user", content: trimmed };
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      setInput("");
      setLoading(true);

      // Add placeholder for streaming
      const assistantPlaceholder: Message = { role: "assistant", content: "" };
      setMessages([...newMessages, assistantPlaceholder]);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            currentPage: pathname,
          }),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(errText || `HTTP ${res.status}`);
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let assistantText = "";

        if (reader) {
          let streamCompleted = false;
          while (true) {
            const { done, value } = await reader.read();
            if (done) { streamCompleted = true; break; }
            assistantText += decoder.decode(value, { stream: true });
            const captured = assistantText;
            setMessages([
              ...newMessages,
              { role: "assistant", content: captured },
            ]);
          }
          // Warn if stream ended without completing (timeout, network drop)
          if (!streamCompleted && assistantText.length > 0) {
            assistantText += "\n\n_(Response may be incomplete — please try again.)_";
            setMessages([
              ...newMessages,
              { role: "assistant", content: assistantText },
            ]);
          }
        }
        if (!isOpen) setUnread((n) => n + 1);
      } catch (err) {
        console.error("Chat error:", err);
        const raw = err instanceof Error ? err.message : "";
        const errMsg =
          raw.includes("Too many") ? "You're sending messages too quickly. Please wait a moment." :
          raw.includes("not configured") ? "AI advisor is not set up yet. Check your Groq API key in Settings." :
          "Sorry, I couldn't connect right now. Try again in a moment.";
        setMessages([
          ...newMessages,
          { role: "assistant", content: errMsg },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, messages, financialContext, pathname, isOpen],
  );

  // Handle pending questions from ExplainButton / Guide
  useEffect(() => {
    if (isOpen && pendingQuestion && !loading) {
      const question = consumeQuestion();
      if (question) {
        // Small delay to let the panel render first
        setTimeout(() => handleSend(question), 150);
      }
    }
  }, [isOpen, pendingQuestion, loading, consumeQuestion, handleSend]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <>
      {/* Floating chat button */}
      <button
        onClick={() => setOpen(!isOpen)}
        data-tour="ai-chat"
        className={cn(
          "fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition-all duration-200",
          isOpen
            ? "bg-slate-700 text-white scale-95"
            : "text-white",
        )}
        style={
          isOpen
            ? {}
            : {
                background: "linear-gradient(135deg, #1d4ed8, #7c3aed)",
                boxShadow: "0 4px 24px rgba(99,102,241,0.5)",
              }
        }
        aria-label="Open AI advisor"
      >
        {isOpen ? (
          <ChevronDown className="h-5 w-5" />
        ) : (
          <>
            <Sparkles className="h-6 w-6" />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-black">
                {unread}
              </span>
            )}
          </>
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-40 flex w-[calc(100vw-3rem)] max-w-sm flex-col overflow-hidden rounded-2xl shadow-2xl sm:w-96"
          style={{
            border: "1px solid rgba(255,255,255,0.08)",
            background: "oklch(0.13 0.05 265)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{
              background: "linear-gradient(135deg, #1e3a8a, #4c1d95)",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
                <Sparkles className="h-4 w-4 text-blue-300" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">AI Advisor</p>
                <p className="text-[10px] text-blue-300/70">Sees your live business data</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg p-1 text-white/50 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div
            className="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
            style={{ maxHeight: "360px", minHeight: "200px" }}
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2",
                  msg.role === "user" ? "flex-row-reverse" : "flex-row",
                )}
              >
                {/* Avatar */}
                <div
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px]",
                    msg.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-white/10 text-blue-300",
                  )}
                >
                  {msg.role === "user" ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                </div>
                {/* Bubble */}
                <div
                  className={cn(
                    "max-w-[82%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "rounded-tr-sm bg-blue-600 text-white"
                      : "rounded-tl-sm text-slate-200",
                  )}
                  style={
                    msg.role === "assistant"
                      ? { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }
                      : {}
                  }
                >
                  {msg.content ? (
                    <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
                  ) : (
                    <span className="inline-flex gap-1 text-slate-500">
                      <span className="animate-bounce">·</span>
                      <span className="animate-bounce [animation-delay:0.15s]">·</span>
                      <span className="animate-bounce [animation-delay:0.3s]">·</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggested questions — only shown when no user messages yet */}
          {messages.filter((m) => m.role === "user").length === 0 && (
            <div className="px-4 pb-2">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                Quick questions
              </p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSend(q)}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-slate-400 transition-colors hover:bg-white/[0.08] hover:text-slate-200"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <p className="px-4 pb-1 text-[9px] leading-tight text-slate-600">
            AI estimates only — not tax, legal, or financial advice. Consult a qualified professional.
          </p>

          {/* Input */}
          <div
            className="flex items-end gap-2 p-3"
            style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
          >
            <Textarea
              ref={textareaRef}
              rows={1}
              placeholder="Ask anything about your business…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              className="max-h-24 min-h-9 resize-none text-sm"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "white",
              }}
            />
            <Button
              size="icon"
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              className="h-9 w-9 shrink-0"
              style={{
                background: "linear-gradient(135deg, #2563eb, #7c3aed)",
              }}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
