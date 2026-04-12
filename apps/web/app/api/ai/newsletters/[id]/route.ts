/**
 * PATCH /api/ai/newsletters/[id]
 *
 * Persists agent edits to a newsletter draft (final_subject / final_body).
 * Called automatically from the NewsletterReviewDrawer as the agent types.
 *
 * Response:
 *   200 { ok: true }           — saved
 *   400 { error }              — validation failure
 *   401                        — unauthenticated
 *   403                        — not owner
 *   404                        — newsletter not found
 *   500                        — internal error
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest }       from "@/lib/api-helpers";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest();
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  let body: { final_subject?: string; final_body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Verify ownership
  const { data: existing, error: fetchError } = await supabase
    .from("newsletter_queue")
    .select("id, user_id")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Newsletter not found" }, { status: 404 });
  }

  if (existing.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Build update payload — only include fields that were provided
  const updates: Record<string, string> = {};
  if (body.final_subject !== undefined) updates.final_subject = body.final_subject;
  if (body.final_body    !== undefined) updates.final_body    = body.final_body;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error: updateError } = await supabase
    .from("newsletter_queue")
    .update(updates)
    .eq("id", id);

  if (updateError) {
    console.error("[newsletters/[id]] Update error:", updateError);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
