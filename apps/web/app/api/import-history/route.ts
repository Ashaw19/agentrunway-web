import { generateText } from "ai";
import { models, heliconeHeaders } from "@/lib/ai/provider";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { requirePro } from "@/lib/require-pro";
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
      // Use lastIndexOf so company names like "ABC & Co. / XYZ Partners" split at the right place
      const slashIdx = party_a.lastIndexOf("/");
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

    // Parse numeric fields safely — strip currency symbols/commas the LLM may include.
    // Also handles accounting-format negatives: (1,500.00) → -1500.
    const toNum = (v: unknown): number | null => {
      if (v == null) return null;
      let s = String(v).replace(/[$,\s]/g, "");
      const isAccounting = s.startsWith("(") && s.endsWith(")");
      if (isAccounting) s = s.slice(1, -1);
      const n = Number(s);
      if (isNaN(n)) return null;
      return isAccounting ? -n : n;
    };
    const salePrice        = toNum(d.sale_price);
    let   gci              = toNum(d.gci) ?? 0;
    const netIncome        = toNum(d.net_income);
    // LLMs sometimes return commission as a string with a % sign (e.g. "3.5%") — strip it before parsing.
    // Also normalize whole-number percentages (e.g. 5 → 0.05).
    let   commissionPct    = d.commission_percent != null
      ? (Number(String(d.commission_percent).replace(/[%\s]/g, "")) || null)
      : null;
    if (commissionPct != null && commissionPct > 1) commissionPct = commissionPct / 100;
    const address          = (d.address ?? "").trim();

    // GCI arithmetic fix: when the LLM had to compute GCI from sale_price × commission_percent,
    // it may introduce rounding errors. Recalculate in code when the values are available and
    // the LLM's GCI is close (within 5%) to the expected product — proving it was derived, not read.
    if (salePrice != null && salePrice > 0 && commissionPct != null && commissionPct > 0 && gci > 0) {
      const computed = Math.round(salePrice * commissionPct * 100) / 100;
      const diff = Math.abs(gci - computed);
      if (diff > 0.5 && diff / computed < 0.05) {
        gci = computed;
      }
    }

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

    // Deals with invalid/missing dates: still count in annual totals but not quarterly
    if (isNaN(dealYear)) {
      quarter_gci[0] += deal.gci; // bucket into Q1 as fallback
      quarter_tx[0]++;
      continue;
    }

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

// Allow up to 60 seconds for LLM extraction (default 10-15s is too short for
// large documents, especially vision-based extraction of multi-page PDFs).
export const maxDuration = 60;

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth guard ───────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const proCheck = await requirePro(supabase, user.id);
  if (!proCheck.allowed) return proCheck.response!;

  // ── Rate limit: 30 document imports per 60-minute window ─────────────────
  const rl = await checkRateLimit(user.id, "import-history", 30, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many imports. Please wait before uploading another document." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  if (!(process.env.ANTHROPIC_API_KEY || process.env.GROQ_API_KEY)) {
    return NextResponse.json({ error: "AI provider is not configured" }, { status: 503 });
  }

  // Reject oversized payloads before parsing (prevent OOM on base64 images).
  // Vercel serverless functions enforce a ~4.5 MB body limit; set ours just
  // below that so we return a helpful error message rather than Vercel's generic 413.
  // Pre-parse check uses Content-Length header; post-parse check guards clients that omit it.
  const MAX_BODY_SIZE = 4.5 * 1024 * 1024; // 4.5MB (Vercel serverless limit)
  const contentLength = parseInt(req.headers.get("content-length") ?? "0", 10);
  if (contentLength > MAX_BODY_SIZE) {
    return NextResponse.json(
      { error: "File too large for direct upload. Try a smaller file or split into multiple uploads." },
      { status: 413 },
    );
  }

  let bodyRaw: string;
  try {
    bodyRaw = await req.text();
  } catch {
    return NextResponse.json({ error: "Could not read request body" }, { status: 400 });
  }
  if (bodyRaw.length > MAX_BODY_SIZE) {
    return NextResponse.json(
      { error: "File too large for direct upload. Try a smaller file or split into multiple uploads." },
      { status: 413 },
    );
  }
  let body: {
    imageBase64?: string;
    /** Multi-page images (e.g. scanned PDF pages). Takes precedence over imageBase64. */
    images?: Array<{ base64: string; mimeType: string; page?: number }>;
    mimeType?: string;        // e.g. "image/jpeg" — used with legacy imageBase64
    textContent?: string;     // for Excel/CSV/TXT
    yearHint?: number;        // override year detection (from sheet name client-side)
  };
  try {
    body = JSON.parse(bodyRaw);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

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

  const aiHeaders = heliconeHeaders({ userId: user.id, feature: "import-history" });

  try {
    let raw: string;
    // Populated in the text path; used after parsing to wire provenance + truncation.
    let textNormalized: ReturnType<typeof normalizeTextDocument> | null = null;

    if (body.textContent) {
      // ── Text path: Excel / CSV / TXT ─────────────────────────────────────

      // Reject UTF-16 encoded files before any processing. UTF-16 files contain
      // a BOM of 0xFF 0xFE (little-endian) or 0xFE 0xFF (big-endian), which
      // JavaScript represents as the two-char sequences "\uFFFD\uFEFF" or similar
      // when the bytes are misread as UTF-8. The safest signal is a high density
      // of null characters (\u0000) — UTF-16 ASCII text has a null byte between
      // every character. If >10% of the first 200 chars are null, it's UTF-16.
      const sampleForEncoding = body.textContent.slice(0, 200);
      const nullCount = (sampleForEncoding.match(/\u0000/g) ?? []).length;
      if (nullCount / Math.max(sampleForEncoding.length, 1) > 0.1) {
        return NextResponse.json(
          { error: "This file appears to be UTF-16 encoded. Please re-save it as UTF-8 CSV and try again." },
          { status: 422 },
        );
      }

      // Strip UTF-8 BOM (U+FEFF) if present — common in CSV files saved by
      // Excel on Windows and older Canadian real-estate software. Without this,
      // the first column header gets a leading \uFEFF that breaks keyword
      // matching and column classification.
      const rawText = body.textContent.startsWith("\uFEFF")
        ? body.textContent.slice(1)
        : body.textContent;

      // 1. Date normalization (Excel serials, slash-date disambiguation)
      const dateNormalized = normalizeDateFormats(rawText);

      // 2. Row cleaning + column classification (strips subtotals, blank rows,
      //    duplicate headers; detects column mapping for prompt injection)
      textNormalized = normalizeTextDocument(dateNormalized, true);

      const promptContent = TEXT_PROMPT(
        textNormalized.cleaned_content,
        textNormalized.column_hints ?? undefined,
      );

      // Primary: Claude Haiku (fast, cheap), fallback to Groq Llama
      try {
        const { text } = await generateText({
          model: models.fast,
          prompt: promptContent,
          temperature: 0.1,
          maxOutputTokens: 8000,
          headers: aiHeaders,
        });
        raw = text;
      } catch (primaryErr) {
        console.warn("[import] Primary model (Haiku) failed, falling back to Groq:", primaryErr);
        const { text } = await generateText({
          model: models.fallback,
          prompt: promptContent,
          temperature: 0.1,
          maxOutputTokens: 8000,
          headers: aiHeaders,
        });
        raw = text;
      }
    } else {
      // ── Vision/document path: PDF pages or uploaded image(s) ─────────────
      // Build message content: images/PDFs first, then the prompt text.
      // When mimeType is "application/pdf", use Claude's native document type
      // (handles all valid PDFs including those with uncommon color spaces that
      // would fail pdfjs client-side). Otherwise use the image type for JPEG pages.
      const documentContent = imageSources.map((img) => {
        if (img.mimeType === "application/pdf") {
          return {
            type: "file" as const,
            data: `data:application/pdf;base64,${img.base64}`,
            mediaType: "application/pdf" as const,
          };
        }
        return {
          type: "image" as const,
          image: `data:${img.mimeType};base64,${img.base64}`,
        };
      });

      // Primary: Claude Haiku (native PDF support), fallback to Groq Llama (images only)
      try {
        const { text } = await generateText({
          model: models.fast,
          messages: [
            {
              role: "user" as const,
              content: [
                ...documentContent,
                { type: "text" as const, text: VISION_PROMPT },
              ],
            },
          ],
          temperature: 0.1,
          maxOutputTokens: 8000,
          headers: aiHeaders,
        });
        raw = text;
      } catch (primaryErr) {
        console.warn("[import] Vision model (Haiku) failed, falling back to Groq:", primaryErr);
        // Groq doesn't support native PDF — filter to image-only content
        const imageOnlyContent = documentContent.filter(
          (c) => c.type === "image",
        );
        if (imageOnlyContent.length === 0) {
          // All content was PDF (no image pages) — can't fall back to Groq
          throw new Error("PDF extraction failed. Please try again or convert to images.");
        }
        const { text } = await generateText({
          model: models.fallback,
          messages: [
            {
              role: "user" as const,
              content: [
                ...imageOnlyContent,
                { type: "text" as const, text: VISION_PROMPT },
              ],
            },
          ],
          temperature: 0.1,
          maxOutputTokens: 8000,
          headers: aiHeaders,
        });
        raw = text;
      }
    }

    // Extract JSON from the LLM response — handles markdown fences, preamble text,
    // and trailing commentary that would break a naive JSON.parse.
    let parsed: GroqRawResponse;
    {
      // Strategy 1: strip markdown fences
      const cleaned = raw
        .replace(/^```(?:json)?\s*/m, "")
        .replace(/\s*```\s*$/m, "")
        .trim();

      // Strategy 2: if that didn't yield valid JSON, find the first COMPLETE { … } block
      // Uses bracket counting rather than lastIndexOf to avoid grabbing a stray }
      // in trailing commentary after the real JSON object.
      let jsonCandidate = cleaned;
      if (!cleaned.startsWith("{")) {
        const firstBrace = cleaned.indexOf("{");
        if (firstBrace !== -1) {
          let depth = 0;
          let endIdx = -1;
          for (let i = firstBrace; i < cleaned.length; i++) {
            if (cleaned[i] === "{") depth++;
            else if (cleaned[i] === "}") {
              depth--;
              if (depth === 0) { endIdx = i; break; }
            }
          }
          if (endIdx !== -1) {
            jsonCandidate = cleaned.slice(firstBrace, endIdx + 1);
          }
        }
      }

      try {
        parsed = JSON.parse(jsonCandidate) as GroqRawResponse;
      } catch {
        // Log the raw response so we can diagnose in Vercel logs
        console.error("[import-history] JSON parse failed. Response length:", raw.length, "First 100 chars:", raw.slice(0, 100));
        throw new Error("JSON parse failed");
      }
    }

    if (typeof parsed.year !== "number" || !Array.isArray(parsed.deals)) {
      console.error("[import-history] Malformed response schema. Response length:", raw.length);
      return NextResponse.json({ error: "Malformed response" }, { status: 422 });
    }

    if (parsed.deals.length === 0) {
      return NextResponse.json(
        { error: "No transaction data found in this document. Please check the file and try again." },
        { status: 422 },
      );
    }

    // yearHint from the sheet name overrides LLM's title-row year detection.
    // If no hint and LLM returned an implausible year, default to current year.
    const currentYear = new Date().getFullYear();
    const llmYear = parsed.year > 2000 && parsed.year <= currentYear + 1 ? parsed.year : currentYear;
    const effectiveYear = yearHintValid ?? llmYear;

    const truncated = textNormalized?.stats.truncated ?? false;
    const importPath: ImportDebug["import_path"] =
      body.textContent ? "text-llm" :
      imageSources.length > 1 ? "vision-multi" : "vision-single";
    const columnSubtype = textNormalized?.column_classification?.document_subtype ?? null;
    const hintsInjected = !!(textNormalized?.column_hints);
    const importSource: "text" | "vision" = body.textContent ? "text" : "vision";

    // Helper to build a full ImportResult from aggregates
    const buildResponse = (result: ReturnType<typeof computeAggregates>): ImportResult => {
      const extraction_quality = computeExtractionQuality(result.deals, truncated);
      const debug: ImportDebug | undefined =
        process.env.NODE_ENV !== "production"
          ? computeImportDebug(result.deals, importPath, textNormalized?.stats ?? null, columnSubtype, hintsInjected)
          : undefined;
      return {
        ...result,
        extraction_quality,
        document_subtype: textNormalized?.column_classification?.document_subtype,
        import_source: importSource,
        ...(debug && { debug }),
        ...(truncated && {
          truncation_warning: {
            rows_kept:  textNormalized!.stats.output_rows,
            rows_total: textNormalized!.stats.input_rows,
          },
        }),
      };
    };

    // ── Multi-year detection: group deals by year when they span 2+ years ────
    const dealYears = new Set<number>();
    for (const d of parsed.deals) {
      const m = /^(\d{4})/.exec(d.date);
      if (m) dealYears.add(Number(m[1]));
    }

    // If yearHint was provided (e.g. sheet name), don't split — trust the hint
    if (!yearHintValid && dealYears.size > 1) {
      // Split deals by year and return array
      const yearResults: ImportResult[] = [];
      for (const yr of Array.from(dealYears).sort()) {
        const yearDeals = parsed.deals.filter((d) => d.date.startsWith(String(yr)));
        if (yearDeals.length === 0) continue;
        const result = computeAggregates(
          yearDeals, yr,
          textNormalized?.column_classification ?? null,
          textNormalized?.raw_header_row ?? null,
        );
        yearResults.push(buildResponse(result));
      }
      return NextResponse.json({ multi_year: true, years: yearResults });
    }

    // Single-year path (original behavior)
    const result = computeAggregates(
      parsed.deals,
      effectiveYear,
      textNormalized?.column_classification ?? null,
      textNormalized?.raw_header_row ?? null,
    );

    return NextResponse.json(buildResponse(result));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Include status code if available (OpenAI SDK attaches it)
    const status = (err as { status?: number })?.status;
    console.error("[import] FAIL status=" + status + " msg=" + msg.slice(0, 300));
    const message =
      msg.includes("body size")
        ? "Document too large. Try uploading fewer pages or a smaller file."
        : msg.includes("timeout")
        ? "Processing timed out. Try a smaller document or split into multiple files."
        : msg.includes("rate") || msg.includes("429") || status === 429
        ? "The AI service is busy. Please try again in a moment."
        : msg.includes("JSON parse")
        ? "The AI could not produce structured data from this file. Try a different format or simpler layout."
        : "Failed to extract data from document. Try uploading a clearer image or a different file format.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
