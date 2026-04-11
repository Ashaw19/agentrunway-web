/**
 * PATCH /api/ai/outreach-queue/[id]
 *
 * Update an outreach_queue row for the authenticated user.
 * Used for: Skip (status → 'skipped'), Mark as Sent (status → 'sent'),
 *           and saving user edits (final_subject, final_body).
 *
 * Supports optimistic locking: if `expected_updated_at` is provided, the
 * update only succeeds when the row's `updated_at` matches.  A 409 Conflict
 * is returned if the row was modified since the client last read it.
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-helpers";

interface PatchBody {
  status?:              "draft" | "ready" | "sent" | "skipped";
  final_subject?:       string | null;
  final_body?:          string | null;
  sent_at?:             string | null;
  /** Optimistic lock — if set, update is rejected when the server value differs. */
  expected_updated_at?: string;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest();
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body: PatchBody = await req.json();

  // Whitelist allowed fields to prevent arbitrary column writes
  const VALID_STATUSES = new Set<PatchBody["status"]>(["draft", "ready", "sent", "skipped"]);
  const allowed: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!VALID_STATUSES.has(body.status)) {
      return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
    }
    allowed.status = body.status;
  }
  if (body.final_subject !== undefined) allowed.final_subject = body.final_subject;
  if (body.final_body    !== undefined) allowed.final_body    = body.final_body;
  if (body.sent_at       !== undefined) allowed.sent_at       = body.sent_at;

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  // ── Optimistic locking ──────────────────────────────────────────────────
  // If the client sends expected_updated_at, verify the row hasn't changed.
  if (body.expected_updated_at) {
    const { data: current } = await supabase
      .from("outreach_queue")
      .select("updated_at")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (current && current.updated_at !== body.expected_updated_at) {
      return NextResponse.json(
        {
          error: "Conflict — this draft was edited elsewhere. Please refresh and try again.",
          code: "CONFLICT",
          server_updated_at: current.updated_at,
        },
        { status: 409 },
      );
    }
  }

  const { data, error } = await supabase
    .from("outreach_queue")
    .update(allowed)
    .eq("id", id)
    .eq("user_id", userId)
    .select("updated_at")
    .single();

  if (error) {
    console.error("[outreach-queue] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update draft" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated_at: data?.updated_at });
}
