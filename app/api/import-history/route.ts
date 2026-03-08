import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export interface ExtractedDeal {
  date: string;         // YYYY-MM-DD
  address: string;
  commission: number;   // gross before broker split
  gci: number;          // Taxable — agent's net commission
  party_a: string;      // names before the slash
  party_b: string;      // names after the slash
  agent_side: 0 | 1 | null; // 0 = party_a is client, 1 = party_b, null = unclear
}

export interface ImportResult {
  year: number;
  annual_gci: number;
  annual_tx: number;
  quarter_gci: [number, number, number, number];
  quarter_tx: [number, number, number, number];
  deals: ExtractedDeal[];
}

const EXTRACTION_PROMPT = `This is a brokerage commission / tax worksheet for a Canadian real estate agent.

Extract all data from the commissions earned table and return a single JSON object — no markdown, no explanation, raw JSON only.

Required structure:
{
  "year": <integer — from the report header date range e.g. "January 01, 2024 to December 31, 2024" → 2024>,
  "annual_gci": <number — sum of the "Taxable" column for all commission rows, NOT the "Commission" column>,
  "annual_tx": <integer — total count of commission / deal rows>,
  "quarter_gci": [<Q1 Taxable sum>, <Q2 Taxable sum>, <Q3 Taxable sum>, <Q4 Taxable sum>],
  "quarter_tx": [<Q1 count>, <Q2 count>, <Q3 count>, <Q4 count>],
  "deals": [
    {
      "date": "<YYYY-MM-DD — convert the date column>",
      "address": "<street address from the address column>",
      "commission": <number: full commission before broker deduction>,
      "gci": <number: Taxable amount — the agent's actual net commission for this deal>,
      "party_a": "<all names before the slash / separator>",
      "party_b": "<all names after the slash / separator>",
      "agent_side": <0 if evidence suggests agent represented party_a, 1 if party_b, null if unclear>
    }
  ]
}

Rules:
- GCI / "Taxable" = what the agent actually earned after the brokerage took their split. Use this column for all gci values, NOT the raw "Commission" column.
- Quarters: Q1 = Jan–Mar, Q2 = Apr–Jun, Q3 = Jul–Sep, Q4 = Oct–Dec. Group deal dates accordingly.
- Ignore the Expenses section entirely — only extract from the Commissions Earned section.
- For agent_side: if one party is clearly a corporation, developer, estate, or builder (e.g. "J.P. Custom Homes Ltd.", "Estate Of..."), the agent likely represented the individual/personal party on the other side. Otherwise set null.
- Party names come from the client column — split on " / " to get party_a and party_b.
- Return ONLY the JSON object, nothing else.`;

export async function POST(req: NextRequest) {
  // Auth guard — must be a signed-in user
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: "GROQ_API_KEY is not configured" },
      { status: 503 },
    );
  }

  const body = await req.json();
  const { imageBase64 } = body as { imageBase64?: string };

  if (!imageBase64) {
    return NextResponse.json(
      { error: "No image data provided" },
      { status: 400 },
    );
  }

  const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
  });

  try {
    const response = await groq.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
              },
            },
            {
              type: "text",
              text: EXTRACTION_PROMPT,
            },
          ],
        },
      ],
      temperature: 0.1,   // low temp for deterministic structured extraction
      max_tokens: 3000,
    });

    const raw = response.choices[0]?.message?.content ?? "";

    // Strip markdown code fences if the model wraps the JSON
    const cleaned = raw
      .replace(/^```(?:json)?\s*/m, "")
      .replace(/\s*```\s*$/m, "")
      .trim();

    const parsed = JSON.parse(cleaned) as ImportResult;

    // Basic sanity check
    if (
      typeof parsed.year !== "number" ||
      typeof parsed.annual_gci !== "number" ||
      !Array.isArray(parsed.deals)
    ) {
      return NextResponse.json(
        { error: "Extracted data is malformed", raw },
        { status: 422 },
      );
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[import-history] extraction error:", err);
    return NextResponse.json(
      { error: "Failed to extract data from document" },
      { status: 422 },
    );
  }
}
