/**
 * POST /api/cockpit/compliance/[id]/snooze
 *
 * Push an event's due_date forward by N days. Used when Andrew has more
 * context than the original seed (e.g. accountant requested 30-day extension,
 * known travel, etc.).
 *
 * Request body: { days: number, reason?: string }
 *   - days: integer ≥ 1, ≤ 365
 *   - reason: appended to notes with timestamp prefix (audit trail)
 *
 * Cannot snooze a completed event (return 409). Snoozing a recurring event
 * only moves THIS occurrence — the recurrence pattern is unchanged so future
 * occurrences keep the original cadence.
 *
 * Allowlisted to Andrew's account only.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { CorpComplianceEvent } from "@agent-runway/core/types/database";

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

export async function POST(
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
  const daysRaw = b.days;
  const reason = typeof b.reason === "string" ? b.reason.trim() : null;

  if (typeof daysRaw !== "number" || !Number.isInteger(daysRaw) || daysRaw < 1 || daysRaw > 365) {
    return NextResponse.json(
      { error: "days must be an integer between 1 and 365" },
      { status: 400 },
    );
  }
  const days = daysRaw;

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
    return NextResponse.json({ error: "cannot snooze a completed event" }, { status: 409 });
  }

  // Compute new due_date as YYYY-MM-DD, UTC-anchored to avoid TZ drift.
  const [y, m, d] = event.due_date.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  const new_due_date = date.toISOString().slice(0, 10);

  const auditPrefix = `[snoozed ${new Date().toISOString().slice(0, 10)} +${days}d]`;
  const auditLine = reason ? `${auditPrefix} ${reason}` : auditPrefix;
  const next_notes = event.notes ? `${event.notes}\n\n${auditLine}` : auditLine;

  const { data: updated, error: updateErr } = await supabase
    .from("corp_compliance_events")
    .update({
      due_date: new_due_date,
      notes: next_notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, event: updated as CorpComplianceEvent });
}
