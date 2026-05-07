import { NextResponse, NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resend, FROM_ADDRESS } from "@/lib/resend";
import { charterWelcomeEmail } from "@/lib/emails/charter-welcome";
import { cheatSheetDeliveryEmail } from "@/lib/emails/cheat-sheet-delivery";
import { buildMarketingUnsubscribeUrl } from "@/lib/email-tokens";

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
  let consent = false;
  let consentLanguage: string | undefined;
  let formUrl: string | undefined;
  try {
    const body = await request.json();
    email = body.email;
    source = body.source ?? "website";
    name = body.name;
    brokerage = body.brokerage;
    consent = body.consent === true;
    consentLanguage =
      typeof body.consent_language === "string" ? body.consent_language : undefined;
    formUrl = typeof body.form_url === "string" ? body.form_url : undefined;
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

  // CASL: every subscribe path must arrive with consent=true and a consent_language
  // string. The waitlist form requires a checkbox; the inline email-capture component
  // sends consent=true based on the disclosure-near-submit pattern. Anything missing
  // these fields is a misconfigured caller and we reject rather than silently subscribing.
  if (!consent || !consentLanguage) {
    return NextResponse.json(
      { error: "Consent is required to subscribe." },
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

  // CASL audit trail — write to consents on every successful subscribe.
  // Stores the exact consent language string (not just a boolean), IP, timestamp,
  // form URL, and form type. 3-year retention per CASL.
  const { error: consentError } = await supabase.from("consents").insert({
    email: email.toLowerCase().trim(),
    form_type: source,
    ip_address: ip,
    consent_language: consentLanguage,
    form_url: formUrl ?? null,
  });

  if (consentError) {
    // Non-fatal: log so the audit gap is visible but don't block the user.
    console.error("[subscribe] ✗ consent insert error:", consentError.message);
  }


  const normalizedEmail = email.toLowerCase().trim();
  const unsubscribeUrl = buildMarketingUnsubscribeUrl(normalizedEmail);

  // Send charter welcome email for waitlist signups (awaited to prevent Vercel lambda termination)
  if (source === "waitlist_event" && resend) {
    const firstName = name?.trim()?.split(" ")[0] ?? null;
    const { subject, html, text } = charterWelcomeEmail({ firstName, unsubscribeUrl });

    try {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: email.toLowerCase().trim(),
        subject,
        html,
        text,
      });
    } catch (err) {
      console.error(`[subscribe] ✗ email FAILED |`, err instanceof Error ? err.message : err);
    }
  } else if (source === "waitlist_event" && !resend) {
    console.warn("[subscribe] ⚠ RESEND_API_KEY NOT SET — email skipped");
  }

  // Send cheat-sheet delivery email for any cheat_sheet_* source.
  // Sources include cheat_sheet_landing (dedicated /tools landing page) and
  // cheat_sheet_inline_<article-slug> (inline CTA on tax-domain SEO articles).
  if (source.startsWith("cheat_sheet_") && resend) {
    const firstName = name?.trim()?.split(" ")[0] ?? null;
    const { subject, html, text } = cheatSheetDeliveryEmail({ firstName, unsubscribeUrl });

    try {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: email.toLowerCase().trim(),
        subject,
        html,
        text,
      });
    } catch (err) {
      console.error(`[subscribe] ✗ cheat-sheet email FAILED |`, err instanceof Error ? err.message : err);
    }
  } else if (source.startsWith("cheat_sheet_") && !resend) {
    console.warn("[subscribe] ⚠ RESEND_API_KEY NOT SET — cheat-sheet email skipped");
  }

  return NextResponse.json({ success: true });
}
