/**
 * POST /api/ai/draft-newsletter
 *
 * On-demand newsletter drafting — agent clicks "Draft with AI" in Flight Control,
 * picks a template, fills in context, and Groq produces a broadcast email.
 *
 * Supported template_type values:
 *   boc_rate_change  — { old_rate: number, new_rate: number, effective_date?: string, notes?: string }
 *   market_update    — {} (auto-fetches latest market_data_points for user's board)
 *   custom           — { topic: string, notes?: string }
 *
 * Response:
 *   201 { newsletter_id, status: "created" }   — drafted and ready
 *   202 { newsletter_id, status: "queued"  }   — inserted but Groq unavailable
 *   400 { error }                              — validation failure
 *   401                                        — unauthenticated
 *   429                                        — rate limited (10/hr)
 *   500                                        — internal error
 *
 * Rate-limited to 10 newsletters/hour per user (endpoint key: "draft_newsletter").
 */

import OpenAI from "openai";
import { NextRequest, NextResponse }  from "next/server";
import { createClient }               from "@/lib/supabase/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { requirePro } from "@/lib/require-pro";
import type { NewsletterTemplateType } from "@agent-runway/core/types/database";
import type { MarketStats }            from "@/lib/newsletter-prompts";
import {
  buildBocRateChangeNewsletterPrompt,
  buildMarketUpdateNewsletterPrompt,
  buildCustomNewsletterPrompt,
} from "@/lib/newsletter-prompts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractFirstName(displayName: string | null): string {
  if (displayName) return displayName.split(/\s+/)[0] ?? displayName;
  return "your agent";
}

function currentMonthYear(): string {
  return new Date().toLocaleDateString("en-CA", { month: "long", year: "numeric" });
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const proCheck = await requirePro(supabase, user.id);
  if (!proCheck.allowed) return proCheck.response!;

  // Check sandbox mode
  const { data: sandboxCheck } = await supabase.from("user_settings").select("sandbox_mode").eq("user_id", user.id).single();
  if (sandboxCheck?.sandbox_mode === true) {
    return NextResponse.json({ error: "Action blocked in Sandbox Mode" }, { status: 403 });
  }

  // Rate limit: 10 newsletters drafted per hour
  const rl = await checkRateLimit(user.id, "draft_newsletter", 10, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. You can draft up to 10 newsletters per hour." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  // ── Parse body ────────────────────────────────────────────────────────────

  let body: {
    template_type?: string;
    // boc_rate_change
    old_rate?:       number;
    new_rate?:       number;
    effective_date?: string;
    // custom
    topic?:          string;
    // shared
    notes?:          string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { template_type } = body;

  const VALID_TYPES: NewsletterTemplateType[] = ["boc_rate_change", "market_update", "custom"];
  if (!template_type || !VALID_TYPES.includes(template_type as NewsletterTemplateType)) {
    return NextResponse.json(
      { error: `template_type must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  const tmplType = template_type as NewsletterTemplateType;

  // ── Validate per-template required fields ────────────────────────────────

  if (tmplType === "boc_rate_change") {
    if (body.old_rate == null || body.new_rate == null) {
      return NextResponse.json(
        { error: "old_rate and new_rate are required for boc_rate_change" },
        { status: 400 },
      );
    }
  }

  if (tmplType === "custom") {
    if (!body.topic?.trim()) {
      return NextResponse.json(
        { error: "topic is required for custom newsletters" },
        { status: 400 },
      );
    }
  }

  // ── Fetch user settings + (for market_update) board data in parallel ──────

  const settingsPromise = supabase
    .from("user_settings")
    .select("display_name, email_signature, board_code, board_subregion")
    .eq("user_id", user.id)
    .single();

  const marketPromise = tmplType === "market_update"
    ? supabase
        .from("market_data_points")
        .select(
          "benchmark_price, avg_price, sales, new_listings, months_of_inventory, yoy_price_pct, yoy_sales_pct, geo_name, period_label",
        )
        .eq("user_id", user.id)
        .order("retrieved_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const [settingsRes, marketRes] = await Promise.all([settingsPromise, marketPromise]);

  const agentFirst     = extractFirstName(settingsRes.data?.display_name ?? null);
  const emailSignature = (settingsRes.data?.email_signature as string) ?? "";
  const boardCode      = (settingsRes.data?.board_code as string) ?? "";

  // ── Build template context + prompt ──────────────────────────────────────

  let context: Record<string, unknown>;
  let prompt: string;

  switch (tmplType) {
    case "boc_rate_change": {
      const oldRate      = Number(body.old_rate);
      const newRate      = Number(body.new_rate);
      const effectiveDate = body.effective_date
        ?? new Date().toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" });
      const notes = body.notes?.trim() || null;

      context = { old_rate: oldRate, new_rate: newRate, effective_date: effectiveDate, notes };
      prompt  = buildBocRateChangeNewsletterPrompt(agentFirst, oldRate, newRate, effectiveDate, notes);
      break;
    }

    case "market_update": {
      const marketData = marketRes.data;
      const boardName  = marketData?.geo_name ?? boardCode ?? "Your Local Market";
      const monthYear  = marketData?.period_label ?? currentMonthYear();

      const stats: MarketStats = {
        benchmark_price:     marketData?.benchmark_price     ?? null,
        avg_price:           marketData?.avg_price           ?? null,
        sales:               marketData?.sales               ?? null,
        new_listings:        marketData?.new_listings        ?? null,
        months_of_inventory: marketData?.months_of_inventory ?? null,
        yoy_price_pct:       marketData?.yoy_price_pct       ?? null,
        yoy_sales_pct:       marketData?.yoy_sales_pct       ?? null,
      };

      context = { board_name: boardName, board_code: boardCode, month_year: monthYear, ...stats };
      prompt  = buildMarketUpdateNewsletterPrompt(agentFirst, boardName, monthYear, stats);
      break;
    }

    case "custom": {
      const topic = body.topic!.trim();
      const notes = body.notes?.trim() || null;
      context = { topic, notes };
      prompt  = buildCustomNewsletterPrompt(agentFirst, topic, notes);
      break;
    }
  }

  // ── Insert draft row ──────────────────────────────────────────────────────

  const { data: inserted, error: insertError } = await supabase
    .from("newsletter_queue")
    .insert({
      user_id:       user.id,
      template_type: tmplType,
      context,
      status:        "draft",
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("[draft-newsletter] Insert error:", insertError);
    return NextResponse.json({ error: "Failed to create newsletter" }, { status: 500 });
  }

  const newsletterId = inserted.id;

  // ── Draft via Groq ────────────────────────────────────────────────────────

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    return NextResponse.json(
      { newsletter_id: newsletterId, status: "queued" },
      { status: 202, headers: rateLimitHeaders(rl) },
    );
  }

  try {
    const groq = new OpenAI({
      apiKey:  groqKey,
      baseURL: "https://api.groq.com/openai/v1",
    });

    const completion = await groq.chat.completions.create({
      model:       "llama-3.3-70b-versatile",
      max_tokens:  700,   // newsletters are longer than individual outreach
      temperature: 0.80,
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
      .from("newsletter_queue")
      .update({ ai_subject, ai_body, status: "ready" })
      .eq("id", newsletterId);

    return NextResponse.json(
      { newsletter_id: newsletterId, status: "created" },
      { status: 201, headers: rateLimitHeaders(rl) },
    );
  } catch (err) {
    console.error("[draft-newsletter] Groq error:", err);
    // Row is inserted but not drafted — cron or retry will pick it up
    return NextResponse.json(
      { newsletter_id: newsletterId, status: "queued" },
      { status: 202, headers: rateLimitHeaders(rl) },
    );
  }
}
