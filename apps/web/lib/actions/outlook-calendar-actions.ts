"use server";

/**
 * Outlook Calendar Actions
 *
 * Server actions for syncing calendar_events with Microsoft Outlook Calendar.
 * Mirrors the Google calendar-actions pattern for consistency.
 *
 * Used by /api/cron/calendar-sync for batch processing.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getValidMicrosoftToken,
  type MicrosoftConnection,
} from "@/lib/microsoft/token-manager";

// ── Sync function (called by cron) ──────────────────────────────────────────

export async function syncUserOutlookCalendar(userId: string): Promise<{
  synced: number;
  errors: number;
}> {
  const admin = createAdminClient();
  let syncedCount = 0;
  let errorCount = 0;

  // Get Microsoft connection with sync token
  const { data: conn } = await admin
    .from("email_connections")
    .select(
      "id, access_token_enc, refresh_token_enc, expires_at, calendar_sync_enabled, calendar_sync_token"
    )
    .eq("user_id", userId)
    .eq("provider", "microsoft")
    .maybeSingle();

  if (!conn?.calendar_sync_enabled) return { synced: 0, errors: 0 };

  try {
    // Get a valid access token
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
      await admin
        .from("email_connections")
        .update(updatePayload)
        .eq("id", conn.id);
    }

    const { listAllEvents, createEvent: createOutlookEvent } = await import(
      "@/lib/microsoft/calendar-client"
    );

    // Incremental sync if we have a deltaLink; full sync for first run
    let deltaLink: string | null = null;

    let result;
    try {
      result = await listAllEvents(
        tokenResult.accessToken,
        conn.calendar_sync_token
          ? { deltaLink: conn.calendar_sync_token }
          : {
              startDateTime: new Date(
                Date.now() - 7 * 24 * 60 * 60 * 1000
              ).toISOString(),
              endDateTime: new Date(
                Date.now() + 90 * 24 * 60 * 60 * 1000
              ).toISOString(),
            }
      );
    } catch (err) {
      // If delta token expired, full resync
      if (
        err instanceof Error &&
        (err as Error & { code?: number }).code === 410
      ) {
        result = await listAllEvents(tokenResult.accessToken, {
          startDateTime: new Date(
            Date.now() - 7 * 24 * 60 * 60 * 1000
          ).toISOString(),
          endDateTime: new Date(
            Date.now() + 90 * 24 * 60 * 60 * 1000
          ).toISOString(),
        });
      } else {
        throw err;
      }
    }

    const { events } = result;
    deltaLink = result.deltaLink;

    // Upsert events from Outlook
    for (const ev of events) {
      try {
        if (
          (ev as Record<string, unknown>)["@removed"] ||
          ev.isCancelled
        ) {
          await admin
            .from("calendar_events")
            .update({
              sync_status: "deleted",
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId)
            .eq("outlook_event_id", ev.id);
        } else {
          const startAt = ev.isAllDay
            ? `${ev.start.dateTime.slice(0, 10)}T00:00:00Z`
            : new Date(ev.start.dateTime).toISOString();
          const endAt = ev.isAllDay
            ? `${ev.end.dateTime.slice(0, 10)}T00:00:00Z`
            : new Date(ev.end.dateTime).toISOString();

          await admin.from("calendar_events").upsert(
            {
              user_id: userId,
              outlook_event_id: ev.id,
              source: "outlook",
              title: ev.subject ?? "(No title)",
              description: ev.bodyPreview ?? null,
              location: ev.location?.displayName ?? null,
              start_at: startAt,
              end_at: endAt,
              all_day: ev.isAllDay ?? false,
              google_updated: ev.lastModifiedDateTime ?? null,
              synced_at: new Date().toISOString(),
              sync_status: "synced",
            },
            {
              onConflict: "user_id,outlook_event_id",
              ignoreDuplicates: false,
            }
          );
        }
        syncedCount++;
      } catch (err) {
        console.error(
          `[outlook-calendar-sync] Error syncing event ${ev.id}:`,
          err
        );
        errorCount++;
      }
    }

    // Push Agent Runway events to Outlook (if not yet pushed)
    const { data: pendingEvents } = await admin
      .from("calendar_events")
      .select("*")
      .eq("user_id", userId)
      .eq("source", "agent_runway")
      .eq("sync_status", "pending")
      .is("outlook_event_id", null)
      .is("google_event_id", null); // Only push to Outlook if not already pushed to Google

    if (pendingEvents) {
      for (const arEvent of pendingEvents) {
        try {
          const tz = "America/Toronto"; // Default timezone for Canadian agents
          const created = await createOutlookEvent(tokenResult.accessToken, {
            subject: arEvent.title,
            body: arEvent.description
              ? { contentType: "Text", content: arEvent.description }
              : undefined,
            location: arEvent.location
              ? { displayName: arEvent.location }
              : undefined,
            start: arEvent.all_day
              ? {
                  dateTime: `${arEvent.start_at.slice(0, 10)}T00:00:00`,
                  timeZone: "UTC",
                }
              : {
                  dateTime: arEvent.start_at.replace("Z", ""),
                  timeZone: tz,
                },
            end: arEvent.all_day
              ? {
                  dateTime: `${arEvent.end_at.slice(0, 10)}T00:00:00`,
                  timeZone: "UTC",
                }
              : {
                  dateTime: arEvent.end_at.replace("Z", ""),
                  timeZone: tz,
                },
            isAllDay: arEvent.all_day ?? false,
          });

          await admin
            .from("calendar_events")
            .update({
              outlook_event_id: created.id,
              synced_at: new Date().toISOString(),
              sync_status: "synced",
            })
            .eq("id", arEvent.id);

          syncedCount++;
        } catch (err) {
          console.error(
            `[outlook-calendar-sync] Failed to push event ${arEvent.id}:`,
            err
          );
          errorCount++;
        }
      }
    }

    // Update sync state
    await admin
      .from("email_connections")
      .update({
        calendar_sync_token: deltaLink,
        last_calendar_sync: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", conn.id);
  } catch (err) {
    console.error(
      `[outlook-calendar-sync] Failed for user ${userId}:`,
      err
    );
    errorCount++;
  }

  return { synced: syncedCount, errors: errorCount };
}
