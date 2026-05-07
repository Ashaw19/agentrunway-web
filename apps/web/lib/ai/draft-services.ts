/**
 * lib/ai/draft-services.ts
 *
 * Shared drafting service helpers used by BOTH the API routes
 * (/api/ai/draft-outreach, /api/ai/listing-description, /api/ai/draft-newsletter,
 * /api/ai/draft-social-post) AND the Flight Crew tools that wrap them
 * (draftOutreachForClient, draftListingDescription, draftNewsletter,
 * draftSocialPost).
 *
 * Why a shared module: the build plan says "the tool calls the existing
 * route via fetch", but Flight Crew tools elsewhere in this codebase use the
 * supabase client directly (no internal fetch pattern exists). Server-side
 * fetch from a route to itself with cookie-based auth forwarding is fragile
 * and untested in this repo. Extracting the core logic here gives us a
 * single source of truth: route handlers wrap auth + rate-limit + HTTP
 * response shaping, tools wrap a confirmation string for chat. Both sides
 * call into the same draft logic — no prompt-engineering duplication.
 *
 * Drafts-only posture:
 * - draftOutreachForClient writes to outreach_queue with status="ready" or
 *   "draft" — never sent automatically. Agent reviews in Flight Control.
 * - draftListingDescription returns description + social_post inline with
 *   no DB write (no persistence table for these).
 * - draftNewsletter writes to newsletter_queue with status="ready" or
 *   "draft" — never sent automatically. Agent reviews in Flight Control.
 * - draftSocialPost returns inline with no DB write (no persistence table).
 */

import { generateText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { models, heliconeHeaders } from "@/lib/ai/provider";
import {
  type Tone,
  AGENT_RUNWAY_VOICE,
  buildAnniversaryPrompt,
  buildBirthdayPrompt,
  buildMortgageRenewalDuePrompt,
  buildMortgageRenewalWindowPrompt,
  buildPastClientCheckInPrompt,
  buildTimeframeApproachingPrompt,
  buildPropertyValueMilestonePrompt,
} from "@/lib/outreach-prompts";
import {
  buildBocRateChangeNewsletterPrompt,
  buildCustomNewsletterPrompt,
} from "@/lib/newsletter-prompts";
import type {
  OutreachOpportunityType,
  NewsletterTemplateType,
  WorkflowTemplate,
  WorkflowTriggerEvent,
} from "@agent-runway/core/types/database";

// ─── Outreach: shared types + draftable list ──────────────────────────────────

export const DRAFTABLE_OUTREACH_TYPES: OutreachOpportunityType[] = [
  "birthday",
  "closing_anniversary",
  "mortgage_renewal_due",
  "mortgage_renewal_window",
  "past_client_check_in",
  "timeframe_approaching",
  "property_value_milestone",
];

export type DraftOutreachStatus = "created" | "existing" | "queued";

export interface DraftOutreachResult {
  status: DraftOutreachStatus;
  queueItemId: string;
  /** Set when status === "created"; the AI-rendered subject line. */
  subject?: string;
  /** Set when status === "created"; the AI-rendered body (signature appended). */
  body?: string;
  /** Set when status !== "created" — gives the caller a human reason. */
  reason?: string;
  /** Set when status === "queued" because of an error path. */
  error?: string;
  /** Resolved client display name — useful for confirmation messages. */
  clientName?: string;
}

// ─── Outreach: pure date helpers (mirrored from the route) ────────────────────

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function addYears(isoDate: string, years: number): Date {
  const d = new Date(isoDate + "T12:00:00");
  d.setFullYear(d.getFullYear() + years);
  return d;
}

function daysUntil(target: Date): number {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
}

function nextBirthdayDate(birthdate: string): Date {
  const today = new Date();
  const [, mmdd] = birthdate.split(/-(.+)/);
  const candidate = new Date(`${today.getFullYear()}-${mmdd}T12:00:00`);
  if (isNaN(candidate.getTime())) return candidate;
  if (candidate < today) candidate.setFullYear(today.getFullYear() + 1);
  return candidate;
}

function extractFirstName(displayName: string | null): string {
  if (displayName) return displayName.split(/\s+/)[0] ?? displayName;
  return "your agent";
}

const ANNIVERSARY_YEARS = [1, 2, 3, 5, 10];
const PROPERTY_MILESTONE_YEARS = [1, 2, 3, 5, 7, 10, 15, 20, 25];

const TIMEFRAME_LABELS: Record<string, string> = {
  asap: "ASAP",
  "1_3_months": "1–3 Month",
  "3_6_months": "3–6 Month",
  "6_12_months": "6–12 Month",
};

const TIMEFRAME_DAYS: Record<string, number> = {
  asap: 14,
  "1_3_months": 90,
  "3_6_months": 180,
  "6_12_months": 365,
};

// ─── Outreach: context classification + instruction blocks (mirrored) ────────

type ContextLevel = "sensitive" | "sparse" | "rich";

function classifyClientContext(
  tags: string[],
  notes: string | null,
  ctx: Record<string, unknown>,
): ContextLevel {
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

  if (sensitiveKeywords.some((kw) => searchText.includes(kw))) return "sensitive";

  const memoryFields = [
    "memory_summary", "next_best_angle", "memory_pain_point", "memory_motivation",
    "budget_context", "areas_of_interest", "last_key_topic", "objection",
  ];
  const populatedCount = memoryFields.filter((f) => {
    const val = ctx[f];
    return val && val !== "null" && val !== "";
  }).length;

  const hasNotes = notes && notes.length > 10;
  const hasTags = tags && tags.length > 0;
  const dataPoints = populatedCount + (hasNotes ? 1 : 0) + (hasTags ? 1 : 0);

  if (dataPoints >= 3) return "rich";
  return "sparse";
}

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
  "thrilled to",
  "excited to announce",
  "excited to share",
  "proud to present",
  "don't miss out",
  "won't last long",
  "once-in-a-lifetime",
  "dream home",
  "in today's competitive market",
  "in today's real estate landscape",
  "whether you're a first-time buyer",
  "your real estate journey",
];

// ─── Outreach: main service ───────────────────────────────────────────────────

/**
 * Draft a single-client outreach message. Mirrors /api/ai/draft-outreach
 * exactly (same prompt assembly, same ban-list, same SUBJECT parsing,
 * same upsert behaviour). Routes call this; tools call this.
 */
export async function draftOutreachForClient(input: {
  supabase: SupabaseClient;
  userId: string;
  clientId: string;
  opportunityType: OutreachOpportunityType;
}): Promise<DraftOutreachResult> {
  const { supabase, userId, clientId, opportunityType: opType } = input;

  // ── Validate type ────────────────────────────────────────────────────────
  if (!DRAFTABLE_OUTREACH_TYPES.includes(opType)) {
    return {
      status: "queued",
      queueItemId: "",
      reason: "This opportunity type does not support on-demand drafting",
    };
  }

  // ── Load client (ownership enforced via user_id match) ──────────────────
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select(
      "id, name, first_name, last_name, city, province_region, birthdate, communication_tone, status, timeframe, property_interest, property_interest_type, notes, tags, last_contact_at",
    )
    .eq("id", clientId)
    .eq("user_id", userId)
    .is("archived_at", null)
    .single();

  if (clientError || !client) {
    return {
      status: "queued",
      queueItemId: "",
      reason: "Client not found or access denied",
    };
  }

  // Resolve a display name early — useful for confirmation copy on every path
  const trimmedName = client.name?.trim();
  const composedName = [client.first_name, client.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const clientDisplayName = trimmedName || composedName || "this client";

  // ── Fetch settings + most recent closed record in parallel ──────────────
  const [settingsRes, recordsRes] = await Promise.all([
    supabase
      .from("user_settings")
      .select("display_name, email_signature, ai_voice_guide")
      .eq("user_id", userId)
      .single(),
    supabase
      .from("client_records")
      .select("id, client_id, address, close_date, gci, side, property_use")
      .eq("client_id", clientId)
      .eq("user_id", userId)
      .not("close_date", "is", null)
      .order("close_date", { ascending: false }),
  ]);

  const agentFirst = extractFirstName(settingsRes.data?.display_name ?? null);
  const emailSignature = (settingsRes.data?.email_signature as string) ?? "";
  const agentStyleGuide = (settingsRes.data?.ai_voice_guide as string | null) ?? null;
  const records = recordsRes.data ?? [];
  const latestRecord = records[0] ?? null;

  const clientTags = (client.tags as string[] | null) ?? [];
  const clientNotes = (client.notes as string | null) ?? null;
  const clientContextBlock = (clientTags.length > 0 || clientNotes)
    ? [
        "IMPORTANT — client context (use to self-moderate tone and content):",
        clientTags.length > 0 ? `- Tags: ${clientTags.join(", ")}` : null,
        clientNotes ? `- Agent notes: "${clientNotes}"` : null,
        "If any context signals a sensitive circumstance, adjust the email accordingly and avoid assumptions.",
      ].filter(Boolean).join("\n")
    : null;

  // ── Compute trigger_date and context per type ────────────────────────────
  let triggerDate: string;
  let context: Record<string, string | number | null>;

  switch (opType) {
    case "birthday": {
      if (!client.birthdate) {
        return { status: "queued", queueItemId: "", reason: "No birthdate on record for this client", clientName: clientDisplayName };
      }
      const bday = nextBirthdayDate(client.birthdate);
      if (isNaN(bday.getTime())) {
        return { status: "queued", queueItemId: "", reason: "Client birthdate is malformed", clientName: clientDisplayName };
      }
      triggerDate = toISODate(bday);
      context = { birthdate: client.birthdate };
      break;
    }

    case "closing_anniversary": {
      if (!latestRecord?.close_date) {
        return { status: "queued", queueItemId: "", reason: "No closed records found for this client", clientName: clientDisplayName };
      }
      let bestDate: Date | null = null;
      let bestYear = 1;
      for (const yr of ANNIVERSARY_YEARS) {
        const anniv = addYears(latestRecord.close_date, yr);
        const days = daysUntil(anniv);
        if (days >= -30 && days <= 30) {
          if (!bestDate || Math.abs(days) < Math.abs(daysUntil(bestDate))) {
            bestDate = anniv;
            bestYear = yr;
          }
        }
      }
      if (!bestDate) {
        for (const yr of ANNIVERSARY_YEARS) {
          const anniv = addYears(latestRecord.close_date, yr);
          if (daysUntil(anniv) >= 0) {
            bestDate = anniv;
            bestYear = yr;
            break;
          }
        }
      }
      if (!bestDate) {
        bestDate = addYears(latestRecord.close_date, 1);
        bestYear = 1;
      }
      triggerDate = toISODate(bestDate);
      context = {
        anniversary_year: bestYear,
        address: latestRecord.address,
        close_date: latestRecord.close_date,
        gci: latestRecord.gci,
        side: latestRecord.side ?? null,
        property_use: latestRecord.property_use ?? null,
      };
      break;
    }

    case "mortgage_renewal_due": {
      if (!latestRecord?.close_date) {
        return { status: "queued", queueItemId: "", reason: "No closed records found for this client", clientName: clientDisplayName };
      }
      const renewalDate = addYears(latestRecord.close_date, 5);
      const daysToRenewal = Math.round(daysUntil(renewalDate));
      triggerDate = toISODate(renewalDate);
      context = {
        close_date: latestRecord.close_date,
        address: latestRecord.address,
        days_until_renewal: daysToRenewal,
        renewal_date: triggerDate,
      };
      break;
    }

    case "mortgage_renewal_window": {
      if (!latestRecord?.close_date) {
        return { status: "queued", queueItemId: "", reason: "No closed records found for this client", clientName: clientDisplayName };
      }
      const renewalDate = addYears(latestRecord.close_date, 5);
      const monthsToRenewal = Math.round(daysUntil(renewalDate) / 30);
      triggerDate = firstOfMonth();
      context = {
        close_date: latestRecord.close_date,
        address: latestRecord.address,
        months_until_renewal: monthsToRenewal,
      };
      break;
    }

    case "past_client_check_in": {
      const lastDeal = latestRecord?.close_date ?? null;
      const monthsIdle = lastDeal
        ? Math.floor(
            (Date.now() - new Date(lastDeal + "T12:00:00").getTime()) /
              (1000 * 60 * 60 * 24 * 30),
          )
        : 12;
      triggerDate = firstOfMonth();
      context = { months_idle: monthsIdle, last_contact_at: lastDeal };
      break;
    }

    case "timeframe_approaching": {
      const tf = (client.timeframe as string) ?? "1_3_months";
      const totalDays = TIMEFRAME_DAYS[tf] ?? 90;
      const daysLeft = Math.round(Math.max(14, totalDays * 0.2));
      const budget =
        client.property_interest_type === "budget" && client.property_interest
          ? Number(client.property_interest)
          : null;
      triggerDate = firstOfMonth();
      context = {
        timeframe: tf,
        timeframe_label: TIMEFRAME_LABELS[tf] ?? tf,
        days_remaining: daysLeft,
        budget,
      };
      break;
    }

    case "property_value_milestone": {
      if (!latestRecord?.close_date) {
        return { status: "queued", queueItemId: "", reason: "No closed records found for this client", clientName: clientDisplayName };
      }
      let milestoneDate: Date | null = null;
      let milestoneYear = 1;
      for (const yr of PROPERTY_MILESTONE_YEARS) {
        const d = addYears(latestRecord.close_date, yr);
        const days = daysUntil(d);
        if (days >= -30 && days <= 45) {
          milestoneDate = d;
          milestoneYear = yr;
          break;
        }
      }
      if (!milestoneDate) {
        for (const yr of PROPERTY_MILESTONE_YEARS) {
          const d = addYears(latestRecord.close_date, yr);
          if (daysUntil(d) >= 0) {
            milestoneDate = d;
            milestoneYear = yr;
            break;
          }
        }
      }
      if (!milestoneDate) {
        milestoneDate = addYears(latestRecord.close_date, 1);
        milestoneYear = 1;
      }
      triggerDate = toISODate(milestoneDate);
      context = {
        milestone_year: milestoneYear,
        close_date: latestRecord.close_date,
        address: latestRecord.address,
        milestone_date: triggerDate,
        side: latestRecord.side ?? null,
        property_use: latestRecord.property_use ?? null,
      };
      break;
    }

    default:
      return { status: "queued", queueItemId: "", reason: "Unsupported opportunity type", clientName: clientDisplayName };
  }

  // ── Check for an existing queue item ─────────────────────────────────────
  const { data: existing } = await supabase
    .from("outreach_queue")
    .select("id, status")
    .eq("user_id", userId)
    .eq("client_id", clientId)
    .eq("opportunity_type", opType)
    .eq("trigger_date", triggerDate)
    .maybeSingle();

  if (existing && (existing.status === "ready" || existing.status === "sent")) {
    return {
      status: "existing",
      queueItemId: existing.id,
      clientName: clientDisplayName,
    };
  }

  // ── Upsert the queue item ────────────────────────────────────────────────
  let queueItemId: string;

  if (existing) {
    queueItemId = existing.id;
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from("outreach_queue")
      .upsert(
        {
          user_id: userId,
          client_id: clientId,
          opportunity_type: opType,
          trigger_date: triggerDate,
          context,
          status: "draft",
        },
        {
          onConflict: "user_id,client_id,opportunity_type,trigger_date",
          ignoreDuplicates: false,
        },
      )
      .select("id")
      .single();

    if (insertError || !inserted) {
      console.error("[draft-services/outreach] Upsert error:", insertError);
      return { status: "queued", queueItemId: "", reason: "Failed to create queue item", clientName: clientDisplayName };
    }
    queueItemId = inserted.id;
  }

  // ── Draft via Claude with Groq fallback ─────────────────────────────────
  const aiKey = process.env.ANTHROPIC_API_KEY || process.env.GROQ_API_KEY;
  if (!aiKey) {
    return { status: "queued", queueItemId, clientName: clientDisplayName, reason: "AI service not configured" };
  }

  try {
    const tone = (client.communication_tone as Tone) ?? "friendly";
    const address = latestRecord?.address ?? client.city ?? null;
    const province = client.province_region ?? null;
    const side = (context.side as "buyer" | "seller" | "both" | null) ?? null;

    let prompt: string;
    switch (opType) {
      case "birthday":
        prompt = buildBirthdayPrompt(agentFirst, clientDisplayName, tone);
        break;
      case "closing_anniversary":
        prompt = buildAnniversaryPrompt(
          agentFirst, clientDisplayName,
          Number(context.anniversary_year ?? 1),
          address, province, tone, side,
        );
        break;
      case "mortgage_renewal_due":
        prompt = buildMortgageRenewalDuePrompt(
          agentFirst, clientDisplayName,
          String(context.close_date ?? ""),
          Number(context.days_until_renewal ?? 0),
          address, tone,
        );
        break;
      case "mortgage_renewal_window":
        prompt = buildMortgageRenewalWindowPrompt(
          agentFirst, clientDisplayName,
          String(context.close_date ?? ""),
          Number(context.months_until_renewal ?? 12),
          address, tone,
        );
        break;
      case "past_client_check_in":
        prompt = buildPastClientCheckInPrompt(
          agentFirst, clientDisplayName,
          Number(context.months_idle ?? 6),
          province, tone,
        );
        break;
      case "timeframe_approaching":
        prompt = buildTimeframeApproachingPrompt(
          agentFirst, clientDisplayName,
          String(context.timeframe_label ?? "upcoming"),
          Number(context.days_remaining ?? 0),
          context.budget != null ? Number(context.budget) : null,
          tone,
        );
        break;
      case "property_value_milestone":
        prompt = buildPropertyValueMilestonePrompt(
          agentFirst, clientDisplayName,
          Number(context.milestone_year ?? 1),
          address, province, tone, side,
        );
        break;
      default:
        prompt = "";
    }

    if (!prompt) {
      return { status: "queued", queueItemId, clientName: clientDisplayName, reason: "Could not build prompt" };
    }

    const contextLevel = classifyClientContext(clientTags, clientNotes, context as Record<string, unknown>);
    const contextLevelBlock =
      contextLevel === "sensitive" ? SENSITIVE_INSTRUCTIONS :
      contextLevel === "rich" ? RICH_CONTEXT_INSTRUCTIONS :
                                 SPARSE_CONTEXT_INSTRUCTIONS;

    const contextSuffix = [
      AGENT_RUNWAY_VOICE,
      clientContextBlock,
      contextLevelBlock,
      VALUE_FIRST_RULE,
      agentStyleGuide
        ? `AGENT VOICE GUIDE (follow closely — message must sound like the agent personally wrote it):\n${agentStyleGuide}`
        : null,
    ].filter(Boolean).join("\n\n");

    const fullPrompt = contextSuffix ? `${prompt}\n\n${contextSuffix}` : prompt;
    const aiHeaders = heliconeHeaders({ userId, feature: "draft-outreach" });

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
      console.warn("[draft-services/outreach] Primary failed, falling back to Groq:", primaryErr);
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

    // ── Self-review: ban list + length cap, retry once ──────────────────────
    const rawLower = raw.toLowerCase();
    const hasBanned = BANNED_PHRASES.some((p) => rawLower.includes(p));
    const wordCount = raw.split(/\s+/).filter(Boolean).length;
    const tooLong = wordCount > 250;

    if (hasBanned || tooLong) {
      const retryNote = [
        hasBanned ? "IMPORTANT: The previous draft contained a clichéd opener. Do NOT open with 'I hope this email finds you well' or similar phrases. Start with something genuine and specific." : null,
        tooLong ? `IMPORTANT: The previous draft was ${wordCount} words. Keep it under 200 words.` : null,
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
        console.warn("[draft-services/outreach] Self-review retry failed:", retryErr);
      }
    }

    // Parse subject + body
    const lines = raw.split("\n");
    const subjIdx = [...lines].reverse().findIndex((l) =>
      l.trimStart().toUpperCase().startsWith("SUBJECT:"),
    );

    let aiSubject: string;
    let aiBody: string;
    if (subjIdx === -1) {
      console.warn(`[draft-services/outreach] No SUBJECT line for item ${queueItemId} — synthesizing`);
      const firstSentence = raw.split(/[.!?\n]/)[0]?.trim() ?? "";
      aiSubject = firstSentence.slice(0, 50).toLowerCase().replace(/^(hi|hey|hello)\s+\w+,?\s*/i, "").trim() || "quick note";
      aiBody = raw.trim();
    } else {
      const realSubjIdx = lines.length - 1 - subjIdx;
      aiSubject = lines[realSubjIdx].replace(/^SUBJECT:\s*/i, "").trim();
      aiBody = lines.slice(0, realSubjIdx).join("\n").trim();
    }

    if (emailSignature) aiBody += `\n\n${emailSignature}`;

    await supabase
      .from("outreach_queue")
      .update({ ai_subject: aiSubject, ai_body: aiBody, status: "ready" })
      .eq("id", queueItemId);

    return {
      status: "created",
      queueItemId,
      subject: aiSubject,
      body: aiBody,
      clientName: clientDisplayName,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[draft-services/outreach] AI error for item ${queueItemId}:`, errMsg);
    return { status: "queued", queueItemId, error: errMsg, clientName: clientDisplayName };
  }
}

// ─── Listing description ─────────────────────────────────────────────────────

export interface PropertySpecs {
  address?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  square_feet?: number | null;
  lot_acres?: number | null;
  garage?: boolean | null;
  waterfront?: boolean | null;
  listing_url?: string | null;
  gci?: number | null;
  side?: string | null;
  city?: string | null;
}

export interface DraftListingDescriptionResult {
  description: string;
  socialPost: string;
}

/**
 * Draft a listing description + paired social post. Mirrors
 * /api/ai/listing-description. Either pass `clientRecordId` (and optionally
 * `clientId`) to fetch from CRM, or pass `specs` directly.
 */
export async function draftListingDescription(input: {
  supabase: SupabaseClient;
  userId: string;
  clientRecordId?: string;
  clientId?: string;
  specs?: PropertySpecs;
  noEmoji?: boolean;
}): Promise<DraftListingDescriptionResult | { error: string }> {
  const { supabase, userId, clientRecordId, clientId, specs: providedSpecs, noEmoji = false } = input;

  let specs: PropertySpecs;

  if (clientRecordId) {
    const { data: record } = await supabase
      .from("client_records")
      .select("address, bedrooms, bathrooms, square_feet, lot_acres, garage, waterfront, listing_url, gci, side")
      .eq("id", clientRecordId)
      .eq("user_id", userId)
      .single();
    if (!record) return { error: "Transaction not found" };
    specs = record;

    if (clientId) {
      const { data: clientRow } = await supabase
        .from("clients")
        .select("city")
        .eq("id", clientId)
        .single();
      if (clientRow?.city) specs.city = clientRow.city;
    }
  } else if (providedSpecs) {
    specs = providedSpecs;
  } else {
    return { error: "Provide clientRecordId or specs" };
  }

  const features: string[] = [];
  if (specs.address) features.push(`Address: ${specs.address}`);
  if (specs.city) features.push(`City/Area: ${specs.city}`);
  if (specs.bedrooms != null) features.push(`${specs.bedrooms} bedroom${specs.bedrooms !== 1 ? "s" : ""}`);
  if (specs.bathrooms != null) features.push(`${specs.bathrooms} bathroom${specs.bathrooms !== 1 ? "s" : ""}`);
  if (specs.square_feet != null) features.push(`${specs.square_feet.toLocaleString()} sq ft`);
  if (specs.lot_acres != null && specs.lot_acres > 0) features.push(`${specs.lot_acres} acre lot`);
  if (specs.garage) features.push("Garage");
  if (specs.waterfront) features.push("Waterfront property");

  if (features.length < 2) {
    return { error: "Not enough property details to generate a description. Add specs like bedrooms, bathrooms, and square footage first." };
  }

  const { data: settings } = await supabase
    .from("user_settings")
    .select("display_name")
    .eq("user_id", userId)
    .single();
  const agentName = settings?.display_name || "";

  const userPrompt = `You are writing property copy for a Canadian real estate agent. Generate TWO things from this property data.

${AGENT_RUNWAY_VOICE}

PROPERTY DETAILS:
${features.join("\n")}

1. **LISTING DESCRIPTION** (2-3 short paragraphs, ~120-150 words)
- Write like a person who walked through the house and is telling a friend about it. Not like a brochure.
- Lead with what makes this property actually interesting — not generic praise.
- Describe what's there. Let the reader decide it's great. Don't announce it.
- Do NOT fabricate features not listed above. If you only have basics, keep it brief and honest.
- Canadian English spelling (colour, centre, neighbourhood, etc.)
- No stacked adjectives. "Bright kitchen with a gas range" beats "beautiful, spacious, updated chef's kitchen."
- End with something specific the agent can offer — not "contact me today!"

2. **SOCIAL MEDIA POST** (~60-80 words)
- Write like a real person sharing something they're genuinely proud of — not a marketing template.
- ${noEmoji ? "Do NOT use any emojis." : "Use 1-2 emojis maximum, only if they feel natural. Skip them entirely if the tone doesn't call for it."}
- Don't open with "Just listed!" or "Exciting news!" — find a more interesting hook.
- End with a natural CTA, not "Don't miss out!" Something like "Send me a message if you want the details."
${agentName ? `- Agent name: ${agentName}` : ""}

Respond in this exact JSON format:
{
  "description": "...",
  "social_post": "..."
}`;

  try {
    const { text: raw } = await generateText({
      model: models.default,
      system: "You write property copy that sounds like a real person, not a marketing team. You avoid AI-sounding language — no 'stunning', 'nestled', 'dream home', 'don't miss out'. You describe what's actually there and let quality speak for itself. Canadian English. Always respond with valid JSON only.",
      prompt: userPrompt,
      temperature: 0.7,
      maxOutputTokens: 800,
      headers: heliconeHeaders({ userId, feature: "listing-description" }),
    });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(raw);

    return {
      description: result.description || "",
      socialPost: result.social_post || "",
    };
  } catch (err) {
    console.error("[draft-services/listing] AI error:", err);
    return { error: "Failed to generate description" };
  }
}

// ─── Newsletter ───────────────────────────────────────────────────────────────

export type DraftNewsletterStatus = "created" | "queued";

export interface DraftNewsletterResult {
  status: DraftNewsletterStatus;
  newsletterId: string;
  subject?: string;
  body?: string;
  reason?: string;
}

export async function draftNewsletter(input: {
  supabase: SupabaseClient;
  userId: string;
  templateType: NewsletterTemplateType;
  oldRate?: number;
  newRate?: number;
  effectiveDate?: string;
  topic?: string;
  notes?: string;
}): Promise<DraftNewsletterResult | { error: string }> {
  const { supabase, userId, templateType: tmplType } = input;

  // ── Validate per-template required fields ────────────────────────────────
  if (tmplType === "boc_rate_change") {
    if (input.oldRate == null || input.newRate == null) {
      return { error: "oldRate and newRate are required for boc_rate_change" };
    }
  }
  if (tmplType === "custom") {
    if (!input.topic?.trim()) return { error: "topic is required for custom newsletters" };
  }

  const settingsRes = await supabase
    .from("user_settings")
    .select("display_name, email_signature")
    .eq("user_id", userId)
    .single();

  const agentFirst = extractFirstName(settingsRes.data?.display_name ?? null);
  const emailSignature = (settingsRes.data?.email_signature as string) ?? "";

  let context: Record<string, unknown>;
  let prompt: string;

  switch (tmplType) {
    case "boc_rate_change": {
      const oldRate = Number(input.oldRate);
      const newRate = Number(input.newRate);
      const effectiveDate = input.effectiveDate
        ?? new Date().toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" });
      const notes = input.notes?.trim() || null;
      context = { old_rate: oldRate, new_rate: newRate, effective_date: effectiveDate, notes };
      prompt = buildBocRateChangeNewsletterPrompt(agentFirst, oldRate, newRate, effectiveDate, notes);
      break;
    }
    case "custom": {
      const topic = input.topic!.trim();
      const notes = input.notes?.trim() || null;
      context = { topic, notes };
      prompt = buildCustomNewsletterPrompt(agentFirst, topic, notes);
      break;
    }
    default:
      return { error: `Unsupported template_type: ${tmplType}` };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("newsletter_queue")
    .insert({
      user_id: userId,
      template_type: tmplType,
      context,
      status: "draft",
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("[draft-services/newsletter] Insert error:", insertError);
    return { error: "Failed to create newsletter" };
  }

  const newsletterId = inserted.id;

  const aiKey = process.env.ANTHROPIC_API_KEY || process.env.GROQ_API_KEY;
  if (!aiKey) {
    return { status: "queued", newsletterId, reason: "AI service not configured" };
  }

  try {
    const aiHeaders = heliconeHeaders({ userId, feature: "draft-newsletter" });
    let raw: string;
    try {
      const { text } = await generateText({
        model: models.default,
        prompt,
        maxOutputTokens: 700,
        temperature: 0.80,
        headers: aiHeaders,
      });
      raw = text.trim();
      if (!raw) throw new Error("Empty Claude response");
    } catch (primaryErr) {
      console.warn("[draft-services/newsletter] Primary failed, falling back to Groq:", primaryErr);
      const { text } = await generateText({
        model: models.fallback,
        prompt,
        maxOutputTokens: 700,
        temperature: 0.80,
        headers: aiHeaders,
      });
      raw = text.trim();
      if (!raw) throw new Error("Empty fallback response");
    }

    const lines = raw.split("\n");
    const subjIdx = [...lines].reverse().findIndex((l) =>
      l.trimStart().toUpperCase().startsWith("SUBJECT:"),
    );
    if (subjIdx === -1) throw new Error("No SUBJECT line in response");

    const realSubjIdx = lines.length - 1 - subjIdx;
    const aiSubject = lines[realSubjIdx].replace(/^SUBJECT:\s*/i, "").trim();
    let aiBody = lines.slice(0, realSubjIdx).join("\n").trim();

    if (emailSignature) aiBody += `\n\n${emailSignature}`;

    await supabase
      .from("newsletter_queue")
      .update({ ai_subject: aiSubject, ai_body: aiBody, status: "ready" })
      .eq("id", newsletterId);

    return { status: "created", newsletterId, subject: aiSubject, body: aiBody };
  } catch (err) {
    console.error("[draft-services/newsletter] AI error:", err);
    return { status: "queued", newsletterId, reason: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Social post ─────────────────────────────────────────────────────────────

export type SocialPostTemplate =
  | "listing_announcement"
  | "just_sold"
  | "open_house"
  | "market_update"
  | "client_win"
  | "custom";

const SOCIAL_TEMPLATE_FRAMING: Record<SocialPostTemplate, string> = {
  listing_announcement: "A new listing the agent has just brought to market.",
  just_sold: "A property the agent has just sold (closed).",
  open_house: "An upcoming open house the agent is hosting.",
  market_update: "A general market update (inventory, rates, conditions) the agent wants to share.",
  client_win: "A client moment worth celebrating (closed deal, new home, milestone).",
  custom: "A custom topic the agent has provided in the context field.",
};

const SOCIAL_SYSTEM_PROMPT = `You write social media posts for Canadian real estate agents.

Tone: professional but approachable. Conversational, not salesy. Sounds like
a real human, not a marketing template.

Constraints:
- Platform-agnostic: the post should fit LinkedIn, Facebook, and Instagram.
- 150–250 words.
- Canadian English spelling (colour, centre, neighbourhood).
- End with a soft CTA (e.g. "DM me if you want the details", "Happy to chat
  about what this means for you", "Reach out anytime"). NOT "Don't miss out!"
  or "Act now!".
- After the body, append 5–8 relevant Canadian real estate hashtags on a
  single line (e.g. #CanadianRealEstate #YourCity etc.).
- Do NOT include any tax advice, tax planning suggestions, or instructions
  on what the reader should do with their money. This is marketing copy,
  not financial advice.
- Do NOT mention specific prices, commissions, or dollar figures unless
  they were provided in the agent's context.
- Avoid AI-flag phrases: "thrilled to", "excited to announce", "dream
  home", "don't miss out", "in today's competitive market", "your real
  estate journey".

Output ONLY the post text (body + hashtag line). No JSON, no headings, no
"Here's your post:" preamble.`;

/**
 * Draft a social media post. Mirrors /api/ai/draft-social-post. No DB write —
 * the route returns the draft inline.
 */
export async function draftSocialPost(input: {
  userId: string;
  template: SocialPostTemplate;
  context: string | null;
  clientName: string | null;
  propertyAddress: string | null;
}): Promise<string | null> {
  const { userId, template, context, clientName, propertyAddress } = input;

  const aiKey = process.env.ANTHROPIC_API_KEY || process.env.GROQ_API_KEY;
  if (!aiKey) return null;

  const framing = SOCIAL_TEMPLATE_FRAMING[template];

  const detailLines: string[] = [];
  detailLines.push(`Template: ${template}`);
  detailLines.push(`Framing: ${framing}`);
  if (clientName) detailLines.push(`Client name (only mention if natural — do NOT use full name without permission, prefer first name only): ${clientName}`);
  if (propertyAddress) detailLines.push(`Property address: ${propertyAddress}`);
  if (context) detailLines.push(`Additional context from agent: ${context}`);

  const userPrompt = `Write a single social media post based on the details below.

${detailLines.join("\n")}

Remember: 150–250 words, soft CTA, 5–8 hashtags on a single line at the end,
Canadian English, no tax/financial advice, no AI-flag phrases.`;

  try {
    const aiHeaders = heliconeHeaders({ userId, feature: "draft-social-post" });
    let raw: string;
    try {
      const { text } = await generateText({
        model: models.default,
        system: SOCIAL_SYSTEM_PROMPT,
        prompt: userPrompt,
        temperature: 0.75,
        maxOutputTokens: 350,
        headers: aiHeaders,
      });
      raw = text.trim();
      if (!raw) throw new Error("Empty Claude response");
    } catch (primaryErr) {
      console.warn("[draft-services/social] Primary failed, falling back to Groq:", primaryErr);
      const { text } = await generateText({
        model: models.fallback,
        system: SOCIAL_SYSTEM_PROMPT,
        prompt: userPrompt,
        temperature: 0.75,
        maxOutputTokens: 350,
        headers: aiHeaders,
      });
      raw = text.trim();
      if (!raw) throw new Error("Empty fallback response");
    }

    return raw;
  } catch (err) {
    console.error("[draft-services/social] AI error:", err);
    return null;
  }
}

// ─── Workflow draft (Flight Status workflow library) ─────────────────────────
//
// A generic, prompt-driven drafter used by the Flight Status workflow library
// (Phase 2.3). Unlike draftOutreachForClient — which is keyed to one of the
// 7 OutreachOpportunityType slots and embeds prompt logic in the service —
// the workflow drafter takes a free-form body_prompt from a workflow_templates
// row and produces a draft. Subject + body are written to a new
// workflow_drafts row owned by the agent. No auto-send, no email integration:
// the draft is text the agent copies into their own email client.
//
// The same ban-list / length-cap self-review pass that the outreach drafter
// runs is applied here, plus the standard AGENT_RUNWAY_VOICE prefix and the
// agent's email signature appended to the body.

export interface DraftWorkflowMessageInput {
  supabase: SupabaseClient;
  userId: string;
  clientId: string;
  template: WorkflowTemplate;
}

export interface DraftWorkflowMessageResult {
  status: "created" | "error";
  draftId?: string;
  subject?: string;
  body?: string;
  clientName?: string;
  reason?: string;
}

function renderTemplateString(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_match, key: string) => {
    const v = vars[key.toLowerCase()];
    return v ?? `{{${key}}}`;
  });
}

export async function draftWorkflowMessage(
  input: DraftWorkflowMessageInput,
): Promise<DraftWorkflowMessageResult> {
  const { supabase, userId, clientId, template } = input;

  // ── Validate template ownership / system access ────────────────────────
  if (template.user_id !== null && template.user_id !== userId) {
    return { status: "error", reason: "Template not accessible" };
  }
  if (!template.is_active) {
    return { status: "error", reason: "Template is inactive" };
  }

  // ── Load client (ownership enforced via user_id match) ────────────────
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, name, first_name, last_name, communication_tone, tags, notes")
    .eq("id", clientId)
    .eq("user_id", userId)
    .is("archived_at", null)
    .single();

  if (clientError || !client) {
    return { status: "error", reason: "Client not found or access denied" };
  }

  const trimmedName = client.name?.trim();
  const composedName = [client.first_name, client.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const clientDisplayName = trimmedName || composedName || "this client";
  const clientFirstName = client.first_name?.trim() || clientDisplayName.split(/\s+/)[0] || "there";

  // ── Load agent settings for signature + voice guide ─────────────────────
  const { data: settings } = await supabase
    .from("user_settings")
    .select("display_name, email_signature, ai_voice_guide")
    .eq("user_id", userId)
    .single();

  const agentFirst = extractFirstName(settings?.display_name ?? null);
  const emailSignature = (settings?.email_signature as string) ?? "";
  const agentStyleGuide = (settings?.ai_voice_guide as string | null) ?? null;

  // ── Render subject template ─────────────────────────────────────────────
  const renderVars: Record<string, string> = {
    client_name: clientDisplayName,
    client_first_name: clientFirstName,
    agent_first_name: agentFirst,
  };
  const renderedSubject = renderTemplateString(template.subject_template, renderVars);

  // ── Build the AI prompt ─────────────────────────────────────────────────
  const renderedBodyPrompt = renderTemplateString(template.body_prompt, renderVars);

  const tone = (client.communication_tone as Tone) ?? "friendly";
  const clientTags = (client.tags as string[] | null) ?? [];
  const clientNotes = (client.notes as string | null) ?? null;

  const clientContextBlock = (clientTags.length > 0 || clientNotes)
    ? [
        "IMPORTANT — client context (use to self-moderate tone and content):",
        clientTags.length > 0 ? `- Tags: ${clientTags.join(", ")}` : null,
        clientNotes ? `- Agent notes: "${clientNotes}"` : null,
        "If any context signals a sensitive circumstance, adjust the email accordingly and avoid assumptions.",
      ].filter(Boolean).join("\n")
    : null;

  const contextLevel = classifyClientContext(clientTags, clientNotes, {});
  const contextLevelBlock =
    contextLevel === "sensitive" ? SENSITIVE_INSTRUCTIONS :
    contextLevel === "rich" ? RICH_CONTEXT_INSTRUCTIONS :
                               SPARSE_CONTEXT_INSTRUCTIONS;

  const promptHeader = `You are drafting a single email from a Canadian real estate agent (${agentFirst}) to a client (${clientDisplayName}). Tone: ${tone}.

${renderedBodyPrompt}

OUTPUT RULES:
- Output the email body only. Do NOT include a subject line — the subject is handled separately.
- Do NOT include the agent's signature — it will be appended automatically.
- Open with a natural greeting using the client's first name. Do NOT open with "I hope this email finds you well", "just touching base", or any clichéd filler.
- Canadian English spelling.
- Plain prose. No headers, no markdown bullets unless genuinely useful.`;

  const fullPrompt = [
    promptHeader,
    AGENT_RUNWAY_VOICE,
    clientContextBlock,
    contextLevelBlock,
    agentStyleGuide
      ? `AGENT VOICE GUIDE (follow closely — message must sound like the agent personally wrote it):\n${agentStyleGuide}`
      : null,
  ].filter(Boolean).join("\n\n");

  // ── Generate via Claude with Groq fallback ─────────────────────────────
  const aiKey = process.env.ANTHROPIC_API_KEY || process.env.GROQ_API_KEY;
  if (!aiKey) {
    return { status: "error", reason: "AI service not configured", clientName: clientDisplayName };
  }

  const aiHeaders = heliconeHeaders({ userId, feature: "draft-workflow-message" });

  let raw: string;
  try {
    try {
      const { text } = await generateText({
        model: models.default,
        prompt: fullPrompt,
        maxOutputTokens: 500,
        temperature: 0.8,
        headers: aiHeaders,
      });
      raw = text.trim();
      if (!raw) throw new Error("Empty Claude response");
    } catch (primaryErr) {
      console.warn("[draft-services/workflow] Primary failed, falling back to Groq:", primaryErr);
      const { text } = await generateText({
        model: models.fallback,
        prompt: fullPrompt,
        maxOutputTokens: 500,
        temperature: 0.8,
        headers: aiHeaders,
      });
      raw = text.trim();
      if (!raw) throw new Error("Empty fallback response");
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[draft-services/workflow] AI error:", errMsg);
    return { status: "error", reason: "Drafting failed — try again in a moment", clientName: clientDisplayName };
  }

  // ── Self-review: ban list + length cap, retry once ─────────────────────
  const rawLower = raw.toLowerCase();
  const hasBanned = BANNED_PHRASES.some((p) => rawLower.includes(p));
  const wordCount = raw.split(/\s+/).filter(Boolean).length;
  const tooLong = wordCount > 280;

  if (hasBanned || tooLong) {
    const retryNote = [
      hasBanned ? "IMPORTANT: The previous draft contained a clichéd opener or banned phrase. Rewrite without 'I hope this email finds you well', 'just touching base', 'exciting news', or similar fillers." : null,
      tooLong ? `IMPORTANT: The previous draft was ${wordCount} words. Tighten it under 220 words while keeping the substance.` : null,
    ].filter(Boolean).join(" ");

    try {
      const { text: retryRaw } = await generateText({
        model: models.default,
        prompt: `${fullPrompt}\n\n${retryNote}`,
        maxOutputTokens: 500,
        temperature: 0.8,
        headers: aiHeaders,
      });
      if (retryRaw?.trim()) raw = retryRaw.trim();
    } catch (retryErr) {
      console.warn("[draft-services/workflow] Self-review retry failed:", retryErr);
    }
  }

  // ── Strip any accidental SUBJECT: line the model emitted (it shouldn't,
  // per OUTPUT RULES, but safety) ────────────────────────────────────────
  const cleanedLines = raw
    .split("\n")
    .filter((line) => !/^\s*subject\s*:/i.test(line));
  let aiBody = cleanedLines.join("\n").trim();

  if (emailSignature) aiBody += `\n\n${emailSignature}`;

  // ── Insert workflow_drafts row ─────────────────────────────────────────
  const { data: inserted, error: insertError } = await supabase
    .from("workflow_drafts")
    .insert({
      user_id: userId,
      client_id: clientId,
      template_id: template.id,
      trigger_event: template.trigger_event as WorkflowTriggerEvent,
      subject: renderedSubject,
      body: aiBody,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("[draft-services/workflow] Insert error:", insertError);
    return { status: "error", reason: "Failed to save draft", clientName: clientDisplayName };
  }

  return {
    status: "created",
    draftId: inserted.id,
    subject: renderedSubject,
    body: aiBody,
    clientName: clientDisplayName,
  };
}
