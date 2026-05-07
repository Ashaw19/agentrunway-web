/**
 * /api/cockpit/bank-lines — GET (list lines for a statement) + PATCH (update match status)
 *
 * GET  ?statement_id=<uuid>&status=unmatched|matched|manual|all&limit=N
 *   Returns lines for the given statement, filtered by status.
 *
 * PATCH body:
 *   { id, match_status: 'manual'|'matched', matched_tx_id?, skip_reason?, notes? }
 *   Used when Andrew manually resolves a line (marks it as skipped or links it
 *   to a corp_transaction from a dropdown).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_EMAILS = new Set(["andrew@andrewdshaw.ca"]);

async function getAuthedUser(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { user: null, supabase, error: "Unauthorized" };
  if (!user.email || !ALLOWED_EMAILS.has(user.email.toLowerCase()))
    return { user: null, supabase, error: "Forbidden" };
  return { user, supabase, error: null };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { user, supabase, error } = await getAuthedUser(req);
  if (!user) return NextResponse.json({ ok: false, error }, { status: error === "Forbidden" ? 403 : 401 });

  const url = new URL(req.url);
  const statementId = url.searchParams.get("statement_id");
  if (!statementId) return NextResponse.json({ ok: false, error: "statement_id is required" }, { status: 400 });

  const status = url.searchParams.get("status") ?? "all";
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") ?? "200", 10)));

  let query = supabase
    .from("corp_bank_lines")
    .select("id, line_date, description_raw, amount_cad, balance_cad, match_status, matched_tx_id, match_method, match_confidence, skip_reason, notes, created_at, updated_at")
    .eq("user_id", user.id)
    .eq("statement_id", statementId)
    .order("line_date", { ascending: true })
    .limit(limit);

  if (status !== "all") {
    query = query.eq("match_status", status);
  }

  const { data, error: dbErr } = await query;
  if (dbErr) {
    console.error("[bank-lines GET]", dbErr.message);
    return NextResponse.json({ ok: false, error: "DB read failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, lines: data ?? [] });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const { user, supabase, error } = await getAuthedUser(req);
  if (!user) return NextResponse.json({ ok: false, error }, { status: error === "Forbidden" ? 403 : 401 });

  let body: {
    id?: string;
    match_status?: string;
    matched_tx_id?: string | null;
    skip_reason?: string | null;
    notes?: string | null;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { id, match_status, matched_tx_id, skip_reason, notes } = body;
  if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
  if (!match_status) return NextResponse.json({ ok: false, error: "match_status is required" }, { status: 400 });

  const validStatuses = ["matched", "manual", "unmatched"];
  if (!validStatuses.includes(match_status))
    return NextResponse.json({ ok: false, error: `match_status must be one of: ${validStatuses.join(", ")}` }, { status: 400 });

  if (match_status === "matched" && !matched_tx_id)
    return NextResponse.json({ ok: false, error: "matched_tx_id is required when match_status is 'matched'" }, { status: 400 });

  const updatePayload: Record<string, unknown> = {
    match_status,
    match_method:  match_status === "matched" ? "manual" : null,
    match_confidence: match_status === "matched" ? 1.0 : null,
    matched_tx_id: match_status === "matched" ? matched_tx_id : null,
    skip_reason:   match_status === "manual" ? (skip_reason?.trim() || null) : null,
    notes:         notes?.trim() || null,
    updated_at:    new Date().toISOString(),
  };

  const { error: dbErr } = await supabase
    .from("corp_bank_lines")
    .update(updatePayload)
    .eq("id", id)
    .eq("user_id", user.id);

  if (dbErr) {
    console.error("[bank-lines PATCH]", dbErr.message);
    return NextResponse.json({ ok: false, error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
