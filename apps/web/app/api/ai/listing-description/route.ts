/**
 * POST /api/ai/listing-description
 *
 * Generates a polished property listing description + paired social post
 * from transaction specs. Uses Claude Sonnet for high-quality creative writing.
 *
 * Input: { client_record_id, client_id? } or { specs: { address, bedrooms, ... } }
 * Optional: { no_emoji: true }
 * Output: { description, social_post }
 *
 * Core drafting logic lives in @/lib/ai/draft-services. The Flight Crew
 * `draftListingDescription` tool calls the same service helper.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { requirePro } from "@/lib/require-pro";
import { draftListingDescription, type PropertySpecs } from "@/lib/ai/draft-services";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const proCheck = await requirePro(supabase, user.id);
  if (!proCheck.allowed) return proCheck.response!;

  const rl = await checkRateLimit(user.id, "listing_description", 20, 60);
  if (!rl.allowed) {
    return new Response("Too many requests. Please wait before sending more messages.", {
      status: 429,
      headers: rateLimitHeaders(rl),
    });
  }

  if (!process.env.ANTHROPIC_API_KEY && !process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: "AI service not configured" }, { status: 503 });
  }

  let body: {
    no_emoji?: boolean;
    client_record_id?: string;
    client_id?: string;
    specs?: PropertySpecs;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const noEmoji = body.no_emoji === true;

  const result = await draftListingDescription({
    supabase,
    userId: user.id,
    clientRecordId: body.client_record_id,
    clientId: body.client_id,
    specs: body.specs as PropertySpecs | undefined,
    noEmoji,
  });

  if ("error" in result) {
    // Map known validation errors to appropriate HTTP codes
    const lower = result.error.toLowerCase();
    if (lower.includes("not found")) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    if (lower.includes("provide") || lower.includes("not enough")) {
      return NextResponse.json({ error: result.error }, { status: lower.includes("provide") ? 400 : 422 });
    }
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    description: result.description,
    social_post: result.socialPost,
  });
}
