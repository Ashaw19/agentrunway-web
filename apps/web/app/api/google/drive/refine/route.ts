/**
 * POST /api/google/drive/refine
 *
 * Use Claude AI to improve/refine a Google Drive document.
 * Downloads the content, sends to Claude with a refinement prompt,
 * and optionally writes the improved version back to Drive.
 *
 * Expects: {
 *   file_id: string,
 *   instruction: string,  // e.g., "Make this listing description more compelling"
 *   write_back?: boolean  // if true, update the file in Drive with refined content
 * }
 *
 * Returns: { ok: true, original_length, refined_content, written_back }
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
  updateFileContent,
  isAnalyzable,
} from "@/lib/google/drive-client";

const REFINE_SYSTEM_PROMPT = `You are a professional writing assistant for Canadian real estate agents.
Your job is to refine, improve, and polish documents while maintaining their original intent and factual content.
Do not invent information — only improve clarity, tone, structure, and professionalism.
Return ONLY the refined document text — no preamble, no explanation, no markdown formatting around it.`;

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

  const rl = await checkRateLimit(user.id, "drive_refine", 10, 60);
  if (!rl.allowed) {
    return new NextResponse("Too many requests. Please wait before sending more messages.", {
      status: 429,
      headers: rateLimitHeaders(rl),
    });
  }

  const body = (await req.json()) as {
    file_id?: string;
    instruction?: string;
    write_back?: boolean;
  };

  if (!body.file_id || !body.instruction) {
    return NextResponse.json(
      { error: "Missing file_id or instruction" },
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
      { error: "AI refinement not configured" },
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

    // ── Get file metadata + content ─────────────────────────────────────
    const meta = await getFileMetadata(accessToken, body.file_id);

    if (!isAnalyzable(meta.mimeType)) {
      return NextResponse.json(
        {
          error: "This file type cannot be refined",
          mimeType: meta.mimeType,
        },
        { status: 422 }
      );
    }

    let text = await readFileText(accessToken, body.file_id, meta.mimeType);
    const originalLength = text.length;

    if (text.length > MAX_TEXT_LENGTH) {
      text =
        text.slice(0, MAX_TEXT_LENGTH) +
        "\n\n[Document truncated — showing first 30,000 characters]";
    }

    // ── Refine with Claude ───────────────────────────────────────────────
    const { text: refinedRaw } = await generateText({
      model: models.default,
      system: REFINE_SYSTEM_PROMPT,
      prompt: `Instruction: ${body.instruction}\n\nDocument name: "${meta.name}"\n\n--- ORIGINAL DOCUMENT ---\n${text}`,
      temperature: 0.3,
      headers: heliconeHeaders({ userId: user.id, feature: "drive-refine" }),
    });

    const refinedContent = refinedRaw || text;

    // ── Optionally write back to Drive ───────────────────────────────────
    let writtenBack = false;
    if (body.write_back) {
      try {
        await updateFileContent(
          accessToken,
          body.file_id,
          refinedContent,
          "text/plain"
        );
        writtenBack = true;
      } catch (err) {
        console.error("[drive/refine] Write-back failed:", err);
        // Don't fail the request — still return the refined content
      }
    }

    return NextResponse.json({
      ok: true,
      original_length: originalLength,
      refined_content: refinedContent,
      written_back: writtenBack,
      file: {
        name:     meta.name,
        mimeType: meta.mimeType,
      },
    });
  } catch (err) {
    console.error("[drive/refine] Error:", err);
    const message = err instanceof Error ? err.message : String(err);

    return NextResponse.json(
      { error: "Refinement failed", message },
      { status: 500 }
    );
  }
}
