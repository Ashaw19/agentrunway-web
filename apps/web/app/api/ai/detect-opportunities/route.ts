/**
 * POST /api/ai/detect-opportunities
 *
 * AI Flight Control — opportunity detector + message drafter.
 *
 * Scans the authenticated user's client data for three types of outreach moments:
 *   1. closing_anniversary — 1 / 2 / 3 / 5 / 10 year milestone within 14 days
 *   2. idle_client          — no deal in 18+ months (max one alert per client/month)
 *   3. birthday             — upcoming birthday within 14 days
 *
 * For every newly detected opportunity it:
 *   a) UPSERTs a row into outreach_queue (UNIQUE constraint prevents duplicates)
 *   b) Calls Groq llama-3.3-70b-versatile to draft a personalised email
 *   c) Updates the row to status='ready' with ai_subject + ai_body
 *
 * Limited to 8 draft calls per invocation to keep response time < 20 s.
 * Gracefully degrades if GROQ_API_KEY is not set.
 *
 * Also exported: detectAndDraftForUser() for use by the cron wrapper.
 */

import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { createClient }       from "@/lib/supabase/server";
import { createAdminClient as _createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import type { OutreachQueueItem } from "@agent-runway/core/types/database";
import type { SupabaseClient }    from "@supabase/supabase-js";

// ── Constants ─────────────────────────────────────────────────────────────────

const ANNIVERSARY_YEARS  = [1, 2, 3, 5, 10];
const WINDOW_DAYS        = 14;   // detect N days in advance
const IDLE_MONTHS        = 18;   // flag clients idle > this many months
const MAX_DRAFTS_PER_RUN = 8;    // max Groq calls per invocation

// ── Date helpers ──────────────────────────────────────────────────────────────

function addYears(isoDate: string, years: number): Date {
  const d = new Date(isoDate + "T12:00:00");
  d.setFullYear(d.getFullYear() + years);
  return d;
}

function daysUntil(target: Date): number {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function monthsAgoDate(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

function nextBirthdayDate(birthdate: string): Date {
  const today = new Date();
  const [, mmdd] = birthdate.split(/-(.+)/); // "1990-03-21" → "03-21"
  const candidate = new Date(`${today.getFullYear()}-${mmdd}T12:00:00`);
  if (isNaN(candidate.getTime())) return candidate; // guard malformed dates
  if (candidate < today) candidate.setFullYear(today.getFullYear() + 1);
  return candidate;
}

function monthsIdleLabel(lastDeal: string): string {
  const months = Math.floor(
    (Date.now() - new Date(lastDeal + "T12:00:00").getTime()) / (1000 * 60 * 60 * 24 * 30),
  );
  return `${months} month${months !== 1 ? "s" : ""}`;
}

// ── Agent first name ──────────────────────────────────────────────────────────

function extractFirstName(displayName: string | null, email: string): string {
  if (displayName) return displayName.split(/\s+/)[0] ?? displayName;
  return email.split("@")[0].replace(/[._-]/g, " ").split(" ")[0] ?? "your agent";
}

// ── Tone instructions ──────────────────────────────────────────────────────────

type Tone = "casual" | "friendly" | "professional" | "formal";

const TONE_INSTRUCTIONS: Record<Tone, string> = {
  casual: `TONE: Very casual, like texting a close friend. Use contractions freely, short sentences, maybe even humour. First names only. Think "buddy sending a quick note" — not an agent running a campaign. No formal greetings.`,
  friendly: `TONE: Warm and conversational — like a friendly neighbour who also happens to be their agent. Use contractions, keep it light, but still polished. No stiff corporate language. Write like you'd talk over coffee.`,
  professional: `TONE: Polished and respectful. Warm but business-appropriate. Use full sentences and proper structure, though contractions are fine. Reads like a trusted advisor — capable and personable.`,
  formal: `TONE: Respectful, precise, and measured. Minimal contractions. Appropriate for a high-net-worth investor or executive. Every sentence should convey competence and discretion. No slang, no emojis, no exclamation marks.`,
};

// ── Groq prompt builders ──────────────────────────────────────────────────────

function buildAnniversaryPrompt(
  agentFirst: string,
  clientName: string,
  years: number,
  address: string | null,
  province: string | null,
  tone: Tone = "friendly",
): string {
  const location = [address, province].filter(Boolean).join(", ");
  return `You are ghostwriting a personal email from a Canadian real estate agent named ${agentFirst} to their past client ${clientName}.

Context:
- Milestone: ${years}-year anniversary of the client's home purchase
- Property: ${location || "their home"}

${TONE_INSTRUCTIONS[tone]}

Write a ${years}-year closing anniversary email (3–4 short paragraphs, under 180 words total).
- DO NOT open with "I hope this email finds you well" or any cliched opener.
- DO NOT start with "Subject:" — just write the email body.
- Reference the property or neighbourhood naturally — make it feel like YOU remember.
- Include a soft CTA: offer a free home-value update or simply invite them to catch up.
- Sign off with just "${agentFirst}" — no "Best regards," no "Sincerely," no formal closing line.
- This should read like a real person wrote it in 2 minutes, not like ChatGPT generated it.
- Vary sentence length. Short sentences are powerful. Mix them in.

On the very last line of your response, write exactly:
SUBJECT: [your subject line — keep it short, personal, not clickbaity]`;
}

function buildIdlePrompt(
  agentFirst: string,
  clientName: string,
  lastDeal: string | null,
  address: string | null,
  province: string | null,
  tone: Tone = "friendly",
): string {
  const location = [address, province].filter(Boolean).join(", ");
  const month    = new Date().getMonth();
  const season   =
    month >= 2  && month <= 4  ? "spring market season"  :
    month >= 5  && month <= 7  ? "summer"                :
    month >= 8  && month <= 10 ? "fall market"           : "new year";

  return `You are ghostwriting a genuine check-in email from a Canadian real estate agent named ${agentFirst} to a past client named ${clientName} they haven't been in touch with for a while.

Context:
- Last property: ${location || "a property"}
- It's the ${season} in Canada

${TONE_INSTRUCTIONS[tone]}

Write a natural 2–3 paragraph check-in email (under 150 words) that:
- Feels like it comes from someone who actually remembers this person — not a CRM drip
- DO NOT open with "I hope this email finds you well" or similar cliches
- DO NOT start with "Subject:" — just write the email body
- Reference something real: the ${season}, their neighbourhood, life in general
- Include a relaxed CTA: coffee, a quick call, or a free home-value check
- Does NOT apologise for not reaching out sooner — just pick up naturally
- Sign off with just "${agentFirst}" — no formal closing line
- Vary sentence length. Keep it human. One-word sentences are fine.

On the very last line, write exactly:
SUBJECT: [short, casual subject — not "Checking In!" or anything generic]`;
}

function buildBirthdayPrompt(
  agentFirst: string,
  clientName: string,
  tone: Tone = "friendly",
): string {
  return `You are ghostwriting a short, warm birthday email from a Canadian real estate agent named ${agentFirst} to their past client ${clientName}.

${TONE_INSTRUCTIONS[tone]}

Write a brief 2-paragraph birthday message (under 80 words) that:
- Feels genuinely personal — like a friend remembered, not an automated system
- DO NOT mention real estate, home values, or ask for anything
- DO NOT start with "Subject:" — just write the message
- The goal: make the client smile and feel remembered
- Sign off with just "${agentFirst}" — no formal closing
- Keep it real. A birthday message that sounds like AI is worse than no message at all.

On the very last line, write exactly:
SUBJECT: [short personal birthday subject — not "Happy Birthday!" which screams auto-generated]`;
}

// ── Draft a single queue item via Groq ────────────────────────────────────────

async function draftItem(
  item:           OutreachQueueItem & { clients: { name: string; city: string | null; province_region: string | null; communication_tone?: string } | null },
  agentFirst:     string,
  emailSignature: string,
  groq:           OpenAI,
  supabase:       SupabaseClient,
): Promise<void> {
  const clientName = item.clients?.name ?? "your client";
  const ctx        = item.context as Record<string, string | number>;
  const tone       = (item.clients?.communication_tone as Tone) ?? "friendly";

  let prompt: string;
  switch (item.opportunity_type) {
    case "closing_anniversary":
      prompt = buildAnniversaryPrompt(
        agentFirst,
        clientName,
        Number(ctx.anniversary_year ?? 1),
        (ctx.address as string) ?? item.clients?.city ?? null,
        item.clients?.province_region ?? null,
        tone,
      );
      break;
    case "idle_client":
      prompt = buildIdlePrompt(
        agentFirst,
        clientName,
        (ctx.last_deal as string) ?? null,
        item.clients?.city ?? null,
        item.clients?.province_region ?? null,
        tone,
      );
      break;
    case "birthday":
      prompt = buildBirthdayPrompt(agentFirst, clientName, tone);
      break;
    default:
      return;
  }

  try {
    const completion = await groq.chat.completions.create({
      model:       "llama-3.3-70b-versatile",
      max_tokens:  400,
      temperature: 0.85,
      messages:    [{ role: "user", content: prompt }],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!raw) throw new Error("Empty response");

    // Parse: last line starting with "SUBJECT:" is the subject
    const lines   = raw.split("\n");
    const subjIdx = [...lines].reverse().findIndex((l) => l.trimStart().toUpperCase().startsWith("SUBJECT:"));
    if (subjIdx === -1) throw new Error("No SUBJECT line");

    const realSubjIdx = lines.length - 1 - subjIdx;
    const ai_subject  = lines[realSubjIdx].replace(/^SUBJECT:\s*/i, "").trim();
    let   ai_body     = lines.slice(0, realSubjIdx).join("\n").trim();

    // Append custom email signature if the agent has one configured
    if (emailSignature) {
      ai_body += `\n\n${emailSignature}`;
    }

    await supabase
      .from("outreach_queue")
      .update({ ai_subject, ai_body, status: "ready" })
      .eq("id", item.id);
  } catch (err) {
    console.error("[flight-control] Draft error for item", item.id, err);
    // Leave status as 'draft' — will retry on next scan
  }
}

// ── Core detection + drafting logic (exported for cron wrapper) ───────────────

export async function detectAndDraftForUser(
  userId:   string,
  supabase: SupabaseClient,
): Promise<{ detected: number; drafted: number }> {
  // ── Fetch data ─────────────────────────────────────────────────────────────
  const [settingsRes, clientsRes, recordsRes] = await Promise.all([
    supabase
      .from("user_settings")
      .select("display_name, email_signature")
      .eq("user_id", userId)
      .single(),
    supabase
      .from("clients")
      .select("id, name, city, province_region, birthdate")
      .eq("user_id", userId)
      .is("archived_at", null),
    supabase
      .from("client_records")
      .select("id, client_id, address, close_date, gci")
      .eq("user_id", userId)
      .not("close_date", "is", null)
      .not("client_id", "is", null),
  ]);

  const agentFirst    = extractFirstName(settingsRes.data?.display_name ?? null, "");
  const emailSignature = (settingsRes.data?.email_signature as string) ?? "";

  const clients = clientsRes.data ?? [];
  const records = recordsRes.data ?? [];
  const _clientMap = new Map(clients.map((c) => [c.id, c]));

  const inserts: object[] = [];
  const idleCutoff = monthsAgoDate(IDLE_MONTHS);

  // ── 1. Closing anniversaries ───────────────────────────────────────────────
  for (const rec of records) {
    if (!rec.close_date || !rec.client_id) continue;
    for (const years of ANNIVERSARY_YEARS) {
      const anniv = addYears(rec.close_date, years);
      const days  = daysUntil(anniv);
      if (days >= 0 && days <= WINDOW_DAYS) {
        inserts.push({
          user_id:          userId,
          client_id:        rec.client_id,
          client_record_id: rec.id,
          opportunity_type: "closing_anniversary",
          trigger_date:     toISODate(anniv),
          context: {
            anniversary_year: years,
            address:          rec.address,
            close_date:       rec.close_date,
            gci:              rec.gci,
          },
          status: "draft",
        });
      }
    }
  }

  // ── 2. Idle clients ────────────────────────────────────────────────────────
  const clientLastDeal = new Map<string, string>();
  for (const rec of records) {
    if (!rec.client_id || !rec.close_date) continue;
    const existing = clientLastDeal.get(rec.client_id);
    if (!existing || rec.close_date > existing) {
      clientLastDeal.set(rec.client_id, rec.close_date);
    }
  }
  const triggerMonthKey = firstOfMonth();
  for (const [clientId, lastDeal] of clientLastDeal.entries()) {
    if (new Date(lastDeal + "T12:00:00") < idleCutoff) {
      inserts.push({
        user_id:          userId,
        client_id:        clientId,
        opportunity_type: "idle_client",
        trigger_date:     triggerMonthKey,
        context: {
          last_deal:    lastDeal,
          months_idle:  monthsIdleLabel(lastDeal),
        },
        status: "draft",
      });
    }
  }

  // ── 3. Birthdays ───────────────────────────────────────────────────────────
  for (const client of clients) {
    if (!client.birthdate) continue;
    const birthday = nextBirthdayDate(client.birthdate);
    if (isNaN(birthday.getTime())) continue;
    const days = daysUntil(birthday);
    if (days >= 0 && days <= WINDOW_DAYS) {
      inserts.push({
        user_id:          userId,
        client_id:        client.id,
        opportunity_type: "birthday",
        trigger_date:     toISODate(birthday),
        context: { birthdate: client.birthdate },
        status: "draft",
      });
    }
  }

  // ── Upsert (UNIQUE constraint on user_id, client_id, type, trigger_date) ───
  if (inserts.length > 0) {
    await supabase
      .from("outreach_queue")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(inserts as any, {
        onConflict:       "user_id,client_id,opportunity_type,trigger_date",
        ignoreDuplicates: true,
      });
  }

  // ── AI drafting ────────────────────────────────────────────────────────────
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    return { detected: inserts.length, drafted: 0 };
  }

  const { data: undrafted } = await supabase
    .from("outreach_queue")
    .select("*, clients(name, city, province_region, communication_tone)")
    .eq("user_id", userId)
    .eq("status", "draft")
    .is("ai_subject", null)
    .order("created_at", { ascending: true })
    .limit(MAX_DRAFTS_PER_RUN);

  if (!undrafted?.length) return { detected: inserts.length, drafted: 0 };

  const groq = new OpenAI({
    apiKey:  groqKey,
    baseURL: "https://api.groq.com/openai/v1",
  });

  let drafted = 0;
  for (const item of undrafted) {
    await draftItem(
      item as OutreachQueueItem & { clients: { name: string; city: string | null; province_region: string | null; communication_tone?: string } | null },
      agentFirst,
      emailSignature,
      groq,
      supabase,
    );
    drafted++;
  }

  return { detected: inserts.length, drafted };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Allow cron calls authenticated via CRON_SECRET Bearer token
  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  const isCronCall = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!user && !isCronCall) {
    return new Response("Unauthorized", { status: 401 });
  }

  // For cron calls running as a specific userId passed in body
  let userId: string;
  if (isCronCall && !user) {
    const body = await req.json().catch(() => ({})) as { user_id?: string };
    if (!body.user_id) {
      return NextResponse.json({ error: "user_id required for cron calls" }, { status: 400 });
    }
    userId = body.user_id;
  } else {
    userId = user!.id;
  }

  // Rate limit: 10 scans/hour per user
  const rl = await checkRateLimit(userId, "detect_opportunities", 10, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Try again in a few minutes." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  try {
    const { detected, drafted } = await detectAndDraftForUser(userId, supabase);

    // Return full pending queue so the UI can refresh in one round-trip
    const { data: queue } = await supabase
      .from("outreach_queue")
      .select("*, clients(name, city, province_region, email)")
      .eq("user_id", userId)
      .in("status", ["draft", "ready"])
      .order("trigger_date", { ascending: true });

    return NextResponse.json(
      { detected, drafted, queue: queue ?? [] },
      { headers: rateLimitHeaders(rl) },
    );
  } catch (err) {
    console.error("[flight-control] detect-opportunities error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Also expose GET so the UI can load the queue without triggering a scan
export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: queue } = await supabase
    .from("outreach_queue")
    .select("*, clients(name, city, province_region, email)")
    .eq("user_id", user.id)
    .in("status", ["draft", "ready"])
    .order("trigger_date", { ascending: true });

  return NextResponse.json({ queue: queue ?? [] });
}
