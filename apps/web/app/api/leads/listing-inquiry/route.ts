import { NextResponse, NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resend, FROM_ADDRESS } from "@/lib/resend";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[\d\s\-+().]{7,20}$/;

const CONSENT_LANGUAGE =
  "I agree to receive marketing communications from Agent Runway Inc. I can unsubscribe at any time.";

// 5 submissions per IP per 15 minutes
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
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  if (!checkIpRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many requests — please try again later." },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // Honeypot — bots fill hidden fields, humans don't
  if (body.website) {
    return NextResponse.json({ success: true }); // silent accept
  }

  // Submission time-check — reject if form was submitted in under 2 seconds
  const submittedAt = typeof body.formLoadedAt === "number" ? body.formLoadedAt : 0;
  if (submittedAt && Date.now() - submittedAt < 2000) {
    return NextResponse.json({ success: true }); // silent accept
  }

  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const propertyAddress =
    typeof body.propertyAddress === "string" ? body.propertyAddress.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const consent = body.consent === true;
  const formUrl = typeof body.formUrl === "string" ? body.formUrl : "/tools/listing-inquiry";

  if (!firstName || firstName.length > 100) {
    return NextResponse.json({ error: "First name is required." }, { status: 400 });
  }
  if (!lastName || lastName.length > 100) {
    return NextResponse.json({ error: "Last name is required." }, { status: 400 });
  }
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }
  if (phone && !PHONE_RE.test(phone)) {
    return NextResponse.json({ error: "Phone number format is invalid." }, { status: 400 });
  }
  if (message.length > 2000) {
    return NextResponse.json({ error: "Message is too long." }, { status: 400 });
  }
  if (!consent) {
    return NextResponse.json(
      { error: "Please accept the consent checkbox to continue." },
      { status: 400 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error: submissionError } = await supabase.from("lead_submissions").insert({
    form_type: "listing_inquiry",
    first_name: firstName,
    last_name: lastName,
    email,
    phone: phone || null,
    property_address: propertyAddress || null,
    message: message || null,
  });

  if (submissionError) {
    console.error("[leads/listing-inquiry] ✗ insert error:", submissionError.message);
    return NextResponse.json(
      { error: "Could not save your submission. Please try again." },
      { status: 500 }
    );
  }

  const { error: consentError } = await supabase.from("consents").insert({
    email,
    form_type: "listing_inquiry",
    ip_address: ip,
    consent_language: CONSENT_LANGUAGE,
    form_url: formUrl,
  });

  if (consentError) {
    console.error("[leads/listing-inquiry] ✗ consent insert error:", consentError.message);
  }

  // Notify Andrew
  if (resend) {
    try {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: "andrew@andrewdshaw.ca",
        subject: `New listing inquiry — ${firstName} ${lastName}`,
        html: `
          <p><strong>New listing inquiry via Agent Runway</strong></p>
          <table cellpadding="6" style="border-collapse:collapse;font-size:14px">
            <tr><td><strong>Name</strong></td><td>${firstName} ${lastName}</td></tr>
            <tr><td><strong>Email</strong></td><td>${email}</td></tr>
            ${phone ? `<tr><td><strong>Phone</strong></td><td>${phone}</td></tr>` : ""}
            ${propertyAddress ? `<tr><td><strong>Property</strong></td><td>${propertyAddress}</td></tr>` : ""}
            ${message ? `<tr><td><strong>Message</strong></td><td>${message}</td></tr>` : ""}
          </table>
          <p style="color:#888;font-size:12px;margin-top:16px">Consent recorded. IP: ${ip}</p>
        `,
        text: `New listing inquiry\n\nName: ${firstName} ${lastName}\nEmail: ${email}${phone ? `\nPhone: ${phone}` : ""}${propertyAddress ? `\nProperty: ${propertyAddress}` : ""}${message ? `\nMessage: ${message}` : ""}\n\nConsent recorded. IP: ${ip}`,
      });
    } catch (err) {
      console.error("[leads/listing-inquiry] ✗ notification email failed:", err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ success: true });
}
