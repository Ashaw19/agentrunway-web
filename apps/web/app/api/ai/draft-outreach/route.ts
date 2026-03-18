/**
 * POST /api/ai/draft-outreach
 *
 * On-demand, single-client outreach drafting triggered from the CRM briefing.
 *
 * Accepts a { client_id, opportunity_type } pair, computes the appropriate
 * trigger_date and context, upserts an outreach_queue row, then immediately
 * calls Groq to draft the message. Returns the queue_item_id so the UI can
 * link directly to Flight Control.
 *
 * Status in response:
 *   "created"  — new item drafted and ready (201)
 *   "existing" — this opportunity was already drafted/sent; link returned (200)
 *   "queued"   — item created but Groq unavailable; cron will draft it (202)
 *
 * Rate-limited to 20 calls/hour per user (endpoint key: "draft_outreach").
 *
 * Only the 7 briefing types that have genuine email value are accepted:
 *   birthday, closing_anniversary, mortgage_renewal_due,
 *   mortgage_renewal_window, past_client_check_in,
 *   timeframe_approaching, property_value_milestone
 */

import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { createClient }           from "@/lib/supabase/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import type { OutreachOpportunityType } from "@agent-runway/core/types/database";
import {
  type Tone,
  buildAnniversaryPrompt,
  buildBirthdayPrompt,
  buildMortgageRenewalDuePrompt,
  buildMortgageRenewalWindowPrompt,
  buildPastClientCheckInPrompt,
  buildTimeframeApproachingPrompt,
  buildPropertyValueMilestonePrompt,
} from "@/lib/outreach-prompts";

// ── Types eligible for briefing-triggered on-demand drafting ──────────────────

const DRAFTABLE_TYPES = new Set<OutreachOpportunityType>([
  "birthday",
  "closing_anniversary",
  "mortgage_renewal_due",
  "mortgage_renewal_window",
  "past_client_check_in",
  "timeframe_approaching",
  "property_value_milestone",
]);

// ── Date helpers (mirrors detect-opportunities, kept local to avoid coupling) ─

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

// ── Anniversary & milestone constants ────────────────────────────────────────

const ANNIVERSARY_YEARS       = [1, 2, 3, 5, 10];
const PROPERTY_MILESTONE_YEARS = [1, 2, 3, 5, 7, 10, 15, 20, 25];

const TIMEFRAME_LABELS: Record<string, string> = {
  asap:         "ASAP",
  "1_3_months": "1–3 Month",
  "3_6_months": "3–6 Month",
  "6_12_months": "6–12 Month",
};

const TIMEFRAME_DAYS: Record<string, number> = {
  asap:         14,
  "1_3_months": 90,
  "3_6_months": 180,
  "6_12_months": 365,
};

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // Rate limit: 20 on-demand drafts per hour
  const rl = await checkRateLimit(user.id, "draft_outreach", 20, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Try again in a few minutes." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  // ── Parse and validate body ───────────────────────────────────────────────

  let body: { client_id?: string; opportunity_type?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { client_id, opportunity_type } = body;

  if (!client_id || !opportunity_type) {
    return NextResponse.json(
      { error: "client_id and opportunity_type are required" },
      { status: 400 },
    );
  }

  if (!DRAFTABLE_TYPES.has(opportunity_type as OutreachOpportunityType)) {
    return NextResponse.json(
      { error: "This opportunity type does not support on-demand drafting" },
      { status: 400 },
    );
  }

  const opType = opportunity_type as OutreachOpportunityType;

  // ── Load client (ownership enforced via user_id match) ───────────────────

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select(
      "id, name, city, province_region, birthdate, communication_tone, status, timeframe, property_interest, property_interest_type",
    )
    .eq("id", client_id)
    .eq("user_id", user.id)
    .is("archived_at", null)
    .single();

  if (clientError || !client) {
    return NextResponse.json(
      { error: "Client not found or access denied" },
      { status: 403 },
    );
  }

  // ── Fetch user settings + most recent closed record in parallel ───────────

  const [settingsRes, recordsRes] = await Promise.all([
    supabase
      .from("user_settings")
      .select("display_name, email_signature")
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("client_records")
      .select("id, client_id, address, close_date, gci")
      .eq("client_id", client_id)
      .eq("user_id", user.id)
      .not("close_date", "is", null)
      .order("close_date", { ascending: false }),
  ]);

  const agentFirst     = extractFirstName(settingsRes.data?.display_name ?? null);
  const emailSignature = (settingsRes.data?.email_signature as string) ?? "";
  const records        = recordsRes.data ?? [];
  const latestRecord   = records[0] ?? null;

  // ── Compute trigger_date and context per type ─────────────────────────────

  let triggerDate: string;
  let context: Record<string, string | number | null>;

  switch (opType) {
    case "birthday": {
      if (!client.birthdate) {
        return NextResponse.json(
          { error: "No birthdate on record for this client" },
          { status: 400 },
        );
      }
      const bday = nextBirthdayDate(client.birthdate);
      if (isNaN(bday.getTime())) {
        return NextResponse.json(
          { error: "Client birthdate is malformed" },
          { status: 400 },
        );
      }
      triggerDate = toISODate(bday);
      context     = { birthdate: client.birthdate };
      break;
    }

    case "closing_anniversary": {
      if (!latestRecord?.close_date) {
        return NextResponse.json(
          { error: "No closed records found for this client" },
          { status: 400 },
        );
      }
      // Pick the most imminent anniversary within ±30 days; fall back to
      // the next upcoming one if none are in the window.
      let bestDate: Date | null = null;
      let bestYear              = 1;

      for (const yr of ANNIVERSARY_YEARS) {
        const anniv = addYears(latestRecord.close_date, yr);
        const days  = daysUntil(anniv);
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
      context     = {
        anniversary_year: bestYear,
        address:          latestRecord.address,
        close_date:       latestRecord.close_date,
        gci:              latestRecord.gci,
      };
      break;
    }

    case "mortgage_renewal_due": {
      if (!latestRecord?.close_date) {
        return NextResponse.json(
          { error: "No closed records found for this client" },
          { status: 400 },
        );
      }
      const renewalDate    = addYears(latestRecord.close_date, 5);
      const daysToRenewal  = Math.round(daysUntil(renewalDate));
      triggerDate          = toISODate(renewalDate);
      context              = {
        close_date:        latestRecord.close_date,
        address:           latestRecord.address,
        days_until_renewal: daysToRenewal,
        renewal_date:      triggerDate,
      };
      break;
    }

    case "mortgage_renewal_window": {
      if (!latestRecord?.close_date) {
        return NextResponse.json(
          { error: "No closed records found for this client" },
          { status: 400 },
        );
      }
      const renewalDate       = addYears(latestRecord.close_date, 5);
      const monthsToRenewal   = Math.round(daysUntil(renewalDate) / 30);
      triggerDate             = firstOfMonth();
      context                 = {
        close_date:           latestRecord.close_date,
        address:              latestRecord.address,
        months_until_renewal: monthsToRenewal,
      };
      break;
    }

    case "past_client_check_in": {
      const lastDeal  = latestRecord?.close_date ?? null;
      const monthsIdle = lastDeal
        ? Math.floor(
            (Date.now() - new Date(lastDeal + "T12:00:00").getTime()) /
              (1000 * 60 * 60 * 24 * 30),
          )
        : 12;

      triggerDate = firstOfMonth();
      context     = {
        months_idle:     monthsIdle,
        last_contact_at: lastDeal,
      };
      break;
    }

    case "timeframe_approaching": {
      const tf         = (client.timeframe as string) ?? "1_3_months";
      const totalDays  = TIMEFRAME_DAYS[tf] ?? 90;
      const daysLeft   = Math.round(Math.max(14, totalDays * 0.2));
      const budget     =
        client.property_interest_type === "budget" && client.property_interest
          ? Number(client.property_interest)
          : null;

      triggerDate = firstOfMonth();
      context     = {
        timeframe:       tf,
        timeframe_label: TIMEFRAME_LABELS[tf] ?? tf,
        days_remaining:  daysLeft,
        budget:          budget,
      };
      break;
    }

    case "property_value_milestone": {
      if (!latestRecord?.close_date) {
        return NextResponse.json(
          { error: "No closed records found for this client" },
          { status: 400 },
        );
      }
      // Find the nearest upcoming milestone within ±30 days; fall back to
      // the next one after today.
      let milestoneDate: Date | null = null;
      let milestoneYear             = 1;

      for (const yr of PROPERTY_MILESTONE_YEARS) {
        const d    = addYears(latestRecord.close_date, yr);
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
      context     = {
        milestone_year: milestoneYear,
        close_date:     latestRecord.close_date,
        address:        latestRecord.address,
        milestone_date: triggerDate,
      };
      break;
    }

    default:
      return NextResponse.json({ error: "Unsupported opportunity type" }, { status: 400 });
  }

  // ── Check for an existing queue item for this exact opportunity ───────────

  const { data: existing } = await supabase
    .from("outreach_queue")
    .select("id, status")
    .eq("user_id", user.id)
    .eq("client_id", client_id)
    .eq("opportunity_type", opType)
    .eq("trigger_date", triggerDate)
    .maybeSingle();

  if (existing && (existing.status === "ready" || existing.status === "sent")) {
    // Already drafted or sent — nothing to do; hand back the existing id
    return NextResponse.json(
      { queue_item_id: existing.id, status: "existing" },
      { headers: rateLimitHeaders(rl) },
    );
  }

  // ── Upsert the queue item ─────────────────────────────────────────────────

  let queueItemId: string;

  if (existing) {
    // Row exists but is in "draft" status — re-use it (avoids double-entry)
    queueItemId = existing.id;
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from("outreach_queue")
      .upsert(
        {
          user_id:          user.id,
          client_id,
          opportunity_type: opType,
          trigger_date:     triggerDate,
          context,
          status:           "draft",
        },
        {
          onConflict:       "user_id,client_id,opportunity_type,trigger_date",
          ignoreDuplicates: false,
        },
      )
      .select("id")
      .single();

    if (insertError || !inserted) {
      console.error("[draft-outreach] Upsert error:", insertError);
      return NextResponse.json({ error: "Failed to create queue item" }, { status: 500 });
    }

    queueItemId = inserted.id;
  }

  // ── Draft via Groq (synchronous — p99 < 4 s for these short prompts) ──────

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    // Groq not configured — item sits in "draft" status, cron will pick it up
    return NextResponse.json(
      { queue_item_id: queueItemId, status: "queued" },
      { status: 202, headers: rateLimitHeaders(rl) },
    );
  }

  try {
    const clientName = client.name;
    const tone       = (client.communication_tone as Tone) ?? "friendly";
    const address    = latestRecord?.address ?? client.city ?? null;
    const province   = client.province_region ?? null;

    let prompt: string;

    switch (opType) {
      case "birthday":
        prompt = buildBirthdayPrompt(agentFirst, clientName, tone);
        break;

      case "closing_anniversary":
        prompt = buildAnniversaryPrompt(
          agentFirst, clientName,
          Number(context.anniversary_year ?? 1),
          address, province, tone,
        );
        break;

      case "mortgage_renewal_due":
        prompt = buildMortgageRenewalDuePrompt(
          agentFirst, clientName,
          String(context.close_date ?? ""),
          Number(context.days_until_renewal ?? 0),
          address, tone,
        );
        break;

      case "mortgage_renewal_window":
        prompt = buildMortgageRenewalWindowPrompt(
          agentFirst, clientName,
          String(context.close_date ?? ""),
          Number(context.months_until_renewal ?? 12),
          address, tone,
        );
        break;

      case "past_client_check_in":
        prompt = buildPastClientCheckInPrompt(
          agentFirst, clientName,
          Number(context.months_idle ?? 6),
          province, tone,
        );
        break;

      case "timeframe_approaching":
        prompt = buildTimeframeApproachingPrompt(
          agentFirst, clientName,
          String(context.timeframe_label ?? "upcoming"),
          Number(context.days_remaining ?? 0),
          context.budget != null ? Number(context.budget) : null,
          tone,
        );
        break;

      case "property_value_milestone":
        prompt = buildPropertyValueMilestonePrompt(
          agentFirst, clientName,
          Number(context.milestone_year ?? 1),
          address, province, tone,
        );
        break;

      default:
        prompt = "";
    }

    if (!prompt) {
      return NextResponse.json(
        { queue_item_id: queueItemId, status: "queued" },
        { status: 202, headers: rateLimitHeaders(rl) },
      );
    }

    const groq = new OpenAI({
      apiKey:  groqKey,
      baseURL: "https://api.groq.com/openai/v1",
    });

    const completion = await groq.chat.completions.create({
      model:       "llama-3.3-70b-versatile",
      max_tokens:  400,
      temperature: 0.85,
      messages:    [{ role: "user", content: prompt }],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!raw) throw new Error("Empty Groq response");

    // Parse: last line starting with "SUBJECT:" is the subject
    const lines     = raw.split("\n");
    const subjIdx   = [...lines].reverse().findIndex((l) =>
      l.trimStart().toUpperCase().startsWith("SUBJECT:"),
    );
    if (subjIdx === -1) throw new Error("No SUBJECT line in response");

    const realSubjIdx = lines.length - 1 - subjIdx;
    const ai_subject  = lines[realSubjIdx].replace(/^SUBJECT:\s*/i, "").trim();
    let   ai_body     = lines.slice(0, realSubjIdx).join("\n").trim();

    if (emailSignature) {
      ai_body += `\n\n${emailSignature}`;
    }

    await supabase
      .from("outreach_queue")
      .update({ ai_subject, ai_body, status: "ready" })
      .eq("id", queueItemId);

    return NextResponse.json(
      { queue_item_id: queueItemId, status: "created" },
      { status: 201, headers: rateLimitHeaders(rl) },
    );
  } catch (err) {
    console.error("[draft-outreach] Groq drafting error:", err);
    // Item was upserted but draft failed — cron will retry on next scan
    return NextResponse.json(
      { queue_item_id: queueItemId, status: "queued" },
      { status: 202, headers: rateLimitHeaders(rl) },
    );
  }
}
