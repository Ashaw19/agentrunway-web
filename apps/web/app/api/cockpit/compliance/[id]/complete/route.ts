/**
 * POST /api/cockpit/compliance/[id]/complete
 *
 * Marks an event complete. If the event has a `recurring_pattern`, also
 * inserts the next occurrence (rolled forward by the pattern) so the
 * calendar self-maintains without per-FY manual seeding.
 *
 * Request body (optional): { note?: string, roll_forward?: boolean }
 *   - note: free-text completed_note (e.g. "filed via accountant 2026-04-15")
 *   - roll_forward: defaults true for recurring events, ignored otherwise
 *
 * Allowlisted to Andrew's account only.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type {
  CorpComplianceEvent,
  CorpComplianceRecurringPattern,
} from "@agent-runway/core/types/database";

const ALLOWED_EMAILS = new Set(["andrew@andrewdshaw.ca"]);

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

/**
 * Compute the next due_date for a recurring event.
 *
 * - annual: +1 year
 * - quarterly: +3 months
 * - monthly: +1 month
 * - fiscal-anniversary: +1 year (treated like annual for AR Inc.'s calendar
 *   year-end; once we support non-calendar fiscal years this branches out).
 *
 * Returns YYYY-MM-DD.
 */
function rollForwardDate(due_date: string, pattern: CorpComplianceRecurringPattern): string {
  const [y, m, d] = due_date.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  switch (pattern) {
    case "annual":
    case "fiscal-anniversary":
      date.setUTCFullYear(date.getUTCFullYear() + 1);
      break;
    case "quarterly":
      date.setUTCMonth(date.getUTCMonth() + 3);
      break;
    case "monthly":
      date.setUTCMonth(date.getUTCMonth() + 1);
      break;
  }
  return date.toISOString().slice(0, 10);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase, user } = await authenticate();
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown = {};
  try {
    const raw = await req.text();
    if (raw.trim()) body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const note = typeof b.note === "string" ? b.note.trim() : null;
  const rollForwardOpt = typeof b.roll_forward === "boolean" ? b.roll_forward : true;

  // Fetch the event first so we can read recurring_pattern + due_date.
  const { data: existing, error: fetchErr } = await supabase
    .from("corp_compliance_events")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const event = existing as CorpComplianceEvent;

  if (event.completed_at) {
    return NextResponse.json({ error: "already completed" }, { status: 409 });
  }

  // Mark complete.
  const { data: updated, error: updateErr } = await supabase
    .from("corp_compliance_events")
    .update({
      completed_at: new Date().toISOString(),
      completed_note: note,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Roll forward if recurring and requested.
  let next: CorpComplianceEvent | null = null;
  if (rollForwardOpt && event.recurring_pattern) {
    const next_due = rollForwardDate(
      event.due_date,
      event.recurring_pattern as CorpComplianceRecurringPattern,
    );

    const { data: inserted, error: insertErr } = await supabase
      .from("corp_compliance_events")
      .insert({
        user_id: user.id,
        title: event.title,
        kind: event.kind,
        due_date: next_due,
        severity: event.severity,
        recurring_pattern: event.recurring_pattern,
        notes: event.notes,
      })
      .select()
      .single();

    if (insertErr) {
      // Don't fail the whole request — completion is more important than
      // the rollover. Surface the warning to the client.
      return NextResponse.json({
        ok: true,
        event: updated as CorpComplianceEvent,
        rollover_warning: insertErr.message,
      });
    }
    next = inserted as CorpComplianceEvent;
  }

  return NextResponse.json({
    ok: true,
    event: updated as CorpComplianceEvent,
    next_occurrence: next,
  });
}
