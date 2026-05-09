/**
 * /api/cockpit/resolutions/[id]
 *
 * PATCH  — update a resolution (subject, body_md, status, passed_date)
 * DELETE — delete a draft resolution (passed resolutions are immutable)
 *
 * Allowlisted to Andrew's account only.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { CorpResolution } from "@agent-runway/core/types/database";

const ALLOWED_EMAILS = new Set(["andrew@andrewdshaw.ca"]);

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

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { supabase, user } = await authenticate(req);
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  if (b.subject !== undefined) {
    const s = b.subject as string;
    if (s.trim().length === 0) return NextResponse.json({ error: "subject cannot be empty" }, { status: 400 });
    updates.subject = s.trim();
  }
  if (b.body_md !== undefined) {
    updates.body_md = (b.body_md as string).trim();
  }
  if (b.status !== undefined) {
    if (!VALID_STATUSES.has(b.status as string)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    updates.status = b.status;
  }
  if (b.passed_date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.passed_date as string)) {
      return NextResponse.json({ error: "passed_date must be YYYY-MM-DD" }, { status: 400 });
    }
    updates.passed_date = b.passed_date;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("corp_resolutions")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, resolution: data as CorpResolution });
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { supabase, user } = await authenticate(req);
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Fetch first to check immutability
  const { data: existing, error: fetchErr } = await supabase
    .from("corp_resolutions")
    .select("id, status")
    .eq("id", id)
    .single();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if ((existing as { status: string }).status === "passed") {
    return NextResponse.json(
      { error: "Passed resolutions cannot be deleted — they are part of the permanent minute book." },
      { status: 409 },
    );
  }

  const { error: deleteErr } = await supabase
    .from("corp_resolutions")
    .delete()
    .eq("id", id);

  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
