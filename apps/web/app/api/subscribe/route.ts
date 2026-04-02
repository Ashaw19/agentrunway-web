import { NextResponse, NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resend, FROM_ADDRESS } from "@/lib/resend";
import { charterWelcomeEmail } from "@/lib/emails/charter-welcome";

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
  console.log("[subscribe] ▶ POST hit");

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkIpRateLimit(ip)) {
    console.log("[subscribe] ✗ rate-limited", ip);
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
    console.log("[subscribe] parsed body:", { email, source, name: name ?? "(none)", brokerage: brokerage ?? "(none)" });
  } catch {
    console.error("[subscribe] ✗ invalid request body");
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
    console.error("[subscribe] ✗ upsert error:", error.message);
    return NextResponse.json(
      { error: "Could not save your email. Please try again." },
      { status: 500 }
    );
  }

  console.log("[subscribe] ✓ upsert success for", email.toLowerCase().trim());

  // Send charter welcome email for waitlist signups
  console.log("[subscribe] email check:", {
    source,
    resendAvailable: !!resend,
    resendApiKeySet: !!process.env.RESEND_API_KEY,
    willSendEmail: source === "waitlist_event" && !!resend,
  });

  if (source === "waitlist_event" && resend) {
    const firstName = name?.trim()?.split(" ")[0] ?? null;
    const { subject, html, text } = charterWelcomeEmail({ firstName });

    console.log("[subscribe] ▶ sending charter welcome email to", email.toLowerCase().trim());

    // Await the send so we can log the result before returning
    try {
      const result = await resend.emails.send({
        from: FROM_ADDRESS,
        to: email.toLowerCase().trim(),
        subject,
        html,
        text,
      });
      console.log("[subscribe] ✓ charter welcome email sent:", JSON.stringify(result));
    } catch (err) {
      console.error("[subscribe] ✗ charter welcome email failed:", err);
    }
  } else if (source === "waitlist_event" && !resend) {
    console.warn("[subscribe] ⚠ source is waitlist_event but resend is null — RESEND_API_KEY not set in environment");
  }

  return NextResponse.json({ success: true });
}
