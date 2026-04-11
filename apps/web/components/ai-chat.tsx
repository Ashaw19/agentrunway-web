"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sparkles, X, Send, Bot, User, ChevronDown, ThumbsUp, ThumbsDown, CheckCircle2, AlertTriangle, ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAiChat } from "@/lib/ai-chat-context";
import { toast } from "sonner";

interface Message {
  role: "user" | "assistant";
  content: string;
}

// ── Action Card Parsing ──────────────────────────────────────────────────────

interface ParsedSegment {
  type: "text" | "actions" | "missing" | "preview";
  content: string;
  items?: string[];
  link?: { label: string; href: string };
}

/**
 * Parse an AI response into structured segments for rich rendering.
 * Detects: ✓ action confirmations, MISSING_FIELDS hints, PREVIEW blocks,
 * and page navigation links like **CRM** (/crm).
 */
function parseMessageSegments(text: string): ParsedSegment[] {
  const segments: ParsedSegment[] = [];
  const lines = text.split("\n");
  let currentText: string[] = [];
  let currentActions: string[] = [];
  let inPreview = false;
  let previewLines: string[] = [];

  const flushText = () => {
    if (currentText.length > 0) {
      segments.push({ type: "text", content: currentText.join("\n") });
      currentText = [];
    }
  };

  const flushActions = () => {
    if (currentActions.length > 0) {
      // Extract a navigation link from the surrounding text if present
      const allText = lines.join(" ");
      const linkMatch = allText.match(/\*\*([^*]+)\*\*\s*\(\/([a-z-]+)\)/);
      const link = linkMatch ? { label: linkMatch[1], href: `/${linkMatch[2]}` } : undefined;

      segments.push({
        type: "actions",
        content: currentActions.join("\n"),
        items: [...currentActions],
        link,
      });
      currentActions = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect PREVIEW blocks
    if (trimmed.startsWith("PREVIEW")) {
      flushText();
      flushActions();
      inPreview = true;
      previewLines = [trimmed];
      continue;
    }
    if (inPreview) {
      if (trimmed === "" && previewLines.length > 1) {
        segments.push({ type: "preview", content: previewLines.join("\n") });
        previewLines = [];
        inPreview = false;
      } else {
        previewLines.push(trimmed);
      }
      continue;
    }

    // Detect action confirmation lines (✓ or ✅)
    if (trimmed.startsWith("✓") || trimmed.startsWith("✅")) {
      flushText();
      currentActions.push(trimmed.replace(/^[✓✅]\s*/, ""));
      continue;
    }

    // Detect MISSING_FIELDS hint
    if (trimmed.includes("MISSING_FIELDS:") || trimmed.includes("still missing")) {
      flushText();
      flushActions();
      segments.push({ type: "missing", content: trimmed });
      continue;
    }

    // Regular text
    flushActions();
    currentText.push(line);
  }

  // Flush remaining
  if (inPreview && previewLines.length > 0) {
    segments.push({ type: "preview", content: previewLines.join("\n") });
  }
  flushText();
  flushActions();

  return segments;
}

/**
 * Extract the first page link from text like **CRM** (/crm) or **Pipeline** (/pipeline)
 */
function extractPageLink(text: string): { label: string; href: string } | null {
  const match = text.match(/\*\*([^*]+)\*\*\s*\(\/([a-z-]+)\)/);
  return match ? { label: match[1], href: `/${match[2]}` } : null;
}

/**
 * Check if a message contains completed actions (for toast firing)
 */
function countActions(text: string): number {
  return (text.match(/^[✓✅]/gm) || []).length;
}

/**
 * Extract a short summary of actions for the toast message
 */
function getActionSummary(text: string): string {
  const actions = text.match(/^[✓✅]\s*.+/gm);
  if (!actions || actions.length === 0) return "";
  const first = actions[0].replace(/^[✓✅]\s*/, "").split("—")[0].split(".")[0].trim();
  if (actions.length === 1) return first;
  return `${first} (+${actions.length - 1} more)`;
}

/**
 * Extract follow-up suggestion chips from AI response text.
 * Looks for patterns like:
 * - [SUGGEST: text here] — explicit AI-generated suggestions
 * - Lines mentioning actions the user could take next
 */
function extractFollowUpChips(text: string): string[] {
  const chips: string[] = [];

  // Explicit [SUGGEST: ...] tags
  const suggestMatches = text.matchAll(/\[SUGGEST:\s*([^\]]+)\]/gi);
  for (const m of suggestMatches) {
    chips.push(m[1].trim());
  }

  // If explicit suggestions exist, use those
  if (chips.length > 0) return chips.slice(0, 3);

  // Auto-detect common follow-up patterns from action responses
  if (countActions(text) > 0) {
    // After client creation — suggest filling details
    if (text.includes("still missing") && text.includes("email")) {
      const nameMatch = text.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)'s profile/);
      if (nameMatch) {
        chips.push(`Add ${nameMatch[1]}'s contact info`);
      }
    }
    // After creating a pipeline deal — suggest close date
    if (text.includes("pipeline") && text.includes("close date")) {
      chips.push("Add an expected close date");
    }
    // After a transaction — suggest client status change
    if (text.includes("Cruising") || text.includes("cruising")) {
      const nameMatch = text.match(/moving?\s+([A-Z][a-z]+)/);
      if (nameMatch) chips.push(`Move ${nameMatch[1]} to Cruising`);
    }
    // After logging activity — suggest a follow-up task
    if (text.includes("Activity logged") || text.includes("activity logged")) {
      chips.push("Create a follow-up task");
    }
    // After expense — suggest viewing overhead
    if (text.includes("Overhead") || text.includes("overhead")) {
      chips.push("Show my expense breakdown");
    }
  }

  return chips.slice(0, 3);
}

type ConfidenceLevel = "high" | "medium" | "low";

/**
 * Parse and strip the [confidence:xxx] tag the AI appends to every response.
 * Also strips partial tags during streaming so raw bracket text never shows.
 */
function parseConfidence(content: string): {
  text: string;
  level: ConfidenceLevel | null;
} {
  // Full tag match — response is complete
  const full = content.match(/\[confidence:(high|medium|low)\]\s*$/i);
  if (full) {
    return {
      text: content.slice(0, -full[0].length).trimEnd(),
      level: full[1].toLowerCase() as ConfidenceLevel,
    };
  }
  // Partial tag match — still streaming, strip incomplete bracket so it never flashes
  const partial = content.match(/\[confidence:[^\]]*$/i);
  if (partial) {
    return { text: content.slice(0, -partial[0].length).trimEnd(), level: null };
  }
  return { text: content, level: null };
}

// ── Rich Rendering Components ─────────────────────────────────────────────────

/**
 * Renders inline text with basic markdown-like formatting:
 * **bold**, page links like **CRM** (/crm), and bullet points.
 */
function FormattedText({ text, onNavigate }: { text: string; onNavigate?: (href: string) => void }) {
  // Replace **text** (/path) with clickable links
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const linkMatch = remaining.match(/\*\*([^*]+)\*\*\s*\(\/([a-z-]+)\)/);
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);

    if (linkMatch && (!boldMatch || remaining.indexOf(linkMatch[0]) <= remaining.indexOf(boldMatch[0]))) {
      const idx = remaining.indexOf(linkMatch[0]);
      if (idx > 0) parts.push(<span key={key++}>{remaining.slice(0, idx)}</span>);
      parts.push(
        <button
          key={key++}
          onClick={() => onNavigate?.(`/${linkMatch[2]}`)}
          className="inline-flex items-center gap-0.5 font-semibold text-blue-400 hover:text-blue-300 transition-colors underline underline-offset-2"
        >
          {linkMatch[1]}
          <ExternalLink className="h-2.5 w-2.5" />
        </button>
      );
      remaining = remaining.slice(idx + linkMatch[0].length);
    } else if (boldMatch) {
      const idx = remaining.indexOf(boldMatch[0]);
      if (idx > 0) parts.push(<span key={key++}>{remaining.slice(0, idx)}</span>);
      parts.push(<strong key={key++} className="font-semibold text-slate-100">{boldMatch[1]}</strong>);
      remaining = remaining.slice(idx + boldMatch[0].length);
    } else {
      if (remaining) parts.push(<span key={key++}>{remaining}</span>);
      break;
    }
  }

  return <>{parts}</>;
}

/**
 * Renders an assistant message with rich action cards, preview blocks,
 * and missing-field warnings.
 */
function AssistantMessage({ content, isStreaming, onNavigate }: { content: string; isStreaming: boolean; onNavigate?: (href: string) => void }) {
  // During streaming, use simple pre-wrap rendering to avoid layout thrashing
  if (isStreaming) {
    return <span style={{ whiteSpace: "pre-wrap" }}>{content}</span>;
  }

  const segments = parseMessageSegments(content);

  // If no special segments detected, fall back to formatted text
  if (segments.length === 1 && segments[0].type === "text") {
    return (
      <span style={{ whiteSpace: "pre-wrap" }}>
        <FormattedText text={content} onNavigate={onNavigate} />
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {segments.map((seg, i) => {
        if (seg.type === "actions" && seg.items) {
          return (
            <div
              key={i}
              className="rounded-lg px-3 py-2.5"
              style={{
                background: "rgba(34, 197, 94, 0.08)",
                border: "1px solid rgba(34, 197, 94, 0.20)",
              }}
            >
              <div className="flex flex-col gap-1.5">
                {seg.items.map((item, j) => (
                  <div key={j} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    <span className="text-slate-200">
                      <FormattedText text={item} onNavigate={onNavigate} />
                    </span>
                  </div>
                ))}
              </div>
              {seg.link && (
                <button
                  onClick={() => onNavigate?.(seg.link!.href)}
                  className="mt-2 flex items-center gap-1 text-[11px] font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  View in {seg.link.label}
                  <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        }

        if (seg.type === "missing") {
          return (
            <div
              key={i}
              className="rounded-lg px-3 py-2 text-sm"
              style={{
                background: "rgba(245, 158, 11, 0.08)",
                border: "1px solid rgba(245, 158, 11, 0.20)",
              }}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                <span className="text-slate-300">
                  <FormattedText text={seg.content.replace("MISSING_FIELDS:", "").trim()} onNavigate={onNavigate} />
                </span>
              </div>
            </div>
          );
        }

        if (seg.type === "preview") {
          return (
            <div
              key={i}
              className="rounded-lg px-3 py-2 text-sm"
              style={{
                background: "rgba(99, 102, 241, 0.08)",
                border: "1px solid rgba(99, 102, 241, 0.20)",
              }}
            >
              <span className="whitespace-pre-wrap text-slate-300">
                <FormattedText text={seg.content.replace(/^PREVIEW\s*[—–-]?\s*/i, "")} onNavigate={onNavigate} />
              </span>
            </div>
          );
        }

        // Regular text
        return (
          <span key={i} style={{ whiteSpace: "pre-wrap" }}>
            <FormattedText text={seg.content} onNavigate={onNavigate} />
          </span>
        );
      })}
    </div>
  );
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

  return "Hey! I'm your Co-Pilot. I can help you explore your business data — GCI, pipeline, expenses, and more. All outputs are estimates for informational purposes only.\n\nWhat do you want to know?";
}

export function AiChat({ financialContext }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { isOpen, setOpen, pendingQuestion, consumeQuestion } = useAiChat();

  const [initialMessage] = useState<Message>({
    role: "assistant",
    content: buildInitialMessage(financialContext),
  });
  const [messages, setMessages] = useState<Message[]>([initialMessage]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  // Enhancement #2: Tracks which message index has been given feedback
  const [feedbackGiven, setFeedbackGiven] = useState<Record<number, "positive" | "negative">>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasNudgedRef = useRef(false);

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

  // Proactive nudge — on first open per session, fetch the morning briefing
  // and surface the top priority as an additional AI message.
  useEffect(() => {
    if (!isOpen || hasNudgedRef.current) return;
    hasNudgedRef.current = true;

    // Use sessionStorage to avoid nudging multiple times per session
    const sessionKey = "ar_nudged_" + new Date().toDateString();
    if (sessionStorage.getItem(sessionKey)) return;

    (async () => {
      try {
        const res = await fetch("/api/briefing");
        if (!res.ok) return;
        const { briefing } = await res.json();
        if (!briefing?.priorities?.length && !briefing?.alerts?.length) return;

        // Build a concise proactive message from the briefing data
        const parts: string[] = [];
        if (briefing.alerts?.length) {
          parts.push(`**Heads up:** ${briefing.alerts[0]}`);
        }
        if (briefing.priorities?.length) {
          const topPriority = briefing.priorities[0];
          parts.push(`**Top priority today:** ${topPriority}`);
          if (briefing.priorities[1]) {
            parts.push(`Also on your radar: ${briefing.priorities[1]}`);
          }
        }
        if (briefing.encouragement) {
          parts.push(briefing.encouragement);
        }

        if (parts.length === 0) return;

        const nudgeMessage: Message = {
          role: "assistant",
          content: parts.join("\n\n") + "\n\nWhat do you want to dig into?",
        };

        setMessages((prev) => [...prev, nudgeMessage]);
        if (!isOpen) setUnread((n) => n + 1);
        sessionStorage.setItem(sessionKey, "1");
      } catch {
        // Silent — nudge is non-critical
      }
    })();
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

        // Fire toast for completed actions
        const actionCount = countActions(assistantText);
        if (actionCount > 0) {
          const summary = getActionSummary(assistantText);
          const link = extractPageLink(assistantText);
          toast.success(summary, {
            description: link ? `View in ${link.label}` : undefined,
            action: link
              ? {
                  label: "Go →",
                  onClick: () => router.push(link.href),
                }
              : undefined,
            duration: 5000,
          });
        }

        if (!isOpen) setUnread((n) => n + 1);
      } catch (err) {
        console.error("Chat error:", err);
        const raw = err instanceof Error ? err.message : "";
        const errMsg =
          raw.includes("Too many") ? "You're sending messages too quickly. Please wait a moment." :
          raw.includes("not configured") ? "Co-Pilot is temporarily unavailable. Please try again shortly." :
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

  // Enhancement #2: Submit thumbs up/down feedback
  const handleFeedback = useCallback(
    async (messageIndex: number, feedback: "positive" | "negative") => {
      if (feedbackGiven[messageIndex]) return; // Already submitted
      setFeedbackGiven((prev) => ({ ...prev, [messageIndex]: feedback }));
      try {
        await fetch("/api/chat/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feedback }),
        });
      } catch {
        // Silent failure — feedback is non-critical
      }
    },
    [feedbackGiven],
  );

  return (
    <>
      {/* Floating chat button */}
      <button
        onClick={() => setOpen(!isOpen)}
        data-tour="ai-chat"
        className={cn(
          "fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full shadow-xl transition-all duration-200",
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
        aria-label="Open Co-Pilot"
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
        <div className="fixed bottom-[4.5rem] right-5 z-40 flex w-[calc(100vw-3rem)] max-w-[500px] flex-col overflow-hidden rounded-2xl shadow-2xl sm:w-[500px]"
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
                <p className="text-sm font-bold text-white">Co-Pilot</p>
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
            style={{ maxHeight: "min(520px, calc(100vh - 240px))", minHeight: "200px" }}
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
                {/* Bubble + feedback */}
                <div className="max-w-[82%]">
                  <div
                    className={cn(
                      "rounded-2xl px-3 py-2 text-sm leading-relaxed",
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
                      msg.role === "assistant" ? (
                        <AssistantMessage content={parseConfidence(msg.content).text} isStreaming={loading && i === messages.length - 1} onNavigate={(href) => router.push(href)} />
                      ) : (
                        <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
                      )
                    ) : (
                      <span className="inline-flex gap-1 text-slate-500">
                        <span className="animate-bounce">·</span>
                        <span className="animate-bounce [animation-delay:0.15s]">·</span>
                        <span className="animate-bounce [animation-delay:0.3s]">·</span>
                      </span>
                    )}
                  </div>
                  {/* Confidence badge + thumbs feedback — shown after streaming completes */}
                  {msg.role === "assistant" && msg.content && i > 0 && !loading && (
                    <div className="mt-1 flex items-center gap-2 pl-1">
                      {/* Confidence indicator */}
                      {(() => {
                        const { level } = parseConfidence(msg.content);
                        if (!level) return null;
                        return (
                          <span
                            className={cn(
                              "text-[9px] font-medium",
                              level === "high" && "text-emerald-500",
                              level === "medium" && "text-amber-500",
                              level === "low" && "text-slate-500",
                            )}
                            title={
                              level === "high"
                                ? "Based on your data"
                                : level === "medium"
                                  ? "Reasonable estimate"
                                  : "Limited data — verify manually"
                            }
                          >
                            {level === "high" ? "✓" : level === "medium" ? "~" : "?"}{" "}
                            {level === "high" ? "Data-backed" : level === "medium" ? "Estimate" : "Uncertain"}
                          </span>
                        );
                      })()}

                      {/* Divider when both confidence and feedback are present */}
                      {parseConfidence(msg.content).level && (
                        <span className="text-slate-700 text-[9px]">·</span>
                      )}

                      {/* Thumbs up/down feedback */}
                      {feedbackGiven[i] ? (
                        <span className="text-[10px] text-slate-600">
                          {feedbackGiven[i] === "positive" ? "Thanks!" : "Noted — we'll improve"}
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => handleFeedback(i, "positive")}
                            className="rounded p-0.5 text-slate-600 transition-colors hover:text-emerald-400"
                            aria-label="Helpful"
                            title="Helpful"
                          >
                            <ThumbsUp className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => handleFeedback(i, "negative")}
                            className="rounded p-0.5 text-slate-600 transition-colors hover:text-rose-400"
                            aria-label="Not helpful"
                            title="Not helpful"
                          >
                            <ThumbsDown className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  {/* Follow-up suggestion chips — shown after action responses */}
                  {msg.role === "assistant" && msg.content && !loading && i === messages.length - 1 && (() => {
                    const chips = extractFollowUpChips(parseConfidence(msg.content).text);
                    if (chips.length === 0) return null;
                    return (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {chips.map((chip) => (
                          <button
                            key={chip}
                            onClick={() => handleSend(chip)}
                            className="rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors"
                            style={{
                              background: "rgba(99, 102, 241, 0.12)",
                              border: "1px solid rgba(99, 102, 241, 0.25)",
                              color: "rgb(165, 180, 252)",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "rgba(99, 102, 241, 0.22)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "rgba(99, 102, 241, 0.12)";
                            }}
                          >
                            {chip}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
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
