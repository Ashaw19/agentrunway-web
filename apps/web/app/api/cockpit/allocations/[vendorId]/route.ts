/**
 * /api/cockpit/allocations/[vendorId] — PATCH
 *
 * Updates the allocation split for a vendor:
 *   1. UPDATE corp_vendors.corp_pct (the "current" value used when matching
 *      new transactions)
 *   2. INSERT into corp_vendor_allocations (audit trail — preserves history)
 *
 * PATCH body: { corp_pct: number (0–100), rationale_text?: string }
 * personal_pct is computed server-side as (100 - corp_pct).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_EMAILS = new Set(["andrew@andrewdshaw.ca"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ vendorId: string }> },
): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!user.email || !ALLOWED_EMAILS.has(user.email.toLowerCase()))
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const { vendorId } = await params;

  let body: { corp_pct?: unknown; rationale_text?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const corpPctRaw = Number(body.corp_pct);
  if (!Number.isFinite(corpPctRaw) || corpPctRaw < 0 || corpPctRaw > 100) {
    return NextResponse.json({ ok: false, error: "corp_pct must be 0–100" }, { status: 400 });
  }
  const corp_pct = Math.round(corpPctRaw * 100) / 100;
  const personal_pct = Math.round((100 - corp_pct) * 100) / 100;
  const rationale_text = typeof body.rationale_text === "string"
    ? body.rationale_text.trim() || null
    : null;

  // 1. Update the vendor's live corp_pct (used for new transaction matching)
  const { error: vendorErr } = await supabase
    .from("corp_vendors")
    .update({ corp_pct, updated_at: new Date().toISOString() })
    .eq("id", vendorId)
    .eq("user_id", user.id);

  if (vendorErr) {
    console.error("[cockpit/allocations PATCH vendor]", vendorErr.message);
    return NextResponse.json({ ok: false, error: "Vendor update failed" }, { status: 500 });
  }

  // 2. Append audit record (non-fatal if this fails — vendor was already updated)
  const { error: allocErr } = await supabase
    .from("corp_vendor_allocations")
    .insert({
      user_id:        user.id,
      vendor_id:      vendorId,
      corp_pct,
      personal_pct,
      rationale_text,
      set_by:         "cockpit-ui",
      effective_from: new Date().toISOString().slice(0, 10),
    });

  if (allocErr) {
    console.error("[cockpit/allocations PATCH alloc insert]", allocErr.message);
  }

  return NextResponse.json({ ok: true });
}
