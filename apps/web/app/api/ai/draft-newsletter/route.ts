/**
 * POST /api/ai/draft-newsletter
 *
 * On-demand newsletter drafting — agent clicks "Draft with AI" in Flight
 * Control OR the Flight Crew Captain calls `draftNewsletter`. Picks a
 * template, fills in context, Claude produces a broadcast email.
 *
 * Supported template_type values:
 *   boc_rate_change  — { old_rate: number, new_rate: number, effective_date?: string, notes?: string }
 *   custom           — { topic: string, notes?: string }
 *
 * Response:
 *   201 { newsletter_id, status: "created" }   — drafted and ready
 *   202 { newsletter_id, status: "queued"  }   — inserted but Claude unavailable
 *   400 { error }                              — validation failure
 *   401                                        — unauthenticated
 *   429                                        — rate limited (10/hr)
 *   500                                        — internal error
 *
 * Rate-limited to 10 newsletters/hour per user (endpoint key: "draft_newsletter").
 *
 * Core drafting logic lives in @/lib/ai/draft-services. The Flight Crew
 * `draftNewsletter` tool calls the same service helper.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { requirePro } from "@/lib/require-pro";
import type { NewsletterTemplateType } from "@agent-runway/core/types/database";
import { draftNewsletter } from "@/lib/ai/draft-services";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const proCheck = await requirePro(supabase, user.id);
  if (!proCheck.allowed) return proCheck.response!;

  const rl = await checkRateLimit(user.id, "draft_newsletter", 10, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. You can draft up to 10 newsletters per hour." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  let body: {
    template_type?: string;
    old_rate?: number;
    new_rate?: number;
    effective_date?: string;
    topic?: string;
    notes?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { template_type } = body;
  const VALID_TYPES: NewsletterTemplateType[] = ["boc_rate_change", "custom"];
  if (!template_type || !VALID_TYPES.includes(template_type as NewsletterTemplateType)) {
    return NextResponse.json(
      { error: `template_type must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  const result = await draftNewsletter({
    supabase,
    userId: user.id,
    templateType: template_type as NewsletterTemplateType,
    oldRate: body.old_rate,
    newRate: body.new_rate,
    effectiveDate: body.effective_date,
    topic: body.topic,
    notes: body.notes,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  if (result.status === "queued") {
    return NextResponse.json(
      { newsletter_id: result.newsletterId, status: "queued" },
      { status: 202, headers: rateLimitHeaders(rl) },
    );
  }

  return NextResponse.json(
    { newsletter_id: result.newsletterId, status: "created" },
    { status: 201, headers: rateLimitHeaders(rl) },
  );
}
