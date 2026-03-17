/**
 * PATCH /api/ai/outreach-queue/[id]
 *
 * Update an outreach_queue row for the authenticated user.
 * Used for: Skip (status → 'skipped'), Mark as Sent (status → 'sent'),
 *           and saving user edits (final_subject, final_body).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface PatchBody {
  status?:        "draft" | "ready" | "sent" | "skipped";
  final_subject?: string | null;
  final_body?:    string | null;
  sent_at?:       string | null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body: PatchBody = await req.json();

  // Whitelist allowed fields to prevent arbitrary column writes
  const VALID_STATUSES = new Set<PatchBody["status"]>(["draft", "ready", "sent", "skipped"]);
  const allowed: PatchBody = {};
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

  const { error } = await supabase
    .from("outreach_queue")
    .update(allowed)
    .eq("id", id)
    .eq("user_id", user.id); // RLS + explicit ownership guard

  if (error) {
    console.error("[outreach-queue] PATCH error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
