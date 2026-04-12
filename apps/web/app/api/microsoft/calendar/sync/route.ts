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

/**
 * Convert Outlook's local dateTime + timeZone to a UTC ISO string.
 * Outlook returns e.g. "2026-04-15T10:00:00.0000000" with timeZone "America/Toronto".
 * We need to store this as a proper UTC timestamp.
 */
function outlookDateToISO(dateTime: string, timeZone: string): string {
  // If the timezone is UTC, just append Z
  if (timeZone === "UTC" || timeZone === "Etc/UTC") {
    return dateTime.replace(/\.0+$/, "").replace(/Z$/, "") + "Z";
  }

  // For other timezones, use Intl to compute the UTC offset
  // The dateTime from Outlook has no offset, so we construct a Date in that timezone
  try {
    // Clean the datetime string (remove trailing zeros from fractional seconds)
    const clean = dateTime.replace(/\.0+$/, "");
    // Use the timezone to format and compute offset
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
      timeZoneName: "shortOffset",
    });
    // Create a reference date to get the UTC offset for this timezone at this time
    const refDate = new Date(clean + "Z"); // parse as UTC first
    const parts = formatter.formatToParts(refDate);
    const offsetPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    // Parse offset like "GMT-4" or "GMT+5:30"
    const offsetMatch = offsetPart.match(/GMT([+-]?\d{1,2})(?::(\d{2}))?/);
    if (offsetMatch) {
      const hours = parseInt(offsetMatch[1], 10);
      const minutes = parseInt(offsetMatch[2] ?? "0", 10);
      // Correctly handle negative offsets with minutes (e.g., GMT-3:30 for Newfoundland)
      const sign = hours < 0 ? -1 : 1;
      const totalOffsetMs = (Math.abs(hours) * 60 + minutes) * sign * 60 * 1000;
      // The dateTime is local time = UTC + offset, so UTC = local - offset
      const localAsUtc = new Date(clean + "Z");
      const utc = new Date(localAsUtc.getTime() - totalOffsetMs);
      return utc.toISOString();
    }
  } catch {
    // Fallback: treat as UTC if timezone parsing fails
  }
  // Fallback: append Z (imperfect but better than crashing)
  return dateTime.replace(/\.0+$/, "") + "Z";
}

export async function POST(): Promise<NextResponse> {
  // ── Auth ────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

      // Parse dates — Outlook returns local time + timeZone, NOT UTC.
      // We must append the timezone or treat the dateTime as-is with its zone context.
      // For all-day events, just use the date portion.
      // For timed events, append "Z" only if the timezone IS UTC, otherwise store as-is
      // (Outlook dateTime format: "2026-04-15T10:00:00.0000000")
      const startAt = event.isAllDay
        ? `${event.start.dateTime.slice(0, 10)}T00:00:00Z`
        : outlookDateToISO(event.start.dateTime, event.start.timeZone);
      const endAt = event.isAllDay
        ? `${event.end.dateTime.slice(0, 10)}T00:00:00Z`
        : outlookDateToISO(event.end.dateTime, event.end.timeZone);

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
    let upsertFailed = false;
    if (upsertPayloads.length > 0) {
      const { error: upsertErr } = await supabase
        .from("calendar_events")
        .upsert(upsertPayloads, {
          onConflict: "user_id,outlook_event_id",
          ignoreDuplicates: false,
        });
      if (upsertErr) {
        console.error("[outlook-calendar/sync] Batch upsert failed:", upsertErr.message);
        upsertFailed = true;
      } else {
        pulled = upsertPayloads.length;
      }
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
    // Push events that don't yet have an Outlook event ID
    // Use "pending" OR "synced" — if Google push already set status to "synced", we still need Outlook push
    const { data: pendingEvents } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("user_id", user.id)
      .eq("source", "agent_runway")
      .in("sync_status", ["pending", "synced"])
      .is("outlook_event_id", null);

    let pushed = 0;
    if (pendingEvents) {
      for (const arEvent of pendingEvents) {
        try {
          // start_at/end_at are stored as UTC ISO strings — tell Outlook they're UTC
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
              : { dateTime: arEvent.start_at.replace("Z", ""), timeZone: "UTC" },
            end: arEvent.all_day
              ? { dateTime: `${arEvent.end_at.slice(0, 10)}T00:00:00`, timeZone: "UTC" }
              : { dateTime: arEvent.end_at.replace("Z", ""), timeZone: "UTC" },
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
    // Only advance sync token if upsert succeeded — otherwise next run re-fetches lost events
    await supabase
      .from("email_connections")
      .update({
        calendar_sync_token: upsertFailed ? conn.calendar_sync_token : deltaLink,
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
    const rawMessage = err instanceof Error ? err.message : String(err);
    console.error("[outlook-calendar/sync] Error:", rawMessage);

    const isAuthError =
      rawMessage.includes("401") || rawMessage.includes("InvalidAuthenticationToken");

    return NextResponse.json(
      {
        error: isAuthError
          ? "Outlook authentication expired — please reconnect"
          : "Outlook calendar sync failed",
        code: isAuthError ? "AUTH_EXPIRED" : "SYNC_FAILED",
      },
      { status: isAuthError ? 401 : 500 }
    );
  }
}
