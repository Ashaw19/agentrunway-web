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

import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { createClient }       from "@/lib/supabase/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import type { OutreachQueueItem } from "@agent-runway/core/types/database";
import type { SupabaseClient }    from "@supabase/supabase-js";
import type { ClientMemoryFacts, ClientMemoryProfile } from "@/lib/ai/client-memory-engine";
import {
  type Tone,
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
const MAX_DRAFTS_PER_RUN = 3;    // max Groq calls per invocation (keeps total < 20s)
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

/** Lightweight relevance score (0–100) for ranking outreach candidates. */
function scoreCandidate(
  opportunityType: string,
  memory: ClientMemoryFacts | null,
  ctx: Record<string, unknown>,
): number {
  let score = 50; // base score — all existing triggers start at 50

  // Boost: memory available at all
  if (memory) score += 5;

  // Boost: memory has a specific angle for this client
  if (memory?.next_best_angle) score += 10;
  if (memory?.pain_point) score += 5;
  if (memory?.motivation) score += 5;

  // Boost: high engagement = more likely to reply
  const eng = memory?.engagement_level?.toLowerCase() ?? "";
  if (eng.includes("highly active") || eng.includes("responsive")) score += 10;
  else if (eng.includes("going cold") || eng.includes("ghost")) score -= 5;

  // Type-specific bonuses
  if (opportunityType === "pain_point_inactive" && memory?.pain_point) score += 15;
  if (opportunityType === "buyer_inventory_match" && memory?.areas_of_interest) score += 10;
  if (opportunityType === "seller_timing_hesitation" && memory?.objection) score += 10;
  if (opportunityType === "educational_value_inactive" && memory?.last_key_topic) score += 10;

  // Recency: post-close triggers are time-sensitive
  if (opportunityType.startsWith("post_close_")) score += 15;
  if (opportunityType === "birthday") score += 10;

  // GCI history = higher-value client
  if (ctx.gci && Number(ctx.gci) > 10000) score += 5;

  return Math.min(100, Math.max(0, score));
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
function enrichContext(
  baseCtx: Record<string, unknown>,
  opportunityType: string,
  memory: ClientMemoryFacts | null,
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
];

async function draftItem(
  item:           OutreachQueueItem & { clients: { name: string; city: string | null; province_region: string | null; communication_tone?: string; tags?: string[]; notes?: string | null } | null },
  agentFirst:     string,
  emailSignature: string,
  agentStyleGuide: string | null,
  groq:           OpenAI,
  supabase:       SupabaseClient,
): Promise<void> {
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
      return;
  }

  try {
    // Build full prompt with client context, memory enrichment, and agent voice guide
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
      clientContextBlock,
      memoryContextBlock,
      agentStyleGuide
        ? `AGENT VOICE GUIDE (follow closely — message must sound like the agent personally wrote it):\n${agentStyleGuide}`
        : null,
    ].filter(Boolean).join("\n\n");
    const fullPrompt = contextSuffix ? `${prompt}\n\n${contextSuffix}` : prompt;

    const completion = await groq.chat.completions.create({
      model:       "llama-3.3-70b-versatile",
      max_tokens:  400,
      temperature: 0.85,
      messages:    [{ role: "user", content: fullPrompt }],
    });

    let raw = completion.choices[0]?.message?.content?.trim() ?? "";
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

      const retryCompletion = await groq.chat.completions.create({
        model:       "llama-3.3-70b-versatile",
        max_tokens:  400,
        temperature: 0.85,
        messages:    [{ role: "user", content: `${fullPrompt}\n\n${retryNote}` }],
      });
      const retryRaw = retryCompletion.choices[0]?.message?.content?.trim();
      if (retryRaw) raw = retryRaw;
    }

    // Parse: last line starting with "SUBJECT:" is the subject
    const lines   = raw.split("\n");
    const subjIdx = [...lines].reverse().findIndex((l) => l.trimStart().toUpperCase().startsWith("SUBJECT:"));
    if (subjIdx === -1) throw new Error("No SUBJECT line");

    const realSubjIdx = lines.length - 1 - subjIdx;
    const ai_subject  = lines[realSubjIdx].replace(/^SUBJECT:\s*/i, "").trim();
    let   ai_body     = lines.slice(0, realSubjIdx).join("\n").trim();

    // Append custom email signature if the agent has one configured
    if (emailSignature) {
      ai_body += `\n\n${emailSignature}`;
    }

    await supabase
      .from("outreach_queue")
      .update({ ai_subject, ai_body, status: "ready" })
      .eq("id", item.id);
  } catch (err) {
    console.error("[flight-control] Draft error for item", item.id, err);
    // Leave status as 'draft' — will retry on next scan
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
      .select("id, name, city, province_region, birthdate, communication_tone, first_contacted_at, last_contact_at, tags, notes, status")
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
    { type: "post_close_3"   as const, days:  3, lookback: 30 },
    { type: "post_close_14"  as const, days: 14, lookback: 30 },
    { type: "post_close_90"  as const, days: 90, lookback: 30 },
    { type: "review_request" as const, days: 21, lookback: 30 },
    { type: "referral_ask"   as const, days: 45, lookback: 30 },
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
      (client.status === "boarding" || client.status === "taxiing")
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
      (facts.goal?.toLowerCase().includes("sell") || facts.motivation?.toLowerCase().includes("sell"))
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

    // Attach score for ranking
    const score = scoreCandidate(ins.opportunity_type, facts, ins.context);
    ins.context = { ...ins.context, outreach_score: score };
  }

  // Sort by score descending — highest-value opportunities first
  inserts.sort((a, b) => {
    const sa = ((a as { context: { outreach_score?: number } }).context.outreach_score ?? 50);
    const sb = ((b as { context: { outreach_score?: number } }).context.outreach_score ?? 50);
    return sb - sa;
  });

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

    // Batch delete: remove skipped rows that match any candidate we're about to insert.
    // Supabase doesn't support compound IN clauses, so we use OR filters per unique key.
    // To avoid excessive query size, process in chunks.
    const CHUNK_SIZE = 100;
    for (let i = 0; i < skippedKeys.length; i += CHUNK_SIZE) {
      const chunk = skippedKeys.slice(i, i + CHUNK_SIZE);
      for (const key of chunk) {
        await supabase
          .from("outreach_queue")
          .delete()
          .eq("user_id", userId)
          .eq("client_id", key.client_id)
          .eq("opportunity_type", key.opportunity_type)
          .eq("trigger_date", key.trigger_date)
          .eq("status", "skipped");
      }
    }
  }

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
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
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

  const groq = new OpenAI({
    apiKey:  groqKey,
    baseURL: "https://api.groq.com/openai/v1",
  });

  let drafted = 0;
  for (const item of undrafted) {
    await draftItem(
      item as OutreachQueueItem & { clients: { name: string; city: string | null; province_region: string | null; communication_tone?: string; tags?: string[]; notes?: string | null } | null },
      agentFirst,
      emailSignature,
      agentStyleGuide,
      groq,
      supabase,
    );
    drafted++;
  }

  return { detected, drafted };
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

  const { data: sandboxCheck } = await supabase.from("user_settings").select("sandbox_mode").eq("user_id", user.id).single();
  if (sandboxCheck?.sandbox_mode === true) {
    return NextResponse.json({ error: "Action blocked in Sandbox Mode" }, { status: 403 });
  }

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
      const groqKey = process.env.GROQ_API_KEY;
      if (groqKey) {
        const [settingsRes, undraftedRes] = await Promise.all([
          supabase.from("user_settings").select("display_name, email_signature, ai_voice_guide").eq("user_id", userId).single(),
          supabase.from("outreach_queue").select("*, clients(name, city, province_region, communication_tone, tags, notes)")
            .eq("user_id", userId).eq("status", "draft").is("ai_subject", null)
            .order("created_at", { ascending: true }).limit(MAX_DRAFTS_PER_RUN),
        ]);
        if (undraftedRes.data?.length) {
          const groq = new OpenAI({ apiKey: groqKey, baseURL: "https://api.groq.com/openai/v1" });
          const agentFirst     = extractFirstName(settingsRes.data?.display_name ?? null, "");
          const emailSignature = (settingsRes.data?.email_signature as string) ?? "";
          const agentStyleGuide = (settingsRes.data?.ai_voice_guide as string | null) ?? null;
          for (const item of undraftedRes.data) {
            await draftItem(
              item as Parameters<typeof draftItem>[0],
              agentFirst, emailSignature, agentStyleGuide, groq, supabase,
            );
            drafted++;
          }
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
