import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { TEXT_PROMPT } from "@/lib/import-prompt";
import { applyValidation } from "@/lib/import/validation/validate-transactions";
import { normalizeTextDocument } from "@/lib/import/normalizers/normalize-text";
import type { ColumnClassification } from "@/lib/import/heuristics/column-classifier";
import type { ExtractionProvenance, ExtractionQuality, ImportDebug } from "@/lib/import/types";
import { normalizeDateFormats } from "@/lib/import/normalizers/normalize-dates";

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
  /**
   * Present when the normalizer had to truncate the document to fit within
   * the 20 000-character limit.  The UI should warn the user that only a
   * portion of the file was analysed.
   */
  truncation_warning?: {
    rows_kept:  number;
    rows_total: number;
  };
  /** Overall quality signal for this import run. Only set by server-side imports. */
  extraction_quality?: ExtractionQuality;
  /**
   * Document subtype detected by the column classifier.
   * "brokerage" triggers the review-required safeguard in the UI.
   * undefined for tracker imports parsed client-side or vision imports.
   */
  document_subtype?: "tracker" | "brokerage" | "generic";
  /**
   * How this document was processed.
   * "vision" triggers the PDF/image review tag in the UI.
   * undefined for tracker imports parsed client-side.
   */
  import_source?: "text" | "vision";
  /** Diagnostic snapshot — only present outside production. */
  debug?: ImportDebug;
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
   Focus ONLY on the "Commissions Earned" rows (transactions with dates, names, and dollar amounts).

6. LONE WOLF / BACK OFFICE REPORTS:
   These brokerage reports (Royal LePage, Coldwell Banker, etc.) use "Lone Wolf Back Office" software.
   - "Tax Worksheet" format has: Trade#, Address, Date, Buyer/Seller, Commission (=GCI), Deductions, Taxable (=net_income), HST
   - "Trade Sheet" / "Cheque Summary" format has: Trade#, Property Address, Gross (=GCI), Buyer, Seller, Net Pay (=net_income), Selling Price (=sale_price)
   - The "Commission" column in a Tax Worksheet IS the gross commission (GCI), not net.
   - The "Taxable" column IS the net income after deductions/split.
   - "PLAN 75/25" or similar means the brokerage split — ignore for extraction, just capture the amounts.

7. Return ONLY the JSON — nothing before or after it.`;

// TEXT_PROMPT is in lib/import-prompt.ts (shared with accuracy test runner).

// ── Aggregate computation (done in code — not trusted to Groq) ───────────────

/**
 * Build column-level provenance for LLM-extracted deals when the pre-classifier
 * detected a column mapping.  Unlike tracker provenance (which knows the exact
 * row), this describes WHERE the LLM was instructed to look for each field —
 * i.e. which column header was classified as GCI, net income, etc.
 *
 * This is a weaker form of provenance than tracker provenance (no row number)
 * but still more informative than nothing, and it makes the source traceable.
 *
 * Only called when column_classification is non-null (tabular documents).
 * Never called for vision/OCR documents.
 */
function buildLlmProvenance(
  cls:     ColumnClassification,
  headers: string[],
): ExtractionProvenance {
  const colLabel = (idx: number) =>
    idx >= 0 ? `Column "${headers[idx]?.trim() || `col ${idx}`}" (col ${idx})` : null;

  return {
    gci:                cls.gci                !== -1 ? `LLM guided to ${colLabel(cls.gci)}`                : null,
    sale_price:         cls.sale_price         !== -1 ? `LLM guided to ${colLabel(cls.sale_price)}`         : null,
    net_income:         cls.net_income         !== -1 ? `LLM guided to ${colLabel(cls.net_income)}`         : null,
    commission_percent: cls.commission_percent !== -1 ? `LLM guided to ${colLabel(cls.commission_percent)}` : null,
    names:              cls.name               !== -1 ? `LLM guided to ${colLabel(cls.name)}`               : null,
    date:               cls.date               !== -1 ? `LLM guided to ${colLabel(cls.date)}`               : null,
    address:            cls.address            !== -1 ? `LLM guided to ${colLabel(cls.address)}`            : null,
  };
}

function computeAggregates(
  deals:               GroqRawResponse["deals"],
  year:                number,
  columnClassification?: ColumnClassification | null,
  rawHeaderRow?:         string[] | null,
): ImportResult {
  // Build column-level provenance once if classifier data is available
  const llmProvenance: ExtractionProvenance | null =
    columnClassification && rawHeaderRow
      ? buildLlmProvenance(columnClassification, rawHeaderRow)
      : null;
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
      // Column-level provenance: only set when the heuristic classifier identified
      // which column each field came from in the source document.
      // Absent for vision/OCR imports where no structured column layout exists.
      provenance:         llmProvenance ?? undefined,
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

// ── Quality + debug helpers ───────────────────────────────────────────────────

function computeExtractionQuality(
  deals:     ExtractedDeal[],
  truncated: boolean,
): ExtractionQuality {
  if (deals.length === 0) return "needs_review";

  const lowOrMissingGci = deals.filter(
    d => d.confidence?.gci === "low" || d.confidence?.gci === "missing",
  ).length;
  if (lowOrMissingGci / deals.length > 0.5) return "needs_review";

  const dealsWithIssues = deals.filter(d => (d.issues?.length ?? 0) > 0).length;
  const missingAddress  = deals.filter(d => !d.address).length;

  if (
    truncated ||
    dealsWithIssues / deals.length > 0.25 ||
    missingAddress  / deals.length > 0.5
  ) return "partial";

  return "good";
}

function computeImportDebug(
  deals:          ExtractedDeal[],
  importPath:     ImportDebug["import_path"],
  normStats:      ReturnType<typeof normalizeTextDocument>["stats"] | null,
  columnSubtype:  ImportDebug["column_subtype"],
  hintsInjected:  boolean,
): ImportDebug {
  const dealsWithIssues = deals.filter(d => (d.issues?.length ?? 0) > 0).length;

  // Count field presence
  const fieldPresence: ImportDebug["field_presence"] = {
    gci:                deals.filter(d => d.gci > 0).length,
    net_income:         deals.filter(d => d.net_income != null).length,
    sale_price:         deals.filter(d => d.sale_price != null).length,
    commission_percent: deals.filter(d => d.commission_percent != null).length,
    address:            deals.filter(d => !!d.address).length,
    date:               deals.filter(d => !!d.date).length,
    names:              deals.filter(d => !!d.party_a).length,
  };

  // Collect all issue messages and count frequency
  const issueCounts = new Map<string, number>();
  for (const deal of deals) {
    for (const msg of deal.issues ?? []) {
      issueCounts.set(msg, (issueCounts.get(msg) ?? 0) + 1);
    }
  }
  const top_issues = [...issueCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([message, count]) => ({ message, count }));

  return {
    import_path:          importPath,
    normalization_ran:    normStats !== null,
    column_subtype:       columnSubtype,
    column_hints_injected: hintsInjected,
    truncated:            normStats?.truncated ?? false,
    rows_input:           normStats?.input_rows ?? 0,
    rows_kept:            normStats?.output_rows ?? 0,
    deals_extracted:      deals.length,
    deals_with_issues:    dealsWithIssues,
    field_presence:       fieldPresence,
    top_issues,
  };
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
  // Cap at 20 pages to prevent unbounded memory / Groq context usage
  const MAX_IMAGES = 20;
  const rawImages = body.images?.length
    ? body.images.slice(0, MAX_IMAGES)
    : body.imageBase64
      ? [{ base64: body.imageBase64, mimeType: body.mimeType ?? "image/jpeg" }]
      : [];
  const imageSources: Array<{ base64: string; mimeType: string }> = rawImages;

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
    // Populated in the text path; used after parsing to wire provenance + truncation.
    let textNormalized: ReturnType<typeof normalizeTextDocument> | null = null;

    if (body.textContent) {
      // ── Text path: Excel / CSV / TXT ─────────────────────────────────────
      // 1. Date normalization (Excel serials, slash-date disambiguation)
      const dateNormalized = normalizeDateFormats(body.textContent);

      // 2. Row cleaning + column classification (strips subtotals, blank rows,
      //    duplicate headers; detects column mapping for prompt injection)
      textNormalized = normalizeTextDocument(dateNormalized, true);

      const response = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "user",
            content: TEXT_PROMPT(
              textNormalized.cleaned_content,
              textNormalized.column_hints ?? undefined,
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

    // Compute all aggregates in code + run validators.
    // Pass column classification when available (text path only) so LLM deals
    // can receive column-level provenance alongside their LLM-generated evidence.
    const result = computeAggregates(
      parsed.deals,
      effectiveYear,
      textNormalized?.column_classification ?? null,
      textNormalized?.raw_header_row ?? null,
    );

    const truncated = textNormalized?.stats.truncated ?? false;

    // Determine import path for debug metadata
    const importPath: ImportDebug["import_path"] =
      body.textContent ? "text-llm" :
      imageSources.length > 1 ? "vision-multi" : "vision-single";

    const columnSubtype = textNormalized?.column_classification?.document_subtype ?? null;
    const hintsInjected = !!(textNormalized?.column_hints);

    // Compute quality signal
    const extraction_quality = computeExtractionQuality(result.deals, truncated);

    // Compute debug snapshot (non-production only)
    const debug: ImportDebug | undefined =
      process.env.NODE_ENV !== "production"
        ? computeImportDebug(
            result.deals,
            importPath,
            textNormalized?.stats ?? null,
            columnSubtype,
            hintsInjected,
          )
        : undefined;

    // Attach truncation warning if the normalizer had to drop rows to fit 20k chars.
    const response: ImportResult = {
      ...result,
      extraction_quality,
      document_subtype: textNormalized?.column_classification?.document_subtype,
      import_source:    body.textContent ? "text" : "vision",
      ...(debug && { debug }),
      ...(truncated && {
        truncation_warning: {
          rows_kept:  textNormalized!.stats.output_rows,
          rows_total: textNormalized!.stats.input_rows,
        },
      }),
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[import-history] error:", err);
    return NextResponse.json({ error: "Failed to extract data from document" }, { status: 422 });
  }
}
