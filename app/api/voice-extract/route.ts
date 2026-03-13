import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

// ── Exported type shared with the client component ────────────────────────────

export interface VoiceClientDraft {
  intent:             "new_client" | "unknown";
  confidence:         "high" | "medium" | "low";
  transcript_cleaned: string;
  client: {
    fullName:   string | null;
    email:      string | null;
    phone:      string | null;
    street1:    string | null;
    street2:    string | null;
    city:       string | null;
    province:   string | null;
    country:    string | null;
    postalCode: string | null;
    source:     string | null;
    tags:       string[];
    notes:      string | null;
  };
  missingFields: string[];
  needsReview:   boolean;
}

// ── Extraction prompt ─────────────────────────────────────────────────────────

const EXTRACT_PROMPT = (transcript: string) =>
`You are a real estate CRM assistant. Extract client contact information from a spoken transcript recorded by a real estate agent.

TRANSCRIPT:
"""
${transcript}
"""

Return ONLY a raw JSON object with no markdown, no code fences, no explanation.

Required JSON structure:
{
  "intent": "new_client" | "unknown",
  "confidence": "high" | "medium" | "low",
  "transcript_cleaned": "<transcript with filler words (um, uh, like) removed>",
  "client": {
    "fullName":   "<full name of the client, or null>",
    "email":      "<email address, or null>",
    "phone":      "<phone number as spoken, or null>",
    "street1":    "<street address line 1, or null>",
    "street2":    "<unit/apt/suite, or null>",
    "city":       "<city, or null>",
    "province":   "<province or state, or null>",
    "country":    "<country name — default to 'Canada' if not mentioned, or null>",
    "postalCode": "<postal/zip code, or null>",
    "source":     "<lead source (e.g. Referral, Open House, Sign Call), or null>",
    "tags":       ["<inferred tags — e.g. 'Buyer', 'Seller', 'Investor', 'Referral'>"],
    "notes":      "<any other relevant details mentioned, or null>"
  },
  "missingFields": ["<field names that are null but would normally be expected>"],
  "needsReview":   true | false
}

Rules:
- intent = "new_client" if the agent mentions adding/logging/creating a new contact or lead; otherwise "unknown"
- confidence = "high" if fullName AND at least one of (email, phone) are present; "medium" if fullName only; "low" otherwise
- tags: infer from context — "Buyer" if looking to purchase, "Seller" if listing, "Investor" for investment property, "Referral" if referred by someone
- country: default to "Canada" unless another country is explicitly mentioned
- missingFields: list fields the agent did not mention that are typically important (e.g. ["email", "phone"] if neither provided)
- needsReview = true if confidence is "low" OR intent is "unknown"
- For null fields use null (not empty string "")
- Return ONLY the JSON`;

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth guard ────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── Rate limit: 20 extractions per 60-minute window ──────────────────────
  const rl = await checkRateLimit(user.id, "voice-extract", 20, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many voice requests. Please wait before trying again." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: "GROQ_API_KEY is not configured" }, { status: 503 });
  }

  const body = await req.json() as { transcript?: string };
  if (!body.transcript?.trim()) {
    return NextResponse.json({ error: "No transcript provided" }, { status: 400 });
  }

  const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
  });

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "user",
          content: EXTRACT_PROMPT(body.transcript),
        },
      ],
      temperature: 0.1,
      max_tokens: 1000,
    });

    const raw = response.choices[0]?.message?.content ?? "";

    // Strip any accidental markdown fences
    const cleaned = raw
      .replace(/^```(?:json)?\s*/m, "")
      .replace(/\s*```\s*$/m, "")
      .trim();

    const draft = JSON.parse(cleaned) as VoiceClientDraft;

    // Basic shape validation
    if (!draft.client || typeof draft.intent !== "string") {
      return NextResponse.json({ error: "Malformed extraction response", raw }, { status: 422 });
    }

    // Ensure tags is always an array
    if (!Array.isArray(draft.client.tags)) {
      draft.client.tags = [];
    }

    return NextResponse.json(draft);
  } catch (err) {
    console.error("[voice-extract] error:", err);
    return NextResponse.json({ error: "Failed to extract client information" }, { status: 422 });
  }
}
