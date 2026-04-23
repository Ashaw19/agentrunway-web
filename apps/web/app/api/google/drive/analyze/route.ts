/**
 * POST /api/google/drive/analyze
 *
 * Analyze a Google Drive document using Claude AI.
 * Downloads the file content, sends to Claude for real-estate-aware analysis,
 * and stores the results in drive_documents.
 *
 * Expects: { file_id: string }
 *
 * Returns: { ok: true, analysis: { summary, extracted_data, tags } }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { requirePro } from "@/lib/require-pro";
import { generateText } from "ai";
import { models, heliconeHeaders } from "@/lib/ai/provider";
import {
  getValidAccessToken,
  type GoogleConnection,
} from "@/lib/google/token-manager";
import {
  getFileMetadata,
  readFileText,
  isAnalyzable,
} from "@/lib/google/drive-client";

const ANALYSIS_PROMPT = `You are a document analyst for Canadian real estate agents.
Analyze this document and return ONLY a raw JSON object — no markdown, no code fences.

Required JSON structure:
{
  "summary": "<2-3 sentence summary of the document's purpose and key content>",
  "document_type": "<one of: listing_agreement, purchase_agreement, cma, marketing_material, client_letter, financial_report, tax_document, checklist, template, other>",
  "extracted_data": {
    "property_addresses": ["<any property addresses mentioned>"],
    "client_names": ["<any client/agent names>"],
    "key_dates": ["<any important dates with context, e.g. 'Closing: 2025-03-15'>"],
    "financial_figures": ["<any dollar amounts with context, e.g. 'List price: $850,000'>"],
    "action_items": ["<any tasks, requirements, or next steps mentioned>"],
    "key_terms": ["<important clauses, conditions, or terms>"]
  },
  "tags": ["<relevant tags from: listing, buyer, seller, cma, marketing, financial, tax, legal, template, checklist, offer, closing, commission, mls>"],
  "quality_notes": "<optional: any issues, outdated info, or improvement suggestions>"
}`;

// Max text to send to Claude (chars) — prevent context overflow
const MAX_TEXT_LENGTH = 30_000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── CASA shelf guard ─────────────────────────────────────────────────────
  return NextResponse.json(
    { error: "Google integration is temporarily unavailable." },
    { status: 503 }
  );

  const proCheck = await requirePro(supabase, user.id);
  if (!proCheck.allowed) return proCheck.response!;

  const rl = await checkRateLimit(user.id, "drive_analyze", 15, 60);
  if (!rl.allowed) {
    return new NextResponse("Too many requests. Please wait before sending more messages.", {
      status: 429,
      headers: rateLimitHeaders(rl),
    });
  }

  const body = (await req.json()) as { file_id?: string };
  if (!body.file_id) {
    return NextResponse.json(
      { error: "Missing file_id" },
      { status: 400 }
    );
  }

  // ── Google connection ───────────────────────────────────────────────────
  const { data: conn, error: connErr } = await supabase
    .from("google_connections")
    .select(
      "id, access_token_enc, refresh_token_enc, expires_at, drive_read_enabled"
    )
    .eq("user_id", user.id)
    .single();

  if (connErr || !conn || !conn.drive_read_enabled) {
    return NextResponse.json(
      { error: "Drive access not enabled", code: "NO_DRIVE_SCOPE" },
      { status: 422 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI analysis not configured" },
      { status: 503 }
    );
  }

  try {
    const tokenResult = await getValidAccessToken(conn as GoogleConnection);

    if (tokenResult.refreshed && tokenResult.newAccessTokenEnc) {
      await supabase
        .from("google_connections")
        .update({
          access_token_enc: tokenResult.newAccessTokenEnc,
          expires_at: tokenResult.newExpiresAt!.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", conn.id);
    }

    const accessToken = tokenResult.accessToken;

    // ── Get file metadata ───────────────────────────────────────────────
    const meta = await getFileMetadata(accessToken, body.file_id);

    if (!isAnalyzable(meta.mimeType)) {
      return NextResponse.json(
        {
          error: "This file type cannot be analyzed",
          mimeType: meta.mimeType,
        },
        { status: 422 }
      );
    }

    // ── Read file content ───────────────────────────────────────────────
    let text = await readFileText(accessToken, body.file_id, meta.mimeType);

    // Truncate if too long
    if (text.length > MAX_TEXT_LENGTH) {
      text =
        text.slice(0, MAX_TEXT_LENGTH) +
        "\n\n[Document truncated — showing first 30,000 characters]";
    }

    // ── Analyze with Claude ──────────────────────────────────────────────
    const { text: rawResponse } = await generateText({
      model: models.default,
      system: ANALYSIS_PROMPT,
      prompt: `Document name: "${meta.name}"\nDocument type (MIME): ${meta.mimeType}\n\n--- DOCUMENT CONTENT ---\n${text}`,
      temperature: 0.1,
      headers: heliconeHeaders({ userId: user.id, feature: "drive-analyze" }),
    });

    // Parse JSON from response (strip code fences if present)
    let analysis: {
      summary?: string;
      document_type?: string;
      extracted_data?: Record<string, unknown>;
      tags?: string[];
      quality_notes?: string;
    };

    try {
      const cleaned = rawResponse
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();
      analysis = JSON.parse(cleaned);
    } catch {
      analysis = { summary: rawResponse, tags: [] };
    }

    // ── Upsert into drive_documents ─────────────────────────────────────
    const { error: upsertErr } = await supabase
      .from("drive_documents")
      .upsert(
        {
          user_id:        user.id,
          google_file_id: body.file_id,
          name:           meta.name,
          mime_type:       meta.mimeType,
          size_bytes:      meta.size ? parseInt(meta.size, 10) : null,
          last_modified:   meta.modifiedTime ?? null,
          web_view_link:   meta.webViewLink ?? null,
          indexed_at:      new Date().toISOString(),
          summary:         analysis.summary ?? null,
          extracted_data:  analysis.extracted_data ?? null,
          tags:            analysis.tags ?? [],
        },
        { onConflict: "user_id,google_file_id" }
      );

    if (upsertErr) {
      console.error("[drive/analyze] Upsert failed:", upsertErr.message);
    }

    return NextResponse.json({
      ok: true,
      analysis: {
        summary:        analysis.summary ?? null,
        document_type:  analysis.document_type ?? null,
        extracted_data: analysis.extracted_data ?? null,
        tags:           analysis.tags ?? [],
        quality_notes:  analysis.quality_notes ?? null,
      },
      file: {
        name:     meta.name,
        mimeType: meta.mimeType,
      },
    });
  } catch (err) {
    console.error("[drive/analyze] Error:", err);
    const message = err instanceof Error ? err.message : String(err);

    return NextResponse.json(
      { error: "Analysis failed", message },
      { status: 500 }
    );
  }
}
