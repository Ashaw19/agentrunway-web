/**
 * POST /api/google/calendar/push
 *
 * Push a single Agent Runway event to Google Calendar immediately.
 * Used when pipeline deals change stage, tasks are created with due dates, etc.
 *
 * Expects: {
 *   title: string,
 *   description?: string,
 *   location?: string,
 *   start_at: string (ISO 8601),
 *   end_at: string (ISO 8601),
 *   all_day?: boolean,
 *   source_type: 'showing' | 'closing' | 'follow_up' | 'meeting',
 *   source_id?: string (UUID of the originating record)
 * }
 *
 * Creates a calendar_events row AND pushes to Google Calendar in one call.
 * If Google Calendar is not connected, still creates the local event (synced later).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getValidAccessToken,
  type GoogleConnection,
} from "@/lib/google/token-manager";
import { createEvent } from "@/lib/google/calendar-client";

interface PushBody {
  title: string;
  description?: string;
  location?: string;
  start_at: string;
  end_at: string;
  all_day?: boolean;
  source_type?: string;
  source_id?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as PushBody;

  if (!body.title || !body.start_at || !body.end_at) {
    return NextResponse.json(
      { error: "Missing required fields: title, start_at, end_at" },
      { status: 400 }
    );
  }

  try {
    // ── Insert local calendar event ─────────────────────────────────────
    const { data: localEvent, error: insertErr } = await supabase
      .from("calendar_events")
      .insert({
        user_id:     user.id,
        source:      "agent_runway",
        source_type: body.source_type ?? null,
        source_id:   body.source_id ?? null,
        title:       body.title,
        description: body.description ?? null,
        location:    body.location ?? null,
        start_at:    body.start_at,
        end_at:      body.end_at,
        all_day:     body.all_day ?? false,
        sync_status: "pending",
      })
      .select("id")
      .single();

    if (insertErr || !localEvent) {
      console.error("[calendar/push] Insert failed:", insertErr?.message);
      return NextResponse.json(
        { error: "Failed to create calendar event" },
        { status: 500 }
      );
    }

    // ── Try to push to Google Calendar ──────────────────────────────────
    const { data: conn } = await supabase
      .from("google_connections")
      .select(
        "id, access_token_enc, refresh_token_enc, expires_at, calendar_sync_enabled"
      )
      .eq("user_id", user.id)
      .single();

    if (conn?.calendar_sync_enabled) {
      try {
        const tokenResult = await getValidAccessToken(
          conn as GoogleConnection
        );

        if (tokenResult.refreshed && tokenResult.newAccessTokenEnc) {
          await supabase
            .from("google_connections")
            .update({
              access_token_enc: tokenResult.newAccessTokenEnc,
              expires_at: tokenResult.newExpiresAt!.toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", conn.id);
        }

        const googleEvent = await createEvent(tokenResult.accessToken, {
          summary:     body.title,
          description: body.description,
          location:    body.location,
          start: body.all_day
            ? { date: body.start_at.slice(0, 10) }
            : { dateTime: body.start_at },
          end: body.all_day
            ? { date: body.end_at.slice(0, 10) }
            : { dateTime: body.end_at },
          reminders: { useDefault: true },
        });

        // Update local record with Google event ID
        await supabase
          .from("calendar_events")
          .update({
            google_event_id: googleEvent.id,
            synced_at:       new Date().toISOString(),
            sync_status:     "synced",
          })
          .eq("id", localEvent.id);

        return NextResponse.json({
          ok: true,
          event_id: localEvent.id,
          google_event_id: googleEvent.id,
          synced: true,
        });
      } catch (err) {
        console.error("[calendar/push] Google push failed:", err);
        // Still return success — local event was created, sync will catch up
      }
    }

    // Google not connected or push failed — event exists locally, will sync later
    return NextResponse.json({
      ok: true,
      event_id: localEvent.id,
      synced: false,
    });
  } catch (err) {
    console.error("[calendar/push] Error:", err);
    return NextResponse.json(
      { error: "Failed to create calendar event" },
      { status: 500 }
    );
  }
}
