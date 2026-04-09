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

// ── Outlook datetime → UTC ISO helper ────────────────────────────────────────

function outlookDateToISO(dateTime: string, timeZone: string): string {
  if (timeZone === "UTC" || timeZone === "Etc/UTC") {
    return dateTime.replace(/\.0+$/, "").replace(/Z$/, "") + "Z";
  }
  try {
    const clean = dateTime.replace(/\.0+$/, "");
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
      timeZoneName: "shortOffset",
    });
    const refDate = new Date(clean + "Z");
    const parts = formatter.formatToParts(refDate);
    const offsetPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    const offsetMatch = offsetPart.match(/GMT([+-]?\d{1,2})(?::(\d{2}))?/);
    if (offsetMatch) {
      const hours = parseInt(offsetMatch[1], 10);
      const minutes = parseInt(offsetMatch[2] ?? "0", 10);
      // Correctly handle negative offsets with minutes (e.g., GMT-3:30 for Newfoundland)
      const sign = hours < 0 ? -1 : 1;
      const totalOffsetMs = (Math.abs(hours) * 60 + minutes) * sign * 60 * 1000;
      const localAsUtc = new Date(clean + "Z");
      const utc = new Date(localAsUtc.getTime() - totalOffsetMs);
      return utc.toISOString();
    }
  } catch { /* fallback */ }
  return dateTime.replace(/\.0+$/, "") + "Z";
}

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
          (ev as unknown as Record<string, unknown>)["@removed"] ||
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
            : outlookDateToISO(ev.start.dateTime, ev.start.timeZone);
          const endAt = ev.isAllDay
            ? `${ev.end.dateTime.slice(0, 10)}T00:00:00Z`
            : outlookDateToISO(ev.end.dateTime, ev.end.timeZone);

          await admin.from("calendar_events").upsert(
            {
              user_id: userId,
              outlook_event_id: ev.id,
              source: "outlook",
              source_type: "personal",
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
    // Push Agent Runway events that don't yet have an Outlook event ID
    // (regardless of whether they've been pushed to Google — dual-provider users need both)
    const { data: pendingEvents } = await admin
      .from("calendar_events")
      .select("*")
      .eq("user_id", userId)
      .eq("source", "agent_runway")
      .is("outlook_event_id", null)
      .in("sync_status", ["pending", "synced"]);

    if (pendingEvents) {
      for (const arEvent of pendingEvents) {
        try {
          // start_at/end_at are stored as UTC ISO strings — tell Outlook they're UTC
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
                  timeZone: "UTC",
                },
            end: arEvent.all_day
              ? {
                  dateTime: `${arEvent.end_at.slice(0, 10)}T00:00:00`,
                  timeZone: "UTC",
                }
              : {
                  dateTime: arEvent.end_at.replace("Z", ""),
                  timeZone: "UTC",
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

    // Update sync state — only advance delta link if no errors occurred.
    // If events failed, keeping the old token ensures they're retried next sync.
    if (errorCount === 0) {
      await admin
        .from("email_connections")
        .update({
          calendar_sync_token: deltaLink,
          last_calendar_sync: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", conn.id);
    } else {
      // Still update timestamps for monitoring, but keep old delta link
      await admin
        .from("email_connections")
        .update({
          last_calendar_sync: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", conn.id);
      console.warn(`[outlook-calendar-sync] Skipped delta link advancement: ${errorCount} errors for user ${userId}`);
    }
  } catch (err) {
    console.error(
      `[outlook-calendar-sync] Failed for user ${userId}:`,
      err
    );
    errorCount++;
  }

  return { synced: syncedCount, errors: errorCount };
}
