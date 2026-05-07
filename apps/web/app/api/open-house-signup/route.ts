import { NextResponse, NextRequest } from "next/server";
import { createClient }              from "@supabase/supabase-js";
import { resend, FROM_ADDRESS }      from "@/lib/resend";

/**
 * POST /api/open-house-signup
 *
 * Handles a visitor registration on a branded open house page.
 *
 * Steps:
 *   1. Validate body: slug, name, email, consent
 *   2. Look up agent_open_houses by slug (service-role — anon can't write)
 *   3. Upsert to email_signups (marketing CASL list, by email)
 *   4. Insert to consents (CASL audit trail)
 *   5. Upsert to clients (agent's CRM, Boarding stage)
 *   6. Send Resend notification to the agent (non-fatal)
 *
 * Rate limit: 5 requests per IP per 15 minutes (shared with /api/subscribe).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Simple in-memory rate limit (same shape as /api/subscribe)
const ipCounts = new Map<string, { count: number; resetAt: number }>();
const RL_MAX        = 5;
const RL_WINDOW_MS  = 15 * 60 * 1000;

function checkIpRateLimit(ip: string): boolean {
  const now   = Date.now();
  const entry = ipCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    ipCounts.set(ip, { count: 1, resetAt: now + RL_WINDOW_MS });
    return true;
  }
  if (entry.count >= RL_MAX) return false;
  entry.count++;
  return true;
}

// ── Notification email ────────────────────────────────────────────────────────

function buildNotificationEmail(
  agentName:   string,
  visitorName:  string,
  visitorEmail: string,
  visitorPhone: string | null,
  address:      string,
): { subject: string; html: string; text: string } {
  const subjectAddr = address ? ` — ${address}` : "";
  const subject = `New open house registration${subjectAddr}: ${visitorName}`;

  const phoneRow = visitorPhone
    ? `<tr><td style="padding:4px 0;color:#94a3b8;font-size:13px">Phone</td><td style="padding:4px 0 4px 12px;color:#e2e8f0;font-size:13px">${visitorPhone}</td></tr>`
    : "";
  const phoneTxt = visitorPhone ? `\nPhone: ${visitorPhone}` : "";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:40px 24px">
  <div style="max-width:520px;margin:0 auto">
    <p style="font-size:13px;color:#64748b;margin:0 0 24px">Agent Runway · Open House Notification</p>
    <h1 style="font-size:20px;font-weight:700;color:#fff;margin:0 0 6px">New registration${subjectAddr}</h1>
    <p style="font-size:15px;color:#94a3b8;margin:0 0 24px">A visitor just signed in to your open house page.</p>
    <div style="background:#1e293b;border-radius:12px;padding:20px 24px;margin:0 0 24px">
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:4px 0;color:#94a3b8;font-size:13px">Name</td><td style="padding:4px 0 4px 12px;color:#e2e8f0;font-size:13px">${visitorName}</td></tr>
        <tr><td style="padding:4px 0;color:#94a3b8;font-size:13px">Email</td><td style="padding:4px 0 4px 12px;color:#e2e8f0;font-size:13px"><a href="mailto:${visitorEmail}" style="color:#60a5fa">${visitorEmail}</a></td></tr>
        ${phoneRow}
        ${address ? `<tr><td style="padding:4px 0;color:#94a3b8;font-size:13px">Property</td><td style="padding:4px 0 4px 12px;color:#e2e8f0;font-size:13px">${address}</td></tr>` : ""}
      </table>
    </div>
    <p style="font-size:13px;color:#64748b;margin:0">
      This contact has been added to your Flight Control CRM at the Boarding stage.
      Log in to <a href="https://agentrunway.ca/crm" style="color:#60a5fa">Agent Runway</a> to see their record and follow up.
    </p>
  </div>
</body>
</html>
  `.trim();

  const text = [
    `New open house registration — ${visitorName}`,
    "",
    `Name:  ${visitorName}`,
    `Email: ${visitorEmail}`,
    phoneTxt,
    address ? `Property: ${address}` : "",
    "",
    "This contact has been added to your Flight Control CRM at the Boarding stage.",
    "Log in to agentrunway.ca/crm to follow up.",
  ]
    .filter((l) => l !== null)
    .join("\n");

  return { subject, html, text };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkIpRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many requests — please try again later." },
      { status: 429 },
    );
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let slug:           string;
  let name:           string;
  let email:          string;
  let phone:          string | null;
  let consent:        boolean;
  let consentLanguage: string;
  let formUrl:        string;

  try {
    const body = await request.json() as {
      slug:             string;
      name:             string;
      email:            string;
      phone?:           string | null;
      consent:          boolean;
      consent_language: string;
      form_url:         string;
    };
    slug           = String(body.slug ?? "").trim();
    name           = String(body.name ?? "").trim();
    email          = String(body.email ?? "").trim().toLowerCase();
    phone          = body.phone?.trim() || null;
    consent        = body.consent === true;
    consentLanguage = String(body.consent_language ?? "").trim();
    formUrl        = String(body.form_url ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!slug)          return NextResponse.json({ error: "Slug is required." },             { status: 400 });
  if (!name)          return NextResponse.json({ error: "Name is required." },              { status: 400 });
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }
  if (!consent || !consentLanguage) {
    return NextResponse.json({ error: "Consent is required." }, { status: 400 });
  }

  // ── Service-role client (bypasses RLS for writes) ─────────────────────────
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // ── 1. Look up the open house page ────────────────────────────────────────
  const { data: ohPage, error: ohError } = await supabase
    .from("agent_open_houses")
    .select("user_id, agent_display_name, agent_email, property_address, property_city, property_province")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (ohError || !ohPage) {
    console.error("[open-house-signup] page lookup failed:", ohError?.message ?? "not found");
    return NextResponse.json({ error: "Open house page not found." }, { status: 404 });
  }

  const agentUserId  = ohPage.user_id as string;
  const agentName    = ohPage.agent_display_name as string;
  const agentEmail   = ohPage.agent_email as string;
  const address      = [ohPage.property_address, ohPage.property_city, ohPage.property_province]
    .filter(Boolean)
    .join(", ");
  const source       = `open_house_${slug}`;

  // ── 2. Upsert to email_signups ────────────────────────────────────────────
  const { error: signupError } = await supabase
    .from("email_signups")
    .upsert(
      {
        email,
        source,
        name,
        ...(phone ? { brokerage: phone } : {}), // re-use brokerage field for phone until dedicated column
      },
      { onConflict: "email" },
    );

  if (signupError) {
    console.error("[open-house-signup] email_signups upsert error:", signupError.message);
    // Non-fatal — continue to write CRM record
  }

  // ── 3. CASL consent audit trail ───────────────────────────────────────────
  const { error: consentError } = await supabase
    .from("consents")
    .insert({
      email,
      form_type:        source,
      ip_address:       ip,
      consent_language: consentLanguage,
      form_url:         formUrl || null,
    });

  if (consentError) {
    console.error("[open-house-signup] consent insert error:", consentError.message);
    // Non-fatal — CASL gap logged but user is not blocked
  }

  // ── 4. Upsert client to agent's CRM (Boarding stage) ─────────────────────
  const nameSearch = name.toLowerCase().trim();

  const { data: existingClient } = await supabase
    .from("clients")
    .select("id")
    .eq("user_id", agentUserId)
    .eq("name_search", nameSearch)
    .maybeSingle();

  if (!existingClient) {
    // Split name heuristically into first / last for the CRM record
    const parts     = name.trim().split(/\s+/);
    const firstName = parts.length > 1 ? parts.slice(0, -1).join(" ") : null;
    const lastName  = parts[parts.length - 1] ?? name.trim();

    const { error: clientError } = await supabase
      .from("clients")
      .insert({
        user_id:          agentUserId,
        name:             name.trim(),
        name_search:      nameSearch,
        first_name:       firstName,
        last_name:        lastName,
        email:            email || null,
        phone:            phone || null,
        status:           "boarding",
        lead_source:      "Open House",
        notes:            `Registered at open house${address ? ` — ${address}` : ""}. Source: ${source}.`,
        country:          "Canada",
        preferred_contact: "email",
        tags:             ["Open House"],
      });

    if (clientError) {
      // Unique constraint race (two submissions for same name) — safe to ignore
      if (!clientError.message.includes("unique") && clientError.code !== "23505") {
        console.error("[open-house-signup] clients insert error:", clientError.message);
      }
    }
  }
  // If client already exists, leave them as-is (no overwrite)

  // ── 5. Notify agent via Resend ────────────────────────────────────────────
  if (resend && agentEmail) {
    const { subject, html, text } = buildNotificationEmail(
      agentName,
      name,
      email,
      phone,
      address,
    );
    try {
      await resend.emails.send({
        from:    FROM_ADDRESS,
        to:      agentEmail,
        subject,
        html,
        text,
      });
    } catch (err) {
      console.error("[open-house-signup] notification email failed:", err instanceof Error ? err.message : err);
      // Non-fatal
    }
  }

  return NextResponse.json({ success: true });
}
