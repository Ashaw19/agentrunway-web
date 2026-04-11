import { generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { requirePro } from "@/lib/require-pro";
import { models, heliconeHeaders } from "@/lib/ai/provider";
import type { VoiceDraft } from "@/lib/voice/types";

// ── Multi-intent extraction prompt ───────────────────────────────────────────

const EXTRACT_PROMPT = (transcript: string) =>
`You are a real estate business assistant. A real estate agent has spoken a command. Classify the intent and extract structured data from the transcript.

TRANSCRIPT:
"""
${transcript}
"""

Return ONLY a raw JSON object with no markdown, no code fences, no explanation.

STEP 1 — Classify the intent (pick exactly one):
- "new_client" — agent mentions adding, logging, or creating a new contact, client, lead, or person
- "new_expense" — agent mentions spending money, buying something, a cost, receipt, fuel, gas, supplies, meals, parking
- "new_transaction" — agent mentions closing a deal, a sale, listing, commission, GCI, pending deal, sold
- "note" — agent mentions calling, emailing, texting, showing houses to, or meeting with an existing client/person
- "unknown" — cannot determine intent

STEP 2 — Return the JSON shape matching the classified intent:

═══ If intent = "new_client" ═══
{
  "intent": "new_client",
  "confidence": "high" | "medium" | "low",
  "transcript_cleaned": "<transcript with filler words removed>",
  "client": {
    "fullName": "<full name or null>",
    "email": "<email or null>",
    "phone": "<phone as spoken or null>",
    "street1": "<street address or null>",
    "street2": "<unit/apt/suite or null>",
    "city": "<city or null>",
    "province": "<province/state or null>",
    "country": "<country — default 'Canada' if not mentioned>",
    "postalCode": "<postal/zip code or null>",
    "source": "<lead source e.g. Referral, Open House, Sign Call, or null>",
    "tags": ["<inferred: Buyer, Seller, Investor, Referral, etc.>"],
    "notes": "<any other details or null>"
  },
  "missingFields": ["<null fields that are typically expected>"],
  "needsReview": true | false
}
confidence: "high" if fullName + (email or phone); "medium" if fullName only; "low" otherwise.
needsReview: true if confidence is "low" or intent is uncertain.
tags: infer from context — Buyer if looking to purchase, Seller if listing, Investor for investment, Referral if referred.
country: default to "Canada" unless another country is explicitly mentioned.

═══ If intent = "new_expense" ═══
{
  "intent": "new_expense",
  "confidence": "high" | "medium" | "low",
  "transcript_cleaned": "<transcript with filler words removed>",
  "expense": {
    "category_key": "<best match from the list below, or null>",
    "amount": <number or null>,
    "vendor": "<business/store name or null>",
    "description": "<what was purchased or null>",
    "date": "<YYYY-MM-DD if mentioned, or null for today>"
  },
  "missingFields": ["<null fields that are typically expected>"],
  "needsReview": true | false
}
Valid category_key values (pick the best match):
  vehicle_fuel, vehicle_service, vehicle_insurance, vehicle_payment,
  marketing_ads, marketing_photography, marketing_print, marketing_gifts,
  office_supplies, office_software, office_phone, office_hardware,
  prof_board_mls, prof_licensing, prof_eo, prof_accounting,
  edu_courses, edu_conferences, edu_books,
  meals_client, meals_team,
  ent_client, ent_events,
  other_misc
confidence: "high" if amount is present; "medium" if description but no amount; "low" otherwise.
needsReview: true if confidence is "low".

═══ If intent = "new_transaction" ═══
{
  "intent": "new_transaction",
  "confidence": "high" | "medium" | "low",
  "transcript_cleaned": "<transcript with filler words removed>",
  "transaction": {
    "date": "<YYYY-MM-DD if mentioned, or null>",
    "address": "<property address or null>",
    "client_name": "<client/buyer/seller name or null>",
    "side": "buyer" | "seller" | "both" | null,
    "status": "closed" | "pending" | null,
    "sale_price": <number or null>,
    "commission_pct": <decimal e.g. 0.025 for 2.5%, or null>,
    "gci": <dollar amount if explicitly stated, or null>,
    "notes": "<any other details or null>"
  },
  "missingFields": ["<null fields that are typically expected>"],
  "needsReview": true | false
}
confidence: "high" if address + sale_price present; "medium" if either one; "low" otherwise.
side: "buyer" if representing buyer, "seller" if listing agent, "both" if double-ended.
status: "closed" if deal is done/sold/closed; "pending" if not yet closed.
commission_pct: convert percentage to decimal (e.g. "two and a half percent" → 0.025).
needsReview: true if confidence is "low".

═══ If intent = "note" ═══
{
  "intent": "note",
  "confidence": "high" | "medium" | "low",
  "transcript_cleaned": "<transcript with filler words removed>",
  "note": {
    "client_name": "<name of the person the activity is about, or null>",
    "activity_type": "call" | "email" | "text" | "showing" | "meeting" | "note",
    "description": "<what happened / key details>"
  },
  "missingFields": ["<null fields that are typically expected>"],
  "needsReview": true | false
}
activity_type: "call" if phone call, "email" if email, "text" if text/SMS, "showing" if property showing, "meeting" if in-person meeting, "note" for general notes.
confidence: "high" if client_name + description present; "medium" if description only; "low" otherwise.

═══ If intent = "unknown" ═══
{
  "intent": "unknown",
  "confidence": "low",
  "transcript_cleaned": "<transcript with filler words removed>",
  "raw_text": "<the cleaned transcript>",
  "missingFields": [],
  "needsReview": true
}

RULES:
- For null fields use null (not empty string "")
- Amounts: parse spoken numbers — "eighty five dollars" → 85, "five fifty" → 550 (assume thousands for real estate prices), "fourteen thousand" → 14000
- For real estate prices: "five fifty" likely means $550,000 (sale price); for expenses: "eighty five" likely means $85
- Return ONLY the JSON — no explanation, no markdown fences`;

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth guard ──────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const proCheck = await requirePro(supabase, user.id);
  if (!proCheck.allowed) return proCheck.response!;

  // ── Rate limit: 20 extractions per 60-minute window ────────────────────
  const rl = await checkRateLimit(user.id, "voice-extract", 20, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many voice requests. Please wait before trying again." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI provider is not configured" }, { status: 503 });
  }

  let body: { transcript?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!body.transcript?.trim()) {
    return NextResponse.json({ error: "No transcript provided" }, { status: 400 });
  }
  if (body.transcript.length > 10_000) {
    return NextResponse.json({ error: "Transcript too long (max 10,000 chars)" }, { status: 400 });
  }

  try {
    const { text: raw } = await generateText({
      model: models.fast,
      prompt: EXTRACT_PROMPT(body.transcript),
      temperature: 0.1,
      maxOutputTokens: 1200,
      headers: heliconeHeaders({ userId: user.id, feature: "voice-extract" }),
    });

    // Strip any accidental markdown fences
    const cleaned = raw
      .replace(/^```(?:json)?\s*/m, "")
      .replace(/\s*```\s*$/m, "")
      .trim();

    const draft = JSON.parse(cleaned) as VoiceDraft;

    // Basic shape validation
    const validIntents = ["new_client", "new_expense", "new_transaction", "note", "unknown"];
    if (!validIntents.includes(draft.intent)) {
      return NextResponse.json({ error: "Malformed extraction response" }, { status: 422 });
    }

    // Intent-specific shape checks + defaults
    if (draft.intent === "new_client") {
      if (!draft.client) {
        return NextResponse.json({ error: "Missing client object" }, { status: 422 });
      }
      if (!Array.isArray(draft.client.tags)) draft.client.tags = [];
    }

    if (draft.intent === "new_expense" && !draft.expense) {
      return NextResponse.json({ error: "Missing expense object" }, { status: 422 });
    }

    if (draft.intent === "new_transaction" && !draft.transaction) {
      return NextResponse.json({ error: "Missing transaction object" }, { status: 422 });
    }

    if (draft.intent === "note" && !draft.note) {
      return NextResponse.json({ error: "Missing note object" }, { status: 422 });
    }

    // Ensure missingFields is always an array
    if (!Array.isArray(draft.missingFields)) {
      (draft as VoiceDraft).missingFields = [];
    }

    return NextResponse.json(draft);
  } catch (err) {
    console.error("[voice-extract] error:", err);
    return NextResponse.json({ error: "Failed to extract information from transcript" }, { status: 422 });
  }
}
