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
const SEASONAL_TOP_N     = 25;   // max clients for seasonal campaigns

// ── Date helpers ──────────────────────────────────────────────────────────────

function addYears(isoDate: string, years: number): Date {
  const d = new Date(isoDate + "T12:00:00");
  d.setFullYear(d.getFullYear() + years);
  return d;
}

function addDays(isoDate: string, days: number): Date {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + days);
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
  return email.split("@")[0].replace(/[._-]/g, " ").split(" ")[0] || "your agent";
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

// ── Batch 1 prompt builders (Post-Close Nurture) ─────────────────────────────

function buildPostClose3Prompt(
  agentFirst:  string,
  clientName:  string,
  address:     string | null,
  tone:        Tone = "friendly",
): string {
  const prop = address ?? "their new home";
  return `You are ghostwriting a short, genuine email from a Canadian real estate agent named ${agentFirst} to their client ${clientName}, sent 3 days after the client's deal just closed.

Context:
- Property: ${prop}

${TONE_INSTRUCTIONS[tone]}

Write a brief 2-paragraph move-in congratulations (under 100 words) that:
- Feels like a warm text from a friend, not a corporate follow-up
- DO NOT open with "I hope this email finds you well" or similar clichés
- DO NOT start with "Subject:"
- Acknowledge the excitement of the first few days in a new home
- Offer to help with anything — local recommendations, tradespeople, questions
- Sign off with just "${agentFirst}"
- Vary sentence length. Keep it warm and real.

On the very last line, write exactly:
SUBJECT: [short, personal subject — not "Congratulations!" which screams automated]`;
}

function buildPostClose14Prompt(
  agentFirst:  string,
  clientName:  string,
  address:     string | null,
  tone:        Tone = "friendly",
): string {
  const prop = address ?? "the new place";
  return `You are ghostwriting a casual check-in email from a Canadian real estate agent named ${agentFirst} to their client ${clientName}, two weeks after closing.

Context:
- Property: ${prop}

${TONE_INSTRUCTIONS[tone]}

Write a 2-paragraph check-in (under 100 words) that:
- Feels like a genuine "how's it going?" — not a scripted follow-up
- DO NOT open with clichés like "I hope you're settling in well"
- DO NOT start with "Subject:"
- Reference that it's been about two weeks — the chaos of moving should be clearing up
- Ask a simple open question: how are they finding the neighbourhood, the commute, anything
- Sign off with just "${agentFirst}"

On the very last line, write exactly:
SUBJECT: [casual, personal subject — could be as simple as their street name or a reference to the move]`;
}

function buildPostClose90Prompt(
  agentFirst:  string,
  clientName:  string,
  address:     string | null,
  province:    string | null,
  tone:        Tone = "friendly",
): string {
  const location = [address, province].filter(Boolean).join(", ") || "the home";
  return `You are ghostwriting a 3-month check-in email from a Canadian real estate agent named ${agentFirst} to their client ${clientName}.

Context:
- Property: ${location}
- It's been 90 days since closing — three months in their new home

${TONE_INSTRUCTIONS[tone]}

Write a warm 2–3 paragraph check-in (under 150 words) that:
- Celebrates the 3-month mark naturally — not in a corporate way
- DO NOT open with clichés like "It's hard to believe it's already been 3 months!"
- DO NOT start with "Subject:"
- Mentions that property values shift in the first year — offer a no-obligation current value snapshot
- Keep the CTA soft: "happy to pull a quick update if you're curious"
- Sign off with just "${agentFirst}"
- Vary sentence length. One or two short punchy sentences work well.

On the very last line, write exactly:
SUBJECT: [personal, not sales-y — reference the home or the timeline naturally]`;
}

function buildReviewRequestPrompt(
  agentFirst:  string,
  clientName:  string,
  address:     string | null,
  tone:        Tone = "friendly",
): string {
  const prop = address ?? "your recent purchase";
  return `You are ghostwriting an honest, non-pushy review request from a Canadian real estate agent named ${agentFirst} to their recent client ${clientName}.

Context:
- Property: ${prop}
- It's been about 3 weeks since closing — experience is still fresh

${TONE_INSTRUCTIONS[tone]}

Write a short 2-paragraph review request (under 120 words) that:
- Opens by genuinely hoping the move went smoothly — but NOT with "I hope this email finds you well"
- DO NOT start with "Subject:"
- Asks honestly if they'd be willing to share their experience on Google or Realtor.ca
- Makes it clear it's completely optional, no pressure — just one sentence asking
- Does NOT grovel or over-explain why reviews matter
- Sign off with just "${agentFirst}"
- The tone should feel like asking a favour from a friend, not a business transaction

On the very last line, write exactly:
SUBJECT: [short, genuine subject — not "Quick Favour!" or "Review Request"]`;
}

function buildReferralAskPrompt(
  agentFirst:  string,
  clientName:  string,
  address:     string | null,
  tone:        Tone = "friendly",
): string {
  const prop = address ?? "your new home";
  return `You are ghostwriting a natural referral ask from a Canadian real estate agent named ${agentFirst} to their settled-in client ${clientName}, about 6 weeks after closing.

Context:
- Property: ${prop}
- Client has had time to settle in — the chaos is over

${TONE_INSTRUCTIONS[tone]}

Write a brief 2-paragraph referral ask (under 120 words) that:
- Opens by connecting with how they're doing — NOT a cliché opener
- DO NOT start with "Subject:"
- Mentions that most of the agent's best clients come from people like ${clientName}
- Makes a genuine, low-pressure ask: if anyone they know is thinking about buying or selling, ${agentFirst} would love the introduction
- Does NOT use corporate phrases like "I'd appreciate any referrals you can send my way"
- Sign off with just "${agentFirst}"

On the very last line, write exactly:
SUBJECT: [casual, warm subject — not "Referral Request" which nobody opens]`;
}

// ── Batch 2 prompt builders (Relationship Milestones) ─────────────────────────

function buildNewClientWelcomePrompt(
  agentFirst:  string,
  clientName:  string,
  tone:        Tone = "friendly",
): string {
  return `You are ghostwriting a brief welcome email from a Canadian real estate agent named ${agentFirst} to their new client ${clientName}, sent about a week after they first connected.

${TONE_INSTRUCTIONS[tone]}

Write a warm 2-paragraph welcome (under 100 words) that:
- Feels like a genuine personal note, not an onboarding template
- DO NOT open with "Welcome aboard!" or "I'm excited to work with you!"
- DO NOT start with "Subject:"
- Reminds them that ${agentFirst} is available for any questions — big or small
- One line about what to expect from working together
- Sign off with just "${agentFirst}"

On the very last line, write exactly:
SUBJECT: [personal, low-key subject — could just reference their first conversation or their goal]`;
}

function buildContactAnniversaryPrompt(
  agentFirst:    string,
  clientName:    string,
  years:         number,
  tone:          Tone = "friendly",
): string {
  const ordinal = years === 1 ? "first" : years === 2 ? "second" : years === 3 ? "third" : `${years}th`;
  return `You are ghostwriting a short relationship anniversary email from a Canadian real estate agent named ${agentFirst} to their long-time client ${clientName}.

Context:
- It's been ${years} year${years !== 1 ? "s" : ""} since they first connected as agent and client

${TONE_INSTRUCTIONS[tone]}

Write a brief 2-paragraph note (under 100 words) that:
- Acknowledges the ${ordinal} year of working together — naturally, not formally
- DO NOT open with "Time flies!" or similar clichés
- DO NOT start with "Subject:"
- Expresses genuine appreciation without being overly sentimental
- Keeps it light — maybe a small reflection on what's changed in the market or their life
- Sign off with just "${agentFirst}"

On the very last line, write exactly:
SUBJECT: [warm, personal subject — reference the ${ordinal} year naturally]`;
}

function buildMultiDealMilestonePrompt(
  agentFirst:  string,
  clientName:  string,
  dealCount:   number,
  tone:        Tone = "friendly",
): string {
  const ordinal = dealCount === 2 ? "second" : dealCount === 3 ? "third" : `${dealCount}th`;
  return `You are ghostwriting a short thank-you from a Canadian real estate agent named ${agentFirst} to their repeat client ${clientName}, who has just completed their ${ordinal} deal together.

${TONE_INSTRUCTIONS[tone]}

Write a genuine 2-paragraph note (under 110 words) that:
- Thanks ${clientName} for trusting ${agentFirst} again — but naturally, not formally
- DO NOT open with "It means so much to me!" or generic gratitude clichés
- DO NOT start with "Subject:"
- Acknowledges that returning clients are rare and appreciated — make it feel earned
- Ends with a forward-looking note: here whenever they need anything next
- Sign off with just "${agentFirst}"

On the very last line, write exactly:
SUBJECT: [concise, warm subject that references working together again]`;
}

// ── Batch 3 prompt builders (Seasonal Campaigns) ──────────────────────────────

function buildSeasonalSpringPrompt(
  agentFirst:  string,
  clientName:  string,
  province:    string | null,
  tone:        Tone = "friendly",
): string {
  const market = province ? `the ${province} real estate market` : "the Canadian real estate market";
  return `You are ghostwriting a spring market update email from a Canadian real estate agent named ${agentFirst} to their past client ${clientName}.

Context:
- It's the spring real estate season in Canada
- ${market} typically sees increased activity this time of year

${TONE_INSTRUCTIONS[tone]}

Write a 3-paragraph spring market note (under 160 words) that:
- Opens with a seasonal observation about spring and real estate — but NOT "Spring is in the air!"
- DO NOT start with "Subject:"
- Shares a brief, genuine insight about the current spring market — what's moving, what's changed
- Includes a soft CTA: happy to share what their home could be worth now, or discuss options
- Does NOT feel like a mass newsletter — reads like it's written specifically for them
- Sign off with just "${agentFirst}"

On the very last line, write exactly:
SUBJECT: [conversational spring market subject — not "Spring Market Update" which screams newsletter]`;
}

function buildSeasonalFallPrompt(
  agentFirst:  string,
  clientName:  string,
  province:    string | null,
  tone:        Tone = "friendly",
): string {
  const market = province ? `the ${province} market` : "the market";
  return `You are ghostwriting a fall market check-in from a Canadian real estate agent named ${agentFirst} to their past client ${clientName}.

Context:
- It's the fall real estate season in Canada
- ${market} enters one of its two active selling periods

${TONE_INSTRUCTIONS[tone]}

Write a 2–3 paragraph fall note (under 150 words) that:
- Opens with something real about fall — NOT "The leaves are changing and so is the market!"
- DO NOT start with "Subject:"
- Mentions that fall is a serious buying/selling window before winter slows things down
- Offers a free home-value check or a 10-minute call to discuss the current market
- Feels personal, not mass-blasted
- Sign off with just "${agentFirst}"

On the very last line, write exactly:
SUBJECT: [casual fall subject — something that doesn't scream "seasonal real estate email"]`;
}

function buildSeasonalYearEndPrompt(
  agentFirst:  string,
  clientName:  string,
  tone:        Tone = "friendly",
): string {
  return `You are ghostwriting a genuine year-end note from a Canadian real estate agent named ${agentFirst} to their past client ${clientName}.

${TONE_INSTRUCTIONS[tone]}

Write a short 2-paragraph year-end message (under 120 words) that:
- Reflects briefly on the year — NOT with "What a year it's been!"
- DO NOT start with "Subject:"
- Expresses genuine appreciation for the relationship — without being saccharine
- Wishes them well for the coming year with one forward-looking sentence
- Does NOT mention real estate, listings, or market trends — this is a pure relationship touchpoint
- Sign off with just "${agentFirst}"

On the very last line, write exactly:
SUBJECT: [warm year-end subject that doesn't feel like a corporate holiday card]`;
}

function buildSeasonalTaxPrompt(
  agentFirst:  string,
  clientName:  string,
  province:    string | null,
  tone:        Tone = "friendly",
): string {
  const prov = province ?? "Canada";
  return `You are ghostwriting a helpful tax-season tip email from a Canadian real estate agent named ${agentFirst} to their past client ${clientName}, who owns real estate in ${prov}.

${TONE_INSTRUCTIONS[tone]}

Write a 2–3 paragraph tax-season note (under 150 words) that:
- Opens with an observation about tax season arriving — NOT "Tax season is here!"
- DO NOT start with "Subject:"
- Shares one or two genuinely useful reminders: principal residence exemption, rental income, FHSA/RRSP home buyer's plan, capital gains on investment properties — pick what's relevant
- Reminds them that ${agentFirst} can connect them with a great accountant or mortgage broker if needed
- Ends with a low-pressure offer to answer any real estate–related tax questions
- Sign off with just "${agentFirst}"

On the very last line, write exactly:
SUBJECT: [practical, approachable subject about tax season — not "Important Tax Reminder!"]`;
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

  const address  = (ctx.address as string) ?? item.clients?.city ?? null;
  const province = item.clients?.province_region ?? null;

  let prompt: string;
  switch (item.opportunity_type) {
    // ── Phase A (live) ─────────────────────────────────────────────────────
    case "closing_anniversary":
      prompt = buildAnniversaryPrompt(agentFirst, clientName, Number(ctx.anniversary_year ?? 1), address, province, tone);
      break;
    case "idle_client":
      prompt = buildIdlePrompt(agentFirst, clientName, (ctx.last_deal as string) ?? null, item.clients?.city ?? null, province, tone);
      break;
    case "birthday":
      prompt = buildBirthdayPrompt(agentFirst, clientName, tone);
      break;
    // ── Batch 1: Post-Close Nurture ────────────────────────────────────────
    case "post_close_3":
      prompt = buildPostClose3Prompt(agentFirst, clientName, address, tone);
      break;
    case "post_close_14":
      prompt = buildPostClose14Prompt(agentFirst, clientName, address, tone);
      break;
    case "post_close_90":
      prompt = buildPostClose90Prompt(agentFirst, clientName, address, province, tone);
      break;
    case "review_request":
      prompt = buildReviewRequestPrompt(agentFirst, clientName, address, tone);
      break;
    case "referral_ask":
      prompt = buildReferralAskPrompt(agentFirst, clientName, address, tone);
      break;
    // ── Batch 2: Relationship Milestones ───────────────────────────────────
    case "new_client_welcome":
      prompt = buildNewClientWelcomePrompt(agentFirst, clientName, tone);
      break;
    case "contact_anniversary":
      prompt = buildContactAnniversaryPrompt(agentFirst, clientName, Number(ctx.anniversary_year ?? 1), tone);
      break;
    case "multi_deal_milestone":
      prompt = buildMultiDealMilestonePrompt(agentFirst, clientName, Number(ctx.deal_count ?? 2), tone);
      break;
    // ── Batch 3: Seasonal ──────────────────────────────────────────────────
    case "seasonal_spring":
      prompt = buildSeasonalSpringPrompt(agentFirst, clientName, province, tone);
      break;
    case "seasonal_fall":
      prompt = buildSeasonalFallPrompt(agentFirst, clientName, province, tone);
      break;
    case "seasonal_yearend":
      prompt = buildSeasonalYearEndPrompt(agentFirst, clientName, tone);
      break;
    case "seasonal_tax":
      prompt = buildSeasonalTaxPrompt(agentFirst, clientName, province, tone);
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
      .select("id, name, city, province_region, birthdate, communication_tone, first_contacted_at")
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

  // ── 4. Post-close nurture sequence (Batch 1) ──────────────────────────────
  const POST_CLOSE_CONFIGS = [
    { type: "post_close_3"   as const, days:  3, lookback: 30 },
    { type: "post_close_14"  as const, days: 14, lookback: 30 },
    { type: "post_close_90"  as const, days: 90, lookback: 30 },
    { type: "review_request" as const, days: 21, lookback: 30 },
    { type: "referral_ask"   as const, days: 45, lookback: 30 },
  ];

  for (const rec of records) {
    if (!rec.close_date || !rec.client_id) continue;
    for (const cfg of POST_CLOSE_CONFIGS) {
      const triggerDate = addDays(rec.close_date, cfg.days);
      const d = daysUntil(triggerDate);
      if (d >= -cfg.lookback && d <= WINDOW_DAYS) {
        inserts.push({
          user_id:          userId,
          client_id:        rec.client_id,
          client_record_id: rec.id,
          opportunity_type: cfg.type,
          trigger_date:     toISODate(triggerDate),
          context: {
            address:         rec.address,
            close_date:      rec.close_date,
            gci:             rec.gci,
            days_after_close: cfg.days,
          },
          status: "draft",
        });
      }
    }
  }

  // ── 5. New client welcome (Batch 2) ───────────────────────────────────────
  for (const client of clients) {
    if (!client.first_contacted_at) continue;
    const welcomeDate = addDays(client.first_contacted_at.slice(0, 10), 7);
    const d = daysUntil(welcomeDate);
    if (d >= -14 && d <= WINDOW_DAYS) {
      inserts.push({
        user_id:          userId,
        client_id:        client.id,
        opportunity_type: "new_client_welcome",
        trigger_date:     toISODate(welcomeDate),
        context: { first_contacted_at: client.first_contacted_at },
        status: "draft",
      });
    }
  }

  // ── 6. Contact anniversary (Batch 2) ──────────────────────────────────────
  for (const client of clients) {
    if (!client.first_contacted_at) continue;
    const startDate   = client.first_contacted_at.slice(0, 10);
    const yearsSince  = new Date().getFullYear() - new Date(startDate + "T12:00:00").getFullYear();
    if (yearsSince < 1) continue;
    for (const yr of [1, 2, 3, 5, 10]) {
      if (yr > yearsSince + 1) break;
      const annivDate = addYears(startDate, yr);
      const d = daysUntil(annivDate);
      if (d >= 0 && d <= WINDOW_DAYS) {
        inserts.push({
          user_id:          userId,
          client_id:        client.id,
          opportunity_type: "contact_anniversary",
          trigger_date:     toISODate(annivDate),
          context: { anniversary_year: yr, first_contacted_at: startDate },
          status: "draft",
        });
      }
    }
  }

  // ── 7. Multi-deal milestone (Batch 2) ────────────────────────────────────
  const clientDealDates = new Map<string, string[]>();
  for (const rec of records) {
    if (!rec.client_id || !rec.close_date) continue;
    const arr = clientDealDates.get(rec.client_id) ?? [];
    arr.push(rec.close_date);
    clientDealDates.set(rec.client_id, arr);
  }
  const MILESTONE_COUNTS = [2, 3, 5];
  for (const [clientId, dates] of clientDealDates.entries()) {
    const sorted = [...dates].sort();
    for (const n of MILESTONE_COUNTS) {
      if (sorted.length < n) continue;
      const nthDate     = sorted[n - 1];
      const triggerDate = addDays(nthDate, 3);
      const d           = daysUntil(triggerDate);
      if (d >= -30 && d <= WINDOW_DAYS) {
        inserts.push({
          user_id:          userId,
          client_id:        clientId,
          opportunity_type: "multi_deal_milestone",
          trigger_date:     toISODate(triggerDate),
          context: { deal_count: n, nth_close_date: nthDate },
          status: "draft",
        });
      }
    }
  }

  // ── 8. Seasonal campaigns (Batch 3) ───────────────────────────────────────
  // Rank clients by lifetime GCI; limit to top SEASONAL_TOP_N
  const clientLifetimeGCI = new Map<string, number>();
  for (const rec of records) {
    if (rec.client_id && rec.gci) {
      clientLifetimeGCI.set(
        rec.client_id,
        (clientLifetimeGCI.get(rec.client_id) ?? 0) + (rec.gci as number),
      );
    }
  }
  const top25Ids = new Set(
    [...clientLifetimeGCI.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, SEASONAL_TOP_N)
      .map(([id]) => id),
  );

  const todayD  = new Date();
  const thisYr  = todayD.getFullYear();
  const todayMM = todayD.getMonth() + 1;
  const todayDD = todayD.getDate();

  type SeasonDef = { type: "seasonal_spring" | "seasonal_fall" | "seasonal_yearend" | "seasonal_tax"; sm: number; sd: number; em: number; ed: number; key: string };
  const SEASONS: SeasonDef[] = [
    { type: "seasonal_spring",  sm:  2, sd: 15, em:  3, ed: 31, key: `${thisYr}-02-15` },
    { type: "seasonal_fall",    sm:  9, sd:  1, em: 10, ed: 15, key: `${thisYr}-09-01` },
    { type: "seasonal_yearend", sm: 12, sd:  1, em: 12, ed: 31, key: `${thisYr}-12-01` },
    { type: "seasonal_tax",     sm:  1, sd: 15, em:  2, ed: 15, key: `${thisYr}-01-15` },
  ];

  for (const season of SEASONS) {
    const inWindow =
      (todayMM > season.sm || (todayMM === season.sm && todayDD >= season.sd)) &&
      (todayMM < season.em || (todayMM === season.em && todayDD <= season.ed));
    if (!inWindow) continue;

    for (const client of clients) {
      if (!top25Ids.has(client.id)) continue;
      inserts.push({
        user_id:          userId,
        client_id:        client.id,
        opportunity_type: season.type,
        trigger_date:     season.key,
        context: { season: season.type, year: thisYr },
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
