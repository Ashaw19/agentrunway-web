import { NextResponse, NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Simple in-memory rate limit: max 5 signups per IP per 15 minutes
const ipCounts = new Map<string, { count: number; resetAt: number }>();
const RL_MAX = 5;
const RL_WINDOW_MS = 15 * 60 * 1000;

function checkIpRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    ipCounts.set(ip, { count: 1, resetAt: now + RL_WINDOW_MS });
    return true;
  }
  if (entry.count >= RL_MAX) return false;
  entry.count++;
  return true;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkIpRateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests — please try again later." }, { status: 429 });
  }

  let email: string;
  let source = "website";
  let name: string | undefined;
  let brokerage: string | undefined;
  try {
    const body = await request.json();
    email = body.email;
    source = body.source ?? "website";
    name = body.name;
    brokerage = body.brokerage;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof email === "string") email = email.trim();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "A valid email address is required." },
      { status: 400 }
    );
  }

  // Use the service-role key so we can bypass RLS on email_signups
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase
    .from("email_signups")
    .upsert(
      {
        email: email.toLowerCase().trim(),
        source,
        ...(name?.trim() ? { name: name.trim() } : {}),
        ...(brokerage?.trim() ? { brokerage: brokerage.trim() } : {}),
      },
      { onConflict: "email" }
    );

  if (error) {
    console.error("[subscribe] upsert error:", error.message);
    return NextResponse.json(
      { error: "Could not save your email. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
