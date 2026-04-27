import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkPublicRateLimit, ipKey, rateLimitHeaders } from "@/lib/rate-limit";

/**
 * GET /api/testimonials — Fetch approved testimonials (public)
 */
export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("testimonials")
    .select("id, name, title, quote, rating, source, created_at")
    .eq("approved", true)
    .order("featured", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("[testimonials] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch testimonials" },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}

/**
 * POST /api/testimonials — Submit a new testimonial (public, attaches user_id if logged in)
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Rate-limit by IP (unauthenticated endpoint) — use forwarded IP or fallback.
    // Hashed and stored in public_rate_limits (auth-keyed rate_limits has a
    // UUID FK to auth.users that rejects raw IP strings — silent fail-open).
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
    const rl = await checkPublicRateLimit(await ipKey(ip), "testimonials_submit", 5, 60); // 5 per hour
    if (!rl.allowed) {
      return new Response("Too many submissions. Please try again later.", {
        status: 429,
        headers: rateLimitHeaders(rl),
      });
    }

    const body = await req.json();
    const { name, title, quote, rating, source } = body as {
      name?: string;
      title?: string;
      quote?: string;
      rating?: number;
      source?: string;
    };

    // Validate required fields
    if (!name?.trim() || !quote?.trim()) {
      return NextResponse.json(
        { error: "Name and review are required" },
        { status: 400 }
      );
    }

    // Validate rating
    const ratingNum = rating ?? 5;
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return NextResponse.json(
        { error: "Rating must be between 1 and 5" },
        { status: 400 }
      );
    }

    // Length guards
    if (name.length > 255 || (title && title.length > 255) || quote.length > 5000) {
      return NextResponse.json(
        { error: "One or more fields exceed maximum length" },
        { status: 400 }
      );
    }

    // Try to get logged-in user (optional)
    let userId: string | null = null;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
    }

    const { error: insertErr } = await supabase.from("testimonials").insert({
      user_id: userId,
      name: name.trim(),
      title: title?.trim() || null,
      quote: quote.trim(),
      rating: ratingNum,
      source: source?.trim() || "website",
    });

    if (insertErr) {
      console.error("[testimonials] Insert error:", insertErr);
      return NextResponse.json(
        { error: "Failed to submit review" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Thank you for your review! It will appear on our site once approved.",
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
