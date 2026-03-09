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
  source?: string;      // lead source: SOI, Agent Referral, Realtor.ca, etc.
  side?: "buyer" | "seller" | "both"; // agent's role: from "Buy | Sell" column
}

export interface ImportResult {
  year: number;
  annual_gci: number;
  annual_tx: number;
  quarter_gci: [number, number, number, number];
  quarter_tx: [number, number, number, number];
  deals: ExtractedDeal[];
  split_pct?: number;  // detected or user-specified agent split (e.g. 0.75 = 75/25)
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
    source?: string;
    side?: string; // "buyer" | "seller" | "both" — from "Buy | Sell" column
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

// Used for text-based input (Excel converted to CSV, plain CSV, or .txt files).
// Handles:
//   A) Agent's own transaction tracker (Name | Address | Close Date | Buy | Sell | Source | GCI | Net)
//   B) Brokerage commission reports (party_a / party_b separated by "/")
//   C) Freeform narrative / bullet-point text (prose summaries, notes, copy-pasted text)
const TEXT_PROMPT = (content: string) => `You are extracting real estate commission transaction data from a document.

The data below may be in any of three formats:
  (A) An agent's own deal tracker — tabular rows with columns like Name, Address, Close Date, Buy | Sell, Source, GCI, Net Commission
  (B) A brokerage commission report — tabular rows where party names are joined by "/"
  (C) Freeform narrative / bullet-point text — prose paragraphs or bullet lists describing closed deals

DOCUMENT CONTENT:
---
${content.slice(0, 20000)}
---

Return ONLY a raw JSON object (no markdown, no code fences). Required structure:
{
  "year": <integer — the calendar year this document covers. Infer from a title line (e.g. "2024 YEAR-END TRANSACTION SUMMARY", "2025 Transaction Tracker") or from the dates. If explicitly stated in a heading, always use that year.>,
  "deals": [
    {
      "date": "<YYYY-MM-DD — closing or payment date>",
      "address": "<property street address, or empty string if not mentioned>",
      "gci": <number — the agent's GROSS commission BEFORE brokerage split. In tracker format use the "GCI" column. In narrative format use amounts labelled "GCI", "GCI earned", "Earned ... GCI", or "Commission" — NOT net/after-split amounts.>,
      "party_a": "<client name — see format rules below>",
      "party_b": "<other party name, or empty string>",
      "agent_side": <0 = agent represented party_a, 1 = party_b, null = unclear>,
      "side": "<\"buyer\" | \"seller\" | \"both\" | null — agent's role>",
      "source": "<lead source, e.g. SOI, Agent Referral, Realtor.ca — or null>"
    }
  ]
}

═══════════════════════════════════════════════════════════════════
FORMAT A — Agent's Own Tracker (tabular, one client per row)
═══════════════════════════════════════════════════════════════════
Detected when columns include: Name, Buy | Sell (or Buy/Sell), Source, GCI, Net Commission Income.

Rules:
- party_a = the Name column value (agent's client)
- party_b = "" (empty)
- agent_side = 0
- side: "Buy" → "buyer" | "Sell" → "seller" | "Buy | Sell" → "both" | "Rent" → "buyer"
- source: copy the Source column verbatim
- gci: use the "GCI" column. Do NOT use "Net Commission" or any post-split column.

Date handling — apply rules in this exact priority order:
1. If the date cell contains a SPECIFIC day (e.g. "Jan 12 2024", "March 26th 2024", "2024-04-22", "30/04/2024", "May 1 (2024)"):
   → Parse the specific date directly. NEVER fall back to a quarter-end date when a day is present.
   → Ignore any parenthetical annotation e.g. "(paid)", "(closed)".
   → For DD/MM vs MM/DD ambiguity: scan ALL dates in the file first. If ANY date has a first component > 12 (e.g. "22/04", "26/03", "30/04"), the entire file uses DD/MM/YYYY — apply DD/MM to ALL dates including ambiguous ones like "12/01/2024" (→ Jan 12, not Dec 1). Only default to MM/DD if no date in the file has a first component > 12.
2. If the date cell contains ONLY a quarter code with no day or month (exactly "Q1", "Q2", "Q3", or "Q4"):
   → Use the LAST day of that quarter for the inferred year: Q1→Mar 31, Q2→Jun 30, Q3→Sep 30, Q4→Dec 31.
3. Excel serial numbers (e.g. 45769 ≈ 2025-03-21). Anchors: 44927=2023-01-01, 45292=2024-01-01, 45658=2025-01-01, 46023=2026-01-01.
4. Partial month+year only (e.g. "Oct 2024", "June 2024"): use the 15th of that month.

EXAMPLES:
  Row: Matt Foster | 531 Ridge Row | Jan 12 (paid) | Sell | SOI | 580000 | 14500 | 10875
  → party_a="Matt Foster", side="seller", source="SOI", gci=14500

  Row: Tong & Sunny Gao | 68 Elizabeth Pkwy | 45769 | Buy | Sell | SOI | 430000 | 10750 | 8062.5
  → party_a="Tong & Sunny Gao", side="both", source="SOI", gci=10750

══════════════════════════════════════════════════════════════════
FORMAT B — Brokerage Commission Report (party_a / party_b names)
══════════════════════════════════════════════════════════════════
Detected when party names are combined with a "/" separator in one field.

Rules:
- Split on the FIRST "/" only: party_a = before, party_b = after (trimmed)
- "&" connects people on the SAME side — never a separator between sides
- agent_side: 0 if agent represented party_a, 1 if party_b, null if unclear
- side: null | source: null

══════════════════════════════════════════════════════════════════════
FORMAT C — Freeform Narrative / Bullet-Point Text
══════════════════════════════════════════════════════════════════════
Detected when the content is prose paragraphs or bullet lists rather than rows with consistent columns.
Examples: "January 12: Sold 531 Ridge Row for Matt Foster. GCI earned $14,500."
          "- Jun 12: Buyer rep for Angelique Simpson — purchased 139 McCarthy's Point Road. Earned $12,700 GCI."
          "May 2: Out-of-area referral sent for Travis & Chryssie Radtke (Cape Breton). Received referral fee of $832.70."

Rules for Format C:
- Extract EVERY transaction mentioned — including small referral fees, rentals, and out-of-area referrals
- party_a = the client name (person described as "for [Name]", "buyer rep for [Name]", "[Name] purchased", etc.)
- party_b = "" (narratives typically only mention the agent's client)
- agent_side = 0
- side: look for words like "Sold/Listing/Sell" → "seller"; "Buyer rep/purchased/bought" → "buyer"; "Double-ended/both sides" → "both"
- source: extract from phrases like "SOI", "Agent Referral", "Realtor.ca", "Referral from SOI", "Database" etc.
- gci: extract the dollar amount labelled "GCI", "GCI earned", "Earned ... GCI", "Commission", or "referral fee". Use the GROSS (pre-split) amount when both gross and net are mentioned.
- date: extract from date mentions at the start of bullets or sentences. If only a quarter section is given (e.g. "Q2 CLOSINGS:"), use the last day of that quarter.
- address: extract any street address mentioned (e.g. "531 Ridge Row", "139 McCarthy's Point Road"). If only a city/region is mentioned (e.g. "Cape Breton"), use that as the address.

CRITICAL for Format C: Do NOT skip deals just because they are small, referral-only, or lack a property address. Every bullet or sentence describing a closed transaction or referral fee must produce one deal object.

══════════════════════════════════════════════════
UNIVERSAL RULES (apply to ALL formats)
══════════════════════════════════════════════════
- SKIP rows/lines where party_a is empty, "Totals", "Name", or a section heading with no deal data
- SKIP subtotals, quarterly summary lines, and expense entries
- year: read from the document title/heading (e.g. "2024 YEAR-END TRANSACTION SUMMARY" → year=2024, "2025 Transaction Tracker" → year=2025)
- If no title, infer year from the dates in the data
- Return ONLY the JSON — nothing before or after it`;

// ── Date normalization (pre-processes content before sending to LLM) ─────────
// Detects DD/MM vs MM/DD by scanning all slash-dates; if any first component > 12
// the whole file is DD/MM. Converts all matched dates to ISO YYYY-MM-DD so the
// LLM never sees ambiguous date strings.

function normalizeDateFormats(content: string): string {
  const slashDate = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
  const matches = [...content.matchAll(slashDate)];
  if (matches.length === 0) return content;

  const isDDMM = matches.some(m => parseInt(m[1]) > 12);
  const isMDY  = !isDDMM && matches.some(m => parseInt(m[2]) > 12);

  if (isDDMM) {
    return content.replace(slashDate, (_, d, m, y) =>
      `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
  }
  if (isMDY) {
    return content.replace(slashDate, (_, m, d, y) =>
      `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
  }
  return content; // all ambiguous — leave for LLM
}

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

    // Normalise side value
    const rawSide = (d.side ?? "").toLowerCase();
    const side: ExtractedDeal["side"] =
      rawSide === "buyer" ? "buyer"
      : rawSide === "seller" ? "seller"
      : rawSide === "both" ? "both"
      : undefined;

    return {
      date: d.date,
      address: d.address ?? "",
      gci: Number(d.gci) || 0,
      party_a,
      party_b,
      agent_side: d.agent_side ?? null,
      source: d.source || undefined,
      side,
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

  // Derive annual totals from the year-filtered quarterly accumulators so they
  // always agree with the quarterly breakdown (deals outside `year` are excluded).
  const annual_gci = Math.round(quarter_gci.reduce((s, v) => s + v, 0) * 100) / 100;
  const annual_tx  = quarter_tx.reduce((s, v) => s + v, 0);

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
    yearHint?: number;       // override year detection (extracted from sheet name client-side)
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
      // Pre-normalise slash dates (DD/MM vs MM/DD) before the LLM ever sees them
      const normalizedContent = normalizeDateFormats(body.textContent);
      const response = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",  // text model — fast and accurate
        messages: [
          {
            role: "user",
            content: TEXT_PROMPT(normalizedContent),
          },
        ],
        temperature: 0.1,
        max_tokens: 8000,
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
        max_tokens: 8000,
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

    // yearHint from the sheet name overrides Groq's title-row year detection
    // (e.g. "2026 SALES" sheet has a title row saying "2025 Transaction Tracker")
    const effectiveYear = (body.yearHint && body.yearHint > 2000 && body.yearHint < 2100)
      ? body.yearHint
      : parsed.year;

    // Compute all aggregates in code — never trust Groq's arithmetic
    const result = computeAggregates(parsed.deals, effectiveYear);

    return NextResponse.json(result);
  } catch (err) {
    console.error("[import-history] error:", err);
    return NextResponse.json({ error: "Failed to extract data from document" }, { status: 422 });
  }
}
