/**
 * POST /api/ai/scan-import-notes
 *
 * During CSV import, scans a "notes"/"comments" column for
 * active-deal language and returns the row indices whose notes
 * sound like the contact is already in a transaction ("showing
 * Saturday", "offer in", "closing March", etc).
 *
 * This powers the optional "flag these as Boarding?" prompt in
 * the CRM import flow (Phase 2 delight layer).
 *
 * Uses Claude Haiku 4.5 via Vercel AI SDK — cheap, fast, and
 * structured through generateObject for guaranteed JSON output.
 * Falls back to a deterministic regex scan if no AI key is set
 * or the model call fails.
 */

import { generateObject } from "ai";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { models, heliconeHeaders } from "@/lib/ai/provider";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScanRow {
  idx: number;
  name: string;
  notes: string;
}

interface ScanRequest {
  rows: ScanRow[];
}

interface ScanResponse {
  activeRowIndices: number[];
  sampledNames: string[];
  source: "claude" | "fallback";
}

// ── Deterministic regex fallback ──────────────────────────────────────────────
// Used when the AI is unavailable. Conservative — prefers false negatives
// (miss a few) over false positives (flag friends as deals).

const ACTIVE_DEAL_PATTERNS: RegExp[] = [
  // Showings / viewings
  /\b(showing|viewing|tour(ing)?|walk[- ]?through|open house)\b/i,
  // Offers
  /\b(offer(ed|ing)?|counter[- ]?offer|bid|bidding|purchase agreement|APS|p\.?s\.?a\.?)\b/i,
  // Closings
  /\b(clos(ing|ed)|settlement|completion date|firm date|waiver|conditional)\b/i,
  // Active buyers
  /\b(pre[- ]?approv|mortgage approval|financing|deposit|down payment)\b/i,
  // Active sellers
  /\b(listing|listed|MLS|staging|photographer|for sale)\b/i,
  // Time-bound activity
  /\b(this (week|weekend|saturday|sunday)|tomorrow|tonight|in \d+ days?)\b/i,
  // Deal-stage vocabulary
  /\b(under contract|pending|in escrow|firm deal|deal fell through)\b/i,
];

function regexScan(rows: ScanRow[]): number[] {
  return rows
    .filter((r) => ACTIVE_DEAL_PATTERNS.some((p) => p.test(r.notes)))
    .map((r) => r.idx);
}

// ── Zod schema for Claude's structured output ─────────────────────────────────

const ScanResultSchema = z.object({
  activeRowIndices: z
    .array(z.number().int().nonnegative())
    .describe(
      "Row indices whose notes strongly suggest the contact is in an active real estate transaction (showings booked, offers submitted, closing scheduled, etc). Only include high-confidence matches.",
    ),
});

// ── Prompt ────────────────────────────────────────────────────────────────────

function buildPrompt(rows: ScanRow[]): string {
  const rowText = rows
    .map((r) => `[${r.idx}] ${r.name}: ${r.notes.slice(0, 300)}`)
    .join("\n");

  return `You are helping a Canadian real estate agent import their CRM contacts. For each contact, review their "notes" field and identify which ones sound like ACTIVE DEALS in progress right now — not past clients, not friends, not general relationship notes.

Flag a contact as an active deal ONLY if the notes mention concrete, time-bound transaction activity such as:
- Scheduled showings, viewings, or open houses
- Offers submitted, countered, or accepted
- Closings, settlements, or completion dates
- Active mortgage pre-approval or financing conversations
- A live listing (photos, staging, MLS)
- Deposits, waivers, conditions, or APS language

Do NOT flag:
- General rapport notes ("met at kids' soccer", "nice couple", "referred by Jim")
- Past transactions ("bought in 2019", "sold their condo last year")
- Vague interest ("maybe wants to move someday", "thinking about it")
- Personal details unrelated to an active transaction

Here are the contacts to review (format: [row_index] Name: notes):

${rowText}

Return ONLY the row indices that are high-confidence active deals. Be conservative — missing a few is better than flagging friends as clients.`;
}

// ── Route handler ─────────────────────────────────────────────────────────────

const MAX_ROWS = 200;

export async function POST(req: NextRequest) {
  // Auth guard
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // Rate limit: 10 scans per hour — scans are expensive and usually run once per import
  const rl = await checkRateLimit(user.id, "scan_import_notes", 10, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Try again later." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  let body: ScanRequest;
  try {
    body = (await req.json()) as ScanRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || !Array.isArray(body.rows)) {
    return NextResponse.json(
      { error: "Missing or invalid `rows` array" },
      { status: 400 },
    );
  }

  // Sanitize + cap — defense against huge payloads
  const rows: ScanRow[] = body.rows
    .filter(
      (r) =>
        r &&
        typeof r.idx === "number" &&
        typeof r.name === "string" &&
        typeof r.notes === "string" &&
        r.name.trim().length > 0 &&
        r.notes.trim().length >= 5,
    )
    .slice(0, MAX_ROWS);

  if (rows.length === 0) {
    return NextResponse.json(
      {
        activeRowIndices: [],
        sampledNames: [],
        source: "fallback",
      } satisfies ScanResponse,
      { headers: rateLimitHeaders(rl) },
    );
  }

  const nameByIdx = new Map(rows.map((r) => [r.idx, r.name] as const));

  // If no AI key available, use deterministic regex fallback
  if (!process.env.ANTHROPIC_API_KEY && !process.env.GROQ_API_KEY) {
    const idxs = regexScan(rows);
    return NextResponse.json(
      {
        activeRowIndices: idxs,
        sampledNames: idxs
          .slice(0, 10)
          .map((i) => nameByIdx.get(i) ?? "")
          .filter(Boolean),
        source: "fallback",
      } satisfies ScanResponse,
      { headers: rateLimitHeaders(rl) },
    );
  }

  // Call Claude Haiku via Vercel AI SDK with structured output
  try {
    const { object } = await generateObject({
      model: models.fast,
      schema: ScanResultSchema,
      prompt: buildPrompt(rows),
      temperature: 0.1, // Deterministic — we want consistent judgments
      maxOutputTokens: 500,
      headers: heliconeHeaders({
        userId: user.id,
        feature: "scan-import-notes",
      }),
    });

    // Filter to only valid indices (model may occasionally hallucinate)
    const validIdxs = object.activeRowIndices.filter((i) => nameByIdx.has(i));
    const sampledNames = validIdxs
      .slice(0, 10)
      .map((i) => nameByIdx.get(i)!)
      .filter(Boolean);

    return NextResponse.json(
      {
        activeRowIndices: validIdxs,
        sampledNames,
        source: "claude",
      } satisfies ScanResponse,
      { headers: rateLimitHeaders(rl) },
    );
  } catch (err) {
    console.error("[scan-import-notes] AI error:", err);
    // Graceful fallback to regex
    const idxs = regexScan(rows);
    return NextResponse.json(
      {
        activeRowIndices: idxs,
        sampledNames: idxs
          .slice(0, 10)
          .map((i) => nameByIdx.get(i) ?? "")
          .filter(Boolean),
        source: "fallback",
      } satisfies ScanResponse,
      { headers: rateLimitHeaders(rl) },
    );
  }
}
