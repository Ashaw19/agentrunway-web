import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ── Exported types shared with the client component ──────────────────────────

export interface ExtractedDeal {
  date: string;         // YYYY-MM-DD
  address: string;
  gci: number;          // agent's net commission for this deal (post-split)
  party_a: string;      // names from ONE side of the deal (before the /)
  party_b: string;      // names from the OTHER side (after the /)
  agent_side: 0 | 1 | null; // 0 = represented party_a, 1 = party_b, null = unclear
}

export interface ImportResult {
  year: number;
  annual_gci: number;
  annual_tx: number;
  quarter_gci: [number, number, number, number];
  quarter_tx: [number, number, number, number];
  deals: ExtractedDeal[];
}

// ── Groq raw response (before we compute aggregates) ─────────────────────────

interface GroqRawResponse {
  year: number;
  deals: Array<{
    date: string;
    address: string;
    gci: number | string;
    party_a: string;
    party_b: string;
    agent_side?: 0 | 1 | null;
  }>;
}

// ── Prompts ───────────────────────────────────────────────────────────────────

// Used for image-based input (PDF rendered to JPEG, or uploaded image)
const VISION_PROMPT = `You are extracting real estate commission transaction data from a brokerage report.

Return ONLY a raw JSON object (no markdown, no code fences, no explanation).

Required JSON structure:
{
  "year": <integer — the year this report covers, e.g. 2024>,
  "deals": [
    {
      "date": "<YYYY-MM-DD — the closing or payment date of the deal>",
      "address": "<property street address>",
      "gci": <number — the agent's NET commission after the brokerage split. Look for columns labelled "Taxable", "Net Commission", "Agent Share", "Net", "Your Commission", or similar. Do NOT use the gross/full commission before split.>,
      "party_a": "<ALL names from ONE side of the transaction — everything BEFORE the first '/' separator>",
      "party_b": "<ALL names from the OTHER side — everything AFTER the first '/' separator>",
      "agent_side": <0 if evidence suggests agent represented party_a, 1 if party_b, null if unclear>
    }
  ]
}

CRITICAL RULES — read every rule carefully before outputting:

1. PARTY NAMES — the "/" character is the ONLY separator between the two sides of a deal.
   You MUST split every name field into exactly two parts using the FIRST "/" as the dividing line.

   SPLITTING RULES:
   - party_a = everything BEFORE the first "/" (trimmed)
   - party_b = everything AFTER the first "/" (trimmed)
   - "&" joins people on the SAME side — it is never a separator between sides
   - Names may span multiple lines in the PDF — treat them as one continuous string, find the "/", then split

   WORKED EXAMPLES (study these carefully):
   - "Ashley Mathias / Jiaolao Meng"
     → party_a="Ashley Mathias", party_b="Jiaolao Meng"

   - "John & Mary Smith / Bob Jones Ltd."
     → party_a="John & Mary Smith", party_b="Bob Jones Ltd."

   - "Micheal Beaton / Jeremy Silvio Macaulay & Ashley Diane Macaulay"
     → party_a="Micheal Beaton", party_b="Jeremy Silvio Macaulay & Ashley Diane Macaulay"

   - "Afshin & Donya Adivi / Estate Of Audrey Elizabeth Ferris"
     → party_a="Afshin & Donya Adivi", party_b="Estate Of Audrey Elizabeth Ferris"

   - "Ashley & Silvio Macaulay / J.P. Custom Homes Ltd."
     → party_a="Ashley & Silvio Macaulay", party_b="J.P. Custom Homes Ltd."

   HARD PROHIBITIONS:
   - NEVER include a "/" character inside party_a or party_b
   - NEVER put the full name string (including the "/") into party_a and leave party_b blank
   - NEVER leave party_b as an empty string when a "/" is visible in the names field

   SELF-CHECK before outputting each deal:
   → Does party_a contain a "/"? If YES, you have made an error — re-split.
   → Is party_b empty but the names field had a "/"? If YES, you have made an error — re-split.

2. GCI VALUE — use the NET / TAXABLE column, not the gross commission:
   - Ignore the "Commission", "Gross", or full amount before the brokerage deduction
   - Use "Taxable", "Net Commission", "Agent Share", "Your Net", or equivalent
   - If only one commission column exists, use it

3. agent_side hint — if one party is a corporation, estate, developer, or builder,
   the agent probably represented the individual on the other side (set 0 or 1 accordingly).
   Otherwise set null.

4. IGNORE expenses, fees, advances, or any section that is not the commission/transaction table.

5. Return ONLY the JSON — nothing before or after it.`;

// Used for text-based input (Excel converted to CSV, or plain CSV)
const TEXT_PROMPT = (content: string) => `You are extracting real estate commission transaction data from a brokerage report exported as text/spreadsheet data.

The report content is below. Find the commission/transaction records and extract per-deal data.

REPORT CONTENT:
---
${content.slice(0, 12000)}
---

Return ONLY a raw JSON object (no markdown, no code fences). Required structure:
{
  "year": <integer — the year this report covers>,
  "deals": [
    {
      "date": "<YYYY-MM-DD — closing or payment date>",
      "address": "<property address, or empty string if not present>",
      "gci": <number — agent's net commission. Look for columns: Taxable, Net Commission, Agent Share, Net, Your Commission, or the amount after brokerage deduction>,
      "party_a": "<buyer or seller name(s) — ONE side of the deal>",
      "party_b": "<the other side of the deal — leave empty string if not available>",
      "agent_side": <0 if agent represented party_a, 1 if party_b, null if unclear>
    }
  ]
}

Rules:
- party_a and party_b represent the two sides of a real estate transaction (buyer / seller).
- If names appear in separate columns (e.g. "Buyer" and "Seller" columns), use those columns directly.
- If names appear combined with "/" separator: split on the FIRST "/" only.
  party_a = everything BEFORE the first "/" (trimmed)
  party_b = everything AFTER the first "/" (trimmed)
  Examples:
    "Afshin & Donya Adivi / Estate Of Audrey Elizabeth Ferris" → party_a="Afshin & Donya Adivi", party_b="Estate Of Audrey Elizabeth Ferris"
    "Micheal Beaton / Jeremy Silvio Macaulay & Ashley Diane Macaulay" → party_a="Micheal Beaton", party_b="Jeremy Silvio Macaulay & Ashley Diane Macaulay"
- "&" connects people on the SAME side — it is NOT a side separator.
- NEVER include "/" in either party_a or party_b.
- NEVER leave party_b empty when a "/" is present in the name field.
- Ignore header rows, totals rows, expense rows, and anything that is not a closed transaction.
- Return ONLY the JSON.`;

// ── Aggregate computation (done in code — not trusted to Groq) ───────────────

function computeAggregates(deals: GroqRawResponse["deals"], year: number): ImportResult {
  const cleanDeals: ExtractedDeal[] = deals.map((d) => {
    let party_a = (d.party_a ?? "").trim();
    let party_b = (d.party_b ?? "").trim();

    // Safety net: if Groq put the full "Name A / Name B" string into party_a
    // and left party_b empty, split it here in code — guaranteed correct.
    if (party_a.includes("/") && !party_b) {
      const slashIdx = party_a.indexOf("/");
      party_b = party_a.slice(slashIdx + 1).trim();
      party_a = party_a.slice(0, slashIdx).trim();
    }

    return {
      date: d.date,
      address: d.address ?? "",
      gci: Number(d.gci) || 0,
      party_a,
      party_b,
      agent_side: d.agent_side ?? null,
    };
  });

  const quarter_gci: [number, number, number, number] = [0, 0, 0, 0];
  const quarter_tx:  [number, number, number, number] = [0, 0, 0, 0];

  for (const deal of cleanDeals) {
    // Parse date — add noon time to avoid UTC-offset day-boundary issues
    const d = new Date(deal.date + "T12:00:00");
    const dealYear = d.getFullYear();

    // Only count deals that actually fall in the reported year
    if (dealYear !== year) continue;

    const q = Math.floor(d.getMonth() / 3) as 0 | 1 | 2 | 3;
    quarter_gci[q] += deal.gci;
    quarter_tx[q]++;
  }

  // Round to 2dp
  for (let i = 0; i < 4; i++) {
    quarter_gci[i] = Math.round(quarter_gci[i] * 100) / 100;
  }

  const annual_gci = Math.round(cleanDeals.reduce((s, d) => s + d.gci, 0) * 100) / 100;
  const annual_tx  = cleanDeals.length;

  return { year, annual_gci, annual_tx, quarter_gci, quarter_tx, deals: cleanDeals };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth guard
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: "GROQ_API_KEY is not configured" }, { status: 503 });
  }

  const body = await req.json() as {
    imageBase64?: string;
    mimeType?: string;       // e.g. "image/jpeg", "image/png"
    textContent?: string;    // for Excel/CSV
  };

  if (!body.imageBase64 && !body.textContent) {
    return NextResponse.json({ error: "No data provided" }, { status: 400 });
  }

  const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
  });

  try {
    let raw: string;

    if (body.textContent) {
      // ── Text path: Excel / CSV ────────────────────────────────────────────
      const response = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",  // text model — fast and accurate
        messages: [
          {
            role: "user",
            content: TEXT_PROMPT(body.textContent),
          },
        ],
        temperature: 0.1,
        max_tokens: 3000,
      });
      raw = response.choices[0]?.message?.content ?? "";
    } else {
      // ── Vision path: PDF (rendered to JPEG) or uploaded image ────────────
      const mimeType = body.mimeType ?? "image/jpeg";
      const response = await groq.chat.completions.create({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${body.imageBase64}` },
              },
              {
                type: "text",
                text: VISION_PROMPT,
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 3000,
      });
      raw = response.choices[0]?.message?.content ?? "";
    }

    // Strip markdown fences if the model wraps output
    const cleaned = raw
      .replace(/^```(?:json)?\s*/m, "")
      .replace(/\s*```\s*$/m, "")
      .trim();

    const parsed = JSON.parse(cleaned) as GroqRawResponse;

    if (typeof parsed.year !== "number" || !Array.isArray(parsed.deals)) {
      return NextResponse.json({ error: "Malformed response", raw }, { status: 422 });
    }

    // Compute all aggregates in code — never trust Groq's arithmetic
    const result = computeAggregates(parsed.deals, parsed.year);

    return NextResponse.json(result);
  } catch (err) {
    console.error("[import-history] error:", err);
    return NextResponse.json({ error: "Failed to extract data from document" }, { status: 422 });
  }
}
