/**
 * /api/cockpit/compliance/[id]
 *
 * PATCH  — edit fields on a compliance event
 * DELETE — remove a compliance event (allowed even if completed —
 *          completed events are still part of the audit trail but Andrew may
 *          want to clear seeded events that don't apply).
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
const VALID_RECURRING = new Set(["annual", "quarterly", "monthly", "fiscal-anniversary"]);

async function authenticate() {
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
  const { id } = await params;
  const { supabase, user } = await authenticate();
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
  const update: Record<string, unknown> = {};

  if (typeof b.title === "string") {
    if (b.title.trim().length === 0) {
      return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    }
    update.title = b.title.trim();
  }
  if (typeof b.kind === "string") {
    if (!VALID_KINDS.has(b.kind)) {
      return NextResponse.json({ error: "invalid kind" }, { status: 400 });
    }
    update.kind = b.kind;
  }
  if (typeof b.due_date === "string") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.due_date)) {
      return NextResponse.json({ error: "due_date must be YYYY-MM-DD" }, { status: 400 });
    }
    update.due_date = b.due_date;
  }
  if (typeof b.severity === "string") {
    if (!VALID_SEVERITIES.has(b.severity)) {
      return NextResponse.json({ error: "invalid severity" }, { status: 400 });
    }
    update.severity = b.severity;
  }
  if ("recurring_pattern" in b) {
    const rp = b.recurring_pattern;
    if (rp !== null && (typeof rp !== "string" || !VALID_RECURRING.has(rp))) {
      return NextResponse.json({ error: "invalid recurring_pattern" }, { status: 400 });
    }
    update.recurring_pattern = rp;
  }
  if ("notes" in b) {
    const n = b.notes;
    if (n !== null && typeof n !== "string") {
      return NextResponse.json({ error: "notes must be a string or null" }, { status: 400 });
    }
    update.notes = typeof n === "string" ? (n.trim() || null) : null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  update.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("corp_compliance_events")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, event: data as CorpComplianceEvent });
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase, user } = await authenticate();
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("corp_compliance_events")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
