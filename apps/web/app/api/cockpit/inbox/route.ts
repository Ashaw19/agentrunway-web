/**
 * /api/cockpit/inbox — GET (list) + POST (create)
 *
 * Cockpit-only endpoint. All corp_inbox_items writes and reads go through
 * here to enforce the cockpit allowlist in addition to RLS.
 *
 * GET  ?resolved=false  → unresolved items only (default)
 *      ?resolved=true   → all items (unresolved + resolved)
 *      ?limit=N         → max rows (default 50)
 *
 * POST body:
 *   { title, body?, source?, source_ref_id?, severity? }
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
  const resolvedParam = url.searchParams.get("resolved");
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10)));
  const includeResolved = resolvedParam === "true";

  let query = supabase
    .from("corp_inbox_items")
    .select("id, title, body, source, source_ref_id, severity, resolved_at, resolved_note, created_at, updated_at")
    .eq("user_id", user.id)
    .order("severity", { ascending: false }) // high → medium → low (lexicographic — works because h > m > l)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!includeResolved) {
    query = query.is("resolved_at", null);
  }

  const { data, error: dbErr } = await query;
  if (dbErr) {
    console.error("[cockpit/inbox GET]", dbErr.message);
    return NextResponse.json({ ok: false, error: "DB read failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, items: data ?? [] });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { user, supabase, error } = await getAuthedUser(req);
  if (!user) return NextResponse.json({ ok: false, error }, { status: error === "Forbidden" ? 403 : 401 });

  let body: {
    title?: string;
    body?: string | null;
    source?: string;
    source_ref_id?: string | null;
    severity?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const title = (body.title ?? "").trim();
  if (!title) return NextResponse.json({ ok: false, error: "title is required" }, { status: 400 });

  const severity = ["low", "medium", "high"].includes(body.severity ?? "")
    ? body.severity
    : "medium";

  const { data: inserted, error: dbErr } = await supabase
    .from("corp_inbox_items")
    .insert({
      user_id:       user.id,
      title,
      body:          body.body?.trim() || null,
      source:        body.source ?? "manual",
      source_ref_id: body.source_ref_id ?? null,
      severity,
    })
    .select("id")
    .single();

  if (dbErr) {
    console.error("[cockpit/inbox POST]", dbErr.message);
    return NextResponse.json({ ok: false, error: "Insert failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: inserted?.id }, { status: 201 });
}
