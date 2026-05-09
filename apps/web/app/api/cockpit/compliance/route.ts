/**
 * /api/cockpit/compliance
 *
 * GET  — list events (optional ?include_completed=1 and ?kind= filters)
 * POST — create a new compliance event
 *
 * Allowlisted to Andrew's account only.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { CorpComplianceEvent } from "@agent-runway/core/types/database";

const ALLOWED_EMAILS = new Set(["andrew@andrewdshaw.ca"]);

const VALID_KINDS = new Set([
  "cra-t2-filing",
  "cra-t2-payment",
  "cra-hst-filing",
  "cra-hst-instalment",
  "cra-payroll-t4",
  "cra-payroll-source-deductions",
  "corp-annual-return-federal",
  "corp-annual-return-nb",
  "corp-minute-book",
  "corp-insurance-renewal",
  "corp-other",
]);

const VALID_SEVERITIES = new Set(["low", "medium", "high"]);

const VALID_RECURRING = new Set([
  "annual",
  "quarterly",
  "monthly",
  "fiscal-anniversary",
]);

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
  const includeCompleted = searchParams.get("include_completed") === "1";
  const kindParam = searchParams.get("kind");

  let query = supabase
    .from("corp_compliance_events")
    .select("*")
    .order("due_date", { ascending: true })
    .order("created_at", { ascending: false });

  if (!includeCompleted) {
    query = query.is("completed_at", null);
  }

  if (kindParam) {
    if (!VALID_KINDS.has(kindParam)) {
      return NextResponse.json({ error: "invalid kind" }, { status: 400 });
    }
    query = query.eq("kind", kindParam);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: (data ?? []) as CorpComplianceEvent[] });
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

  const title = b.title as string | undefined;
  const kind = (b.kind as string | undefined) ?? "corp-other";
  const due_date = b.due_date as string | undefined;
  const severity = (b.severity as string | undefined) ?? "medium";
  const recurring_pattern = (b.recurring_pattern as string | null | undefined) ?? null;
  const notes = (b.notes as string | null | undefined) ?? null;

  if (!title || title.trim().length === 0) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!VALID_KINDS.has(kind)) {
    return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  }
  if (!due_date || !/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
    return NextResponse.json({ error: "due_date must be YYYY-MM-DD" }, { status: 400 });
  }
  if (!VALID_SEVERITIES.has(severity)) {
    return NextResponse.json({ error: "invalid severity" }, { status: 400 });
  }
  if (recurring_pattern !== null && !VALID_RECURRING.has(recurring_pattern)) {
    return NextResponse.json({ error: "invalid recurring_pattern" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("corp_compliance_events")
    .insert({
      user_id: user.id,
      title: title.trim(),
      kind,
      due_date,
      severity,
      recurring_pattern,
      notes: notes ? notes.trim() : null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, event: data as CorpComplianceEvent }, { status: 201 });
}
