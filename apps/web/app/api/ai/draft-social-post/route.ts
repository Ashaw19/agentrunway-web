/**
 * POST /api/ai/draft-social-post
 *
 * On-demand social media post drafting — agent picks a template (or "custom"),
 * supplies optional context, and Claude Sonnet produces a 150–250 word
 * platform-agnostic post (LinkedIn / Facebook / Instagram). Drafts only:
 * nothing is auto-published.
 *
 * Inputs:
 *   {
 *     template: "listing_announcement" | "just_sold" | "open_house"
 *             | "market_update" | "client_win" | "custom",
 *     context?: string,         // free-form notes the agent wants reflected
 *     client_name?: string,     // optional — if the post references a client
 *     property_address?: string // optional — if the post references a listing
 *   }
 *
 * Output:
 *   200 { draft: string }       — drafted social post text (with hashtags)
 *   400 { error }               — validation failure
 *   401                         — unauthenticated
 *   403                         — non-Pro
 *   429                         — rate limited (10/hr)
 *   500                         — internal error
 *   503                         — AI not configured
 *
 * Rate-limited to 10 posts/hour per user (endpoint key: "draft_social_post").
 * No DB write — social posts have no persistence table; the draft is returned
 * inline and the agent copies it to whichever platform they're posting on.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { requirePro } from "@/lib/require-pro";
import { draftSocialPost, type SocialPostTemplate } from "@/lib/ai/draft-services";

const VALID_TEMPLATES: SocialPostTemplate[] = [
  "listing_announcement",
  "just_sold",
  "open_house",
  "market_update",
  "client_win",
  "custom",
];

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const proCheck = await requirePro(supabase, user.id);
  if (!proCheck.allowed) return proCheck.response!;

  const rl = await checkRateLimit(user.id, "draft_social_post", 10, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. You can draft up to 10 social posts per hour." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  if (!process.env.ANTHROPIC_API_KEY && !process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: "AI service not configured" }, { status: 503 });
  }

  let body: {
    template?: string;
    context?: string;
    client_name?: string;
    property_address?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { template, context, client_name, property_address } = body;

  if (!template || !VALID_TEMPLATES.includes(template as SocialPostTemplate)) {
    return NextResponse.json(
      { error: `template must be one of: ${VALID_TEMPLATES.join(", ")}` },
      { status: 400 },
    );
  }

  if (template === "custom" && !context?.trim()) {
    return NextResponse.json(
      { error: "context is required for custom social posts" },
      { status: 400 },
    );
  }

  try {
    const draft = await draftSocialPost({
      userId: user.id,
      template: template as SocialPostTemplate,
      context: context?.trim() || null,
      clientName: client_name?.trim() || null,
      propertyAddress: property_address?.trim() || null,
    });

    if (!draft) {
      return NextResponse.json(
        { error: "Failed to generate social post" },
        { status: 500, headers: rateLimitHeaders(rl) },
      );
    }

    return NextResponse.json({ draft }, { headers: rateLimitHeaders(rl) });
  } catch (err) {
    console.error("[draft-social-post] AI error:", err);
    return NextResponse.json(
      { error: "Failed to generate social post" },
      { status: 500, headers: rateLimitHeaders(rl) },
    );
  }
}
