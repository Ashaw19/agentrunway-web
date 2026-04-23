/**
 * POST /api/google/calendar/sync
 *
 * Bidirectional Google Calendar sync.
 *
 * Pull phase:
 *  1. If calendar_sync_token exists → incremental sync (only changes)
 *  2. If not → initial sync (next 90 days of events)
 *  3. Upsert Google events into calendar_events table
 *
 * Push phase:
 *  4. Find Agent Runway events with sync_status='pending' (no google_event_id)
 *  5. Create them in Google Calendar
 *  6. Store the returned google_event_id
 *
 * Updates calendar_sync_token and last_calendar_sync on the google_connections row.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getValidAccessToken,
  type GoogleConnection,
} from "@/lib/google/token-manager";
import {
  listAllEvents,
  createEvent,
  type GoogleCalendarEvent,
} from "@/lib/google/calendar-client";

export async function POST(): Promise<NextResponse> {
  // ── Auth ────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── CASA shelf guard ─────────────────────────────────────────────────────
  return NextResponse.json(
    { error: "Google integration is temporarily unavailable." },
    { status: 503 }
  );

  // ── Fetch Google connection ─────────────────────────────────────────────
  const { data: conn, error: connErr } = await supabase
    .from("google_connections")
    .select(
      "id, access_token_enc, refresh_token_enc, expires_at, calendar_sync_enabled, calendar_sync_token, last_calendar_sync"
    )
    .eq("user_id", user.id)
    .single();

  if (connErr || !conn) {
    return NextResponse.json(
      { error: "No Google connection found", code: "NO_CONNECTION" },
      { status: 422 }
    );
  }

  if (!conn.calendar_sync_enabled) {
    return NextResponse.json(
      { error: "Calendar sync not enabled", code: "NO_CALENDAR_SCOPE" },
      { status: 403 }
    );
  }

  try {
    // ── Get valid access token ──────────────────────────────────────────
    const tokenResult = await getValidAccessToken(conn as GoogleConnection);

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

    const accessToken = tokenResult.accessToken;

    // ── PULL: Sync events FROM Google ───────────────────────────────────
    let events: GoogleCalendarEvent[];
    let nextSyncToken: string | null;

    try {
      if (conn.calendar_sync_token) {
        // Incremental sync
        const result = await listAllEvents(accessToken, {
          syncToken: conn.calendar_sync_token,
        });
        events = result.events;
        nextSyncToken = result.nextSyncToken;
      } else {
        // Initial sync — next 90 days
        const now = new Date();
        const future = new Date(
          now.getTime() + 90 * 24 * 60 * 60 * 1000
        );
        const result = await listAllEvents(accessToken, {
          timeMin: now.toISOString(),
          timeMax: future.toISOString(),
        });
        events = result.events;
        nextSyncToken = result.nextSyncToken;
      }
    } catch (err) {
      // If sync token is stale (410), do a full resync
      if (
        err instanceof Error &&
        (err as Error & { code?: number }).code === 410
      ) {
        const now = new Date();
        const future = new Date(
          now.getTime() + 90 * 24 * 60 * 60 * 1000
        );
        const result = await listAllEvents(accessToken, {
          timeMin: now.toISOString(),
          timeMax: future.toISOString(),
        });
        events = result.events;
        nextSyncToken = result.nextSyncToken;
      } else {
        throw err;
      }
    }

    // Batch upsert pulled events
    const upsertPayloads: Array<Record<string, unknown>> = [];
    const cancelledIds: string[] = [];
    const nowISO = new Date().toISOString();

    for (const event of events) {
      if (!event.id) continue;

      // Cancelled events → collect IDs for batch update
      if (event.status === "cancelled") {
        cancelledIds.push(event.id);
        continue;
      }

      const startAt = event.start?.dateTime ?? event.start?.date;
      const endAt = event.end?.dateTime ?? event.end?.date;
      if (!startAt || !endAt) continue;

      const isAllDay = !event.start?.dateTime;

      upsertPayloads.push({
        user_id:         user.id,
        google_event_id: event.id,
        source:          "google",
        title:           event.summary ?? "(No title)",
        description:     event.description ?? null,
        location:        event.location ?? null,
        start_at:        isAllDay ? `${startAt}T00:00:00Z` : startAt,
        end_at:          isAllDay ? `${endAt}T00:00:00Z` : endAt,
        all_day:         isAllDay,
        google_updated:  event.updated ?? null,
        synced_at:       nowISO,
        sync_status:     "synced",
      });
    }

    // Batch upsert all non-cancelled events in one call
    let pulled = 0;
    let upsertFailed = false;
    if (upsertPayloads.length > 0) {
      const { error: upsertErr } = await supabase
        .from("calendar_events")
        .upsert(upsertPayloads, {
          onConflict: "user_id,google_event_id",
          ignoreDuplicates: false,
        });
      if (upsertErr) {
        console.error("[calendar/sync] Batch upsert failed:", upsertErr.message);
        upsertFailed = true;
      } else {
        pulled = upsertPayloads.length;
      }
    }

    // Batch update cancelled events in one call
    if (cancelledIds.length > 0) {
      await supabase
        .from("calendar_events")
        .update({ sync_status: "deleted", updated_at: nowISO })
        .eq("user_id", user.id)
        .in("google_event_id", cancelledIds);
    }

    // ── PUSH: Sync Agent Runway events TO Google ────────────────────────
    // Use "pending" OR "synced" — if Outlook push already set status to "synced", we still need Google push
    const { data: pendingEvents } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("user_id", user.id)
      .eq("source", "agent_runway")
      .in("sync_status", ["pending", "synced"])
      .is("google_event_id", null);

    let pushed = 0;
    if (pendingEvents) {
      for (const arEvent of pendingEvents) {
        try {
          const created = await createEvent(accessToken, {
            summary:     arEvent.title,
            description: arEvent.description ?? undefined,
            location:    arEvent.location ?? undefined,
            start: arEvent.all_day
              ? { date: arEvent.start_at.slice(0, 10) }
              : { dateTime: arEvent.start_at },
            end: arEvent.all_day
              ? { date: arEvent.end_at.slice(0, 10) }
              : { dateTime: arEvent.end_at },
            reminders: { useDefault: true },
          });

          await supabase
            .from("calendar_events")
            .update({
              google_event_id: created.id,
              synced_at:       new Date().toISOString(),
              sync_status:     "synced",
            })
            .eq("id", arEvent.id);

          pushed++;
        } catch (err) {
          console.error(
            `[calendar/sync] Failed to push event ${arEvent.id}:`,
            err
          );
        }
      }
    }

    // ── Update sync state ───────────────────────────────────────────────
    // Only advance sync token if upsert succeeded — otherwise next run re-fetches lost events
    await supabase
      .from("google_connections")
      .update({
        calendar_sync_token: upsertFailed ? conn.calendar_sync_token : nextSyncToken,
        last_calendar_sync:  new Date().toISOString(),
        updated_at:          new Date().toISOString(),
      })
      .eq("id", conn.id);

    return NextResponse.json({
      ok: true,
      pulled,
      pushed,
      total_events: events.length,
    });
  } catch (err) {
    console.error("[calendar/sync] Error:", err);

    const message = err instanceof Error ? err.message : String(err);
    const isAuthError =
      message.includes("401") || message.includes("invalid_grant");

    return NextResponse.json(
      {
        error: "Calendar sync failed",
        message,
        code: isAuthError ? "AUTH_EXPIRED" : "SYNC_FAILED",
      },
      { status: isAuthError ? 401 : 500 }
    );
  }
}
