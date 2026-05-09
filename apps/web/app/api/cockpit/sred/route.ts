/**
 * /api/cockpit/sred
 *
 * GET  — list SR&ED entries (optional ?year=2026 and ?weight= filters)
 * POST — create a new SR&ED work-log entry
 *
 * Allowlisted to Andrew's account only.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { CorpSredEntry } from "@agent-runway/core/types/database";

const ALLOWED_EMAILS = new Set(["andrew@andrewdshaw.ca"]);

const VALID_WEIGHTS = new Set(["none", "low", "medium", "high"]);

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
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const yearParam = searchParams.get("year");
  const weightParam = searchParams.get("weight");

  let query = supabase
    .from("corp_sred_entries")
    .select("*")
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (yearParam) {
    const year = Number(yearParam);
    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      return NextResponse.json({ error: "invalid year" }, { status: 400 });
    }
    query = query
      .gte("entry_date", `${year}-01-01`)
      .lte("entry_date", `${year}-12-31`);
  }

  if (weightParam) {
    if (!VALID_WEIGHTS.has(weightParam)) {
      return NextResponse.json({ error: "invalid weight" }, { status: 400 });
    }
    query = query.eq("sred_weight", weightParam);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also fetch the annual summary for the requested year
  let summary = null;
  if (yearParam) {
    const { data: summaryData } = await supabase
      .from("v_corp_sred_annual_summary")
      .select("*")
      .eq("fiscal_year", Number(yearParam))
      .single();
    summary = summaryData;
  }

  return NextResponse.json({
    entries: (data ?? []) as CorpSredEntry[],
    summary,
  });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { supabase, user } = await authenticate(req);
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;

  const entry_date = b.entry_date as string | undefined;
  const hours = b.hours as number | undefined;
  const work_summary = b.work_summary as string | undefined;
  const sred_weight = (b.sred_weight as string | undefined) ?? "high";

  if (!entry_date || !/^\d{4}-\d{2}-\d{2}$/.test(entry_date)) {
    return NextResponse.json({ error: "entry_date must be YYYY-MM-DD" }, { status: 400 });
  }
  if (typeof hours !== "number" || hours <= 0 || hours > 24) {
    return NextResponse.json({ error: "hours must be a number between 0 and 24" }, { status: 400 });
  }
  if (!work_summary || work_summary.trim().length === 0) {
    return NextResponse.json({ error: "work_summary is required" }, { status: 400 });
  }
  if (!VALID_WEIGHTS.has(sred_weight)) {
    return NextResponse.json({ error: "invalid sred_weight" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("corp_sred_entries")
    .insert({
      user_id:         user.id,
      entry_date,
      hours,
      work_summary:    work_summary.trim(),
      tech_challenges: b.tech_challenges ? String(b.tech_challenges).trim() : null,
      sred_note:       b.sred_note ? String(b.sred_note).trim() : null,
      sred_weight,
      commits_count:   typeof b.commits_count === "number" ? b.commits_count : null,
      pr_refs:         b.pr_refs ? String(b.pr_refs).trim() : null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, entry: data as CorpSredEntry }, { status: 201 });
}
