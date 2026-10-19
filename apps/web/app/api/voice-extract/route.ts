/**
 * POST /api/voice-extract
 *
 * A note (the transcript from /api/voice-transcribe, or pasted text) to
 * proposed writes: what to save, in the Flight Crew tools' argument shapes,
 * with the client and deal matches and Atlantic dates resolved
 * (lib/voice/capture.ts → core capture pipeline). Nothing is saved here; the
 * agent confirms on the card and the app saves through core record-writers.
 *
 * Callers: the web voice button (session cookie), the iPhone app and the MCP
 * capture_note tool (Authorization: Bearer <access token>). getRequestUser
 * takes either; the client it returns is the user's own (RLS).
 *
 * Body: { transcript: string, context?: { clientId?: string } }
 * Returns: CaptureProposal (packages/core/lib/capture/types.ts)
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { requirePro } from "@/lib/require-pro";
import { getRequestUser } from "@/lib/supabase/request-user";
import { MAX_TRANSCRIPT_CHARS, proposeCapture } from "@/lib/voice/capture";
import { CaptureParseError } from "@agent-runway/core/lib/capture/parse";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  // ── Auth guard ──────────────────────────────────────────────────────────
  const requestUser = await getRequestUser(req);
  if (!requestUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, supabase } = requestUser;

  const proCheck = await requirePro(supabase, user.id);
  if (!proCheck.allowed) return proCheck.response!;

  // ── Rate limit: 20 extractions per 60-minute window ────────────────────
  const rl = await checkRateLimit(user.id, "voice-extract", 20, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many voice requests. Please wait before trying again." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI provider is not configured" }, { status: 503 });
  }

  let body: { transcript?: unknown; context?: { clientId?: unknown } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const transcript = typeof body.transcript === "string" ? body.transcript.trim() : "";
  if (!transcript) {
    return NextResponse.json({ error: "No transcript provided" }, { status: 400 });
  }
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    return NextResponse.json({ error: `Transcript too long (max ${MAX_TRANSCRIPT_CHARS.toLocaleString("en-CA")} characters)` }, { status: 400 });
  }
  const clientId = typeof body.context?.clientId === "string" && UUID.test(body.context.clientId) ? body.context.clientId : null;

  try {
    const proposal = await proposeCapture(supabase, user.id, transcript, {
      context: clientId ? { clientId } : undefined,
      feature: "voice-extract",
    });
    return NextResponse.json(proposal);
  } catch (err) {
    if (err instanceof CaptureParseError) {
      console.error("[voice-extract] unreadable model reply:", err.message);
      return NextResponse.json({ error: "Couldn't read that note. Try again, or type it instead." }, { status: 422 });
    }
    console.error("[voice-extract] error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to extract information from the note" }, { status: 502 });
  }
}
