"use client";

import { useState, useRef, useEffect, useCallback, Fragment } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sparkles, X, Send, Bot, User, ChevronDown, ThumbsUp, ThumbsDown, CheckCircle2, AlertTriangle, ArrowRight, ExternalLink, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAiChat } from "@/lib/ai-chat-context";
import { toast } from "sonner";
import { getPersona, DEFAULT_PERSONA, parseMention, detectHandoff, type Persona } from "@/lib/flight-crew/personas";
import { PersonaBadge } from "@/components/flight-crew/persona-badge";
import { PersonaSelector } from "@/components/flight-crew/persona-selector";
import { MentionAutocomplete } from "@/components/flight-crew/mention-autocomplete";

interface Message {
  role: "user" | "assistant";
  content: string;
  id: string;
  /**
   * Flight Crew persona who authored this message (for "assistant" role only).
   * "captain" | "navigator" | "dispatcher". Optional for backwards
   * compatibility with messages stored before the Flight Crew ship —
   * legacy messages default to "captain" via getPersona() at render time.
   * See lib/flight-crew/personas.ts for the canonical type.
   */
  persona?: Persona;
  /**
   * Optional structured record of a gated tool call that resolved on this
   * message. Populated when the user approves or denies a tool via the
   * approval card. Not rendered in the UI — only folded into `content` when
   * the message is serialized for the next /api/chat call, so the model
   * knows what it actually ran (or was asked to run) on the previous turn.
   */
  toolInvocation?: {
    toolName: string;
    args: Record<string, unknown>;
    status: "approved" | "denied";
    /** Tool result text — only present when status === "approved". */
    result?: string;
  };
}

interface PendingApproval {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  description: string;
  messageId: string; // which assistant message this belongs to
}

/**
 * Fold a message's toolInvocation (if any) into a content-prefix annotation
 * the model can parse. Keeps the UI message clean (renders `m.content` only)
 * while giving the next model turn structured context about the tool that
 * just ran. Called by handleSend when building the /api/chat payload.
 */
function serializeMessageForAI(m: Message): { role: "user" | "assistant"; content: string } {
  if (m.role !== "assistant" || !m.toolInvocation) {
    return { role: m.role, content: m.content };
  }
  const { toolName, args, status, result } = m.toolInvocation;
  let argsJson: string;
  try {
    argsJson = JSON.stringify(args);
  } catch {
    argsJson = "{}";
  }
  // Cap args to keep the annotation bounded — server slices messages to 4000 chars.
  if (argsJson.length > 600) argsJson = argsJson.slice(0, 600) + "…";
  const annotation = status === "approved"
    ? `[Flight Crew called ${toolName} (user approved). Args: ${argsJson}. Result: ${String(result ?? "").slice(0, 800)}]`
    : `[Flight Crew proposed ${toolName} (user denied — no action taken). Args: ${argsJson}]`;
  return { role: m.role, content: `${annotation}\n\n${m.content}` };
}

let msgIdCounter = 0;
function nextMsgId(): string {
  return `msg-${++msgIdCounter}-${Date.now()}`;
}

// ── Tool call status labels (shown while tools execute) ─────────────────────
const TOOL_STATUS_LABELS: Record<string, string> = {
  searchClients: "Searching clients…",
  searchClientsByFilter: "Filtering clients…",
  searchPipelineDeals: "Searching pipeline…",
  createClient: "Creating client…",
  createPipelineDeal: "Adding pipeline deal…",
  updateClientDetails: "Updating profile…",
  updateClientNotes: "Adding notes…",
  updateClientStatus: "Updating status…",
  updateClientTags: "Updating tags…",
  updateClientTone: "Setting tone…",
  logContactActivity: "Logging activity…",
  createContactTask: "Creating task…",
  addRecurringExpense: "Adding expense…",
  deleteRecurringExpense: "Removing expense…",
  logExpense: "Logging expense…",
  updateExpense: "Updating expense…",
  logMileage: "Logging mileage…",
  recordReferral: "Recording referral…",
  recordTransaction: "Recording transaction…",
  updateTransaction: "Updating transaction…",
  updatePipelineDealValue: "Updating deal value…",
  addCCAAsset: "Adding CCA asset…",
  updateListingAppointment: "Updating listing…",
  addPropertyShowing: "Logging showing…",
  scheduleListingAppointment: "Scheduling appointment…",
  linkClientReferral: "Linking referral…",
  linkClientRelationship: "Linking relationship…",
  getClientSummary: "Loading client summary…",
  createFlightPlan: "Creating flight plan…",
  webSearch: "Searching the web…",
  draftOutreachForClient: "Drafting outreach message…",
  draftListingDescription: "Drafting listing description…",
  draftNewsletter: "Drafting newsletter…",
  draftSocialPost: "Drafting social post…",
  getWorkflowTemplates: "Checking Flight Plan templates…",
};

/**
 * Parse the Vercel AI SDK data stream protocol.
 * Extracts text deltas (prefix 0:), tool call events (prefix 9:),
 * and approval-required events (prefix b:).
 * Returns { text, toolName, approval } for each parsed chunk.
 */
function parseDataStreamChunk(raw: string): {
  text: string;
  toolName: string | null;
  approval: { toolCallId: string; toolName: string; args: Record<string, unknown>; description: string } | null;
} {
  let text = "";
  let toolName: string | null = null;
  let approval: { toolCallId: string; toolName: string; args: Record<string, unknown>; description: string } | null = null;

  const lines = raw.split("\n");
  for (const line of lines) {
    if (!line) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx < 1) continue;
    const prefix = line.slice(0, colonIdx);
    const payload = line.slice(colonIdx + 1);

    if (prefix === "0") {
      // Text delta — payload is a JSON string like "hello "
      try {
        text += JSON.parse(payload);
      } catch {
        // Not valid JSON, skip
      }
    } else if (prefix === "9") {
      // Tool call start — payload is JSON with toolName
      try {
        const parsed = JSON.parse(payload);
        if (parsed.toolName) toolName = parsed.toolName;
      } catch {
        // Skip
      }
    } else if (prefix === "b") {
      // Approval required — tool call paused, waiting for user confirmation
      try {
        const parsed = JSON.parse(payload);
        if (parsed.toolCallId && parsed.toolName) {
          approval = parsed;
        }
      } catch {
        // Skip
      }
    }
    // Prefixes a (tool-result), e (step-finish), d (finish) — we don't need to surface these
  }

  return { text, toolName, approval };
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
      // Extract a navigation link from the actions + nearby text (not entire message)
      const nearbyText = [...currentActions, ...currentText.slice(-3)].join(" ");
      const linkMatch = nearbyText.match(/\*\*([^*]+)\*\*\s*\(\/([\w/.-]+)\)/);
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
  const match = text.match(/\*\*([^*]+)\*\*\s*\(\/([\w/.-]+)\)/);
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

  return [...new Set(chips)].slice(0, 3);
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

  while (true) {
    const linkMatch = remaining.match(/\*\*([^*]+)\*\*\s*\(\/([\w/.-]+)\)/);
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

/**
 * Approval card — shown when a tool needs user confirmation before executing.
 * Replaces the old `confirmed: true` parameter hack with a proper UI gate.
 */
function ApprovalCard({
  approval,
  onApprove,
  onDeny,
  isProcessing,
  resolved,
}: {
  approval: PendingApproval;
  onApprove: () => void;
  onDeny: () => void;
  isProcessing: boolean;
  resolved: "approved" | "denied" | null;
}) {
  const TOOL_LABELS: Record<string, string> = {
    createClient: "Add Client",
    updateClientDetails: "Update Profile",
    updateClientNotes: "Add Note",
    updateClientStatus: "Update Status",
    updateClientTags: "Update Tags",
    updateClientTone: "Set Tone",
    linkClientReferral: "Link Referral",
    createPipelineDeal: "Add Deal",
    updatePipelineDealStage: "Move Deal",
    logContactActivity: "Log Activity",
    createContactTask: "Create Task",
    createRecurringExpense: "Add Expense",
    deleteRecurringExpense: "Remove Expense",
  };

  return (
    <div
      className="rounded-lg px-3 py-2.5 my-1"
      style={{
        background: resolved === "approved"
          ? "rgba(34, 197, 94, 0.08)"
          : resolved === "denied"
          ? "rgba(239, 68, 68, 0.08)"
          : "rgba(99, 102, 241, 0.08)",
        border: resolved === "approved"
          ? "1px solid rgba(34, 197, 94, 0.20)"
          : resolved === "denied"
          ? "1px solid rgba(239, 68, 68, 0.20)"
          : "1px solid rgba(99, 102, 241, 0.30)",
      }}
    >
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium text-indigo-300 uppercase tracking-wide mb-1">
            {TOOL_LABELS[approval.toolName] ?? "Action"} — Confirm?
          </div>
          <div className="text-sm text-slate-200">{approval.description}</div>
          {!resolved && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={onApprove}
                disabled={isProcessing}
                className="flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50"
              >
                {isProcessing ? (
                  <span className="animate-pulse">Executing…</span>
                ) : (
                  <>
                    <CheckCircle2 className="h-3 w-3" />
                    Confirm
                  </>
                )}
              </button>
              <button
                onClick={onDeny}
                disabled={isProcessing}
                className="flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors disabled:opacity-50"
              >
                <XCircle className="h-3 w-3" />
                Cancel
              </button>
            </div>
          )}
          {resolved === "approved" && (
            <div className="flex items-center gap-1 mt-1.5 text-xs text-emerald-400">
              <CheckCircle2 className="h-3 w-3" /> Approved and executed
            </div>
          )}
          {resolved === "denied" && (
            <div className="flex items-center gap-1 mt-1.5 text-xs text-red-400">
              <XCircle className="h-3 w-3" /> Cancelled
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface Props {
  financialContext: string;
}

/* ── Page-specific suggested questions ──────────────────────────── */

const DEFAULT_SUGGESTIONS = [
  "Am I on pace to hit my annual goal?",
  "What's my estimated tax burden this year?",
  "What's my biggest business risk right now?",
  "How does my performance compare to other agents?",
];

const PAGE_SUGGESTIONS: Record<string, string[]> = {
  "/dashboard": [
    "Am I on pace to hit my annual goal?",
    "How is my Runway Score calculated?",
    "What's my biggest business risk right now?",
    "What's my estimated tax burden this year?",
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
    "How does the engine estimate tax per deal?",
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
    const deals = dealsMatch ? parseInt(dealsMatch[1]) : 0;

    // Zero-data onboarding: no closed deals AND no YTD income. A pct/behind
    // narrative here would be misleading ("0% of goal, ground to make up")
    // — the reality is they just haven't logged anything yet. Give them a
    // welcoming onboarding nudge instead of a pep talk about a deficit.
    if (deals === 0 && ytd === 0) {
      return "Hey! I'm Captain, part of your Flight Crew. I coordinate with Navigator (finance) and Dispatcher (clients).\n\nI don't see any transactions yet — once you log your first deal or import history, we'll start turning your numbers into real answers. In the meantime I can walk you through how Agent Runway works, explain any metric, or help you think through your goal for the year.\n\nWhat's on your mind?";
    }

    const pct = Math.round((ytd / goal) * 100);
    return `Hey! I've got your numbers in front of me.\n\nYou're at ${pct}% of your annual goal with ${deals} deal${deals !== 1 ? "s" : ""} closed. ${pct >= 75 ? "You're killing it — let's make sure you finish strong." : pct >= 50 ? "You're past the halfway mark — solid position." : "There's ground to make up, but the year isn't over."}\n\nWhat do you want to dig into?`;
  }

  return "Hey! I'm Captain, part of your Flight Crew. I coordinate with Navigator (finance) and Dispatcher (clients). Ask me anything, or @-mention a specialist.\n\nAll outputs are estimates for informational purposes only. What do you want to know?";
}

export function AiChat({ financialContext }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { isOpen, setOpen, pendingQuestion, consumeQuestion } = useAiChat();

  const [initialMessage] = useState<Message>({
    role: "assistant",
    content: buildInitialMessage(financialContext),
    id: nextMsgId(),
    persona: "captain",
  });
  const [messages, setMessages] = useState<Message[]>([initialMessage]);
  // Flight Crew: currently active persona — determines which system prompt
  // the server uses for the next message. Default is Captain (per locked
  // direction decision). User can change via the selector or @mention.
  const [activePersona, setActivePersona] = useState<Persona>(DEFAULT_PERSONA);
  // Ref tracks latest messages so handleSend always has current state
  // (React 18 batching can defer setState callbacks, making side-effect
  // variable capture unreliable)
  const messagesRef = useRef<Message[]>([initialMessage]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  // Enhancement #2: Tracks which message ID has been given feedback
  const [feedbackGiven, setFeedbackGiven] = useState<Record<string, "positive" | "negative">>({});
  // Approval gate: pending tool calls waiting for user confirmation
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [approvalStates, setApprovalStates] = useState<Record<string, { processing: boolean; resolved: "approved" | "denied" | null }>>({});
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
          id: nextMsgId(),
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

      const userMessage: Message = { role: "user", content: trimmed, id: nextMsgId() };
      const assistantId = nextMsgId();
      setInput("");
      setLoading(true);

      // Flight Crew: an @mention in this message overrides activePersona for
      // this single turn only — the dropdown selection persists for the NEXT
      // message. Matches the "@mention is for a single message, selector is
      // for the active persona" model locked in the direction decisions.
      const mentionedPersona = parseMention(trimmed);
      const effectivePersona = mentionedPersona ?? activePersona;

      // Build newMessages from ref (always current — immune to React 18 batching)
      const newMessages = [...messagesRef.current, userMessage];
      setMessages([
        ...newMessages,
        { role: "assistant", content: "", id: assistantId, persona: effectivePersona },
      ]);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // serializeMessageForAI folds any tool-approval outcome into the
            // content prefix so the model sees what it ran (or was denied)
            // on the previous turn. UI still renders m.content only.
            messages: newMessages.map(serializeMessageForAI),
            currentPage: pathname,
            // Flight Crew: tell the server which persona is responding so it
            // loads the correct system-prompt prefix. effectivePersona is
            // either the @mention override from this message or the active
            // dropdown selection.
            persona: effectivePersona,
          }),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(errText || `HTTP ${res.status}`);
        }

        const decoder = new TextDecoder();

        // Inner helper: run one streaming pass, progressively updating the
        // LAST message in state (which must already be a placeholder with
        // targetId + targetPersona). Returns the final text for post-stream
        // logic (e.g., handoff detection). Used twice: once for the primary
        // response, and once more if a Flight Crew handoff is detected.
        const streamOneTurn = async (
          reader: ReadableStreamDefaultReader<Uint8Array>,
          targetId: string,
          targetPersona: Persona,
        ): Promise<string> => {
          let text = "";
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const chunk = decoder.decode(value, { stream: true });
              const parsed = parseDataStreamChunk(chunk);

              if (parsed.toolName) {
                setToolStatus(TOOL_STATUS_LABELS[parsed.toolName] ?? "Working…");
              }

              if (parsed.approval) {
                const approval = parsed.approval;
                setToolStatus(null);
                const pendingApproval: PendingApproval = {
                  ...approval,
                  messageId: targetId,
                };
                setPendingApprovals((prev) => [...prev, pendingApproval]);
                setApprovalStates((prev) => ({
                  ...prev,
                  [approval.toolCallId]: { processing: false, resolved: null },
                }));
                if (!text) {
                  text = "I'd like to take an action — please confirm:";
                }
                const captured = text;
                setMessages((prev) => [
                  ...prev.slice(0, -1),
                  { role: "assistant", content: captured, id: targetId, persona: targetPersona },
                ]);
              }

              if (parsed.text) {
                setToolStatus(null);
                text += parsed.text;
                const captured = text;
                setMessages((prev) => [
                  ...prev.slice(0, -1),
                  { role: "assistant", content: captured, id: targetId, persona: targetPersona },
                ]);
              }
            }
          } catch {
            if (text.length > 0) {
              text += "\n\n_(Response may be incomplete — please try again.)_";
            } else {
              text = "Sorry, something went wrong while processing that. Please try again.";
            }
            setMessages((prev) => [
              ...prev.slice(0, -1),
              { role: "assistant", content: text, id: targetId, persona: targetPersona },
            ]);
          }
          if (!text) {
            text = "Sorry, I couldn't complete that action. Please try again.";
            setMessages((prev) => [
              ...prev.slice(0, -1),
              { role: "assistant", content: text, id: targetId, persona: targetPersona },
            ]);
          }
          setToolStatus(null);
          return text;
        };

        const reader = res.body?.getReader();
        let assistantText = "";

        if (reader) {
          assistantText = await streamOneTurn(reader, assistantId, effectivePersona);
        }

        // Flight Crew — narrated-handoff auto-routing.
        // When a persona responds with a pure handoff sentence ("Navigator can
        // speak to this — passing it over."), we need to actually invoke the
        // target persona. Otherwise the handoff is prose theater: the message
        // reads like a routing action but nothing downstream responds.
        //
        // detectHandoff returns { target, displayText } when the completed
        // message contains a handoff phrase within the first 300 chars and
        // names a crew member OTHER than the current speaker. displayText is
        // the truncated handoff sentence — when a persona over-generates past
        // the handoff (e.g. Captain emits "...passing it over.\n---\nDispatcher
        // here. [full answer]" in one stream), we drop the extra text and let
        // the real target persona answer cleanly in its own bubble.
        //
        // On match: truncate the first bubble to the handoff sentence, append
        // a placeholder with the TARGET persona (so the existing handoff-seam
        // renderer draws between the two), then fire a second /api/chat call
        // that uses the target persona for its system-prompt prefix.
        const handoff = detectHandoff(assistantText, effectivePersona);
        if (handoff && assistantText && !assistantText.startsWith("Sorry")) {
          const { target: handoffTarget, displayText } = handoff;

          // If the speaker over-generated past the handoff sentence, truncate
          // the displayed message so only the handoff sentence remains. The
          // real target persona's response will render in its own bubble.
          if (displayText !== assistantText) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: displayText } : m,
              ),
            );
            assistantText = displayText;
          }

          const followupId = nextMsgId();
          // Captain's handoff is ALREADY in state (streamed into the placeholder
          // with id=assistantId during the first pass). We add a new placeholder
          // for the handoff target's response. The existing handoff-seam
          // renderer draws between the two because their personas differ.
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "", id: followupId, persona: handoffTarget },
          ]);

          try {
            // IMPORTANT: do NOT include captainMsg in the outgoing payload.
            // Anthropic treats a trailing assistant message as a PREFILL and
            // will try to continue Captain's sentence instead of starting a
            // fresh Navigator turn. With the target persona's prompt pulling
            // in a different direction, the model lands in an inconsistent
            // state and the stream errors out with a generic failure.
            //
            // The right shape is: send only through the user's question. The
            // target persona's system-prompt prefix tells it who it is and
            // what to do. Captain's handoff stays visible in the UI (it's in
            // messagesRef and renders normally); it just isn't in THIS one
            // outgoing request. On the next user turn, the array is
            // [..., captain-handoff, navigator-response, new-user-message]
            // — last message is user, so Anthropic generates naturally.
            const followupBody = {
              messages: newMessages.map(serializeMessageForAI),
              currentPage: pathname,
              persona: handoffTarget,
            };
            console.info("[flight-crew] auto-handoff", {
              from: effectivePersona,
              to: handoffTarget,
              messageCount: followupBody.messages.length,
              lastTwoRoles: followupBody.messages.slice(-2).map((m) => m.role),
            });

            const followupRes = await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(followupBody),
            });

            if (followupRes.ok) {
              const followupReader = followupRes.body?.getReader();
              if (followupReader) {
                const followupText = await streamOneTurn(followupReader, followupId, handoffTarget);
                console.info("[flight-crew] handoff response", {
                  to: handoffTarget,
                  length: followupText.length,
                  preview: followupText.slice(0, 120),
                });
                const followupActions = countActions(followupText);
                if (followupActions > 0) {
                  const summary = getActionSummary(followupText);
                  toast.success(summary, { duration: 5000 });
                }
              }
            } else {
              const errBody = await followupRes.text().catch(() => "");
              console.error("[flight-crew] handoff request failed", {
                status: followupRes.status,
                body: errBody.slice(0, 500),
              });
              setMessages((prev) => [
                ...prev.slice(0, -1),
                {
                  role: "assistant",
                  content: `The handoff didn't complete (HTTP ${followupRes.status}) — please try your question again.`,
                  id: followupId,
                  persona: handoffTarget,
                },
              ]);
            }
          } catch (handoffErr) {
            console.error("[flight-crew] handoff threw", handoffErr);
            setMessages((prev) => [
              ...prev.slice(0, -1),
              {
                role: "assistant",
                content: "The handoff was interrupted — please try your question again.",
                id: followupId,
                persona: handoffTarget,
              },
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
        const raw = err instanceof Error ? err.message : String(err);
        const errMsg =
          raw.includes("Too many") ? "You're sending messages too quickly. Please wait a moment." :
          raw.includes("not configured") ? "Flight Crew is temporarily unavailable. Please try again shortly." :
          "Sorry, I couldn't connect right now. Try again in a moment.";
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: "assistant", content: errMsg, id: assistantId, persona: prev[prev.length - 1]?.persona },
        ]);
      } finally {
        setLoading(false);
        setToolStatus(null);
      }
    },
    [input, loading, pathname, isOpen, router, activePersona],
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
      // If a @mention autocomplete is showing (input ends with @<letters>),
      // let the MentionAutocomplete document listener handle Enter to select
      // the persona — don't submit the partial mention text as a message.
      if (/(?:^|\s)@[a-zA-Z]*$/.test(input)) return;
      handleSend();
    }
  }

  // Enhancement #2: Submit thumbs up/down feedback
  const handleFeedback = useCallback(
    async (messageId: string, feedback: "positive" | "negative") => {
      if (feedbackGiven[messageId]) return; // Already submitted
      setFeedbackGiven((prev) => ({ ...prev, [messageId]: feedback }));
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

  // ── Approval handlers ──────────────────────────────────────────────────────
  const handleApprove = useCallback(
    async (approval: PendingApproval) => {
      setApprovalStates((prev) => ({
        ...prev,
        [approval.toolCallId]: { processing: true, resolved: null },
      }));

      try {
        const res = await fetch("/api/chat/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toolName: approval.toolName,
            args: approval.args,
          }),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(errText || `HTTP ${res.status}`);
        }

        const { result } = await res.json();

        setApprovalStates((prev) => ({
          ...prev,
          [approval.toolCallId]: { processing: false, resolved: "approved" },
        }));

        // Append the tool result as a new assistant message. The
        // toolInvocation record is folded into the wire content on the next
        // /api/chat call so the model knows what it just ran (and with which
        // args). Without this, follow-ups like "undo that" or "edit that
        // expense" have no structured context to reference.
        // Flight Crew: tag the tool-result message with the same persona as
        // the preceding assistant message so the UI renders the correct
        // avatar/color/name (not a default fallback to Captain).
        setMessages((prev) => {
          const lastPersona = prev[prev.length - 1]?.persona;
          const resultMessage: Message = {
            role: "assistant",
            content: result,
            id: nextMsgId(),
            persona: lastPersona,
            toolInvocation: {
              toolName: approval.toolName,
              args: approval.args,
              status: "approved",
              result,
            },
          };
          return [...prev, resultMessage];
        });

        // Fire toast for the action
        const actionCount = countActions(result);
        if (actionCount > 0) {
          const summary = getActionSummary(result);
          const link = extractPageLink(result);
          toast.success(summary, {
            description: link ? `View in ${link.label}` : undefined,
            action: link
              ? { label: "Go →", onClick: () => router.push(link.href) }
              : undefined,
            duration: 5000,
          });
        }
      } catch (err) {
        console.error("Approval error:", err);
        setApprovalStates((prev) => ({
          ...prev,
          [approval.toolCallId]: { processing: false, resolved: "denied" },
        }));
        const errMsg = err instanceof Error ? err.message : "Something went wrong";
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Failed to execute: ${errMsg}. Please try again.`, id: nextMsgId(), persona: prev[prev.length - 1]?.persona },
        ]);
      }
    },
    [router],
  );

  const handleDeny = useCallback((approval: PendingApproval) => {
    setApprovalStates((prev) => ({
      ...prev,
      [approval.toolCallId]: { processing: false, resolved: "denied" },
    }));
    // Record the denial on the message so the next model turn has structured
    // context — the user can ask "why did you cancel?" or "what did you want
    // to do?" and the model can answer from the preserved args.
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: "No problem — cancelled that action.",
        id: nextMsgId(),
        toolInvocation: {
          toolName: approval.toolName,
          args: approval.args,
          status: "denied",
        },
      },
    ]);
  }, []);

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
        aria-label="Open Flight Crew"
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
            // Bound total panel height to viewport so the header + selector
            // never get pushed off the top edge. The `bottom-[4.5rem]` anchor
            // (72px) + a small top breathing gap (16px) = 88px reserved; round
            // to 6rem for Tailwind-friendly math. Panel internals flex/shrink
            // inside this envelope; only the messages area scrolls.
            maxHeight: "calc(100vh - 6rem)",
          }}
        >
          {/* Header */}
          <div
            className="flex shrink-0 items-center justify-between px-4 py-3"
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
                <p className="text-sm font-bold text-white">Flight Crew</p>
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

          {/* Flight Crew: persona selector */}
          <div
            className="flex shrink-0 items-center px-4 py-2"
            style={{
              background: "rgba(255,255,255,0.02)",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <PersonaSelector
              activePersona={activePersona}
              onChange={setActivePersona}
            />
          </div>

          {/* Messages */}
          <div
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
          >
            {messages.map((msg, i) => {
              // Flight Crew: derive persona metadata for assistant messages.
              // Legacy messages without a persona default to Captain (per
              // getPersona() safe-fallback behavior).
              const personaMeta = msg.role === "assistant" ? getPersona(msg.persona) : null;
              const PersonaIcon = personaMeta?.icon;

              // Flight Crew: detect a crew handoff — when consecutive AI
              // messages come from different personas. Render a subtle seam
              // between them so the persona change is visually unmistakable.
              const prevMsg = i > 0 ? messages[i - 1] : null;
              const isHandoff =
                msg.role === "assistant" &&
                prevMsg?.role === "assistant" &&
                prevMsg.persona !== undefined &&
                msg.persona !== undefined &&
                prevMsg.persona !== msg.persona;

              return (
              <Fragment key={msg.id}>
              {isHandoff && (
                <div
                  className="flex items-center gap-2 px-2 text-[10px] uppercase tracking-wider text-slate-500"
                  aria-label="Crew handoff"
                  role="separator"
                >
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-white/10" />
                  <span>handoff</span>
                  <div className="h-px flex-1 bg-gradient-to-r from-white/10 via-white/10 to-transparent" />
                </div>
              )}
              <div
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
                      : cn(personaMeta?.accentBg ?? "bg-white/10"),
                  )}
                  aria-label={
                    msg.role === "assistant" && personaMeta
                      ? `${personaMeta.name} — ${personaMeta.domain}`
                      : undefined
                  }
                >
                  {msg.role === "user" ? (
                    <User className="h-3 w-3" />
                  ) : PersonaIcon ? (
                    <PersonaIcon className={cn("h-3 w-3", personaMeta?.accentText)} aria-hidden="true" />
                  ) : (
                    <Bot className="h-3 w-3" />
                  )}
                </div>
                {/* Bubble + feedback */}
                <div className="max-w-[82%]">
                  {/* Flight Crew: persona name label above AI messages */}
                  {msg.role === "assistant" && personaMeta && (
                    <div className="mb-1 px-1">
                      <PersonaBadge persona={personaMeta.id} variant="inline" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "rounded-2xl px-3 py-2 text-sm leading-relaxed",
                      msg.role === "user"
                        ? "rounded-tr-sm bg-blue-600 text-white"
                        : "rounded-tl-sm text-slate-200",
                      msg.role === "assistant" && personaMeta && "border-l-[3px]",
                      msg.role === "assistant" && personaMeta?.accent,
                    )}
                    style={
                      msg.role === "assistant"
                        ? { background: "rgba(255,255,255,0.06)", borderTop: "1px solid rgba(255,255,255,0.08)", borderRight: "1px solid rgba(255,255,255,0.08)", borderBottom: "1px solid rgba(255,255,255,0.08)" }
                        : {}
                    }
                  >
                    {msg.content ? (
                      msg.role === "assistant" ? (
                        <>
                          <AssistantMessage content={parseConfidence(msg.content).text} isStreaming={loading && i === messages.length - 1} onNavigate={(href) => router.push(href)} />
                          {/* Render approval cards attached to this message */}
                          {pendingApprovals
                            .filter((a) => a.messageId === msg.id)
                            .map((a) => (
                              <ApprovalCard
                                key={a.toolCallId}
                                approval={a}
                                onApprove={() => handleApprove(a)}
                                onDeny={() => handleDeny(a)}
                                isProcessing={approvalStates[a.toolCallId]?.processing ?? false}
                                resolved={approvalStates[a.toolCallId]?.resolved ?? null}
                              />
                            ))}
                        </>
                      ) : (
                        <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
                      )
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-slate-500">
                        {toolStatus ? (
                          <>
                            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-indigo-400/70" />
                            <span className="text-xs text-slate-400">{toolStatus}</span>
                          </>
                        ) : (
                          <>
                            <span className="animate-bounce">·</span>
                            <span className="animate-bounce [animation-delay:0.15s]">·</span>
                            <span className="animate-bounce [animation-delay:0.3s]">·</span>
                          </>
                        )}
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
                      {feedbackGiven[msg.id] ? (
                        <span className="text-[10px] text-slate-600">
                          {feedbackGiven[msg.id] === "positive" ? "Thanks!" : "Noted — we'll improve"}
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => handleFeedback(msg.id, "positive")}
                            className="rounded p-0.5 text-slate-600 transition-colors hover:text-emerald-400"
                            aria-label="Helpful"
                            title="Helpful"
                          >
                            <ThumbsUp className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => handleFeedback(msg.id, "negative")}
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
              </Fragment>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggested questions — only shown when no user messages yet */}
          {messages.filter((m) => m.role === "user").length === 0 && (
            <div className="shrink-0 px-4 pb-2">
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
          <p className="shrink-0 px-4 pb-1 text-[9px] leading-tight text-slate-600">
            AI estimates only — not tax, legal, or financial advice. Consult a qualified professional.
          </p>

          {/* Input */}
          <div
            className="flex shrink-0 items-end gap-2 p-3"
            style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="relative flex-1">
              {/* Flight Crew @mention autocomplete — only renders when relevant */}
              <MentionAutocomplete value={input} onSelect={setInput} />
              <Textarea
                ref={textareaRef}
                rows={1}
                placeholder="Ask anything… (try @Navigator for tax, @Dispatcher for clients)"
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
            </div>
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
