/**
 * POST /api/ai/client-memory
 *
 * Manual compute/read endpoint for client memory profiles.
 *
 * Actions:
 *   { action: "compute", client_id: string }  — (Re)compute the memory profile
 *   { action: "read",    client_id: string }  — Read existing profile (no AI call)
 *
 * Failure-safe: AI errors return { success: false, error } with status 200
 * so the caller can handle gracefully without toast-level error handling.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  updateClientMemory,
  getClientMemory,
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

  // ── Parse body ────────────────────────────────────────────────────────────
  const body = (await req.json()) as {
    action?: string;
    client_id?: string;
  };

  const { action, client_id } = body;

  if (!client_id) {
    return NextResponse.json({ error: "Missing client_id" }, { status: 400 });
  }

  if (!action || !["compute", "read"].includes(action)) {
    return NextResponse.json(
      { error: 'Invalid action — use "compute" or "read"' },
      { status: 400 },
    );
  }

  // ── Read action (no AI, no rate limit) ────────────────────────────────────
  if (action === "read") {
    const profile = await getClientMemory(supabase, user.id, client_id);
    return NextResponse.json({ success: true, profile });
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

  const result = await updateClientMemory(supabase, user.id, client_id);

  return NextResponse.json(result);
}

// Allow up to 30s for Groq call
export const maxDuration = 30;
