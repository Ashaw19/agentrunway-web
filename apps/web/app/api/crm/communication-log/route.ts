/**
 * POST /api/crm/communication-log
 *
 * Phase 2.4 of the HML gap-closure plan: agent-facing "Log reply" endpoint
 * that powers the per-client conversation timeline panel.
 *
 * The agent pastes an inbound reply they received from a client (or jots a
 * manual note about a phone/in-person/text conversation) and we append a
 * row to client_communication_log. Combined with workflow_drafts and
 * outreach_queue (both already in production), the timeline panel renders
 * a unified view without any email integration — Gmail/Workspace/IMAP are
 * CASA-shelved per memory/project_google_integrations.md.
 *
 * CASL posture: rows are agent notes, not automated commercial messages.
 * No consent regime applies to note-taking.
 *
 * Body:
 *   {
 *     client_id: string;
 *     direction: 'outbound' | 'inbound' | 'note';
 *     subject?: string;
 *     body: string;
 *     logged_at?: string;   // ISO timestamp; defaults to now()
 *   }
 *
 * Auth-gated. No rate limit (agent-facing, low volume).
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-helpers";
import type {
  ClientCommunicationLog,
  CommunicationDirection,
} from "@agent-runway/core/types/database";

const VALID_DIRECTIONS: ReadonlyArray<CommunicationDirection> = [
  "outbound",
  "inbound",
  "note",
];

const MAX_SUBJECT_LEN = 500;
const MAX_BODY_LEN = 50_000;

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest();
    if (auth.error) return auth.error;
    const { supabase, userId } = auth;

    let body: {
      client_id?: string;
      direction?: string;
      subject?: string | null;
      body?: string;
      logged_at?: string;
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // ── Validate ──────────────────────────────────────────────────────────
    const clientId = body.client_id?.trim();
    if (!clientId) {
      return NextResponse.json(
        { error: "client_id is required" },
        { status: 400 },
      );
    }

    const direction = body.direction;
    if (!direction || !VALID_DIRECTIONS.includes(direction as CommunicationDirection)) {
      return NextResponse.json(
        { error: `direction must be one of: ${VALID_DIRECTIONS.join(", ")}` },
        { status: 400 },
      );
    }

    const messageBody = body.body?.trim();
    if (!messageBody) {
      return NextResponse.json(
        { error: "body is required" },
        { status: 400 },
      );
    }
    if (messageBody.length > MAX_BODY_LEN) {
      return NextResponse.json(
        { error: `body exceeds ${MAX_BODY_LEN} characters` },
        { status: 400 },
      );
    }

    const subject = body.subject?.trim() || null;
    if (subject && subject.length > MAX_SUBJECT_LEN) {
      return NextResponse.json(
        { error: `subject exceeds ${MAX_SUBJECT_LEN} characters` },
        { status: 400 },
      );
    }

    let loggedAt: string | undefined;
    if (body.logged_at) {
      const parsed = new Date(body.logged_at);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: "logged_at must be a valid ISO timestamp" },
          { status: 400 },
        );
      }
      loggedAt = parsed.toISOString();
    }

    // ── Confirm the client belongs to this user (RLS will also block,
    //    but we want a clear 403 instead of a generic insert error). ──────
    const { data: clientRow, error: clientErr } = await supabase
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .eq("user_id", userId)
      .maybeSingle();

    if (clientErr) {
      console.error("[crm/communication-log POST] client lookup error:", clientErr);
      return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
    }
    if (!clientRow) {
      return NextResponse.json(
        { error: "Client not found or access denied" },
        { status: 403 },
      );
    }

    // ── Insert ────────────────────────────────────────────────────────────
    const insertPayload: {
      user_id: string;
      client_id: string;
      direction: CommunicationDirection;
      subject: string | null;
      body: string;
      logged_at?: string;
    } = {
      user_id: userId,
      client_id: clientId,
      direction: direction as CommunicationDirection,
      subject,
      body: messageBody,
    };
    if (loggedAt) insertPayload.logged_at = loggedAt;

    const { data: inserted, error: insertErr } = await supabase
      .from("client_communication_log")
      .insert(insertPayload)
      .select("*")
      .single();

    if (insertErr || !inserted) {
      console.error("[crm/communication-log POST] insert error:", insertErr);
      return NextResponse.json({ error: "Insert failed" }, { status: 500 });
    }

    return NextResponse.json(
      { entry: inserted as ClientCommunicationLog },
      { status: 201 },
    );
  } catch (err) {
    console.error("[crm/communication-log POST] unexpected error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
