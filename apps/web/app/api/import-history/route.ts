import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { TEXT_PROMPT } from "@/lib/import-prompt";
import { applyValidation } from "@/lib/import/validation/validate-transactions";
import { normalizeTextDocument } from "@/lib/import/normalizers/normalize-text";
import type { ExtractionProvenance } from "@/lib/import/types";

// ── Exported types shared with the client component ──────────────────────────
//
// FIELD SEMANTICS (keep consistent across prompts, validators, and UI):
//   gci               = Gross Commission Income — PRE-SPLIT (before brokerage cut)
//   net_income        = POST-split amount the agent actually receives
//   sale_price        = Property transaction price — null when not in document (never 0)
//   commission_percent = Commission rate as a decimal (0.03 = 3%)

export interface ExtractedDeal {
  date: string;          // YYYY-MM-DD
  address: string;
  /** Property sale / transaction price. null = not found in document. NEVER 0. */
  sale_price: number | null;
  /** Gross Commission Income — PRE-SPLIT amount the agent's side earned before brokerage cut. */
  gci: number;
  party_a: string;       // names from ONE side of the deal (before the /)
  party_b: string;       // names from the OTHER side (after the /)
  agent_side: 0 | 1 | null; // 0 = represented party_a, 1 = party_b, null = unclear
  source?: string;       // lead source: SOI, Agent Referral, Realtor.ca, etc.
  side?: "buyer" | "seller" | "both"; // agent's role: from "Buy | Sell" column
  /** Commission rate as a decimal (e.g. 0.03 = 3%). null if not in document. */
  commission_percent?: number | null;
  /** Net income AFTER brokerage split. null if split not determinable from document. */
  net_income?: number | null;
  confidence?: {
    gci:                "high" | "medium" | "low" | "missing";
    sale_price:         "high" | "medium" | "low" | "missing";
    names:              "high" | "medium" | "low";
    date:               "high" | "medium" | "low";
    address:            "high" | "medium" | "low" | "missing";
    commission_percent?: "high" | "medium" | "low" | "missing";
    net_income?:         "high" | "medium" | "low" | "missing";
  };
  /** Verbatim text from source document that produced each extracted value.
   *  null for fields extracted by deterministic parsing (no AI involved). */
  evidence?: {
    gci?:                string | null;
    sale_price?:         string | null;
    net_income?:         string | null;
    commission_percent?: string | null;
    names?:              string | null;
    date?:               string | null;
    address?:            string | null;
  };
  /** Human-readable issues detected by deterministic post-extraction validators. */
  issues?: string[];
  /**
   * Parser provenance — populated only for deals that were extracted by the
   * deterministic tracker parser (not LLM). Describes which column each value
   * came from so the UI can show "Parsed from column: GCI (col 6)" in tooltips.
   * Absent (undefined) when the deal was produced by LLM/vision extraction.
   */
  provenance?: ExtractionProvenance;
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
    /** PRE-SPLIT gross commission income */
    gci: number | string | null;
    /** POST-SPLIT net income (optional — only present when document has a net column) */
    net_income?: number | string | null;
    commission_percent?: number | string | null;
    party_a: string;
    party_b: string;
    agent_side?: 0 | 1 | null;
    source?: string;
    side?: string;
    confidence?: {
      gci?: string;
      sale_price?: string;
      net_income?: string;
      commission_percent?: string;
      names?: string;
      date?: string;
      address?: string;
    };
    evidence?: {
      gci?: string | null;
      sale_price?: string | null;
      net_income?: string | null;
      commission_percent?: string | null;
      names?: string | null;
      date?: string | null;
      address?: string | null;
    };
  }>;
}

// ── Prompts ───────────────────────────────────────────────────────────────────

// Used for image-based input (PDF rendered to JPEG, or uploaded image).
//
// FIELD SEMANTICS:
//   gci       = PRE-SPLIT gross commission income (before brokerage cut)
//   net_income = POST-SPLIT amount the agent receives
const VISION_PROMPT = `You are extracting real estate commission transaction data from a brokerage report.

Return ONLY a raw JSON object (no markdown, no code fences, no explanation).

Required JSON structure:
{
  "year": <integer — the year this report covers, e.g. 2024>,
  "deals": [
    {
      "date": "<YYYY-MM-DD — the closing or payment date of the deal>",
      "address": "<property street address, or empty string if not shown>",
      "sale_price": <number or null — the property transaction price (e.g. 485000).
        Look for "Sale Price", "Transaction Price", "Purchase Price", "Selling Price", "Listed/Sold Price".
        Return null (NOT 0) if no sale price column exists in this document.>,
      "gci": <number or null — the agent's GROSS commission income, PRE-SPLIT (before brokerage deduction).
        Look for "Gross Commission", "Commission", "Co-op Commission", "Agent Commission", or the column
        that appears BEFORE the brokerage split is applied.
        Do NOT use "Net", "Taxable", or "Agent Net" for this field — those go in net_income.
        Return null if only a net/taxable column exists.>,
      "net_income": <number or null — the agent's NET income AFTER brokerage split.
        Look for "Net Commission (Taxable)", "Taxable", "Net Commission", "Agent Net", "Your Net",
        "Your Commission", "Net Amount", "Commission Earned".
        Return null if no net/taxable column exists.>,
      "commission_percent": <number or null — commission rate as a DECIMAL (0.03 for 3%, NOT 3).
        Return null if no commission rate is visible in the document.>,
      "party_a": "<ALL names from ONE side — everything BEFORE the first '/' separator>",
      "party_b": "<ALL names from the OTHER side — everything AFTER the first '/' separator>",
      "agent_side": <0 if agent represented party_a, 1 if party_b, null if unclear>,
      "confidence": {
        "gci": "<high | medium | low | missing>",
        "sale_price": "<high | medium | low | missing>",
        "net_income": "<high | medium | low | missing>",
        "commission_percent": "<high | medium | low | missing>",
        "names": "<high | medium | low>",
        "date": "<high | medium | low>",
        "address": "<high | medium | low | missing>"
      },
      "evidence": {
        "gci": "<verbatim text that produced this value, or null>",
        "sale_price": "<verbatim text, or null>",
        "net_income": "<verbatim text, or null>",
        "commission_percent": "<verbatim text, or null>",
        "names": "<verbatim text, or null>",
        "date": "<verbatim text, or null>",
        "address": "<verbatim text, or null>"
      }
    }
  ]
}

CRITICAL RULES:

1. PARTY NAMES — "/" is the ONLY separator between the two sides of a deal.
   - party_a = everything BEFORE the first "/" (trimmed)
   - party_b = everything AFTER the first "/" (trimmed)
   - "&" joins people on the SAME side — never a separator between sides
   - NEVER include a "/" inside party_a or party_b
   - NEVER leave party_b empty when a "/" is visible in the names field

   EXAMPLES:
   - "Ashley Mathias / Jiaolao Meng"
     → party_a="Ashley Mathias", party_b="Jiaolao Meng"
   - "John & Mary Smith / Bob Jones Ltd."
     → party_a="John & Mary Smith", party_b="Bob Jones Ltd."
   - "Afshin & Donya Adivi / Estate Of Audrey Elizabeth Ferris"
     → party_a="Afshin & Donya Adivi", party_b="Estate Of Audrey Elizabeth Ferris"

2. GCI vs NET INCOME — these are different fields:
   - gci       = PRE-SPLIT gross (Gross Commission, Commission, Co-op). Always ≥ net_income.
   - net_income = POST-SPLIT net (Taxable, Agent Net, Your Net). Always ≤ gci.
   - If only ONE commission column: put it in net_income and leave gci=null.
   - NEVER put the same value in both fields.

   WORKED EXAMPLES:
     Gross Commission=14550  Agent Net (Taxable)=11640  → gci=14550, net_income=11640
     Gross Commission=28750  Your Net=23000             → gci=28750, net_income=23000
     Net Commission (Taxable)=9200 (only column)        → gci=null,  net_income=9200

3. SALE PRICE — typically 6–8 figures for Canadian real estate.
   - Do NOT confuse with commission amounts.
   - Return null (not 0) when no sale price column exists.

4. agent_side — if one party is a corporation, estate, or developer,
   the agent probably represented the individual. Set 0 or 1 accordingly.

5. IGNORE expenses, fees, advances, T4A summaries, or any non-commission section.

6. Return ONLY the JSON — nothing before or after it.`;

// TEXT_PROMPT is in lib/import-prompt.ts (shared with accuracy test runner).

// ── Date normalization (pre-processes content before sending to LLM) ─────────
// Two passes:
//   1. Excel serial numbers → ISO dates (so LLM never has to do serial arithmetic)
//   2. Slash dates DD/MM vs MM/DD disambiguation → ISO dates

/** Convert an Excel serial number to YYYY-MM-DD using the known 2023-01-01 = 44927 anchor. */
function excelSerialToISO(serial: number): string {
  const ANCHOR_DATE   = new Date(Date.UTC(2023, 0, 1)); // 2023-01-01
  const ANCHOR_SERIAL = 44927;
  const ms  = ANCHOR_DATE.getTime() + (serial - ANCHOR_SERIAL) * 86_400_000;
  const d   = new Date(ms);
  const y   = d.getUTCFullYear();
  const m   = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeDateFormats(content: string): string {
  // Pass 1 — Excel serial numbers (5-digit integers, ~2015-2035 range)
  //
  // Strategy: if the content is a CSV with a labelled Date column, only convert
  // serials in THAT column — prevents false-positives from GCI/price values that
  // happen to fall in the 42000–47999 range (e.g. a $45,000 commission).
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
    // Generic: replace cell-isolated serial numbers (tab/comma/newline boundaries)
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

    // Safety net: if LLM put the full "Name A / Name B" string into party_a
    // and left party_b empty, split it here in code — guaranteed correct.
    if (party_a.includes("/") && !party_b) {
      const slashIdx = party_a.indexOf("/");
      party_b = party_a.slice(slashIdx + 1).trim();
      party_a = party_a.slice(0, slashIdx).trim();
    }

    // Normalise side value
    const rawSide = (d.side ?? "").toLowerCase();
    const side: ExtractedDeal["side"] =
      rawSide === "buyer"  ? "buyer"
      : rawSide === "seller" ? "seller"
      : rawSide === "both"   ? "both"
      : undefined;

    const rawDeal = d as typeof d & {
      confidence?: ExtractedDeal["confidence"];
      sale_price?: number | string | null;
    };

    // Parse numeric fields safely
    const salePrice        = d.sale_price != null ? (Number(d.sale_price) || null) : null;
    const gci              = Number(d.gci) || 0;
    const netIncome        = d.net_income != null ? (Number(d.net_income) || null) : null;
    const commissionPct    = d.commission_percent != null ? (Number(d.commission_percent) || null) : null;
    const address          = (d.address ?? "").trim();

    // If party_a had a "/" that we just split, confidence for names is medium
    const namesWereSplit = party_a !== (d.party_a ?? "").trim();

    // Build confidence — use LLM's self-reported values as the starting point,
    // then override fields we can verify deterministically.
    // llmConf is typed as the confidence sub-object from GroqRawResponse (string values).
    type LlmConf = NonNullable<GroqRawResponse["deals"][number]["confidence"]>;
    const llmConf: Partial<LlmConf> = rawDeal.confidence ?? {};
    const confidence: NonNullable<ExtractedDeal["confidence"]> = {
      gci:                (llmConf.gci  as NonNullable<ExtractedDeal["confidence"]>["gci"])  ?? (gci > 0 ? "high" : "low"),
      sale_price:         (llmConf.sale_price  as NonNullable<ExtractedDeal["confidence"]>["sale_price"])  ?? (salePrice != null ? "high" : "missing"),
      names:              namesWereSplit ? "medium" : ((llmConf.names as NonNullable<ExtractedDeal["confidence"]>["names"]) ?? "high"),
      date:               (llmConf.date  as NonNullable<ExtractedDeal["confidence"]>["date"])  ?? "high",
      address:            (llmConf.address  as NonNullable<ExtractedDeal["confidence"]>["address"])  ?? (address ? "high" : "missing"),
      commission_percent: (llmConf.commission_percent  as NonNullable<ExtractedDeal["confidence"]>["commission_percent"])  ?? (commissionPct != null ? "high" : "missing"),
      net_income:         (llmConf.net_income  as NonNullable<ExtractedDeal["confidence"]>["net_income"])  ?? (netIncome != null ? "high" : "missing"),
    };

    // Code-level confidence overrides for fields we can verify deterministically
    if (salePrice == null) confidence.sale_price = "missing";
    if (gci <= 0)          confidence.gci         = "missing";

    return {
      date:               d.date,
      address,
      sale_price:         salePrice,
      gci,
      net_income:         netIncome,
      commission_percent: commissionPct,
      party_a,
      party_b,
      agent_side:         d.agent_side ?? null,
      source:             d.source || undefined,
      side,
      confidence,
      evidence:           d.evidence ?? undefined,
    };
  });

  // Run deterministic validators on each deal
  const validatedDeals = cleanDeals.map((deal) => applyValidation(deal, year));

  const quarter_gci: [number, number, number, number] = [0, 0, 0, 0];
  const quarter_tx:  [number, number, number, number] = [0, 0, 0, 0];

  for (const deal of validatedDeals) {
    // Parse date — add noon to avoid UTC-offset day-boundary issues
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

  // Derive annual totals from year-filtered quarterly accumulators
  const annual_gci = Math.round(quarter_gci.reduce((s, v) => s + v, 0) * 100) / 100;
  const annual_tx  = quarter_tx.reduce((s, v) => s + v, 0);

  return { year, annual_gci, annual_tx, quarter_gci, quarter_tx, deals: validatedDeals };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth guard ───────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── Rate limit: 10 document imports per 60-minute window ─────────────────
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
    /** Multi-page images (e.g. scanned PDF pages). Takes precedence over imageBase64. */
    images?: Array<{ base64: string; mimeType: string; page?: number }>;
    mimeType?: string;        // e.g. "image/jpeg" — used with legacy imageBase64
    textContent?: string;     // for Excel/CSV/TXT
    yearHint?: number;        // override year detection (from sheet name client-side)
  };

  // Normalise to a single image source list (backward-compat with single imageBase64)
  const imageSources: Array<{ base64: string; mimeType: string }> =
    body.images?.length
      ? body.images
      : body.imageBase64
        ? [{ base64: body.imageBase64, mimeType: body.mimeType ?? "image/jpeg" }]
        : [];

  if (!body.textContent && imageSources.length === 0) {
    return NextResponse.json({ error: "No data provided" }, { status: 400 });
  }

  const yearHintValid =
    body.yearHint && body.yearHint > 2000 && body.yearHint < 2100
      ? body.yearHint
      : undefined;

  const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
  });

  try {
    let raw: string;

    if (body.textContent) {
      // ── Text path: Excel / CSV / TXT ─────────────────────────────────────
      // 1. Date normalization (Excel serials, slash-date disambiguation)
      const dateNormalized = normalizeDateFormats(body.textContent);

      // 2. Row cleaning + column classification (strips subtotals, blank rows,
      //    duplicate headers; detects column mapping for prompt injection)
      const normalized = normalizeTextDocument(dateNormalized, true);

      const response = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "user",
            content: TEXT_PROMPT(
              normalized.cleaned_content,
              normalized.column_hints ?? undefined,
            ),
          },
        ],
        temperature: 0.1,
        max_tokens: 8000,
      });
      raw = response.choices[0]?.message?.content ?? "";
    } else {
      // ── Vision path: PDF pages or uploaded image(s) ───────────────────────
      // Build message content: all images first, then the prompt text.
      // Groq vision supports multiple images in a single message.
      const imageContent = imageSources.map((img) => ({
        type: "image_url" as const,
        image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
      }));

      const response = await groq.chat.completions.create({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
          {
            role: "user",
            content: [
              ...imageContent,
              { type: "text" as const, text: VISION_PROMPT },
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

    // yearHint from the sheet name overrides LLM's title-row year detection
    const effectiveYear = yearHintValid ?? parsed.year;

    // Compute all aggregates in code + run validators
    const result = computeAggregates(parsed.deals, effectiveYear);

    return NextResponse.json(result);
  } catch (err) {
    console.error("[import-history] error:", err);
    return NextResponse.json({ error: "Failed to extract data from document" }, { status: 422 });
  }
}
