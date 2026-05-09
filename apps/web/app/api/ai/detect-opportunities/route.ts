/**
 * POST /api/ai/detect-opportunities
 *
 * AI Flight Control — opportunity detector + message drafter.
 *
 * Scans the authenticated user's client data for outreach moments and
 * UPSERTs them into outreach_queue. Groq then drafts a personalised email
 * for each newly detected item.
 *
 * Limited to 8 draft calls per invocation to keep response time < 20 s.
 * Gracefully degrades if GROQ_API_KEY is not set.
 *
 * Also exported: detectAndDraftForUser() for use by the cron wrapper.
 *
 * All prompt builders live in @/lib/outreach-prompts (shared with the
 * single-item /api/ai/draft-outreach endpoint).
 */

import { generateText } from "ai";
import { models, heliconeHeaders } from "@/lib/ai/provider";
import { NextRequest, NextResponse } from "next/server";
import { createClient }       from "@/lib/supabase/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { requirePro } from "@/lib/require-pro";
import type { OutreachQueueItem, AgentState } from "@agent-runway/core/types/database";
import type { SupabaseClient }    from "@supabase/supabase-js";
import type { ClientMemoryFacts } from "@/lib/ai/client-memory-engine";
import {
  type Tone,
  AGENT_RUNWAY_VOICE,
  buildAnniversaryPrompt,
  buildIdlePrompt,
  buildBirthdayPrompt,
  buildPostClose3Prompt,
  buildPostClose14Prompt,
  buildPostClose90Prompt,
  buildReviewRequestPrompt,
  buildReferralAskPrompt,
  buildNewClientWelcomePrompt,
  buildContactAnniversaryPrompt,
  buildMultiDealMilestonePrompt,
  buildSeasonalSpringPrompt,
  buildSeasonalFallPrompt,
  buildSeasonalYearEndPrompt,
  buildSeasonalTaxPrompt,
  buildMortgageRenewalDuePrompt,
  buildMortgageRenewalWindowPrompt,
  buildPastClientCheckInPrompt,
  buildTimeframeApproachingPrompt,
  buildPropertyValueMilestonePrompt,
  buildPainPointInactivePrompt,
  buildBuyerInventoryMatchPrompt,
  buildSellerTimingHesitationPrompt,
  buildMortgageRenewalFinancePrompt,
  buildEducationalValuePrompt,
} from "@/lib/outreach-prompts";

// ── Constants ─────────────────────────────────────────────────────────────────

const ANNIVERSARY_YEARS  = [1, 2, 3, 5, 10];
const WINDOW_DAYS        = 14;   // detect N days in advance
const IDLE_MONTHS        = 18;   // flag clients idle > this many months
const MAX_DRAFTS_PER_RUN = 10;   // max Groq calls per invocation (~2-3s each, within 60s timeout)
const SEASONAL_TOP_N     = 25;   // max clients for seasonal campaigns

// ── Date helpers ──────────────────────────────────────────────────────────────

function addYears(isoDate: string, years: number): Date {
  const d = new Date(isoDate + "T12:00:00");
  d.setFullYear(d.getFullYear() + years);
  return d;
}

function addDays(isoDate: string, days: number): Date {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d;
}

function daysUntil(target: Date): number {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function monthsAgoDate(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

function nextBirthdayDate(birthdate: string): Date {
  const today = new Date();
  const [, mmdd] = birthdate.split(/-(.+)/); // "1990-03-21" → "03-21"
  const candidate = new Date(`${today.getFullYear()}-${mmdd}T12:00:00`);
  if (isNaN(candidate.getTime())) return candidate; // guard malformed dates
  if (candidate < today) candidate.setFullYear(today.getFullYear() + 1);
  return candidate;
}

// ── Memory-powered scoring & value selection ─────────────────────────────────

// ── Send-worthiness constants ────────────────────────────────────────────────

/** Minimum score to surface an opportunity. Below this, it's filtered out. */
const MIN_SEND_WORTHY_SCORE = 45;

/** Max opportunities to surface per client per scan. Prevents inbox flooding. */
const MAX_PER_CLIENT_PER_SCAN = 2;

/** Types with inherently strong timing signals (always pass timing check). */
const STRONG_TIMING_TYPES = new Set([
  "birthday", "closing_anniversary", "post_close_3", "post_close_14",
  "post_close_90", "mortgage_renewal_due", "timeframe_approaching",
  "property_value_milestone", "new_client_welcome", "condition_firming",
  "scheduled_date_approaching",
]);

/** Types that are relationship-maintenance (weaker signal, need support from data). */
const MAINTENANCE_TYPES = new Set([
  "idle_client", "past_client_check_in", "seasonal_spring", "seasonal_fall",
  "seasonal_yearend", "seasonal_tax", "contact_anniversary",
]);

/** Lightweight relevance score (0–100) for ranking outreach candidates.
 *  Score reflects: reason strength × value potential × client state × timing. */
function scoreCandidate(
  opportunityType: string,
  memory: ClientMemoryFacts | null,
  ctx: Record<string, unknown>,
  clientTags?: string[],
  clientNotes?: string | null,
): number {
  let score = 40; // base — slightly below threshold, must earn its way in

  // ── Reason strength: why now? ──────────────────────────────────────────────
  if (STRONG_TIMING_TYPES.has(opportunityType)) score += 20;
  else if (MAINTENANCE_TYPES.has(opportunityType)) score += 8;
  else score += 12; // memory-powered or other

  // ── Value potential: can we say something useful? ──────────────────────────
  if (memory) score += 5;
  if (memory?.next_best_angle) score += 10;
  if (memory?.pain_point) score += 5;
  if (memory?.motivation) score += 5;
  if (memory?.areas_of_interest) score += 3;
  if (memory?.budget_context) score += 3;

  // ── Client state: engagement + data richness ──────────────────────────────
  const eng = memory?.engagement_level?.toLowerCase() ?? "";
  if (eng.includes("highly active") || eng.includes("responsive")) score += 10;
  else if (eng.includes("going cold") || eng.includes("ghost")) score -= 10;

  // Sparse-data penalty for maintenance types — don't spam with weak signals
  const contextLevel = classifyClientContext(
    clientTags ?? [], clientNotes ?? null, ctx,
  );
  if (contextLevel === "sparse" && MAINTENANCE_TYPES.has(opportunityType)) {
    score -= 10; // needs stronger reason or richer data to justify outreach
  }
  if (contextLevel === "sensitive") {
    // Sensitive clients: only strong-timing triggers should pass
    if (!STRONG_TIMING_TYPES.has(opportunityType)) score -= 8;
  }

  // ── Type-specific bonuses ─────────────────────────────────────────────────
  if (opportunityType === "pain_point_inactive" && memory?.pain_point) score += 15;
  if (opportunityType === "buyer_inventory_match" && memory?.areas_of_interest) score += 10;
  if (opportunityType === "seller_timing_hesitation" && memory?.objection) score += 10;
  if (opportunityType === "educational_value_inactive" && memory?.last_key_topic) score += 10;

  // Time-critical triggers get extra urgency
  if (opportunityType.startsWith("post_close_")) score += 15;
  if (opportunityType === "birthday") score += 10;

  // GCI history = higher-value client
  if (ctx.gci && Number(ctx.gci) > 10000) score += 5;

  return Math.min(100, Math.max(0, score));
}

/** Generate a short human-readable explanation of why this opportunity was surfaced. */
function buildOutreachReason(
  opportunityType: string,
  score: number,
  ctx: Record<string, unknown>,
): string {
  const parts: string[] = [];

  // Timing reason
  switch (opportunityType) {
    case "birthday": parts.push("Birthday coming up"); break;
    case "closing_anniversary": parts.push(`${ctx.anniversary_year ?? 1}-year anniversary`); break;
    case "post_close_3": parts.push("3 days since closing"); break;
    case "post_close_14": parts.push("2 weeks since closing"); break;
    case "post_close_90": parts.push("90 days since closing"); break;
    case "mortgage_renewal_due": parts.push("Mortgage renewal approaching"); break;
    case "mortgage_renewal_window": parts.push("In mortgage renewal window"); break;
    case "timeframe_approaching": parts.push("Stated timeframe arriving"); break;
    case "scheduled_date_approaching": parts.push(`Scheduled target ~${ctx.days_until ?? "soon"} days out`); break;
    case "property_value_milestone": parts.push(`${ctx.milestone_year ?? 1}-year property milestone`); break;
    case "idle_client": parts.push(`No contact in ${ctx.months_idle ?? "18+"} months`); break;
    case "past_client_check_in": parts.push(`${ctx.months_idle ?? "6+"} months since last deal`); break;
    case "pain_point_inactive": parts.push("Known concern + inactive"); break;
    case "buyer_inventory_match": parts.push("Active buyer with target areas"); break;
    case "seller_timing_hesitation": parts.push("Seller with timing objection"); break;
    case "mortgage_renewal_finance": parts.push("Mortgage context in memory"); break;
    case "educational_value_inactive": parts.push("Topic of interest + inactive"); break;
    case "new_client_welcome": parts.push("New client welcome"); break;
    case "review_request": parts.push("Good time to request review"); break;
    case "referral_ask": parts.push("Relationship mature for referral ask"); break;
    default:
      if (opportunityType.startsWith("seasonal_")) parts.push("Seasonal touchpoint");
      else parts.push("Outreach opportunity detected");
  }

  // Value signal
  if (ctx.next_best_angle) parts.push(`angle: ${(ctx.next_best_angle as string).slice(0, 60)}`);
  else if (ctx.memory_pain_point) parts.push("has known concern");
  else if (ctx.areas_of_interest) parts.push("has target areas");

  return `${parts.join(" · ")} (score: ${score})`;
}

type ValueType = "listing_bundle" | "market_note" | "educational_resource" | "financing_scenario" | "custom_explanation" | null;

/** Select the best value type to include with outreach based on trigger + memory. */
function selectValueType(
  opportunityType: string,
  memory: ClientMemoryFacts | null,
): { value_type: ValueType; value_summary: string | null } {
  // Memory-informed selection
  if (memory) {
    if (memory.budget_context?.toLowerCase().includes("mortgage") || memory.pain_point?.toLowerCase().includes("rate")) {
      return { value_type: "financing_scenario", value_summary: "Mortgage rate context or renewal scenario" };
    }
    if (memory.areas_of_interest && (opportunityType.includes("idle") || opportunityType.includes("check_in"))) {
      return { value_type: "market_note", value_summary: `Market update for areas of interest: ${memory.areas_of_interest}` };
    }
    if (memory.pain_point && opportunityType === "pain_point_inactive") {
      return { value_type: "custom_explanation", value_summary: `Address pain point: ${memory.pain_point}` };
    }
  }

  // Fallback: type-based defaults
  switch (opportunityType) {
    case "closing_anniversary":
    case "property_value_milestone":
      return { value_type: "listing_bundle", value_summary: "Home value update / CMA snapshot" };
    case "seasonal_spring":
    case "seasonal_fall":
      return { value_type: "market_note", value_summary: "Seasonal market conditions overview" };
    case "seasonal_tax":
      return { value_type: "educational_resource", value_summary: "Tax season real estate tips" };
    case "mortgage_renewal_due":
    case "mortgage_renewal_window":
    case "mortgage_renewal_finance":
      return { value_type: "financing_scenario", value_summary: "Mortgage renewal rate comparison" };
    case "educational_value_inactive":
      return { value_type: "educational_resource", value_summary: memory?.last_key_topic ? `Educational content on: ${memory.last_key_topic}` : "General real estate education" };
    default:
      return { value_type: null, value_summary: null };
  }
}

/** Build enriched context by merging existing context with memory-derived fields. */
// Accepts either bare ClientMemoryFacts or facts augmented with the parent
// profile's memory_summary. The optional field lets existing call sites that
// pass only facts compile without changes.
type EnrichMemory = ClientMemoryFacts & { memory_summary?: string | null };

function enrichContext(
  baseCtx: Record<string, unknown>,
  opportunityType: string,
  memory: EnrichMemory | null,
  reasonWhy: string,
): Record<string, unknown> {
  const { value_type, value_summary } = selectValueType(opportunityType, memory);
  const confidence = memory ? (memory.engagement_level ? "high" : "medium") : "low";

  // Determine which memory fields were used
  const memoryFieldsUsed: string[] = [];
  if (memory) {
    for (const [key, val] of Object.entries(memory)) {
      if (val && val !== "null") memoryFieldsUsed.push(key);
    }
  }

  return {
    ...baseCtx,
    // Memory-enrichment fields (additive — never overwrite existing keys)
    ...(reasonWhy && !baseCtx.selected_reason ? { selected_reason: reasonWhy } : {}),
    ...(opportunityType && !baseCtx.reason_category ? { reason_category: categorizeReason(opportunityType) } : {}),
    ...(reasonWhy && !baseCtx.reason_why_now ? { reason_why_now: reasonWhy } : {}),
    ...(memory?.likely_cold_reason && !baseCtx.likely_cold_reason ? { likely_cold_reason: memory.likely_cold_reason } : {}),
    ...(value_type && !baseCtx.selected_value_type ? { selected_value_type: value_type } : {}),
    ...(value_summary && !baseCtx.selected_value_summary ? { selected_value_summary: value_summary } : {}),
    ...(memoryFieldsUsed.length > 0 && !baseCtx.memory_fields_used ? { memory_fields_used: memoryFieldsUsed } : {}),
    ...(confidence && !baseCtx.confidence ? { confidence } : {}),
    // Memory narrative for drafting (truncated to avoid bloating JSONB)
    ...(memory?.memory_summary && !baseCtx.memory_summary ? { memory_summary: memory.memory_summary.slice(0, 500) } : {}),
    ...(memory?.next_best_angle && !baseCtx.next_best_angle ? { next_best_angle: memory.next_best_angle } : {}),
    ...(memory?.pain_point && !baseCtx.memory_pain_point ? { memory_pain_point: memory.pain_point } : {}),
    ...(memory?.motivation && !baseCtx.memory_motivation ? { memory_motivation: memory.motivation } : {}),
  };
}

function categorizeReason(opportunityType: string): string {
  if (opportunityType.startsWith("post_close_")) return "post_close_nurture";
  if (opportunityType.startsWith("seasonal_")) return "seasonal";
  if (opportunityType.includes("mortgage")) return "financial";
  if (opportunityType.includes("anniversary")) return "milestone";
  if (opportunityType === "birthday") return "personal";
  if (opportunityType.includes("idle") || opportunityType.includes("check_in")) return "re_engagement";
  if (opportunityType.includes("pain_point") || opportunityType.includes("educational")) return "value_add";
  if (opportunityType.includes("buyer") || opportunityType.includes("seller")) return "active_pipeline";
  return "relationship";
}

function monthsIdleLabel(lastDeal: string): string {
  const months = Math.floor(
    (Date.now() - new Date(lastDeal + "T12:00:00").getTime()) / (1000 * 60 * 60 * 24 * 30),
  );
  return `${months} month${months !== 1 ? "s" : ""}`;
}

// ── Agent first name ──────────────────────────────────────────────────────────

function extractFirstName(displayName: string | null, email: string): string {
  if (displayName) return displayName.split(/\s+/)[0] ?? displayName;
  return email.split("@")[0].replace(/[._-]/g, " ").split(" ")[0] || "your agent";
}

// ── Context classification ────────────────────────────────────────────────────

type ContextLevel = "sensitive" | "sparse" | "rich";

/**
 * Classify a client's context richness for drafting purposes.
 * Inferred from existing data — no new fields required.
 *
 * "sensitive": indicators of emotional sensitivity (estate, divorce, legal, negative tags/notes)
 * "sparse":   most memory fields are null, minimal client data
 * "rich":     multiple structured memory fields present, good personalization potential
 */
function classifyClientContext(
  tags: string[],
  notes: string | null,
  ctx: Record<string, unknown>,
): ContextLevel {
  // ── Sensitive detection ──────────────────────────────────────────────────
  const sensitiveKeywords = [
    "estate", "executor", "deceased", "divorce", "separation", "legal",
    "foreclosure", "bankruptcy", "illness", "passing", "death", "widow",
    "sensitive", "careful", "bereavement", "probate", "power of attorney",
  ];
  const searchText = [
    ...(tags ?? []),
    notes ?? "",
    (ctx.memory_summary as string) ?? "",
    (ctx.memory_pain_point as string) ?? "",
  ].join(" ").toLowerCase();

  if (sensitiveKeywords.some((kw) => searchText.includes(kw))) {
    return "sensitive";
  }

  // ── Rich vs sparse: count how many memory fields are populated ───────────
  const memoryFields = [
    "memory_summary", "next_best_angle", "memory_pain_point", "memory_motivation",
    "budget_context", "areas_of_interest", "last_key_topic", "objection",
  ];
  const populatedCount = memoryFields.filter((f) => {
    const val = ctx[f];
    return val && val !== "null" && val !== "";
  }).length;

  // Also count basic client data presence
  const hasNotes = notes && notes.length > 10;
  const hasTags = tags && tags.length > 0;
  const dataPoints = populatedCount + (hasNotes ? 1 : 0) + (hasTags ? 1 : 0);

  if (dataPoints >= 3) return "rich";
  return "sparse";
}

// ── Context-aware drafting instructions ──────────────────────────────────────

const SENSITIVE_INSTRUCTIONS = `SENSITIVITY NOTICE:
This client may be in a sensitive situation (estate, legal matter, life transition).
- Keep the tone respectful, neutral, and brief.
- Avoid strong emotional assumptions or overly personal references.
- Do NOT speculate about their circumstances.
- Focus on being helpful and available without being presumptuous.
- Shorter is better. When in doubt, leave it out.
- Value nugget must remain neutral: a seasonal observation or general neighbourhood note is safe.
  GOOD: "a few things have shifted in the area recently — happy to fill you in whenever you're ready"
  BAD: "exciting changes happening in your neighbourhood!"`;

const SPARSE_CONTEXT_INSTRUCTIONS = `CONTEXT NOTICE — LIMITED CLIENT DATA:
You have minimal information about this client. Do NOT attempt deep personalization.
- Focus on being useful and relevant, not personal.
- Avoid filler language like "just reaching out", "wanted to touch base", or "hope all is well".
- Keep it concise and confident — a short, useful message beats a long, vague one.
- Do NOT fabricate personal details or assume preferences you don't have evidence for.
- Write as if the agent is sharing something genuinely worth reading, not filling a CRM checkbox.
- Your value nugget MUST be concrete and grounded. Use soft specificity:
  GOOD: "a couple of homes came up this week that caught my eye" or "inventory has picked up a bit this month"
  GOOD: "rates shifted a little recently — could change what buyers qualify for"
  GOOD: "I can walk you through what your price range looks like in today's market"
  BAD: "I have a market insight to share" or "thought this might be helpful" (says nothing)
  BAD: "there have been some changes in the market" (too vague — WHAT changes?)`;

const RICH_CONTEXT_INSTRUCTIONS = `CONTEXT NOTICE — RICH CLIENT DATA AVAILABLE:
Use the available memory and client data to personalize meaningfully.
- Reference specific preferences, history, areas of interest, or past conversations when natural.
- Show that the agent remembers and pays attention — this is what separates good agents from forgettable ones.
- Still keep it concise. Personalization should sharpen the message, not inflate it.
- Tailor value to what you know: if they're a buyer, mention inventory in their areas. If a seller, mention demand or pricing trends. If a past client, mention neighbourhood developments or equity.`;

const VALUE_FIRST_RULE = `VALUE-FIRST RULE (mandatory):
Every message MUST include at least one concrete, specific piece of value. Abstract claims do not count.

WHAT COUNTS AS VALUE (pick one, make it specific):
- A market observation with direction: "inventory has picked up a bit this month" or "homes under $X are still moving quickly"
- A seasonal/timing note: "spring listings tend to get more eyes — this month is usually when things heat up"
- A practical offer: "I can walk you through what $X looks like in today's market" or "I put together a quick snapshot of your neighbourhood — happy to share"
- A neighbourhood note: "a couple homes came up this week in [area] that caught my eye"
- A rate/financing note: "rates have shifted a bit recently, which could change what buyers qualify for"

WHAT DOES NOT COUNT (banned — never write these):
- "just wanted to share an update" (what update? say it)
- "thought this might be helpful" without specifying WHAT
- "there have been some changes" (what changes? be specific)
- "I have some market insights" (what insights? say one)
- "exciting things happening" (what things?)
- Any sentence that claims value exists without delivering it

SPECIFICITY RULES:
- Anchor to at least one of: area/neighbourhood, approximate price range, or timing (this week, this month, recently, this season)
- Use soft specificity when you lack exact data: "a couple", "a few", "recently", "this month"
- Do NOT fabricate exact numbers, addresses, or statistics you don't have
- A single concrete sentence beats three vague ones`;

// ── Draft a single queue item via Groq ────────────────────────────────────────

const BANNED_PHRASES = [
  "i hope this email finds you well",
  "i hope you're doing well",
  "hope this finds you",
  "as per my last",
  "touching base",
  "just following up",
  "just checking in",
  "per our conversation",
  "i wanted to reach out",
  "exciting update",
  "big news",
  "important reminder",
  "all done at",
  "just wanted to share an update",
  "thought this might be helpful",
  "there have been some changes",
  "i have some market insights",
  "exciting things happening",
  "some exciting",
];

/** Draft a single queue item. Returns true if successfully drafted, false on failure. */
async function draftItem(
  item:           OutreachQueueItem & { clients: { name: string; city: string | null; province_region: string | null; communication_tone?: string; tags?: string[]; notes?: string | null } | null },
  agentFirst:     string,
  emailSignature: string,
  agentStyleGuide: string | null,
  userId:         string,
  supabase:       SupabaseClient,
): Promise<boolean> {
  const clientName = item.clients?.name ?? "your client";
  const ctx        = item.context as Record<string, string | number>;
  const tone       = (item.clients?.communication_tone as Tone) ?? "friendly";

  const address  = (ctx.address as string) ?? item.clients?.city ?? null;
  const province = item.clients?.province_region ?? null;

  // ── Client context for AI self-moderation ─────────────────────────────────
  // Pass tags + notes so the model can infer sensitivities without manual flags.
  // e.g. tag "Investor" → don't say "settling in to your new home"
  //      notes mentioning estate / executor → avoid assumptions about property
  const clientTags  = item.clients?.tags ?? [];
  const clientNotes = item.clients?.notes ?? null;
  const clientContextBlock = (clientTags.length > 0 || clientNotes)
    ? [
        "IMPORTANT — client context (use to self-moderate tone and content):",
        clientTags.length > 0 ? `- Tags: ${clientTags.join(", ")}` : null,
        clientNotes        ? `- Agent notes: "${clientNotes}"` : null,
        "If any context signals a sensitive circumstance, adjust the email accordingly and avoid assumptions.",
      ].filter(Boolean).join("\n")
    : null;

  let prompt: string;
  switch (item.opportunity_type) {
    // ── Phase A (live) ─────────────────────────────────────────────────────
    case "closing_anniversary":
      prompt = buildAnniversaryPrompt(agentFirst, clientName, Number(ctx.anniversary_year ?? 1), address, province, tone, (ctx.side as "buyer" | "seller" | "both" | null) ?? null);
      break;
    case "idle_client":
      prompt = buildIdlePrompt(agentFirst, clientName, (ctx.last_deal as string) ?? null, item.clients?.city ?? null, province, tone);
      break;
    case "birthday":
      prompt = buildBirthdayPrompt(agentFirst, clientName, tone);
      break;
    // ── Batch 1: Post-Close Nurture ────────────────────────────────────────
    case "post_close_3":
      prompt = buildPostClose3Prompt(agentFirst, clientName, address, tone, (ctx.side as "buyer" | "seller" | "both" | null) ?? null, (ctx.property_use as "primary_residence" | "investment" | "commercial" | "pre_construction" | null) ?? null);
      break;
    case "post_close_14":
      prompt = buildPostClose14Prompt(agentFirst, clientName, address, tone, (ctx.side as "buyer" | "seller" | "both" | null) ?? null, (ctx.property_use as "primary_residence" | "investment" | "commercial" | "pre_construction" | null) ?? null);
      break;
    case "post_close_90":
      prompt = buildPostClose90Prompt(agentFirst, clientName, address, province, tone, (ctx.side as "buyer" | "seller" | "both" | null) ?? null, (ctx.property_use as "primary_residence" | "investment" | "commercial" | "pre_construction" | null) ?? null);
      break;
    case "review_request":
      prompt = buildReviewRequestPrompt(agentFirst, clientName, address, tone, (ctx.side as "buyer" | "seller" | "both" | null) ?? null);
      break;
    case "referral_ask":
      prompt = buildReferralAskPrompt(agentFirst, clientName, address, tone, (ctx.side as "buyer" | "seller" | "both" | null) ?? null);
      break;
    // ── Batch 2: Relationship Milestones ───────────────────────────────────
    case "new_client_welcome":
      prompt = buildNewClientWelcomePrompt(agentFirst, clientName, tone);
      break;
    case "contact_anniversary":
      prompt = buildContactAnniversaryPrompt(agentFirst, clientName, Number(ctx.anniversary_year ?? 1), tone);
      break;
    case "multi_deal_milestone":
      prompt = buildMultiDealMilestonePrompt(agentFirst, clientName, Number(ctx.deal_count ?? 2), tone);
      break;
    // ── Batch 3: Seasonal ──────────────────────────────────────────────────
    case "seasonal_spring":
      prompt = buildSeasonalSpringPrompt(agentFirst, clientName, province, tone);
      break;
    case "seasonal_fall":
      prompt = buildSeasonalFallPrompt(agentFirst, clientName, province, tone);
      break;
    case "seasonal_yearend":
      prompt = buildSeasonalYearEndPrompt(agentFirst, clientName, tone);
      break;
    case "seasonal_tax":
      prompt = buildSeasonalTaxPrompt(agentFirst, clientName, province, tone);
      break;
    // ── Batch 4: Intelligent Outreach (briefing-triggered) ─────────────────
    case "mortgage_renewal_due":
      prompt = buildMortgageRenewalDuePrompt(
        agentFirst, clientName,
        (ctx.close_date as string) ?? "",
        Number(ctx.days_until_renewal ?? 0),
        address, tone,
      );
      break;
    case "mortgage_renewal_window":
      prompt = buildMortgageRenewalWindowPrompt(
        agentFirst, clientName,
        (ctx.close_date as string) ?? "",
        Number(ctx.months_until_renewal ?? 12),
        address, tone,
      );
      break;
    case "past_client_check_in":
      prompt = buildPastClientCheckInPrompt(
        agentFirst, clientName,
        Number(ctx.months_idle ?? 6),
        province, tone,
      );
      break;
    case "timeframe_approaching":
      prompt = buildTimeframeApproachingPrompt(
        agentFirst, clientName,
        (ctx.timeframe_label as string) ?? "upcoming",
        Number(ctx.days_remaining ?? 0),
        ctx.budget ? Number(ctx.budget) : null,
        tone,
      );
      break;
    case "scheduled_date_approaching":
      // Reuse the timeframe-approaching prompt shape — same intent (a stated
      // future date is now near). Use scheduled_phrase as the human-readable
      // label when present, else fall back to the literal date.
      prompt = buildTimeframeApproachingPrompt(
        agentFirst, clientName,
        (ctx.scheduled_phrase as string) ?? (ctx.scheduled_for as string) ?? "the date you set",
        Number(ctx.days_until ?? 0),
        null,
        tone,
      );
      break;
    case "property_value_milestone":
      prompt = buildPropertyValueMilestonePrompt(
        agentFirst, clientName,
        Number(ctx.milestone_year ?? 1),
        address, province, tone,
        (ctx.side as "buyer" | "seller" | "both" | null) ?? null,
      );
      break;
    // ── Batch 5: Memory-Powered Triggers ────────────────────────────────────
    case "pain_point_inactive":
      prompt = buildPainPointInactivePrompt(
        agentFirst, clientName,
        (ctx.pain_point as string) ?? (ctx.memory_pain_point as string) ?? "unspecified concern",
        (ctx.memory_summary as string) ?? null,
        (ctx.next_best_angle as string) ?? null,
        tone,
      );
      break;
    case "buyer_inventory_match":
      prompt = buildBuyerInventoryMatchPrompt(
        agentFirst, clientName,
        (ctx.areas_of_interest as string) ?? "their target areas",
        (ctx.budget_context as string) ?? null,
        (ctx.memory_summary as string) ?? null,
        tone,
      );
      break;
    case "seller_timing_hesitation":
      prompt = buildSellerTimingHesitationPrompt(
        agentFirst, clientName,
        (ctx.objection as string) ?? "timing uncertainty",
        (ctx.memory_motivation as string) ?? (ctx.motivation as string) ?? null,
        (ctx.memory_summary as string) ?? null,
        tone,
      );
      break;
    case "mortgage_renewal_finance":
      prompt = buildMortgageRenewalFinancePrompt(
        agentFirst, clientName,
        (ctx.close_date as string) ?? "",
        (ctx.budget_context as string) ?? null,
        (ctx.memory_pain_point as string) ?? (ctx.pain_point as string) ?? null,
        tone,
      );
      break;
    case "educational_value_inactive":
      prompt = buildEducationalValuePrompt(
        agentFirst, clientName,
        (ctx.last_key_topic as string) ?? "real estate",
        (ctx.memory_summary as string) ?? null,
        tone,
      );
      break;
    default:
      console.warn(`[flight-control] Unknown opportunity_type: ${item.opportunity_type} for item ${item.id}`);
      return false;
  }

  // Track retry attempts via context field (persisted across scans)
  const attempts = Number(ctx._draft_attempts ?? 0) + 1;
  const MAX_DRAFT_ATTEMPTS = 3;

  if (attempts > MAX_DRAFT_ATTEMPTS) {
    console.warn(`[flight-control] Item ${item.id} exceeded ${MAX_DRAFT_ATTEMPTS} draft attempts — marking failed`);
    await supabase
      .from("outreach_queue")
      .update({ status: "skipped", context: { ...ctx, _draft_attempts: attempts, _draft_error: "exceeded max attempts" } })
      .eq("id", item.id);
    return false;
  }

  try {
    // ── Classify context and build appropriate instruction blocks ────────────
    const contextLevel = classifyClientContext(clientTags, clientNotes, ctx);

    const contextLevelBlock =
      contextLevel === "sensitive" ? SENSITIVE_INSTRUCTIONS :
      contextLevel === "rich"     ? RICH_CONTEXT_INSTRUCTIONS :
                                    SPARSE_CONTEXT_INSTRUCTIONS;

    const memoryContextBlock = ctx.memory_summary || ctx.next_best_angle || ctx.memory_motivation
      ? [
          "CLIENT MEMORY (use to personalize — do not mention the CRM or memory system):",
          ctx.memory_summary ? `- Summary: ${(ctx.memory_summary as string).slice(0, 300)}` : null,
          ctx.next_best_angle ? `- Recommended angle: ${ctx.next_best_angle}` : null,
          ctx.memory_motivation ? `- Known motivation: ${ctx.memory_motivation}` : null,
          ctx.memory_pain_point ? `- Known concern: ${ctx.memory_pain_point}` : null,
        ].filter(Boolean).join("\n")
      : null;

    const contextSuffix = [
      AGENT_RUNWAY_VOICE,
      clientContextBlock,
      contextLevelBlock,
      VALUE_FIRST_RULE,
      memoryContextBlock,
      agentStyleGuide
        ? `AGENT VOICE GUIDE (follow closely — message must sound like the agent personally wrote it):\n${agentStyleGuide}`
        : null,
    ].filter(Boolean).join("\n\n");
    const fullPrompt = contextSuffix ? `${prompt}\n\n${contextSuffix}` : prompt;

    const aiHeaders = heliconeHeaders({ userId, feature: "detect-opportunities" });

    // Primary: Claude Sonnet via Vercel AI SDK, fallback to Groq Llama
    let raw: string;
    try {
      const { text } = await generateText({
        model: models.default,
        prompt: fullPrompt,
        maxOutputTokens: 400,
        temperature: 0.85,
        headers: aiHeaders,
      });
      raw = text.trim();
      if (!raw) throw new Error("Empty Claude response");
    } catch (primaryErr) {
      console.warn(`[flight-control] Primary model failed for item ${item.id}, falling back to Groq:`, primaryErr);
      const { text } = await generateText({
        model: models.fallback,
        prompt: fullPrompt,
        maxOutputTokens: 400,
        temperature: 0.85,
        headers: aiHeaders,
      });
      raw = text.trim();
      if (!raw) throw new Error("Empty fallback response");
    }
    if (!raw) throw new Error("Empty response");

    // Self-review: retry once if banned phrases or excessive length
    const rawLower  = raw.toLowerCase();
    const hasBanned = BANNED_PHRASES.some((p) => rawLower.includes(p));
    const wordCount = raw.split(/\s+/).filter(Boolean).length;
    const tooLong   = wordCount > 250;

    if (hasBanned || tooLong) {
      const retryNote = [
        hasBanned ? "IMPORTANT: The previous draft contained a clichéd opener. Do NOT open with 'I hope this email finds you well' or similar phrases. Start with something genuine and specific." : null,
        tooLong   ? `IMPORTANT: The previous draft was ${wordCount} words. Keep it under 200 words.` : null,
      ].filter(Boolean).join(" ");

      try {
        const { text: retryRaw } = await generateText({
          model: models.default,
          prompt: `${fullPrompt}\n\n${retryNote}`,
          maxOutputTokens: 400,
          temperature: 0.85,
          headers: aiHeaders,
        });
        if (retryRaw?.trim()) raw = retryRaw.trim();
      } catch (retryErr) {
        // Retry failed — use the original (imperfect) draft rather than failing entirely
        console.warn(`[flight-control] Self-review retry failed for item ${item.id}:`, retryErr);
      }
    }

    // Parse: last line starting with "SUBJECT:" is the subject
    const lines   = raw.split("\n");
    const subjIdx = [...lines].reverse().findIndex((l) => l.trimStart().toUpperCase().startsWith("SUBJECT:"));

    let ai_subject: string;
    let ai_body: string;

    if (subjIdx === -1) {
      // No SUBJECT line — synthesize one from the first sentence instead of failing
      console.warn(`[flight-control] No SUBJECT line in Groq response for item ${item.id} — synthesizing`);
      const firstSentence = raw.split(/[.!?\n]/)[0]?.trim() ?? "";
      ai_subject = firstSentence.slice(0, 50).toLowerCase().replace(/^(hi|hey|hello)\s+\w+,?\s*/i, "").trim() || "quick note";
      ai_body = raw.trim();
    } else {
      const realSubjIdx = lines.length - 1 - subjIdx;
      ai_subject = lines[realSubjIdx].replace(/^SUBJECT:\s*/i, "").trim();
      ai_body    = lines.slice(0, realSubjIdx).join("\n").trim();
    }

    // Append custom email signature if the agent has one configured
    if (emailSignature) {
      ai_body += `\n\n${emailSignature}`;
    }

    await supabase
      .from("outreach_queue")
      .update({ ai_subject, ai_body, status: "ready" })
      .eq("id", item.id);

    return true;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[flight-control] Draft error for item ${item.id} (attempt ${attempts}):`, errMsg);
    // Persist attempt count so retries are bounded
    await supabase
      .from("outreach_queue")
      .update({ context: { ...ctx, _draft_attempts: attempts, _draft_error: errMsg } })
      .eq("id", item.id);
    return false;
  }
}

// ── Core detection + drafting logic (exported for cron wrapper) ───────────────

export async function detectAndDraftForUser(
  userId:   string,
  supabase: SupabaseClient,
): Promise<{ detected: number; drafted: number }> {
  // ── Fetch data ─────────────────────────────────────────────────────────────
  const [settingsRes, clientsRes, recordsRes, memoryRes] = await Promise.all([
    supabase
      .from("user_settings")
      .select("display_name, email_signature, ai_voice_guide")
      .eq("user_id", userId)
      .single(),
    supabase
      .from("clients")
      .select("id, name, city, province_region, birthdate, communication_tone, first_contacted_at, last_contact_at, tags, notes, status, scheduled_for, scheduled_phrase")
      .eq("user_id", userId)
      .is("archived_at", null),
    supabase
      .from("client_records")
      .select("id, client_id, address, close_date, gci, side, property_use")
      .eq("user_id", userId)
      .not("close_date", "is", null)
      .not("client_id", "is", null),
    // Batch-fetch all memory profiles for this user (optional — failures are non-fatal)
    supabase
      .from("client_memory_profiles")
      .select("client_id, memory_summary, structured_facts, stale")
      .eq("user_id", userId)
      .eq("stale", false),
  ]);

  const agentFirst      = extractFirstName(settingsRes.data?.display_name ?? null, "");
  const emailSignature  = (settingsRes.data?.email_signature as string) ?? "";
  const agentStyleGuide = (settingsRes.data?.ai_voice_guide as string | null) ?? null;

  const clients    = clientsRes.data ?? [];
  const records    = recordsRes.data ?? [];
  const _clientMap = new Map(clients.map((c) => [c.id, c]));

  // Memory lookup — graceful degradation if fetch failed
  const memoryMap = new Map<string, { memory_summary: string | null; structured_facts: ClientMemoryFacts }>();
  if (memoryRes.data) {
    for (const m of memoryRes.data) {
      memoryMap.set(m.client_id, {
        memory_summary: m.memory_summary,
        structured_facts: m.structured_facts as ClientMemoryFacts,
      });
    }
  }

  // Suppression: clients contacted within 14 days should not receive non-birthday outreach
  // Birthday messages are always appropriate regardless of recent contact
  const SUPPRESSION_DAYS = 14;
  const suppressionCutoff = new Date();
  suppressionCutoff.setDate(suppressionCutoff.getDate() - SUPPRESSION_DAYS);
  const recentlyContactedIds = new Set(
    clients
      .filter((c) => c.last_contact_at && new Date(c.last_contact_at) > suppressionCutoff)
      .map((c) => c.id),
  );

  const inserts: object[] = [];
  const idleCutoff = monthsAgoDate(IDLE_MONTHS);

  // ── 1. Closing anniversaries ───────────────────────────────────────────────
  for (const rec of records) {
    if (!rec.close_date || !rec.client_id) continue;
    if (recentlyContactedIds.has(rec.client_id)) continue; // suppress if recently contacted
    for (const years of ANNIVERSARY_YEARS) {
      const anniv = addYears(rec.close_date, years);
      const days  = daysUntil(anniv);
      if (days >= 0 && days <= WINDOW_DAYS) {
        inserts.push({
          user_id:          userId,
          client_id:        rec.client_id,
          client_record_id: rec.id,
          opportunity_type: "closing_anniversary",
          trigger_date:     toISODate(anniv),
          context: {
            anniversary_year: years,
            address:          rec.address,
            close_date:       rec.close_date,
            gci:              rec.gci,
            side:             rec.side,
            property_use:     rec.property_use,
          },
          status: "draft",
        });
      }
    }
  }

  // ── 2. Idle clients ────────────────────────────────────────────────────────
  const clientLastDeal = new Map<string, string>();
  for (const rec of records) {
    if (!rec.client_id || !rec.close_date) continue;
    const existing = clientLastDeal.get(rec.client_id);
    if (!existing || rec.close_date > existing) {
      clientLastDeal.set(rec.client_id, rec.close_date);
    }
  }
  const triggerMonthKey = firstOfMonth();
  for (const [clientId, lastDeal] of clientLastDeal.entries()) {
    if (recentlyContactedIds.has(clientId)) continue; // suppress if recently contacted
    if (new Date(lastDeal + "T12:00:00") < idleCutoff) {
      inserts.push({
        user_id:          userId,
        client_id:        clientId,
        opportunity_type: "idle_client",
        trigger_date:     triggerMonthKey,
        context: {
          last_deal:   lastDeal,
          months_idle: monthsIdleLabel(lastDeal),
        },
        status: "draft",
      });
    }
  }

  // ── 3. Birthdays ───────────────────────────────────────────────────────────
  for (const client of clients) {
    if (!client.birthdate) continue;
    const birthday = nextBirthdayDate(client.birthdate);
    if (isNaN(birthday.getTime())) continue;
    const days = daysUntil(birthday);
    if (days >= 0 && days <= WINDOW_DAYS) {
      inserts.push({
        user_id:          userId,
        client_id:        client.id,
        opportunity_type: "birthday",
        trigger_date:     toISODate(birthday),
        context: { birthdate: client.birthdate },
        status: "draft",
      });
    }
  }

  // ── 4. Post-close nurture sequence (Batch 1) ──────────────────────────────
  const POST_CLOSE_CONFIGS = [
    { type: "post_close_3"   as const, days:  3, lookback:  5 },
    { type: "post_close_14"  as const, days: 14, lookback:  7 },
    { type: "post_close_90"  as const, days: 90, lookback: 30 },
    { type: "review_request" as const, days: 21, lookback: 10 },
    { type: "referral_ask"   as const, days: 45, lookback: 21 },
  ];

  for (const rec of records) {
    if (!rec.close_date || !rec.client_id) continue;
    if (recentlyContactedIds.has(rec.client_id)) continue; // suppress if recently contacted
    for (const cfg of POST_CLOSE_CONFIGS) {
      // Sensitive clients: suppress solicitation types only
      const triggerDate = addDays(rec.close_date, cfg.days);
      const d = daysUntil(triggerDate);
      if (d >= -cfg.lookback && d <= WINDOW_DAYS) {
        inserts.push({
          user_id:          userId,
          client_id:        rec.client_id,
          client_record_id: rec.id,
          opportunity_type: cfg.type,
          trigger_date:     toISODate(triggerDate),
          context: {
            address:          rec.address,
            close_date:       rec.close_date,
            gci:              rec.gci,
            days_after_close: cfg.days,
            side:             rec.side,
            property_use:     rec.property_use,
          },
          status: "draft",
        });
      }
    }
  }

  // ── 5. New client welcome (Batch 2) ───────────────────────────────────────
  for (const client of clients) {
    if (!client.first_contacted_at) continue;
    if (recentlyContactedIds.has(client.id)) continue; // suppress if recently contacted
    const welcomeDate = addDays(client.first_contacted_at.slice(0, 10), 7);
    const d = daysUntil(welcomeDate);
    if (d >= -14 && d <= WINDOW_DAYS) {
      inserts.push({
        user_id:          userId,
        client_id:        client.id,
        opportunity_type: "new_client_welcome",
        trigger_date:     toISODate(welcomeDate),
        context: { first_contacted_at: client.first_contacted_at },
        status: "draft",
      });
    }
  }

  // ── 6. Contact anniversary (Batch 2) ──────────────────────────────────────
  for (const client of clients) {
    if (!client.first_contacted_at) continue;
    if (recentlyContactedIds.has(client.id)) continue; // suppress if recently contacted
    const startDate  = client.first_contacted_at.slice(0, 10);
    const yearsSince = new Date().getFullYear() - new Date(startDate + "T12:00:00").getFullYear();
    if (yearsSince < 1) continue;
    for (const yr of [1, 2, 3, 5, 10]) {
      if (yr > yearsSince + 1) break;
      const annivDate = addYears(startDate, yr);
      const d = daysUntil(annivDate);
      if (d >= 0 && d <= WINDOW_DAYS) {
        inserts.push({
          user_id:          userId,
          client_id:        client.id,
          opportunity_type: "contact_anniversary",
          trigger_date:     toISODate(annivDate),
          context: { anniversary_year: yr, first_contacted_at: startDate },
          status: "draft",
        });
      }
    }
  }

  // ── 7. Multi-deal milestone (Batch 2) ─────────────────────────────────────
  const clientDealDates = new Map<string, string[]>();
  for (const rec of records) {
    if (!rec.client_id || !rec.close_date) continue;
    // Collapsed deals are not real closings — exclude from milestone math
    // (mirrors clients-content.tsx:1248 and insights-tab.tsx:96).
    if ((rec as Record<string, unknown>).condition_status === "collapsed") continue;
    const arr = clientDealDates.get(rec.client_id) ?? [];
    arr.push(rec.close_date);
    clientDealDates.set(rec.client_id, arr);
  }
  const MILESTONE_COUNTS = [2, 3, 5];
  for (const [clientId, dates] of clientDealDates.entries()) {
    if (recentlyContactedIds.has(clientId)) continue; // suppress if recently contacted
    const sorted = [...dates].sort();
    for (const n of MILESTONE_COUNTS) {
      if (sorted.length < n) continue;
      const nthDate     = sorted[n - 1];
      const triggerDate = addDays(nthDate, 3);
      const d           = daysUntil(triggerDate);
      if (d >= -30 && d <= WINDOW_DAYS) {
        inserts.push({
          user_id:          userId,
          client_id:        clientId,
          opportunity_type: "multi_deal_milestone",
          trigger_date:     toISODate(triggerDate),
          context: { deal_count: n, nth_close_date: nthDate },
          status: "draft",
        });
      }
    }
  }

  // ── 8. Seasonal campaigns (Batch 3) ───────────────────────────────────────
  // Rank clients by lifetime GCI; limit to top SEASONAL_TOP_N
  const clientLifetimeGCI = new Map<string, number>();
  for (const rec of records) {
    if (rec.client_id && rec.gci) {
      clientLifetimeGCI.set(
        rec.client_id,
        (clientLifetimeGCI.get(rec.client_id) ?? 0) + (rec.gci as number),
      );
    }
  }
  const top25Ids = new Set(
    [...clientLifetimeGCI.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, SEASONAL_TOP_N)
      .map(([id]) => id),
  );

  const todayD  = new Date();
  const thisYr  = todayD.getFullYear();
  const todayMM = todayD.getMonth() + 1;
  const todayDD = todayD.getDate();

  type SeasonDef = { type: "seasonal_spring" | "seasonal_fall" | "seasonal_yearend" | "seasonal_tax"; sm: number; sd: number; em: number; ed: number; key: string };
  const SEASONS: SeasonDef[] = [
    { type: "seasonal_spring",  sm:  2, sd: 15, em:  3, ed: 31, key: `${thisYr}-02-15` },
    { type: "seasonal_fall",    sm:  9, sd:  1, em: 10, ed: 15, key: `${thisYr}-09-01` },
    { type: "seasonal_yearend", sm: 12, sd:  1, em: 12, ed: 31, key: `${thisYr}-12-01` },
    { type: "seasonal_tax",     sm:  1, sd: 15, em:  2, ed: 15, key: `${thisYr}-01-15` },
  ];

  for (const season of SEASONS) {
    const inWindow =
      (todayMM > season.sm || (todayMM === season.sm && todayDD >= season.sd)) &&
      (todayMM < season.em || (todayMM === season.em && todayDD <= season.ed));
    if (!inWindow) continue;

    for (const client of clients) {
      if (!top25Ids.has(client.id)) continue;
      if (recentlyContactedIds.has(client.id)) continue; // suppress if recently contacted
      inserts.push({
        user_id:          userId,
        client_id:        client.id,
        opportunity_type: season.type,
        trigger_date:     season.key,
        context: { season: season.type, year: thisYr },
        status: "draft",
      });
    }
  }

  // ── 9. Memory-powered triggers (only fire when memory is available) ────────
  const MEMORY_IDLE_MONTHS = 6; // lower threshold than idle_client (18mo) since memory gives us angle
  const memoryIdleCutoff = monthsAgoDate(MEMORY_IDLE_MONTHS);

  for (const client of clients) {
    if (recentlyContactedIds.has(client.id)) continue;
    const mem = memoryMap.get(client.id);
    if (!mem?.structured_facts) continue; // no memory → skip memory-powered triggers
    const facts = mem.structured_facts;

    const lastContact = client.last_contact_at ? new Date(client.last_contact_at) : null;
    const isIdle = !lastContact || lastContact < memoryIdleCutoff;
    const triggerDateStr = firstOfMonth(); // group by month to avoid duplicates

    // 9a. Pain point + inactive: client has a known pain point and has gone quiet
    if (facts.pain_point && isIdle) {
      inserts.push({
        user_id:          userId,
        client_id:        client.id,
        opportunity_type: "pain_point_inactive",
        trigger_date:     triggerDateStr,
        context: enrichContext(
          { pain_point: facts.pain_point, engagement_level: facts.engagement_level },
          "pain_point_inactive", facts,
          `Client has a known pain point ("${facts.pain_point}") and hasn't been contacted in ${MEMORY_IDLE_MONTHS}+ months`,
        ),
        status: "draft",
      });
    }

    // 9b. Buyer inventory match: active buyer with known areas of interest
    if (
      facts.areas_of_interest &&
      facts.goal?.toLowerCase().includes("buy") &&
      (client.status === "boarding" || client.status === "scheduled")
    ) {
      inserts.push({
        user_id:          userId,
        client_id:        client.id,
        opportunity_type: "buyer_inventory_match",
        trigger_date:     triggerDateStr,
        context: enrichContext(
          { areas_of_interest: facts.areas_of_interest, budget_context: facts.budget_context, goal: facts.goal },
          "buyer_inventory_match", facts,
          `Active buyer interested in ${facts.areas_of_interest} — proactive inventory update`,
        ),
        status: "draft",
      });
    }

    // 9c. Seller timing hesitation: known objection or hesitation for potential sellers
    if (
      facts.objection &&
      (/\bsell(ing|er|s)?\b/i.test(facts.goal ?? "") || /\bsell(ing|er|s)?\b/i.test(facts.motivation ?? ""))
    ) {
      inserts.push({
        user_id:          userId,
        client_id:        client.id,
        opportunity_type: "seller_timing_hesitation",
        trigger_date:     triggerDateStr,
        context: enrichContext(
          { objection: facts.objection, motivation: facts.motivation, timeline: facts.timeline },
          "seller_timing_hesitation", facts,
          `Potential seller with known hesitation: "${facts.objection}"`,
        ),
        status: "draft",
      });
    }

    // 9d. Mortgage renewal + finance concern: mortgage coming up AND memory shows financial concern
    if (
      (facts.budget_context?.toLowerCase().includes("mortgage") ||
       facts.pain_point?.toLowerCase().includes("rate") ||
       facts.pain_point?.toLowerCase().includes("payment")) &&
      clientLastDeal.has(client.id)
    ) {
      const deal = clientLastDeal.get(client.id)!;
      const dealDate = new Date(deal + "T12:00:00");
      const yearsSinceDeal = (Date.now() - dealDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      // Only fire if within 3.5–5.5 year window (approaching 5-year renewal)
      if (yearsSinceDeal >= 3.5 && yearsSinceDeal <= 5.5) {
        inserts.push({
          user_id:          userId,
          client_id:        client.id,
          opportunity_type: "mortgage_renewal_finance",
          trigger_date:     triggerDateStr,
          context: enrichContext(
            { close_date: deal, budget_context: facts.budget_context, pain_point: facts.pain_point },
            "mortgage_renewal_finance", facts,
            `Mortgage renewal approaching and client has financial concerns in memory`,
          ),
          status: "draft",
        });
      }
    }

    // 9e. Educational value for inactive: client has a known interest topic and is idle
    if (facts.last_key_topic && isIdle && !facts.pain_point) {
      // Don't double-fire if pain_point_inactive already covers this client
      inserts.push({
        user_id:          userId,
        client_id:        client.id,
        opportunity_type: "educational_value_inactive",
        trigger_date:     triggerDateStr,
        context: enrichContext(
          { last_key_topic: facts.last_key_topic, areas_of_interest: facts.areas_of_interest },
          "educational_value_inactive", facts,
          `Idle client with known interest in "${facts.last_key_topic}" — educational touchpoint`,
        ),
        status: "draft",
      });
    }
  }

  // ── Enrich all candidates with memory context + score ────────────────────
  for (const insert of inserts) {
    const ins = insert as { client_id: string; opportunity_type: string; context: Record<string, unknown> };
    const mem = memoryMap.get(ins.client_id);
    const facts = mem?.structured_facts ?? null;

    // Enrich existing triggers with memory fields (additive — won't overwrite existing keys)
    if (facts && !ins.context.memory_summary) {
      ins.context = enrichContext(
        ins.context,
        ins.opportunity_type,
        facts,
        ins.context.selected_reason as string ?? "",
      );
    }

    // Score with client context for data-richness awareness
    const clientData = _clientMap.get(ins.client_id);
    const clientTags = (clientData?.tags as string[] | null) ?? [];
    const clientNotes = (clientData?.notes as string | null) ?? null;

    const score = scoreCandidate(ins.opportunity_type, facts, ins.context, clientTags, clientNotes);
    const reason = buildOutreachReason(ins.opportunity_type, score, ins.context);
    ins.context = { ...ins.context, outreach_score: score, outreach_reason: reason };
  }

  // Sort by score descending — highest-value opportunities first
  inserts.sort((a, b) => {
    const sa = ((a as { context: { outreach_score?: number } }).context.outreach_score ?? 50);
    const sb = ((b as { context: { outreach_score?: number } }).context.outreach_score ?? 50);
    return sb - sa;
  });

  // ── Send-worthiness filter: remove weak signals ───────────────────────────
  const preFilterCount = inserts.length;
  const filtered = inserts.filter((ins) => {
    const score = (ins as { context: { outreach_score?: number } }).context.outreach_score ?? 0;
    return score >= MIN_SEND_WORTHY_SCORE;
  });

  // ── Per-client cap: max N opportunities per client per scan ───────────────
  const clientCounts = new Map<string, number>();
  const capped: typeof filtered = [];
  for (const ins of filtered) {
    const clientId = (ins as { client_id: string }).client_id;
    const count = clientCounts.get(clientId) ?? 0;
    if (count < MAX_PER_CLIENT_PER_SCAN) {
      capped.push(ins);
      clientCounts.set(clientId, count + 1);
    }
  }

  // Replace inserts with filtered + capped list
  inserts.length = 0;
  inserts.push(...capped);

  if (preFilterCount > inserts.length) {
    console.log(`[detect-opportunities] Filtered ${preFilterCount - inserts.length} weak/capped opportunities (${preFilterCount} → ${inserts.length})`);
  }

  // ── Clear skipped rows so they can be re-detected as fresh drafts ──────────
  // Why: The UNIQUE constraint (user_id, client_id, opportunity_type, trigger_date)
  // combined with ignoreDuplicates silently blocks re-insertion of opportunities
  // the user previously skipped. If the system re-detects the same opportunity
  // (still in window, still valid), the user should get another chance to act on it.
  // This only removes "skipped" rows — draft, ready, and sent rows are preserved.
  if (inserts.length > 0) {
    const skippedKeys = inserts.map((ins) => {
      const i = ins as { client_id: string; opportunity_type: string; trigger_date: string };
      return { client_id: i.client_id, opportunity_type: i.opportunity_type, trigger_date: i.trigger_date };
    });

    // Parallel delete: fire all skipped-row deletions concurrently instead of sequentially.
    // Each is a small, independent query — safe to parallelize.
    await Promise.all(
      skippedKeys.map((key) =>
        supabase
          .from("outreach_queue")
          .delete()
          .eq("user_id", userId)
          .eq("client_id", key.client_id)
          .eq("opportunity_type", key.opportunity_type)
          .eq("trigger_date", key.trigger_date)
          .eq("status", "skipped"),
      ),
    );
  }

  // ── Expire stale draft rows whose trigger windows have closed ────────────
  // Draft rows that were never acted on and are now past their lookback window
  // should not linger in the queue indefinitely. The tightest window across
  // post-close types is 5 days (post_close_3 lookback). Use 35 days as a
  // conservative floor so we never prune rows that are still valid for any type.
  const expiryCutoff = new Date();
  expiryCutoff.setDate(expiryCutoff.getDate() - 35);
  await supabase
    .from("outreach_queue")
    .delete()
    .eq("user_id", userId)
    .in("status", ["draft", "ready"])
    .lt("trigger_date", expiryCutoff.toISOString().slice(0, 10));

  // ── Upsert (UNIQUE constraint on user_id, client_id, type, trigger_date) ───
  // ignoreDuplicates: true ensures we never overwrite active draft/ready/sent rows.
  // Skipped rows were cleared above, so they no longer block re-detection.
  if (inserts.length > 0) {
    await supabase
      .from("outreach_queue")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(inserts as any, {
        onConflict:       "user_id,client_id,opportunity_type,trigger_date",
        ignoreDuplicates: true,
      });
  }

  // ── Count truly new (undrafted) items — this is the meaningful "detected" number ──
  // inserts.length counts re-detected duplicates too; we only want rows that
  // actually need action (status=draft, no ai_subject yet).
  const { count: undraftedCount } = await supabase
    .from("outreach_queue")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "draft")
    .is("ai_subject", null);

  const detected = undraftedCount ?? 0;

  // ── AI drafting ────────────────────────────────────────────────────────────
  const aiKey = process.env.ANTHROPIC_API_KEY || process.env.GROQ_API_KEY;
  if (!aiKey) {
    return { detected, drafted: 0 };
  }

  const { data: undrafted } = await supabase
    .from("outreach_queue")
    .select("*, clients(name, city, province_region, communication_tone, tags, notes)")
    .eq("user_id", userId)
    .eq("status", "draft")
    .is("ai_subject", null)
    .order("created_at", { ascending: true })
    .limit(MAX_DRAFTS_PER_RUN);

  if (!undrafted?.length) return { detected, drafted: 0 };

  // Draft all items in parallel — each draftItem has its own timeout + error handling,
  // so one slow/failed item never blocks the others.
  const results = await Promise.allSettled(
    undrafted.map((item) =>
      draftItem(
        item as OutreachQueueItem & { clients: { name: string; city: string | null; province_region: string | null; communication_tone?: string; tags?: string[]; notes?: string | null } | null },
        agentFirst,
        emailSignature,
        agentStyleGuide,
        userId,
        supabase,
      ),
    ),
  );

  let drafted = 0;
  let failed  = 0;
  for (const r of results) {
    if (r.status === "fulfilled" && r.value === true) drafted++;
    else failed++;
  }

  if (failed > 0) {
    console.warn(`[flight-control] Drafting complete: ${drafted} succeeded, ${failed} failed out of ${undrafted.length}`);
  }

  return { detected, drafted };
}

// ── Top Opportunities Engine ─────────────────────────────────────────────────
// Pure detection + scoring — NO database writes, NO Groq calls.
// Returns the top N highest-value opportunities as structured insight cards.

import type { TopOpportunity } from "@agent-runway/core/types/database";

const MAX_TOP_OPPORTUNITIES = 5;

/** Map opportunity type to a practical, short suggested approach. */
function suggestAngle(
  opportunityType: string,
  memory: ClientMemoryFacts | null,
  ctx: Record<string, unknown>,
): string {
  // Memory-driven angles take priority
  if (memory?.next_best_angle) return memory.next_best_angle;

  if (memory?.pain_point && opportunityType.includes("inactive")) {
    return "Address their concern directly — show you remembered";
  }
  if (memory?.areas_of_interest && (opportunityType.includes("buyer") || opportunityType.includes("idle"))) {
    return `Inventory update for ${memory.areas_of_interest}`;
  }

  // Type-specific defaults
  switch (opportunityType) {
    case "closing_anniversary":
      return "Home anniversary + neighbourhood value update";
    case "idle_client":
      return "Casual reconnection — market update for their area";
    case "birthday":
      return "Personal birthday note — no business pitch";
    case "post_close_3":
      return ctx.side === "listing" || ctx.side === "seller"
        ? "Post-closing check-in — how are things going"
        : "Settling-in check — anything they need help with";
    case "post_close_14":
      return ctx.side === "listing" || ctx.side === "seller"
        ? "Two-week follow-up — any loose ends from the sale"
        : "Two-week follow-up — how's the new place";
    case "post_close_90":
      return ctx.side === "listing" || ctx.side === "seller"
        ? "Three-month check-in — stay connected for what's next"
        : "Three-month milestone — value check-in";
    case "review_request":
      return "Ask for a review or testimonial";
    case "referral_ask":
      return "Referral touchpoint — who else can you help";
    case "new_client_welcome":
      return "Welcome + set expectations for how you work together";
    case "contact_anniversary":
      return "Relationship milestone — express genuine appreciation";
    case "multi_deal_milestone":
      return "Loyalty recognition — repeat client appreciation";
    case "mortgage_renewal_due":
    case "mortgage_renewal_window":
    case "mortgage_renewal_finance":
      return "Mortgage renewal conversation — connect with rates/options";
    case "past_client_check_in":
      return "Casual check-in — share something useful about their area";
    case "timeframe_approaching":
      return "Their stated timeline is arriving — are they still on track";
    case "scheduled_date_approaching":
      return "Their Scheduled stage target date is approaching — confirm they're still planning to act";
    case "property_value_milestone":
      return "Property anniversary + offer equity snapshot";
    case "buyer_inventory_match":
      return "New listings in their target areas";
    case "seller_timing_hesitation":
      return "Address their timing concern with current market context";
    case "educational_value_inactive":
      return `Educational content on ${(ctx.last_key_topic as string) ?? "their area of interest"}`;
    case "pain_point_inactive":
      return "Re-engage by addressing their known concern";
    case "condition_firming":
      return "Check in on condition status — confirm next steps toward firming";
    default:
      if (opportunityType.startsWith("seasonal_")) return "Seasonal market update — keep it relevant";
      return "General relationship touchpoint";
  }
}

/** Build a human-readable label for the opportunity card. */
function buildTopLabel(
  opportunityType: string,
  ctx: Record<string, unknown>,
  clientCity: string | null,
): string {
  const parts: string[] = [];

  switch (opportunityType) {
    case "closing_anniversary":
      parts.push(`${ctx.anniversary_year ?? 1}-year home anniversary`);
      if (ctx.address) parts.push(String(ctx.address));
      break;
    case "idle_client":
      parts.push(`No contact in ${ctx.months_idle ?? "18+"}`);
      break;
    case "birthday":
      parts.push("Birthday coming up");
      break;
    case "post_close_3":
      parts.push("Just closed · 3-day check-in");
      if (ctx.address) parts.push(String(ctx.address));
      break;
    case "post_close_14":
      parts.push("2 weeks since closing");
      break;
    case "post_close_90":
      parts.push("3-month post-close milestone");
      break;
    case "review_request":
      parts.push("21 days post-close · review timing");
      break;
    case "referral_ask":
      parts.push("45 days post-close · referral window");
      break;
    case "new_client_welcome":
      parts.push("New client · 7-day welcome");
      break;
    case "contact_anniversary":
      parts.push(`${ctx.anniversary_year ?? 1}-year relationship`);
      break;
    case "multi_deal_milestone":
      parts.push(`${ctx.deal_count ?? 2}x repeat client`);
      break;
    case "mortgage_renewal_due":
      parts.push("Mortgage renewal approaching");
      break;
    case "mortgage_renewal_window":
      parts.push("Entering renewal window");
      break;
    case "past_client_check_in":
      parts.push(`Past client · ${ctx.months_idle ?? "6+"}mo since last deal`);
      break;
    case "timeframe_approaching":
      parts.push(`Stated timeline arriving · ${ctx.days_remaining ?? "?"}d`);
      break;
    case "scheduled_date_approaching":
      parts.push(`Scheduled target · ${ctx.days_until ?? "?"}d`);
      break;
    case "property_value_milestone":
      parts.push(`${ctx.milestone_year ?? 1}-year property anniversary`);
      break;
    case "pain_point_inactive":
      parts.push("Known concern + inactive");
      break;
    case "buyer_inventory_match":
      parts.push("Active buyer with target areas");
      break;
    case "seller_timing_hesitation":
      parts.push("Seller with timing objection");
      break;
    case "educational_value_inactive":
      parts.push("Topic interest + inactive");
      break;
    case "condition_firming":
      parts.push("Condition date approaching");
      if (ctx.address) parts.push(String(ctx.address));
      break;
    default:
      if (opportunityType.startsWith("seasonal_")) parts.push("Seasonal touchpoint");
      else parts.push("Outreach opportunity");
  }

  // Append city if we have it and haven't already mentioned an address
  if (clientCity && !ctx.address) parts.push(clientCity);

  // Append GCI tier if notable
  if (ctx.gci && Number(ctx.gci) > 10000) parts.push(`$${(Number(ctx.gci) / 1000).toFixed(0)}k GCI`);

  return parts.join(" · ");
}

/** Build the "why this matters" explanation focused on relationship value. */
function buildWhyThisMatters(
  opportunityType: string,
  ctx: Record<string, unknown>,
  memory: ClientMemoryFacts | null,
): string {
  const lines: string[] = [];

  // Relationship value
  if (ctx.gci && Number(ctx.gci) > 15000) {
    lines.push("High-value client relationship.");
  } else if (ctx.gci && Number(ctx.gci) > 5000) {
    lines.push("Solid past transaction history.");
  }

  if (memory?.engagement_level) {
    const eng = memory.engagement_level.toLowerCase();
    if (eng.includes("highly active") || eng.includes("responsive")) {
      lines.push("Client has been responsive and engaged.");
    } else if (eng.includes("going cold") || eng.includes("ghost")) {
      lines.push("Client engagement is dropping — this could re-engage them.");
    }
  }

  // Type-specific reasons
  switch (opportunityType) {
    case "closing_anniversary":
      lines.push("Closing anniversaries are one of the strongest referral triggers in real estate.");
      break;
    case "idle_client":
      lines.push("Long gaps in contact erode relationships. A timely touchpoint keeps you top-of-mind.");
      break;
    case "birthday":
      lines.push("Personal milestones build loyalty more effectively than business outreach.");
      break;
    case "post_close_3":
    case "post_close_14":
    case "post_close_90":
      lines.push("Post-close nurture is where referrals are earned. Most agents disappear after closing.");
      break;
    case "review_request":
      lines.push("Reviews from recent clients carry the most weight and authenticity.");
      break;
    case "referral_ask":
      lines.push("Clients are most likely to refer within 60 days of a positive closing experience.");
      break;
    case "mortgage_renewal_due":
    case "mortgage_renewal_window":
    case "mortgage_renewal_finance":
      lines.push("Mortgage renewal is a natural re-engagement moment. Be there before the bank is.");
      break;
    case "past_client_check_in":
      lines.push("Past clients are your most underutilized asset. A brief, useful check-in goes far.");
      break;
    case "buyer_inventory_match":
      lines.push("Active buyer with known preferences — showing relevant inventory builds trust.");
      break;
    case "seller_timing_hesitation":
      lines.push("Addressing objections directly shows you're paying attention, not just following up.");
      break;
    case "condition_firming":
      lines.push("Condition dates are deal-defining moments — staying on top of them demonstrates professionalism and protects the transaction.");
      break;
    default:
      if (lines.length === 0) lines.push("Maintaining regular contact strengthens the relationship.");
  }

  // Memory-enhanced insights
  if (memory?.pain_point && !lines.some((l) => l.includes("concern"))) {
    lines.push(`Known concern: "${memory.pain_point.slice(0, 80)}".`);
  }
  if (memory?.motivation) {
    lines.push(`Motivation: ${memory.motivation.slice(0, 80)}.`);
  }

  return lines.join(" ");
}

/** Build the "why now" timing justification. */
function buildWhyNow(
  opportunityType: string,
  ctx: Record<string, unknown>,
  triggerDate: string,
): string {
  switch (opportunityType) {
    case "closing_anniversary":
      return `${ctx.anniversary_year ?? 1}-year closing anniversary is ${daysUntilLabel(triggerDate)}.`;
    case "idle_client":
      return `Last deal was ${ctx.months_idle ?? "18+ months"} ago — well past the recommended contact interval.`;
    case "birthday":
      return `Birthday is ${daysUntilLabel(triggerDate)} — best to reach out a day or two before.`;
    case "post_close_3":
      return ctx.side === "listing" || ctx.side === "seller"
        ? "3 days since closing — the transaction is still fresh and your follow-through sets the tone for the ongoing relationship."
        : "3 days since closing — the client is still in the emotional high of a new home.";
    case "post_close_14":
      return ctx.side === "listing" || ctx.side === "seller"
        ? "2 weeks since closing — enough time for the dust to settle. A check-in now reinforces that you're more than a transaction."
        : "2 weeks since closing — they've settled in enough to reflect on the experience.";
    case "post_close_90":
      return ctx.side === "listing" || ctx.side === "seller"
        ? "3 months since closing — long enough that life has moved on, soon enough to stay connected for their next move."
        : "3 months since closing — long enough to feel established, soon enough to remember you.";
    case "review_request":
      return "21 days post-close — the ideal window for an authentic review request.";
    case "referral_ask":
      return "45 days post-close — the peak referral window before the relationship cools.";
    case "new_client_welcome":
      return "7 days since first contact — enough time to process, early enough to set expectations.";
    case "contact_anniversary":
      return `${ctx.anniversary_year ?? 1}-year relationship milestone is ${daysUntilLabel(triggerDate)}.`;
    case "multi_deal_milestone":
      return `Recent close marked their ${ctx.deal_count ?? 2}th deal with you — loyalty worth recognizing.`;
    case "mortgage_renewal_due":
      return `Mortgage renewal is approaching — ${ctx.days_until_renewal ?? "soon"}. Contact before the bank does.`;
    case "mortgage_renewal_window":
      return `${ctx.months_until_renewal ?? 12} months until renewal — now is the time to plant the seed.`;
    case "past_client_check_in":
      return `${ctx.months_idle ?? "6+"} months since last deal with no recent contact.`;
    case "timeframe_approaching":
      return `Their stated timeline of "${ctx.timeframe_label ?? "move date"}" is ~${ctx.days_remaining ?? "?"}d away.`;
    case "scheduled_date_approaching":
      return `Their Scheduled stage target date${ctx.scheduled_phrase ? ` (${ctx.scheduled_phrase})` : ""} is ~${ctx.days_until ?? "?"}d away — confirm intent before the date passes.`;
    case "property_value_milestone":
      return `${ctx.milestone_year ?? 1}-year property anniversary — natural moment to discuss equity.`;
    case "pain_point_inactive":
      return "Client has a known concern and has gone quiet — reaching out shows you haven't forgotten.";
    case "buyer_inventory_match":
      return "Active buyer with known target areas — new listings align with their preferences.";
    case "seller_timing_hesitation":
      return "Seller with timing objection — current market data could shift their thinking.";
    case "educational_value_inactive":
      return `Client showed interest in "${ctx.last_key_topic ?? "a topic"}" — educational value re-engages without pressure.`;
    case "condition_firming": {
      const dUntil = ctx.days_until_condition ? Number(ctx.days_until_condition) : 0;
      if (dUntil <= 0) return "The condition date has arrived — this deal needs to firm, be waived, or collapse today. Advance the pipeline stage now.";
      if (dUntil <= 3) return `Condition date is ${dUntil === 1 ? "tomorrow" : `in ${dUntil} days`} — confirm with all parties and prepare to advance this deal to the next stage.`;
      return `Condition date is ${daysUntilLabel(triggerDate)} — stay ahead of it so the deal can progress on time.`;
    }
    default:
      if (opportunityType.startsWith("seasonal_")) {
        return "Seasonal timing — relevant touchpoint that doesn't need a specific reason.";
      }
      return `Trigger date is ${daysUntilLabel(triggerDate)}.`;
  }
}

function daysUntilLabel(triggerDate: string): string {
  const target = new Date(triggerDate + "T12:00:00");
  const today  = new Date();
  today.setHours(12, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0)  return `${Math.abs(days)} days ago`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/**
 * Build a 1-2 sentence financial impact explanation.
 *
 * Design principles:
 * - Personal: reference the agent's actual portfolio stats, not generic advice
 * - Relative: frame value compared to alternatives (cold leads, general marketing)
 * - Urgent when warranted: use pipeline depth + timing windows, never alarm
 * - Varied: no two opportunity types should produce the same sentence structure
 */
function buildFinancialImpact(
  opportunityType: string,
  ctx: Record<string, unknown>,
  memory: ClientMemoryFacts | null,
  clientStatus: string | null,
  clientDealCount: number,
  portfolioStats: {
    avgGci: number;
    totalDeals: number;
    repeatRate: number;
    activeClients: number;
  },
  state: AgentState,
): string {
  const gci = ctx.gci ? Number(ctx.gci) : 0;
  const isHighValue = gci > 15000;
  const _isMidValue = gci > 5000 && gci <= 15000;
  const isRepeat = clientDealCount >= 2;
  const pipelineLight = portfolioStats.activeClients < 3;
  const pipelineDry = portfolioStats.activeClients === 0;
  const hasStrongRepeatHistory = portfolioStats.repeatRate > 25;
  const _hasModerateRepeatHistory = portfolioStats.repeatRate > 10;
  const monthsIdle = ctx.months_idle ? parseInt(String(ctx.months_idle), 10) : 0;
  const daysRemaining = ctx.days_remaining ? Number(ctx.days_remaining) : 0;
  const gciLabel = gci > 0 ? `$${(gci / 1000).toFixed(0)}k` : null;

  // ── Post-close 3/14: foundation moments ───────────────────────────────────
  const isSeller = ctx.side === "listing" || ctx.side === "seller";

  if (opportunityType === "post_close_3") {
    if (isSeller && isHighValue && gciLabel) {
      return `This was a ${gciLabel} GCI listing — your follow-through after closing shapes whether this seller refers you to their network or moves on.`;
    }
    if (isSeller) {
      return "The first few days after a listing closes are when sellers decide if you're someone they'd recommend. A brief check-in now cements that impression.";
    }
    if (isHighValue && gciLabel) {
      return `This was a ${gciLabel} GCI deal — your follow-through in the first week directly shapes whether this client becomes a long-term referral source or a one-time transaction.`;
    }
    return "The first few days after closing are when clients decide if you're the agent they tell their friends about. This is a higher-leverage moment than most agents realize.";
  }

  if (opportunityType === "post_close_14") {
    if (isSeller && pipelineLight) {
      return "Two weeks after their listing closed — the transaction stress has faded and they're ready to reflect on the experience. With your pipeline light, this relationship is worth nurturing.";
    }
    if (isSeller) {
      return "Two weeks out from closing their property — the deal is behind them but you're still top of mind. A check-in here keeps you positioned as their go-to agent.";
    }
    if (pipelineLight) {
      return "Two weeks post-close is when the referral seed gets planted. With your pipeline needing attention, nurturing this relationship now could directly generate your next lead.";
    }
    return "Two weeks in, the closing excitement has settled but you're still top of mind. A check-in here has more referral potential than any marketing campaign.";
  }

  // ── Referral ask / post-close 90 ──────────────────────────────────────────
  if (opportunityType === "referral_ask") {
    if (isHighValue && gciLabel && state.pace_status === "behind") {
      return `You're behind pace, and at ${gciLabel} GCI, a referral from this client could be the deal that gets you back on track. This is your highest-leverage ask right now.`;
    }
    if (isHighValue && gciLabel) {
      return `At ${gciLabel} GCI, referrals from this client are likely to be similarly valuable. This is a higher-probability path to your next closing than any new lead source.`;
    }
    if (hasStrongRepeatHistory) {
      return `Your repeat rate is strong — this referral window is how you keep feeding that. One ask here is worth more than a week of prospecting.`;
    }
    if (state.pace_status === "ahead") {
      return "You're on track this month — this referral ask helps you maintain momentum rather than recover it. That's a better position to be asking from.";
    }
    return "You're in the peak referral window. A single referral from a happy client typically closes faster and at higher value than cold outreach.";
  }

  if (opportunityType === "post_close_90") {
    if (isSeller && isRepeat) {
      return "Three months since their listing closed — with a repeat client, this check-in keeps the relationship active for their next transaction or referral.";
    }
    if (isSeller) {
      return "Three months since their property sold. Most agents vanish after closing — a check-in now keeps you positioned for referrals and future business.";
    }
    if (isRepeat) {
      return "Three months out with a repeat client — this is the point where the relationship either deepens or drifts. A brief check-in now protects a significant asset in your business.";
    }
    return "The 90-day mark is when most agents disappear. Showing up here separates you from the agents they'll forget — and makes you the one they recommend.";
  }

  // ── Review request ────────────────────────────────────────────────────────
  if (opportunityType === "review_request") {
    if (portfolioStats.totalDeals > 10) {
      return "You've closed enough deals that reviews compound your credibility. Each new review makes every future conversation easier — this one costs you a two-minute ask.";
    }
    return "Early in building your review base, every review punches above its weight. A strong testimonial from this client could influence multiple future buyers and sellers.";
  }

  // ── Closing anniversary ───────────────────────────────────────────────────
  if (opportunityType === "closing_anniversary") {
    if (isRepeat && isHighValue && gciLabel) {
      return `A repeat client with ${gciLabel} GCI — this is one of the most valuable relationships in your book. Protecting it with an anniversary note is a no-brainer.`;
    }
    if (isRepeat) {
      return "Repeat clients already chose you twice. This anniversary touchpoint costs you nothing and keeps the compounding loyalty cycle alive.";
    }
    if (isHighValue && gciLabel) {
      return `This ${gciLabel} deal makes this one of your higher-value past clients. A quick anniversary note does more for your future pipeline than hours of cold calling.`;
    }
    if (pipelineLight) {
      return "Your pipeline needs attention, and anniversaries are the easiest re-engagement trigger you have. This one takes minimal effort with disproportionate upside.";
    }
    return "Anniversary check-ins convert at a higher rate than almost any other outreach type. This is one of the simplest high-return actions on your list today.";
  }

  // ── Idle client / past client check-in ────────────────────────────────────
  if (opportunityType === "idle_client" || opportunityType === "past_client_check_in") {
    if (pipelineDry && state.pace_status === "behind") {
      return "With no active deals and your pace behind where it needs to be, this past client is your fastest path back to momentum. They already trust you — start here.";
    }
    if (pipelineDry) {
      return "You have no active deals right now. This past client already trusts you — reconnecting here is the single highest-probability move you can make for near-term income.";
    }
    if (pipelineLight && state.pace_status === "behind" && isHighValue && gciLabel) {
      return `You're behind pace with a light pipeline — and this ${gciLabel} past client is sitting right there. This is a higher-probability path to your next closing than anything else on this list.`;
    }
    if (pipelineLight && isHighValue && gciLabel) {
      return `With your pipeline light and ${gciLabel} in past GCI, this dormant relationship is more valuable than any new lead you could chase today.`;
    }
    if (isHighValue && gciLabel) {
      return `${gciLabel} GCI from this client last time. Re-engaging a proven high-value relationship consistently outperforms sourcing new ones.`;
    }
    if (monthsIdle > 24) {
      return "It's been over two years — the longer you wait, the harder it gets to re-engage. Acting now, while the relationship is still recoverable, protects future deal potential.";
    }
    if (hasStrongRepeatHistory) {
      return "You already turn past clients into repeat clients at a strong rate. This is another opportunity to keep that working — and it takes less effort than finding a new one.";
    }
    if (pipelineLight) {
      return "Your pipeline is light and this client already knows your work. Past-client outreach converts at a significantly higher rate than cold prospecting.";
    }
    if (state.pace_status === "ahead") {
      return "You're ahead of pace — this is a longer-term play, not urgent. But re-engaging now while you have breathing room means you're building pipeline from a position of strength.";
    }
    return "This relationship has gone quiet, but the trust you built doesn't expire overnight. A well-timed check-in here is worth more than several cold introductions.";
  }

  // ── Birthday ──────────────────────────────────────────────────────────────
  if (opportunityType === "birthday") {
    if (isRepeat && isHighValue) {
      return "A high-value repeat client's birthday — this is one of the cheapest ways to reinforce a relationship that has already generated significant income for your business.";
    }
    if (isHighValue && gciLabel) {
      return `At ${gciLabel} in past GCI, keeping this client loyal pays for itself many times over. A birthday note costs you thirty seconds and strengthens that bond.`;
    }
    if (pipelineLight) {
      return "When business is quiet, personal gestures keep your network warm. Birthday notes have an outsized impact on whether someone thinks of you when opportunity strikes.";
    }
    return "The agents who get the most referrals are the ones people genuinely like. A personal birthday message builds that kind of loyalty — silently, consistently.";
  }

  // ── Mortgage renewal ──────────────────────────────────────────────────────
  if (opportunityType === "mortgage_renewal_due") {
    if (isHighValue && gciLabel) {
      return `This client's mortgage is up for renewal — and their last deal was ${gciLabel} GCI. This is one of the rare moments where a past client is actively rethinking their housing. Be there first.`;
    }
    return "Mortgage renewal is one of the only triggers that naturally pulls clients back into real estate thinking. Reaching out before the bank does positions you for their next transaction.";
  }

  if (opportunityType === "mortgage_renewal_window" || opportunityType === "mortgage_renewal_finance") {
    if (pipelineLight) {
      return "With your pipeline needing deals, mortgage renewal conversations are a direct path to listings and purchases. This client will be making a decision soon — with or without you.";
    }
    return "Clients entering their renewal window are quietly evaluating their options. Showing up now, before they feel pressured, gives you a strategic advantage.";
  }

  // ── Multi-deal milestone ──────────────────────────────────────────────────
  if (opportunityType === "multi_deal_milestone") {
    if (gciLabel) {
      return `This client has closed ${clientDealCount} deals with you. At ${gciLabel} on the latest, this is one of your most valuable relationships — the kind that funds your business long-term.`;
    }
    return `${clientDealCount} deals together and counting. Repeat clients cost you nothing to acquire and close faster — this relationship is disproportionately valuable.`;
  }

  // ── Active buyer ──────────────────────────────────────────────────────────
  if (opportunityType === "buyer_inventory_match") {
    if (pipelineDry && state.pace_status === "behind") {
      return "With no active deals and your pace falling behind, this buyer with known preferences is the most direct path to a closing. This is recovery territory — act on it.";
    }
    if (pipelineLight) {
      return "Your pipeline needs active deals, and this buyer has known preferences. Sending relevant inventory now could be the push that moves this from browsing to offer.";
    }
    if (state.pipeline_status === "healthy") {
      return "Your pipeline is in good shape — this is about accelerating an active buyer, not filling a gap. Proactive inventory surfacing moves deals faster.";
    }
    return "Buyers who see you proactively surfacing listings commit faster. This is direct pipeline activity — not relationship maintenance, but deal acceleration.";
  }

  // ── Seller hesitation ─────────────────────────────────────────────────────
  if (opportunityType === "seller_timing_hesitation") {
    if (pipelineDry && state.pace_status === "behind") {
      return "You need listings and you're behind pace — this seller has a known objection you can address. Converting this could be the turning point in your quarter.";
    }
    if (pipelineDry) {
      return "You need listings and this seller has a known objection. Overcoming one hesitation with the right data point could be the single most impactful action you take this week.";
    }
    if (pipelineLight) {
      return "Converting a hesitant seller into a listing is one of the highest-leverage moves available to you right now. One data point could tip the balance.";
    }
    return "Hesitant sellers who feel informed convert at a higher rate than those who feel pushed. A well-timed observation here could unlock a listing you'd otherwise lose.";
  }

  // ── Pain point reactivation ───────────────────────────────────────────────
  if (opportunityType === "pain_point_inactive") {
    const painPoint = memory?.pain_point ?? (ctx.pain_point as string) ?? null;
    if (pipelineLight && painPoint) {
      return `Your pipeline is light, and this client has a specific unresolved concern. Addressing it directly is a higher-conversion play than generic outreach — they'll know you were paying attention.`;
    }
    if (painPoint) {
      return "You know exactly what's holding this client back. That's an advantage most agents don't have — using it positions you as the one who actually listens.";
    }
    return "Re-engaging a client through their specific concern converts better than broad check-ins. This is targeted, not generic — and that difference matters.";
  }

  // ── Condition firming ─────────────────────────────────────────────────────
  if (opportunityType === "condition_firming") {
    if (gciLabel) {
      return `This is a ${gciLabel} GCI deal with an approaching condition date. Missing it could collapse the transaction entirely — protecting this closing is your highest-value action.`;
    }
    if (pipelineLight) {
      return "With your pipeline light, every pending deal matters more. This condition date determines whether this deal advances or falls apart.";
    }
    return "Condition dates are binary moments — the deal either moves forward or it doesn't. Staying on top of this protects income that's already in your pipeline.";
  }

  // ── Educational value ─────────────────────────────────────────────────────
  if (opportunityType === "educational_value_inactive") {
    if (pipelineLight) {
      return "Educating idle clients on topics they've expressed interest in is a low-effort way to restart conversations. With your pipeline light, these conversations are where your next deal comes from.";
    }
    return "Sharing relevant knowledge keeps this client engaged without any sales pressure. When they're ready to act, you'll be the first call — not the agent they have to go find.";
  }

  // ── Timeframe approaching ─────────────────────────────────────────────────
  if (opportunityType === "timeframe_approaching") {
    if (daysRemaining > 0 && daysRemaining <= 30) {
      return `Their stated timeline is within a month. This is not a someday conversation — this is an active deal window. If you don't reach out, someone else will.`;
    }
    if (daysRemaining > 30 && daysRemaining <= 90) {
      return "Their timeline is approaching and the window to be their agent is narrowing. A check-in now keeps you positioned as the obvious choice when they pull the trigger.";
    }
    return "This client gave you a timeline, and it's arriving. Following through on that shows reliability — the trait that converts more deals than any marketing tactic.";
  }

  // ── Property milestone ────────────────────────────────────────────────────
  if (opportunityType === "property_value_milestone") {
    if (isHighValue && gciLabel) {
      return `A ${gciLabel} GCI client hitting a property milestone — an equity conversation here could surface their next move before they even start thinking about it.`;
    }
    return "Property anniversaries naturally prompt homeowners to think about equity and options. Starting that conversation proactively positions you ahead of competing agents.";
  }

  // ── Seasonal ──────────────────────────────────────────────────────────────
  if (opportunityType.startsWith("seasonal_")) {
    if (pipelineDry && state.pace_status === "behind") {
      return "With no active deals and your pace behind, staying visible isn't optional — it's how you generate your next conversation. This seasonal touchpoint is that first step.";
    }
    if (pipelineDry) {
      return "With no active deals, staying visible to your database is critical. A seasonal touchpoint now could surface the conversation that becomes your next closing.";
    }
    if (pipelineLight) {
      return "Pipeline gaps get filled by agents who stay visible between deals. This seasonal touchpoint is a low-cost way to keep your name in circulation.";
    }
    if (state.pipeline_status === "healthy" && state.pace_status === "ahead") {
      return "Your pipeline is healthy and you're ahead of pace — this seasonal touchpoint is about maintaining visibility, not generating urgency. Keep the flywheel turning.";
    }
    return "Seasonal outreach keeps you in your network's peripheral vision — so when someone in their circle needs an agent, your name surfaces first.";
  }

  // ── New client welcome ────────────────────────────────────────────────────
  if (opportunityType === "new_client_welcome") {
    if (pipelineLight && state.pace_status === "behind") {
      return "You need more active clients and you're behind pace. This new contact is a fresh opportunity — a strong first impression could accelerate them from prospect to active deal.";
    }
    if (pipelineLight) {
      return "This is a new relationship — and with your pipeline light, converting new contacts into active clients matters more right now than usual. A strong first impression accelerates that.";
    }
    return "New clients who feel well-handled in the first week are significantly more likely to follow through on their goals with you. This impression sets the trajectory.";
  }

  // ── Contact anniversary ───────────────────────────────────────────────────
  if (opportunityType === "contact_anniversary") {
    if (isRepeat && gciLabel) {
      return `${clientDealCount} deals and ${gciLabel} in GCI — this relationship anniversary is worth protecting. It costs nothing and reinforces a bond that's already generating real income.`;
    }
    if (isRepeat) {
      return "A repeat client's anniversary is an easy win — it deepens a relationship that's already proven it generates business. High leverage, minimal effort.";
    }
    return "Relationship milestones create a moment of natural warmth. Clients who feel valued beyond the transaction refer more and stay loyal longer.";
  }

  // ── Fallback (should be rare — most types are covered above) ──────────────
  if (state.urgency_level === "critical") {
    return "With your pipeline empty and pace behind, every quality touchpoint is a potential path back to income. This one deserves your attention right now.";
  }
  if (pipelineDry) {
    return "With your pipeline empty, every quality touchpoint with a past or active client is a potential path to your next deal. This one is worth your attention.";
  }
  if (state.urgency_level === "high") {
    return "Your pipeline needs attention and your pace could use a boost. This is a higher-probability conversation than cold outreach — someone who already knows your work.";
  }
  if (pipelineLight) {
    return "Your pipeline could use more activity. This opportunity represents a higher-probability conversation than cold outreach — someone who already knows your work.";
  }
  if (state.pace_status === "ahead") {
    return "You're in a strong position right now. This touchpoint builds on that — maintaining relationships from a position of strength is how you stay ahead.";
  }
  return "This is a warm relationship with existing trust. Reaching out here converts at a meaningfully higher rate than any cold introduction would.";
}

/**
 * Compute a lightweight agent_state snapshot at runtime.
 * No new DB queries — uses data already fetched by getTopOpportunities.
 */
function computeAgentState(
  activeClients: number,
  dealsThisYear: number,
  totalDeals: number,
  yearsActive: number,
): AgentState {
  // ── Pipeline status ─────────────────────────────────────────────────────
  const pipeline_status: AgentState["pipeline_status"] =
    activeClients === 0 ? "empty" :
    activeClients <= 2  ? "light" :
                          "healthy";

  // ── Pace status ─────────────────────────────────────────────────────────
  // Compare deals closed this calendar year vs historical yearly average,
  // prorated for how far through the year we are.
  let pace_status: AgentState["pace_status"] = "on_track";

  if (yearsActive >= 1 && totalDeals >= 2) {
    const yearlyAvg = totalDeals / yearsActive;
    const monthFraction = (new Date().getMonth() + 1) / 12;
    const expectedByNow = yearlyAvg * monthFraction;

    if (dealsThisYear >= expectedByNow * 1.25) {
      pace_status = "ahead";
    } else if (dealsThisYear <= expectedByNow * 0.7) {
      pace_status = "behind";
    }
  } else {
    // Fallback: infer from pipeline depth when history is thin
    if (activeClients === 0) pace_status = "behind";
    else if (activeClients >= 3) pace_status = "on_track";
  }

  // ── Urgency level ───────────────────────────────────────────────────────
  let urgency_level: AgentState["urgency_level"] = "moderate";

  if (pipeline_status === "empty" && pace_status === "behind") {
    urgency_level = "critical";
  } else if (pipeline_status === "empty" || (pipeline_status === "light" && pace_status === "behind")) {
    urgency_level = "high";
  } else if (pipeline_status === "light" || pace_status === "behind") {
    urgency_level = "moderate";
  } else {
    urgency_level = "low";
  }

  return { pipeline_status, pace_status, urgency_level };
}

/**
 * Get Top Opportunities — detection + scoring without persistence.
 * Returns the highest-value opportunities as structured insight cards.
 * NO database writes. NO Groq calls. Fast and safe.
 */
export async function getTopOpportunities(
  userId:   string,
  supabase: SupabaseClient,
): Promise<TopOpportunity[]> {
  // ── Fetch data (same as detectAndDraftForUser) ─────────────────────────────
  const [clientsRes, recordsRes, memoryRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, city, province_region, birthdate, communication_tone, first_contacted_at, last_contact_at, tags, notes, status, scheduled_for, scheduled_phrase")
      .eq("user_id", userId)
      .is("archived_at", null),
    supabase
      .from("client_records")
      .select("id, client_id, address, close_date, gci, side, property_use, condition_date, condition_status")
      .eq("user_id", userId)
      .not("client_id", "is", null),
    supabase
      .from("client_memory_profiles")
      .select("client_id, memory_summary, structured_facts, stale")
      .eq("user_id", userId)
      .eq("stale", false),
  ]);

  const clients    = clientsRes.data ?? [];
  const records    = recordsRes.data ?? [];
  const _clientMap = new Map(clients.map((c) => [c.id, c]));

  const memoryMap = new Map<string, { memory_summary: string | null; structured_facts: ClientMemoryFacts }>();
  if (memoryRes.data) {
    for (const m of memoryRes.data) {
      memoryMap.set(m.client_id, {
        memory_summary: m.memory_summary,
        structured_facts: m.structured_facts as ClientMemoryFacts,
      });
    }
  }

  // Suppression
  const SUPPRESSION_DAYS = 14;
  const suppressionCutoff = new Date();
  suppressionCutoff.setDate(suppressionCutoff.getDate() - SUPPRESSION_DAYS);
  const recentlyContactedIds = new Set(
    clients
      .filter((c) => c.last_contact_at && new Date(c.last_contact_at) > suppressionCutoff)
      .map((c) => c.id),
  );

  const inserts: object[] = [];
  const idleCutoff = monthsAgoDate(IDLE_MONTHS);

  // ── Run ALL the same detection loops ──────────────────────────────────────
  // (Duplicated from detectAndDraftForUser for isolation — no DB writes here)

  // 1. Closing anniversaries
  for (const rec of records) {
    if (!rec.close_date || !rec.client_id) continue;
    if (recentlyContactedIds.has(rec.client_id)) continue;
    for (const years of ANNIVERSARY_YEARS) {
      const anniv = addYears(rec.close_date, years);
      const days  = daysUntil(anniv);
      if (days >= 0 && days <= WINDOW_DAYS) {
        inserts.push({
          user_id: userId, client_id: rec.client_id, client_record_id: rec.id,
          opportunity_type: "closing_anniversary", trigger_date: toISODate(anniv),
          context: { anniversary_year: years, address: rec.address, close_date: rec.close_date, gci: rec.gci, side: rec.side, property_use: rec.property_use },
        });
      }
    }
  }

  // 2. Idle clients
  const clientLastDeal = new Map<string, string>();
  for (const rec of records) {
    if (!rec.client_id || !rec.close_date) continue;
    const existing = clientLastDeal.get(rec.client_id);
    if (!existing || rec.close_date > existing) clientLastDeal.set(rec.client_id, rec.close_date);
  }
  const triggerMonthKey = firstOfMonth();
  for (const [clientId, lastDeal] of clientLastDeal.entries()) {
    if (recentlyContactedIds.has(clientId)) continue;
    if (new Date(lastDeal + "T12:00:00") < idleCutoff) {
      inserts.push({
        user_id: userId, client_id: clientId, opportunity_type: "idle_client",
        trigger_date: triggerMonthKey,
        context: { last_deal: lastDeal, months_idle: monthsIdleLabel(lastDeal) },
      });
    }
  }

  // 3. Birthdays
  for (const client of clients) {
    if (!client.birthdate) continue;
    const birthday = nextBirthdayDate(client.birthdate);
    if (isNaN(birthday.getTime())) continue;
    const days = daysUntil(birthday);
    if (days >= 0 && days <= WINDOW_DAYS) {
      inserts.push({
        user_id: userId, client_id: client.id, opportunity_type: "birthday",
        trigger_date: toISODate(birthday), context: { birthdate: client.birthdate },
      });
    }
  }

  // 4. Post-close nurture
  const POST_CLOSE_CONFIGS = [
    { type: "post_close_3" as const, days: 3, lookback: 5 },
    { type: "post_close_14" as const, days: 14, lookback: 7 },
    { type: "post_close_90" as const, days: 90, lookback: 30 },
    { type: "review_request" as const, days: 21, lookback: 10 },
    { type: "referral_ask" as const, days: 45, lookback: 21 },
  ];
  for (const rec of records) {
    if (!rec.close_date || !rec.client_id) continue;
    if (recentlyContactedIds.has(rec.client_id)) continue;
    for (const cfg of POST_CLOSE_CONFIGS) {
      const triggerDate = addDays(rec.close_date, cfg.days);
      const d = daysUntil(triggerDate);
      if (d >= -cfg.lookback && d <= WINDOW_DAYS) {
        inserts.push({
          user_id: userId, client_id: rec.client_id, client_record_id: rec.id,
          opportunity_type: cfg.type, trigger_date: toISODate(triggerDate),
          context: { address: rec.address, close_date: rec.close_date, gci: rec.gci, days_after_close: cfg.days, side: rec.side, property_use: rec.property_use },
        });
      }
    }
  }

  // 4b. Condition date approaching — deal about to firm or needs action
  for (const rec of records) {
    if (!rec.client_id) continue;
    const condDate = (rec as Record<string, unknown>).condition_date as string | null;
    const condStatus = (rec as Record<string, unknown>).condition_status as string | null;
    if (!condDate || condStatus === "firmed" || condStatus === "waived" || condStatus === "collapsed") continue;
    const d = daysUntil(new Date(condDate + "T12:00:00"));
    if (d >= -3 && d <= WINDOW_DAYS) {
      inserts.push({
        user_id: userId, client_id: rec.client_id, client_record_id: rec.id,
        opportunity_type: "condition_firming",
        trigger_date: condDate,
        context: { address: rec.address, gci: rec.gci, side: rec.side, condition_date: condDate, days_until_condition: d },
      });
    }
  }

  // 5-9: Remaining triggers (welcome, contact anniversary, multi-deal, seasonal, mortgage, memory-powered)
  // Welcome
  for (const client of clients) {
    if (!client.first_contacted_at) continue;
    if (recentlyContactedIds.has(client.id)) continue;
    const welcomeDate = addDays(client.first_contacted_at.slice(0, 10), 7);
    const d = daysUntil(welcomeDate);
    if (d >= -14 && d <= WINDOW_DAYS) {
      inserts.push({
        user_id: userId, client_id: client.id, opportunity_type: "new_client_welcome",
        trigger_date: toISODate(welcomeDate), context: { first_contacted_at: client.first_contacted_at },
      });
    }
  }

  // Scheduled-date approaching — surfaces clients in the Scheduled stage when
  // their stated future-intent date is within ~30 days. Without this, the
  // `scheduled_for` column is data-write-only with no engine consumer.
  for (const client of clients) {
    if (client.status !== "scheduled") continue;
    const c = client as Record<string, unknown>;
    const scheduledFor = (c.scheduled_for as string | null) ?? null;
    if (!scheduledFor) continue;
    if (recentlyContactedIds.has(client.id)) continue;
    const d = daysUntil(new Date(scheduledFor + "T12:00:00"));
    if (d >= -3 && d <= 30) {
      inserts.push({
        user_id: userId, client_id: client.id, opportunity_type: "scheduled_date_approaching",
        trigger_date: scheduledFor,
        context: {
          scheduled_for: scheduledFor,
          scheduled_phrase: (c.scheduled_phrase as string | null) ?? null,
          days_until: d,
        },
      });
    }
  }

  // Contact anniversary
  for (const client of clients) {
    if (!client.first_contacted_at) continue;
    if (recentlyContactedIds.has(client.id)) continue;
    const startDate = client.first_contacted_at.slice(0, 10);
    const yearsSince = new Date().getFullYear() - new Date(startDate + "T12:00:00").getFullYear();
    if (yearsSince < 1) continue;
    for (const yr of [1, 2, 3, 5, 10]) {
      if (yr > yearsSince + 1) break;
      const annivDate = addYears(startDate, yr);
      const d = daysUntil(annivDate);
      if (d >= 0 && d <= WINDOW_DAYS) {
        inserts.push({
          user_id: userId, client_id: client.id, opportunity_type: "contact_anniversary",
          trigger_date: toISODate(annivDate), context: { anniversary_year: yr, first_contacted_at: startDate },
        });
      }
    }
  }

  // Multi-deal milestone
  // The repeat-rate metric below also reads from clientDealDates, so the
  // collapsed-deal filter here is load-bearing for feedback_repeat_clients_metric.md.
  const clientDealDates = new Map<string, string[]>();
  for (const rec of records) {
    if (!rec.client_id || !rec.close_date) continue;
    if ((rec as Record<string, unknown>).condition_status === "collapsed") continue;
    const arr = clientDealDates.get(rec.client_id) ?? [];
    arr.push(rec.close_date);
    clientDealDates.set(rec.client_id, arr);
  }
  for (const [clientId, dates] of clientDealDates.entries()) {
    if (recentlyContactedIds.has(clientId)) continue;
    const sorted = [...dates].sort();
    for (const milestone of [2, 3, 5]) {
      if (sorted.length >= milestone) {
        const latestClose = sorted[sorted.length - 1];
        const trigDate = addDays(latestClose, 7);
        const d = daysUntil(trigDate);
        if (d >= -30 && d <= WINDOW_DAYS) {
          inserts.push({
            user_id: userId, client_id: clientId, opportunity_type: "multi_deal_milestone",
            trigger_date: toISODate(trigDate), context: { deal_count: milestone },
          });
        }
      }
    }
  }

  // Memory-powered triggers
  for (const [clientId, mem] of memoryMap.entries()) {
    if (recentlyContactedIds.has(clientId)) continue;
    const facts = mem.structured_facts;
    if (!facts) continue;
    const client = _clientMap.get(clientId);
    if (!client) continue;

    const lastDeal = clientLastDeal.get(clientId);
    const idleMonths = lastDeal ? Math.floor((Date.now() - new Date(lastDeal + "T12:00:00").getTime()) / (1000 * 60 * 60 * 24 * 30)) : 999;

    if (facts.pain_point && idleMonths >= 6) {
      inserts.push({
        user_id: userId, client_id: clientId, opportunity_type: "pain_point_inactive",
        trigger_date: triggerMonthKey, context: enrichContext({ pain_point: facts.pain_point }, "pain_point_inactive", facts, `Known concern + ${idleMonths}mo inactive`),
      });
    }
    if (facts.areas_of_interest && facts.goal?.toLowerCase().includes("buy") && (client.status === "boarding" || client.status === "scheduled")) {
      inserts.push({
        user_id: userId, client_id: clientId, opportunity_type: "buyer_inventory_match",
        trigger_date: triggerMonthKey, context: enrichContext({ areas_of_interest: facts.areas_of_interest, budget: facts.budget_context }, "buyer_inventory_match", facts, "Active buyer with target areas"),
      });
    }
    if (facts.objection && (facts.goal?.toLowerCase().includes("sell") || facts.motivation?.toLowerCase().includes("sell"))) {
      inserts.push({
        user_id: userId, client_id: clientId, opportunity_type: "seller_timing_hesitation",
        trigger_date: triggerMonthKey, context: enrichContext({ objection: facts.objection, motivation: facts.motivation }, "seller_timing_hesitation", facts, "Seller with timing concern"),
      });
    }
  }

  // ── Score + filter ──────────────────────────────────────────────────────────
  for (const insert of inserts) {
    const ins = insert as { client_id: string; opportunity_type: string; context: Record<string, unknown> };
    const mem = memoryMap.get(ins.client_id);
    const facts = mem?.structured_facts ?? null;
    if (facts && !ins.context.memory_summary) {
      ins.context = enrichContext(ins.context, ins.opportunity_type, facts, ins.context.selected_reason as string ?? "");
    }
    const clientData = _clientMap.get(ins.client_id);
    const clientTags = (clientData?.tags as string[] | null) ?? [];
    const clientNotes = (clientData?.notes as string | null) ?? null;
    const score = scoreCandidate(ins.opportunity_type, facts, ins.context, clientTags, clientNotes);
    ins.context = { ...ins.context, outreach_score: score };
  }

  // Sort by score, filter by threshold, cap per client
  inserts.sort((a, b) => {
    const sa = ((a as { context: { outreach_score?: number } }).context.outreach_score ?? 0);
    const sb = ((b as { context: { outreach_score?: number } }).context.outreach_score ?? 0);
    return sb - sa;
  });

  // Higher threshold for top opportunities — only genuinely valuable ones
  const TOP_OPPORTUNITY_THRESHOLD = 55;
  const clientCounts = new Map<string, number>();
  const topCandidates: object[] = [];

  for (const ins of inserts) {
    const typed = ins as { client_id: string; opportunity_type: string; trigger_date: string; client_record_id?: string; context: Record<string, unknown> };
    const score = typed.context.outreach_score as number ?? 0;
    if (score < TOP_OPPORTUNITY_THRESHOLD) continue;

    const clientId = typed.client_id;
    const count = clientCounts.get(clientId) ?? 0;
    if (count >= 1) continue; // strict: 1 opportunity per client for top list

    clientCounts.set(clientId, count + 1);
    topCandidates.push(ins);
    if (topCandidates.length >= MAX_TOP_OPPORTUNITIES) break;
  }

  // ── Compute portfolio-level stats for financial impact reasoning ──────────
  const allGcis = records
    .filter((r) => r.gci && Number(r.gci) > 0)
    .map((r) => Number(r.gci));
  const avgGci = allGcis.length > 0
    ? Math.round(allGcis.reduce((sum, g) => sum + g, 0) / allGcis.length)
    : 0;
  const totalDeals = records.length;

  // Clients with multiple deals (repeat rate proxy)
  // Denominator: only clients with closed transactions (clientDealDates), not all records
  const repeatClients = [...clientDealDates.entries()].filter(([, dates]) => dates.length >= 2).length;
  const repeatRate = clientDealDates.size > 0
    ? Math.round((repeatClients / clientDealDates.size) * 100)
    : 0;

  // Pipeline depth — include scheduled (4-stage canonical: boarding/scheduled/in_flight)
  const activeClients = clients.filter((c) =>
    c.status === "boarding" || c.status === "scheduled" || c.status === "in_flight",
  ).length;
  const pipelineLight = activeClients < 3;

  // ── Compute agent state ────────────────────────────────────────────────────
  const currentYear = new Date().getFullYear();
  const dealsThisYear = records.filter((r) =>
    r.close_date && r.close_date.startsWith(String(currentYear)),
  ).length;
  const closeDates = records
    .filter((r) => r.close_date)
    .map((r) => new Date(r.close_date + "T12:00:00").getFullYear());
  const earliestYear = closeDates.length > 0 ? Math.min(...closeDates) : currentYear;
  const yearsActive = Math.max(1, currentYear - earliestYear + 1);

  const agentState = computeAgentState(activeClients, dealsThisYear, totalDeals, yearsActive);

  // ── Build structured response ───────────────────────────────────────────────
  const results = topCandidates.map((ins) => {
    const typed = ins as {
      client_id: string; opportunity_type: string; trigger_date: string;
      client_record_id?: string; context: Record<string, unknown>;
    };
    const client = _clientMap.get(typed.client_id);
    const mem = memoryMap.get(typed.client_id);
    const facts = mem?.structured_facts ?? null;
    const clientTags = (client?.tags as string[] | null) ?? [];
    const clientNotes = (client?.notes as string | null) ?? null;
    const contextLevel = classifyClientContext(clientTags, clientNotes, typed.context);

    return {
      client_id:        typed.client_id,
      client_name:      client?.name ?? "Unknown",
      client_city:      client?.city ?? null,
      opportunity_type: typed.opportunity_type as TopOpportunity["opportunity_type"],
      trigger_date:     typed.trigger_date,
      score:            (typed.context.outreach_score as number) ?? 0,
      label:            buildTopLabel(typed.opportunity_type, typed.context, client?.city ?? null),
      why_this_matters: buildWhyThisMatters(typed.opportunity_type, typed.context, facts),
      why_now:          buildWhyNow(typed.opportunity_type, typed.context, typed.trigger_date),
      suggested_angle:  suggestAngle(typed.opportunity_type, facts, typed.context),
      context_level:    contextLevel,
      client_record_id: typed.client_record_id ?? null,
      context:          typed.context,
      financial_impact: buildFinancialImpact(
        typed.opportunity_type,
        typed.context,
        facts,
        client?.status ?? null,
        (clientDealDates.get(typed.client_id) ?? []).length,
        { avgGci, totalDeals, repeatRate, activeClients },
        agentState,
      ),
      is_primary:     false,
      primary_reason: null as string | null,
      risk_if_ignored: null as string | null,
      agent_state:    agentState,
    };
  });

  // ── Select the single primary opportunity ──────────────────────────────────
  if (results.length > 0) {
    // Score tiebreaker: timing strength → client value → score
    let primaryIdx = 0;
    let bestPriority = -Infinity;

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      let priority = r.score; // base: outreach score (0-100)

      // Boost strong timing signals — these have a window that closes
      if (STRONG_TIMING_TYPES.has(r.opportunity_type)) priority += 15;

      // Boost time-sensitive items (trigger date is today or very soon)
      const trigTarget = new Date(r.trigger_date + "T12:00:00");
      const today = new Date(); today.setHours(12, 0, 0, 0);
      const daysAway = Math.round((trigTarget.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysAway >= -3 && daysAway <= 0) priority += 12; // overdue ≤3 days: most urgent
      else if (daysAway < -3) priority += 3;              // overdue >3 days: decayed, fresh items should win
      else if (daysAway <= 3) priority += 8;              // within 3 days
      else if (daysAway <= 7) priority += 4;              // within a week

      // Boost high-value client relationships
      const gci = r.context.gci ? Number(r.context.gci) : 0;
      if (gci > 15000) priority += 10;
      else if (gci > 5000) priority += 5;

      // Boost repeat clients
      const dealCount = (clientDealDates.get(r.client_id) ?? []).length;
      if (dealCount >= 2) priority += 8;

      // Pipeline-urgency boost: when pipeline is dry/light, direct-pipeline types matter more
      if (pipelineLight && (
        r.opportunity_type === "buyer_inventory_match" ||
        r.opportunity_type === "seller_timing_hesitation" ||
        r.opportunity_type === "timeframe_approaching"
      )) {
        priority += 10;
      }

      if (priority > bestPriority) {
        bestPriority = priority;
        primaryIdx = i;
      }
    }

    const primary = results[primaryIdx];
    primary.is_primary = true;
    primary.primary_reason = buildPrimaryReason(
      primary.opportunity_type,
      primary.context,
      primary.trigger_date,
      primary.score,
      _clientMap.get(primary.client_id)?.status ?? null,
      (clientDealDates.get(primary.client_id) ?? []).length,
      { activeClients, pipelineLight },
      agentState,
    );
    primary.risk_if_ignored = buildRiskIfIgnored(
      primary.opportunity_type,
      primary.context,
      primary.trigger_date,
      (clientDealDates.get(primary.client_id) ?? []).length,
      { activeClients, pipelineLight },
      agentState,
    );

    // Move primary to index 0 so UI always shows it first
    if (primaryIdx !== 0) {
      results.splice(primaryIdx, 1);
      results.unshift(primary);
    }
  }

  return results;
}

/** Build the primary_reason: why THIS is the best use of time right now. */
function buildPrimaryReason(
  opportunityType: string,
  ctx: Record<string, unknown>,
  triggerDate: string,
  score: number,
  clientStatus: string | null,
  clientDealCount: number,
  pipeline: { activeClients: number; pipelineLight: boolean },
  state: AgentState,
): string {
  const gci = ctx.gci ? Number(ctx.gci) : 0;
  const gciLabel = gci > 0 ? `$${(gci / 1000).toFixed(0)}k` : null;
  const isRepeat = clientDealCount >= 2;
  const pipelineDry = pipeline.activeClients === 0;

  // ── Pipeline-driven urgency ───────────────────────────────────────────────
  if (pipelineDry) {
    if (state.pace_status === "behind" && (opportunityType === "buyer_inventory_match" || opportunityType === "seller_timing_hesitation" || opportunityType === "timeframe_approaching")) {
      return "No active deals and you're behind pace. This is the closest thing to a live deal in front of you — this is where your day starts.";
    }
    if (opportunityType === "buyer_inventory_match" || opportunityType === "seller_timing_hesitation" || opportunityType === "timeframe_approaching") {
      return "You have no active deals. This is the closest thing to a live opportunity in your pipeline — act on it first.";
    }
    if (isRepeat && gciLabel && state.pace_status === "behind") {
      return `No active deals, behind pace, and a ${gciLabel} repeat client who already trusts you. This is the clearest path back to momentum.`;
    }
    if (isRepeat && gciLabel) {
      return `No active deals and a ${gciLabel} repeat client waiting to hear from you. This is your highest-probability path to income right now.`;
    }
    if (gciLabel) {
      return `With an empty pipeline and ${gciLabel} in past GCI, reconnecting with this client is the most valuable action you can take today.`;
    }
    return "Your pipeline is empty. This is the strongest signal in your book right now — start here.";
  }

  // ── Time-critical window ──────────────────────────────────────────────────
  const trigTarget = new Date(triggerDate + "T12:00:00");
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const daysAway = isNaN(trigTarget.getTime()) ? 999 : Math.round((trigTarget.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (daysAway <= 0) {
    if (opportunityType === "birthday") return "Their birthday is today. This takes thirty seconds and the window doesn't come back for a year.";
    if (opportunityType === "timeframe_approaching") return "Their stated timeline has arrived. If you're not reaching out, someone else will — this is the most time-sensitive item on your list.";
    return "This is overdue. The longer you wait, the less impact it has — handle this one first.";
  }

  if (daysAway <= 3) {
    if (opportunityType === "birthday") return "Their birthday is in the next couple of days. A brief note now lands perfectly — miss it and the moment passes.";
    return "This has the tightest timing window of anything on your list. Acting now gives you the best shot at impact.";
  }

  // ── Relationship value ────────────────────────────────────────────────────
  if (isRepeat && gciLabel) {
    return `A ${clientDealCount}x repeat client with ${gciLabel} in past GCI — this is one of the most valuable relationships you have. It earns the first call.`;
  }

  if (isRepeat) {
    return "This is a repeat client who has already demonstrated loyalty. Protecting that relationship should take priority over everything else on this list.";
  }

  if (gci > 20000 && gciLabel) {
    return `At ${gciLabel} GCI, this is one of your highest-value client relationships. High-value touchpoints deserve to be first, not an afterthought.`;
  }

  // ── Direct pipeline types ─────────────────────────────────────────────────
  if (opportunityType === "buyer_inventory_match") {
    if (pipeline.pipelineLight) return "Active buyers with known preferences are the most direct path to a closing. With your pipeline light, this is where your attention should go first.";
    return "This is an active buyer with clear preferences — the most direct opportunity to move a deal forward. Start here.";
  }

  if (opportunityType === "seller_timing_hesitation") {
    return "A seller with a known objection is a solvable problem. Converting this into a listing would be the highest-impact outcome from today's opportunities.";
  }

  if (opportunityType === "timeframe_approaching") {
    return "This client gave you a deadline and it's approaching. Following through now is the single most important trust signal you can send.";
  }

  // ── Condition firming ────────────────────────────────────────────────────
  if (opportunityType === "condition_firming") {
    if (gciLabel) {
      return `A ${gciLabel} deal with an approaching condition date — this is the most time-sensitive action on your list. Confirm the condition status and advance the pipeline stage.`;
    }
    return "This deal has a condition date coming up. Confirming the status and advancing the pipeline stage is the most impactful thing you can do right now.";
  }

  // ── Post-close / referral window ──────────────────────────────────────────
  if (opportunityType === "referral_ask" || opportunityType === "post_close_90") {
    return "You're in the peak referral window with this client. This has the highest multiplier potential — one action here could generate your next client.";
  }

  if (opportunityType === "post_close_3" || opportunityType === "post_close_14") {
    return "Post-close follow-through shapes the entire future of this relationship. This is the foundation — handle it before anything else.";
  }

  // ── Strong score ──────────────────────────────────────────────────────────
  if (score >= 80) {
    return "This scored highest across timing, relationship value, and context strength. It's the best use of your next five minutes.";
  }

  // ── General primary ───────────────────────────────────────────────────────
  if (pipeline.pipelineLight && state.pace_status === "behind") {
    return "Your pipeline is light and you're behind pace. This is the highest-probability action to get things moving — start here.";
  }
  if (pipeline.pipelineLight) {
    return "With your pipeline needing attention, this is the strongest opportunity to generate a meaningful conversation. Start here.";
  }
  if (state.pace_status === "ahead") {
    return "You're ahead of pace with a healthy pipeline. This is about building on strength — the best time to deepen relationships is when you're not under pressure.";
  }
  return "This has the strongest combination of timing, relationship value, and opportunity quality on your list today. Start here.";
}

/** Build a calm, single-sentence consequence of inaction for the primary opportunity. */
function buildRiskIfIgnored(
  opportunityType: string,
  ctx: Record<string, unknown>,
  triggerDate: string,
  clientDealCount: number,
  pipeline: { activeClients: number; pipelineLight: boolean },
  state: AgentState,
): string {
  const gci = ctx.gci ? Number(ctx.gci) : 0;
  const gciLabel = gci > 0 ? `$${(gci / 1000).toFixed(0)}k` : null;
  const pipelineDry = pipeline.activeClients === 0;
  const isRepeat = clientDealCount >= 2;

  // Timing awareness
  const trigTarget = new Date(triggerDate + "T12:00:00");
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const daysAway = isNaN(trigTarget.getTime()) ? 999 : Math.round((trigTarget.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const isOverdue = daysAway <= 0;
  const isImminent = daysAway > 0 && daysAway <= 3;

  // ── Post-close nurture ────────────────────────────────────────────────────
  if (opportunityType === "post_close_3" || opportunityType === "post_close_14") {
    return "Silence after closing is what turns a satisfied client into someone who forgets your name within a year.";
  }

  if (opportunityType === "post_close_90") {
    return "Without a 90-day touchpoint, this client quietly moves from your network to your competitor's the next time someone asks for a recommendation.";
  }

  // ── Referral window ───────────────────────────────────────────────────────
  if (opportunityType === "referral_ask") {
    return "Referral windows close quietly — the longer you wait, the less natural the ask becomes and the less likely it produces a result.";
  }

  // ── Review request ────────────────────────────────────────────────────────
  if (opportunityType === "review_request") {
    return "The window for an authentic review shrinks quickly after closing — every week that passes makes it feel less natural for both of you.";
  }

  // ── Birthday ──────────────────────────────────────────────────────────────
  if (opportunityType === "birthday") {
    if (isOverdue) return "The birthday has already passed — reaching out late is still better than not at all, but the impact diminishes each day.";
    if (isImminent) return "Miss this birthday and you won't get another chance for a year — a small window with outsized relationship value.";
    return "Birthdays are once a year — missing this one means twelve months before the same natural touchpoint comes around again.";
  }

  // ── Closing anniversary ───────────────────────────────────────────────────
  if (opportunityType === "closing_anniversary") {
    if (isRepeat && gciLabel) {
      return `Letting a ${gciLabel} repeat client's anniversary pass unnoticed risks signaling that the relationship matters less to you than it does to them.`;
    }
    if (gciLabel) {
      return `A ${gciLabel} client who doesn't hear from you on their anniversary is a ${gciLabel} client who may not think of you next time.`;
    }
    return "Anniversaries that go unacknowledged quietly erode the connection — and with it, the likelihood of a referral or repeat deal.";
  }

  // ── Idle client / past client check-in ────────────────────────────────────
  if (opportunityType === "idle_client" || opportunityType === "past_client_check_in") {
    if (pipelineDry && state.pace_status === "behind") {
      return "With no deals and your pace falling behind, every week you delay re-engagement makes the gap harder to close.";
    }
    if (pipelineDry) {
      return "Without active deals, every week you delay re-engagement pushes your next potential closing further out.";
    }
    if (gciLabel) {
      return `Each month this ${gciLabel} relationship stays dormant, the probability of reactivation drops — and with it, your access to their network.`;
    }
    return "The longer a past client goes without hearing from you, the more likely they are to use a different agent next time.";
  }

  // ── Mortgage renewal ──────────────────────────────────────────────────────
  if (opportunityType === "mortgage_renewal_due") {
    return "If you don't reach out before renewal time, the bank will — and they won't be recommending you.";
  }
  if (opportunityType === "mortgage_renewal_window" || opportunityType === "mortgage_renewal_finance") {
    return "Clients in their renewal window are quietly weighing options — if you're not part of that conversation, you'll hear about their decision after it's made.";
  }

  // ── Active buyer/seller ───────────────────────────────────────────────────
  if (opportunityType === "buyer_inventory_match") {
    if (state.urgency_level === "critical") {
      return "You have no deals and you're behind — losing an active buyer's attention now means losing what may be your best near-term path to income.";
    }
    if (pipeline.pipelineLight) {
      return "Active buyers who don't hear from their agent start browsing on their own — and eventually working with someone who's paying closer attention.";
    }
    return "Buyers who feel unsupported between showings are the most likely to start taking calls from other agents.";
  }

  if (opportunityType === "seller_timing_hesitation") {
    if (state.urgency_level === "critical" || state.urgency_level === "high") {
      return "You need listings and this seller is reachable now. If you don't address their hesitation, they'll either stall indefinitely or list with whoever reaches out next.";
    }
    return "Hesitant sellers who don't hear from you will either stay stuck or list with whoever reaches out next — neither outcome helps your business.";
  }

  // ── Timeframe approaching ─────────────────────────────────────────────────
  if (opportunityType === "timeframe_approaching") {
    if (isImminent || isOverdue) {
      return "Their stated deadline is here — if you're not in the conversation now, you've likely lost the deal.";
    }
    return "Clients with approaching timelines who don't hear from you assume you forgot — and start looking for someone who didn't.";
  }

  // ── Scheduled date approaching ────────────────────────────────────────────
  if (opportunityType === "scheduled_date_approaching") {
    if (isImminent || isOverdue) {
      return "The future date they parked at is here. Either they're ready to move and looking for an agent, or life has shifted — the only way to know is to ask now.";
    }
    return "They told you to circle back at a specific time. Following through on that earns trust; missing it sends them shopping for a more attentive agent.";
  }

  // ── Pain point / educational ──────────────────────────────────────────────
  if (opportunityType === "pain_point_inactive") {
    return "Clients with unresolved concerns who never hear back conclude you didn't care enough to follow up — a hard impression to reverse.";
  }

  if (opportunityType === "educational_value_inactive") {
    return "When you don't follow up on a client's expressed interest, the next agent who does gets the relationship.";
  }

  // ── Multi-deal milestone ──────────────────────────────────────────────────
  if (opportunityType === "multi_deal_milestone") {
    return "Repeat clients who feel taken for granted stop repeating — and their referral network goes with them.";
  }

  // ── Property milestone ────────────────────────────────────────────────────
  if (opportunityType === "property_value_milestone") {
    return "Homeowners who never hear about their equity from you will eventually hear about it from someone else.";
  }

  // ── Welcome ───────────────────────────────────────────────────────────────
  if (opportunityType === "new_client_welcome") {
    return "New clients who don't hear from you in the first week are more likely to disengage before the relationship even starts.";
  }

  // ── Contact anniversary ───────────────────────────────────────────────────
  if (opportunityType === "contact_anniversary") {
    return "Relationship milestones that pass unnoticed gradually reduce the warmth that makes future outreach effective.";
  }

  // ── Condition firming ────────────────────────────────────────────────────
  if (opportunityType === "condition_firming") {
    if (gciLabel) {
      return `A ${gciLabel} deal left unmanaged through its condition date could collapse — and once a condition expires without action, recovering the deal is significantly harder.`;
    }
    return "Missing a condition date can collapse a deal that was otherwise on track. This is the most avoidable loss in your pipeline.";
  }

  // ── Seasonal ──────────────────────────────────────────────────────────────
  if (opportunityType.startsWith("seasonal_")) {
    if (pipelineDry) {
      return "Without any active deals, going quiet during a key market season makes it harder to generate conversations when you need them most.";
    }
    return "Agents who stay silent during seasonal moments lose visibility — and visibility is what keeps your phone ringing between deals.";
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  if (state.urgency_level === "critical") {
    return "With no active deals and your pace behind, each missed touchpoint widens the gap you need to close.";
  }
  if (pipelineDry) {
    return "With no active deals, each missed touchpoint extends the gap before your next closing.";
  }
  return "Opportunities left unacted on quietly erode the relationships that generate your future business.";
}

// ── Vercel function timeout — allows up to 60s for sequential Groq calls ──────
export const maxDuration = 60;

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const proCheck = await requirePro(supabase, user.id);
  if (!proCheck.allowed) return proCheck.response!;

  const userId = user.id;

  // draft_only=true: skip detection, only draft already-queued "draft" items.
  // Separate rate limit so users can unblock stuck items without burning their scan quota.
  const url = new URL(req.url);
  const draftOnly = url.searchParams.get("draft_only") === "true";

  // Rate limit: 10 full scans/hour, 30 draft-only calls/hour per user
  const rlKey = draftOnly ? "draft_queue_items" : "detect_opportunities";
  const rlMax = draftOnly ? 30 : 10;
  const rl = await checkRateLimit(userId, rlKey, rlMax, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Try again in a few minutes." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  try {
    let detected = 0;
    let drafted  = 0;

    if (draftOnly) {
      // Skip detection — only draft pending items for this user
      const aiKey = process.env.ANTHROPIC_API_KEY || process.env.GROQ_API_KEY;
      if (aiKey) {
        const [settingsRes, undraftedRes] = await Promise.all([
          supabase.from("user_settings").select("display_name, email_signature, ai_voice_guide").eq("user_id", userId).single(),
          supabase.from("outreach_queue").select("*, clients(name, city, province_region, communication_tone, tags, notes)")
            .eq("user_id", userId).eq("status", "draft").is("ai_subject", null)
            .order("created_at", { ascending: true }).limit(MAX_DRAFTS_PER_RUN),
        ]);
        if (undraftedRes.data?.length) {
          const agentFirst     = extractFirstName(settingsRes.data?.display_name ?? null, "");
          const emailSignature = (settingsRes.data?.email_signature as string) ?? "";
          const agentStyleGuide = (settingsRes.data?.ai_voice_guide as string | null) ?? null;
          const results = await Promise.allSettled(
            undraftedRes.data.map((item) =>
              draftItem(
                item as Parameters<typeof draftItem>[0],
                agentFirst, emailSignature, agentStyleGuide, userId, supabase,
              ),
            ),
          );
          drafted = results.filter((r) => r.status === "fulfilled" && r.value === true).length;
        }
      }
    } else {
      ({ detected, drafted } = await detectAndDraftForUser(userId, supabase));
    }

    // Return full pending queue so the UI can refresh in one round-trip
    const { data: queue } = await supabase
      .from("outreach_queue")
      .select("*, clients(name, city, province_region, email)")
      .eq("user_id", userId)
      .in("status", ["draft", "ready"])
      .order("trigger_date", { ascending: true });

    return NextResponse.json(
      { detected, drafted, queue: queue ?? [] },
      { headers: rateLimitHeaders(rl) },
    );
  } catch (err) {
    console.error("[flight-control] detect-opportunities error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Also expose GET so the UI can load the queue without triggering a scan
export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: queue } = await supabase
    .from("outreach_queue")
    .select("*, clients(name, city, province_region, email)")
    .eq("user_id", user.id)
    .in("status", ["draft", "ready"])
    .order("trigger_date", { ascending: true });

  return NextResponse.json({ queue: queue ?? [] });
}
