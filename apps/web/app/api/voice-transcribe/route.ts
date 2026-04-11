import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { requirePro } from "@/lib/require-pro";
import { authenticateRequest } from "@/lib/api-helpers";

// NOTE: Groq Whisper audio transcription uses the OpenAI-compatible REST API,
// NOT the Vercel AI SDK (which has no audio transcription support).
// The @ai-sdk/groq provider only supports chat/text generation.

export async function POST(req: NextRequest) {
  // ── Auth guard ────────────────────────────────────────────────────────────
  const auth = await authenticateRequest();
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  const proCheck = await requirePro(supabase, userId);
  if (!proCheck.allowed) return proCheck.response!;

  // ── Rate limit: 20 voice transcriptions per 60-minute window ─────────────
  const rl = await checkRateLimit(userId, "voice-transcribe", 20, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many voice requests. Please wait before trying again." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: "GROQ_API_KEY is not configured" }, { status: 503 });
  }

  // ── Parse multipart form data ─────────────────────────────────────────────
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const audio = form.get("audio") as File | null;
  if (!audio) return NextResponse.json({ error: "No audio file provided" }, { status: 400 });

  // Sanity check: 10 MB max
  if (audio.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Audio file too large (max 10 MB)" }, { status: 413 });
  }

  // ── Transcribe via Groq Whisper ───────────────────────────────────────────
  const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
  });

  try {
    const transcription = await groq.audio.transcriptions.create({
      file: audio,
      model: "whisper-large-v3-turbo",
      language: "en",
    });

    return NextResponse.json({ transcript: transcription.text });
  } catch (err) {
    console.error("[voice-transcribe] error:", err);
    return NextResponse.json({ error: "Failed to transcribe audio" }, { status: 422 });
  }
}
