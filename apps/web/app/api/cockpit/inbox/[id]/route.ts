/**
 * /api/cockpit/inbox/[id] — PATCH (resolve / update) + DELETE
 *
 * PATCH body:
 *   { resolved_note? }   → resolves the item (sets resolved_at = now())
 *   { title?, body?, severity? }  → updates fields (title/body/severity only)
 *
 * To resolve: include resolved_note (can be empty string ""). The presence
 * of the resolved_note key signals intent to resolve, not its content.
 * Sending { title: "new title" } without resolved_note only updates fields.
 *
 * DELETE → hard-delete (allowed for cleanup of accidental items; the UI
 * only exposes resolve, not delete, but the API is open for scripted use).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_EMAILS = new Set(["andrew@andrewdshaw.ca"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!user.email || !ALLOWED_EMAILS.has(user.email.toLowerCase()))
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  let body: {
    resolved_note?: string;
    title?: string;
    body?: string | null;
    severity?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const isResolve = "resolved_note" in body;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (isResolve) {
    patch.resolved_at = new Date().toISOString();
    patch.resolved_note = (body.resolved_note ?? "").trim() || null;
  }
  if (body.title !== undefined) patch.title = body.title.trim();
  if (body.body !== undefined) patch.body = body.body?.trim() || null;
  if (body.severity !== undefined && ["low", "medium", "high"].includes(body.severity)) {
    patch.severity = body.severity;
  }

  const { error: dbErr } = await supabase
    .from("corp_inbox_items")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id);

  if (dbErr) {
    console.error("[cockpit/inbox PATCH]", dbErr.message);
    return NextResponse.json({ ok: false, error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!user.email || !ALLOWED_EMAILS.has(user.email.toLowerCase()))
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const { error: dbErr } = await supabase
    .from("corp_inbox_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (dbErr) {
    console.error("[cockpit/inbox DELETE]", dbErr.message);
    return NextResponse.json({ ok: false, error: "Delete failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
