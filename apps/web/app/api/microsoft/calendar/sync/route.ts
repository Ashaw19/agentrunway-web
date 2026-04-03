/**
 * POST /api/microsoft/calendar/sync
 *
 * Bidirectional Outlook Calendar sync.
 *
 * Pull phase:
 *  1. If calendar_sync_token (deltaLink) exists → incremental sync
 *  2. If not → initial sync (next 90 days)
 *  3. Upsert Outlook events into calendar_events table
 *
 * Push phase:
 *  4. Find Agent Runway events with sync_status='pending' (no outlook_event_id)
 *  5. Create them in Outlook Calendar
 *  6. Store the returned outlook_event_id
 *
 * Updates calendar_sync_token and last_calendar_sync on the email_connections row.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getValidMicrosoftToken,
  type MicrosoftConnection,
} from "@/lib/microsoft/token-manager";
import {
  listAllEvents,
  createEvent as createOutlookEvent,
  type OutlookCalendarEvent,
} from "@/lib/microsoft/calendar-client";

export async function POST(): Promise<NextResponse> {
  // ── Auth ────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check sandbox mode
  const { data: sandboxCheck } = await supabase
    .from("user_settings")
    .select("sandbox_mode")
    .eq("user_id", user.id)
    .single();
  if (sandboxCheck?.sandbox_mode === true) {
    return NextResponse.json({ error: "Action blocked in Sandbox Mode" }, { status: 403 });
  }

  // ── Fetch Microsoft connection ─────────────────────────────────────────
  const { data: conn, error: connErr } = await supabase
    .from("email_connections")
    .select(
      "id, access_token_enc, refresh_token_enc, expires_at, calendar_sync_enabled, calendar_sync_token, last_calendar_sync"
    )
    .eq("user_id", user.id)
    .eq("provider", "microsoft")
    .single();

  if (connErr || !conn) {
    return NextResponse.json(
      { error: "No Microsoft connection found", code: "NO_CONNECTION" },
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
    const tokenResult = await getValidMicrosoftToken(
      conn as unknown as MicrosoftConnection
    );

    if (tokenResult.refreshed) {
      const updatePayload: Record<string, string> = {
        access_token_enc: tokenResult.newAccessTokenEnc!,
        expires_at: tokenResult.newExpiresAt!.toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (tokenResult.newRefreshTokenEnc) {
        updatePayload.refresh_token_enc = tokenResult.newRefreshTokenEnc;
      }
      await supabase
        .from("email_connections")
        .update(updatePayload)
        .eq("id", conn.id);
    }

    const accessToken = tokenResult.accessToken;

    // ── PULL: Sync events FROM Outlook ─────────────────────────────────
    let events: OutlookCalendarEvent[];
    let deltaLink: string | null;

    try {
      if (conn.calendar_sync_token) {
        // Incremental sync using deltaLink
        const result = await listAllEvents(accessToken, {
          deltaLink: conn.calendar_sync_token,
        });
        events = result.events;
        deltaLink = result.deltaLink;
      } else {
        // Initial sync — next 90 days
        const now = new Date();
        const future = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
        const result = await listAllEvents(accessToken, {
          startDateTime: now.toISOString(),
          endDateTime: future.toISOString(),
        });
        events = result.events;
        deltaLink = result.deltaLink;
      }
    } catch (err) {
      // If delta token expired (410), do a full resync
      if (
        err instanceof Error &&
        (err as Error & { code?: number }).code === 410
      ) {
        const now = new Date();
        const future = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
        const result = await listAllEvents(accessToken, {
          startDateTime: now.toISOString(),
          endDateTime: future.toISOString(),
        });
        events = result.events;
        deltaLink = result.deltaLink;
      } else {
        throw err;
      }
    }

    // Batch upsert pulled events
    const upsertPayloads: Array<Record<string, unknown>> = [];
    const deletedIds: string[] = [];
    const nowISO = new Date().toISOString();

    for (const event of events) {
      if (!event.id) continue;

      // Deleted or cancelled events
      if (event["@removed"] || event.isCancelled) {
        deletedIds.push(event.id);
        continue;
      }

      // Parse dates — Outlook uses { dateTime, timeZone } format
      const startAt = event.isAllDay
        ? `${event.start.dateTime.slice(0, 10)}T00:00:00Z`
        : new Date(`${event.start.dateTime}`).toISOString();
      const endAt = event.isAllDay
        ? `${event.end.dateTime.slice(0, 10)}T00:00:00Z`
        : new Date(`${event.end.dateTime}`).toISOString();

      upsertPayloads.push({
        user_id:          user.id,
        outlook_event_id: event.id,
        source:           "outlook",
        title:            event.subject ?? "(No title)",
        description:      event.bodyPreview ?? null,
        location:         event.location?.displayName ?? null,
        start_at:         startAt,
        end_at:           endAt,
        all_day:          event.isAllDay ?? false,
        google_updated:   event.lastModifiedDateTime ?? null, // reusing the column for "provider_updated"
        synced_at:        nowISO,
        sync_status:      "synced",
      });
    }

    // Batch upsert
    let pulled = 0;
    if (upsertPayloads.length > 0) {
      const { error: upsertErr } = await supabase
        .from("calendar_events")
        .upsert(upsertPayloads, {
          onConflict: "user_id,outlook_event_id",
          ignoreDuplicates: false,
        });
      if (!upsertErr) pulled = upsertPayloads.length;
    }

    // Batch update deleted events
    if (deletedIds.length > 0) {
      await supabase
        .from("calendar_events")
        .update({ sync_status: "deleted", updated_at: nowISO })
        .eq("user_id", user.id)
        .in("outlook_event_id", deletedIds);
    }

    // ── PUSH: Sync Agent Runway events TO Outlook ──────────────────────
    const { data: pendingEvents } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("user_id", user.id)
      .eq("source", "agent_runway")
      .eq("sync_status", "pending")
      .is("outlook_event_id", null);

    let pushed = 0;
    if (pendingEvents) {
      for (const arEvent of pendingEvents) {
        try {
          // Determine timezone — default to America/Toronto
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto";

          const created = await createOutlookEvent(accessToken, {
            subject: arEvent.title,
            body: arEvent.description
              ? { contentType: "Text", content: arEvent.description }
              : undefined,
            location: arEvent.location
              ? { displayName: arEvent.location }
              : undefined,
            start: arEvent.all_day
              ? { dateTime: `${arEvent.start_at.slice(0, 10)}T00:00:00`, timeZone: "UTC" }
              : { dateTime: arEvent.start_at.replace("Z", ""), timeZone: tz },
            end: arEvent.all_day
              ? { dateTime: `${arEvent.end_at.slice(0, 10)}T00:00:00`, timeZone: "UTC" }
              : { dateTime: arEvent.end_at.replace("Z", ""), timeZone: tz },
            isAllDay: arEvent.all_day ?? false,
          });

          await supabase
            .from("calendar_events")
            .update({
              outlook_event_id: created.id,
              synced_at:        new Date().toISOString(),
              sync_status:      "synced",
            })
            .eq("id", arEvent.id);

          pushed++;
        } catch (err) {
          console.error(
            `[outlook-calendar/sync] Failed to push event ${arEvent.id}:`,
            err
          );
        }
      }
    }

    // ── Update sync state ───────────────────────────────────────────────
    await supabase
      .from("email_connections")
      .update({
        calendar_sync_token: deltaLink,
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
    console.error("[outlook-calendar/sync] Error:", err);

    const message = err instanceof Error ? err.message : String(err);
    const isAuthError =
      message.includes("401") || message.includes("InvalidAuthenticationToken");

    return NextResponse.json(
      {
        error: "Outlook calendar sync failed",
        message,
        code: isAuthError ? "AUTH_EXPIRED" : "SYNC_FAILED",
      },
      { status: isAuthError ? 401 : 500 }
    );
  }
}
