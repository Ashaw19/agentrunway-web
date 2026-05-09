/**
 * /api/cockpit/resolutions
 *
 * GET  — list resolutions (optional ?year=2026 and ?type= filters)
 * POST — create a new resolution (resolution_number assigned by DB trigger)
 *
 * Allowlisted to Andrew's account only.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { CorpResolution } from "@agent-runway/core/types/database";

const ALLOWED_EMAILS = new Set(["andrew@andrewdshaw.ca"]);

const VALID_TYPES = new Set([
  "salary_election",
  "dividend_declaration",
  "banking_authority",
  "officer_appointment",
  "agm_waiver",
  "general",
]);

const VALID_STATUSES = new Set(["draft", "passed"]);

async function authenticate(req: NextRequest) {
  void req;
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user || !user.email || !ALLOWED_EMAILS.has(user.email.toLowerCase())) {
    return { supabase, user: null };
  }
  return { supabase, user };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { supabase, user } = await authenticate(req);
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const yearParam = searchParams.get("year");
  const typeParam = searchParams.get("type");

  let query = supabase
    .from("corp_resolutions")
    .select("*")
    .order("passed_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (yearParam) {
    const year = Number(yearParam);
    if (!Number.isInteger(year)) {
      return NextResponse.json({ error: "invalid year" }, { status: 400 });
    }
    query = query.eq("fiscal_year", year);
  }

  if (typeParam) {
    if (!VALID_TYPES.has(typeParam)) {
      return NextResponse.json({ error: "invalid type" }, { status: 400 });
    }
    query = query.eq("resolution_type", typeParam);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ resolutions: (data ?? []) as CorpResolution[] });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { supabase, user } = await authenticate(req);
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;

  const resolution_type = b.resolution_type as string | undefined;
  const subject = b.subject as string | undefined;
  const body_md = b.body_md as string | undefined;
  const passed_date = b.passed_date as string | undefined;
  const status = (b.status as string | undefined) ?? "passed";

  if (!resolution_type || !VALID_TYPES.has(resolution_type)) {
    return NextResponse.json({ error: "invalid resolution_type" }, { status: 400 });
  }
  if (!subject || subject.trim().length === 0) {
    return NextResponse.json({ error: "subject is required" }, { status: 400 });
  }
  if (!body_md && body_md !== "") {
    return NextResponse.json({ error: "body_md is required" }, { status: 400 });
  }
  if (!passed_date || !/^\d{4}-\d{2}-\d{2}$/.test(passed_date)) {
    return NextResponse.json({ error: "passed_date must be YYYY-MM-DD" }, { status: 400 });
  }
  if (!VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("corp_resolutions")
    .insert({
      user_id: user.id,
      resolution_type,
      subject: subject.trim(),
      body_md: (body_md ?? "").trim(),
      passed_date,
      status,
      // resolution_number and fiscal_year are set by the DB trigger
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, resolution: data as CorpResolution }, { status: 201 });
}
