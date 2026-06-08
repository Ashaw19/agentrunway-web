/**
 * POST /api/ai/client-memory
 *
 * Manual compute/read endpoint for client memory profiles.
 *
 * Actions:
 *   { action: "compute",    client_id: string }  — (Re)compute the memory profile
 *   { action: "read",       client_id: string }  — Read existing profile (no AI call)
 *   { action: "mark-stale", client_id: string }  — Mark profile as stale (no AI call)
 *
 * Failure-safe: AI errors return { success: false, error } with status 200
 * so the caller can handle gracefully without toast-level error handling.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { requirePro } from "@/lib/require-pro";
import {
  updateClientMemory,
  getClientMemory,
  markMemoryStale,
} from "@/lib/ai/client-memory-engine";

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const proCheck = await requirePro(supabase, user.id);
  if (!proCheck.allowed) return proCheck.response!;

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: {
    action?: string;
    client_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { action, client_id } = body;

  if (!client_id) {
    return NextResponse.json({ error: "Missing client_id" }, { status: 400 });
  }

  if (!action || !["compute", "read", "mark-stale"].includes(action)) {
    return NextResponse.json(
      { error: 'Invalid action — use "compute", "read", or "mark-stale"' },
      { status: 400 },
    );
  }

  // ── Read action (no AI, no rate limit) ────────────────────────────────────
  if (action === "read") {
    try {
      const profile = await getClientMemory(supabase, user.id, client_id);
      return NextResponse.json({ success: true, profile });
    } catch (err) {
      console.error("[client-memory] read failed:", err instanceof Error ? err.message : String(err));
      return NextResponse.json({ success: false, error: "Failed to read client memory" });
    }
  }

  // ── Mark-stale action (no AI, no rate limit) ─────────────────────────────
  if (action === "mark-stale") {
    try {
      await markMemoryStale(supabase, user.id, client_id);
      return NextResponse.json({ success: true });
    } catch (err) {
      console.error("[client-memory] mark-stale failed:", err instanceof Error ? err.message : String(err));
      return NextResponse.json({ success: false, error: "Failed to mark memory stale" });
    }
  }

  // ── Compute action ────────────────────────────────────────────────────────
  // Rate limit: 30 computes per hour per user
  const rl = await checkRateLimit(user.id, "client-memory-compute", 30, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Rate limit reached — try again later" },
      { status: 429 },
    );
  }

  try {
    const result = await updateClientMemory(supabase, user.id, client_id);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[client-memory] compute failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ success: false, error: "Failed to compute client memory" });
  }
}

// Allow up to 30s for Groq call
export const maxDuration = 30;
