import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { TEXT_PROMPT } from "@/lib/import-prompt";

// ── Exported types shared with the client component ──────────────────────────

export interface ExtractedDeal {
  date: string;          // YYYY-MM-DD
  address: string;
  sale_price: number;    // property sale / transaction price (0 if not found in document)
  gci: number;           // agent's net commission for this deal (post-split)
  party_a: string;       // names from ONE side of the deal (before the /)
  party_b: string;       // names from the OTHER side (after the /)
  agent_side: 0 | 1 | null; // 0 = represented party_a, 1 = party_b, null = unclear
  source?: string;       // lead source: SOI, Agent Referral, Realtor.ca, etc.
  side?: "buyer" | "seller" | "both"; // agent's role: from "Buy | Sell" column
  confidence?: {
    gci: "high" | "medium" | "low";
    sale_price: "high" | "medium" | "low" | "missing";
    names: "high" | "medium" | "low";
    date: "high" | "medium" | "low";
    address: "high" | "medium" | "low" | "missing";
  };
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
    sale_price?: number | string | null;
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
      "address": "<property street address, or empty string if not shown>",
      "sale_price": <number — the property sale / transaction price (e.g. 485000). Look for columns labelled "Sale Price", "Transaction Price", "Purchase Price", "Selling Price", "Listed/Sold Price", "Property Value", or similar. Set to 0 if no sale price column exists in this document.>,
      "gci": <number — the agent's NET commission after the brokerage split. Look for columns labelled "Taxable", "Net Commission", "Agent Share", "Net", "Your Commission", or similar. Do NOT use the gross/full commission before split.>,
      "party_a": "<ALL names from ONE side of the transaction — everything BEFORE the first '/' separator>",
      "party_b": "<ALL names from the OTHER side — everything AFTER the first '/' separator>",
      "agent_side": <0 if evidence suggests agent represented party_a, 1 if party_b, null if unclear>,
      "confidence": {
        "gci": "<high | medium | low> — high if an exact labelled GCI/Net column was found, medium if inferred, low if estimated",
        "sale_price": "<high | medium | low | missing> — missing if no sale price column in document",
        "names": "<high | medium | low> — high if names are clearly formatted, medium if partial, low if ambiguous",
        "date": "<high | medium | low> — high if explicit date, medium if inferred from quarter, low if estimated",
        "address": "<high | medium | low | missing> — missing if no address in document"
      }
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

3. SALE PRICE — look for any column indicating the property value or transaction amount:
   - Common labels: "Sale Price", "Purchase Price", "Selling Price", "Transaction Price", "Sold Price"
   - Do NOT confuse with commission amounts — sale prices are typically 6–8 figures for Canadian real estate
   - Set sale_price to 0 and confidence.sale_price to "missing" if no such column exists

4. agent_side hint — if one party is a corporation, estate, developer, or builder,
   the agent probably represented the individual on the other side (set 0 or 1 accordingly).
   Otherwise set null.

5. IGNORE expenses, fees, advances, or any section that is not the commission/transaction table.

6. Return ONLY the JSON — nothing before or after it.`;

// TEXT_PROMPT is now in lib/import-prompt.ts (shared with the accuracy test runner).
// Imported above.

// ── Date normalization (pre-processes content before sending to LLM) ─────────
// Two passes:
//   1. Excel serial numbers → ISO dates (so LLM never has to do serial arithmetic)
//   2. Slash dates DD/MM vs MM/DD disambiguation → ISO dates

/** Convert an Excel serial number to YYYY-MM-DD using the known 2023-01-01 = 44927 anchor. */
function excelSerialToISO(serial: number): string {
  const ANCHOR_DATE  = new Date(Date.UTC(2023, 0, 1)); // 2023-01-01
  const ANCHOR_SERIAL = 44927;
  const ms = ANCHOR_DATE.getTime() + (serial - ANCHOR_SERIAL) * 86_400_000;
  const d  = new Date(ms);
  const y  = d.getUTCFullYear();
  const m  = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeDateFormats(content: string): string {
  // Pass 1 — Excel serial numbers (5-digit integers, ~2015-2035 range)
  //
  // Strategy: if the content is a CSV with a labelled Date column, only convert
  // serials in THAT column — prevents false-positives from GCI/price values that
  // happen to fall in the 42000–47999 range (e.g. a $45,000 commission).
  // Falls back to a generic cell-boundary regex for non-CSV content.
  const SERIAL_RE = /^(4[2-7]\d{3}|48[0-3]\d\d)$/;

  const lines = content.split("\n");
  let dateColIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const cells = lines[i].split(",");
    if (cells.length >= 3) {
      const idx = cells.findIndex(c =>
        /\b(?:close[\s_]?)?date\b|\bclosing\b|\bsettlement[\s_]date\b/i.test(c.trim())
      );
      if (idx >= 0) { dateColIdx = idx; break; }
    }
  }

  let result: string;
  if (dateColIdx >= 0) {
    // Column-aware: only replace serials in the detected date column
    result = lines.map(line => {
      const cells = line.split(",");
      if (cells.length > dateColIdx) {
        const cell = cells[dateColIdx].trim();
        if (SERIAL_RE.test(cell)) {
          cells[dateColIdx] = excelSerialToISO(parseInt(cell, 10));
          return cells.join(",");
        }
      }
      return line;
    }).join("\n");
  } else {
    // Generic: replace cell-isolated serial numbers (tab/comma/newline/line-start boundaries)
    result = content.replace(
      /(?<=^|[\t,\n])(4[2-7]\d{3}|48[0-3]\d\d)(?=$|[\t,\n])/gm,
      (_, serial) => excelSerialToISO(parseInt(serial, 10)),
    );
  }

  // Pass 2 — slash dates (DD/MM/YYYY vs MM/DD/YYYY)
  const slashDate = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
  const matches = [...result.matchAll(slashDate)];
  if (matches.length === 0) return result;

  const isDDMM = matches.some(m => parseInt(m[1]) > 12);
  const isMDY  = !isDDMM && matches.some(m => parseInt(m[2]) > 12);

  if (isDDMM) {
    return result.replace(slashDate, (_, d, m, y) =>
      `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
  }
  if (isMDY) {
    return result.replace(slashDate, (_, m, d, y) =>
      `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
  }
  return result; // all ambiguous — leave for LLM
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

    const rawDeal = d as typeof d & {
      confidence?: ExtractedDeal["confidence"];
      sale_price?: number | string | null;
    };

    // Derive code-level confidence overrides for fields we can verify deterministically
    const salePrice = Number(rawDeal.sale_price ?? 0) || 0;
    const gci = Number(d.gci) || 0;
    const address = (d.address ?? "").trim();

    // If party_a still had a "/" (we just fixed it above), names confidence is medium
    const namesWereSplit = party_a !== (d.party_a ?? "").trim();

    const confidence: ExtractedDeal["confidence"] = rawDeal.confidence ?? {
      gci: gci > 0 ? "high" : "low",
      sale_price: salePrice > 0 ? "high" : "missing",
      names: namesWereSplit ? "medium" : "high",
      date: "high",
      address: address ? "high" : "missing",
    };

    // Override sale_price confidence if we can see it's missing
    if (salePrice === 0) confidence.sale_price = "missing";

    return {
      date: d.date,
      address,
      sale_price: salePrice,
      gci,
      party_a,
      party_b,
      agent_side: d.agent_side ?? null,
      source: d.source || undefined,
      side,
      confidence,
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
  // ── Auth guard ───────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── Rate limit: 10 document imports per 60-minute window ─────────────────
  // Each import makes a vision/LLM call that is both expensive and slow.
  const rl = await checkRateLimit(user.id, "import-history", 10, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many imports. Please wait before uploading another document." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

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
