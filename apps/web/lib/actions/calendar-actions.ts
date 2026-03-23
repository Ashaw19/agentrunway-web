"use server";

/**
 * Calendar Actions
 *
 * Server actions for managing calendar_events and syncing with Google Calendar.
 * Events are pushed to Google when created locally; pulled during incremental
 * sync (triggered by the /api/cron/calendar-sync route).
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken, type GoogleConnection } from "@/lib/google/token-manager";
import { createEvent, updateEvent, deleteEvent, type CalendarEventInput } from "@/lib/google/calendar-client";
import { revalidatePath } from "next/cache";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CreateCalendarEventInput {
  title: string;
  description?: string;
  start_at: string;       // ISO 8601
  end_at: string;         // ISO 8601
  all_day?: boolean;
  location?: string;
  source_type?: "showing" | "closing" | "follow_up" | "meeting" | "personal";
  source_id?: string;     // FK to source table (pipeline_deals, contact_tasks, etc.)
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function getCalendarToken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<{ accessToken: string; connId: string } | null> {
  const { data: conn } = await supabase
    .from("google_connections")
    .select("id, access_token_enc, refresh_token_enc, expires_at, calendar_sync_enabled")
    .eq("user_id", userId)
    .maybeSingle();

  if (!conn?.calendar_sync_enabled) return null;

  try {
    const tokenResult = await getValidAccessToken(conn as unknown as GoogleConnection);

    // Persist refresh if needed
    if (tokenResult.refreshed && tokenResult.newAccessTokenEnc) {
      await supabase
        .from("google_connections")
        .update({
          access_token_enc: tokenResult.newAccessTokenEnc,
          expires_at:       tokenResult.newExpiresAt!.toISOString(),
          updated_at:       new Date().toISOString(),
        })
        .eq("id", conn.id);
    }

    return { accessToken: tokenResult.accessToken, connId: conn.id };
  } catch {
    return null;
  }
}

// ── Create ─────────────────────────────────────────────────────────────────────

export async function createCalendarEvent(input: CreateCalendarEventInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // 1. Insert local record
  const { data: localEvent, error: insertErr } = await supabase
    .from("calendar_events")
    .insert({
      user_id:     user.id,
      source:      "agent_runway",
      source_type: input.source_type ?? "meeting",
      source_id:   input.source_id ?? null,
      title:       input.title,
      description: input.description ?? null,
      start_at:    input.start_at,
      end_at:      input.end_at,
      all_day:     input.all_day ?? false,
      location:    input.location ?? null,
      sync_status: "pending",
    })
    .select("id")
    .single();

  if (insertErr || !localEvent) {
    return { error: insertErr?.message ?? "Failed to create event" };
  }

  // 2. Push to Google Calendar (fire-and-forget OK — sync_status tracks state)
  const tokenCtx = await getCalendarToken(supabase, user.id);
  if (tokenCtx) {
    try {
      const gcalEvent: CalendarEventInput = {
        summary:     input.title,
        description: input.description,
        location:    input.location,
        start:       input.all_day
          ? { date: input.start_at.split("T")[0] }
          : { dateTime: input.start_at, timeZone: "America/Toronto" },
        end:         input.all_day
          ? { date: input.end_at.split("T")[0] }
          : { dateTime: input.end_at, timeZone: "America/Toronto" },
        reminders:   { useDefault: true },
      };

      const created = await createEvent(tokenCtx.accessToken, gcalEvent);

      await supabase
        .from("calendar_events")
        .update({
          google_event_id: created.id,
          google_updated:  created.updated ?? new Date().toISOString(),
          synced_at:       new Date().toISOString(),
          sync_status:     "synced",
        })
        .eq("id", localEvent.id);
    } catch (err) {
      console.error("[calendar-actions] Google push failed:", err);
      // Leave sync_status as 'pending' — cron will retry
    }
  }

  revalidatePath("/dashboard");
  return { ok: true, id: localEvent.id };
}

// ── Update ─────────────────────────────────────────────────────────────────────

export async function updateCalendarEvent(
  id: string,
  input: Partial<CreateCalendarEventInput>
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // Fetch existing record (to get google_event_id)
  const { data: existing } = await supabase
    .from("calendar_events")
    .select("id, google_event_id, user_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!existing) return { error: "Event not found" };

  // Update local record
  await supabase
    .from("calendar_events")
    .update({
      ...(input.title       && { title:       input.title }),
      ...(input.description !== undefined && { description: input.description ?? null }),
      ...(input.start_at    && { start_at:    input.start_at }),
      ...(input.end_at      && { end_at:      input.end_at }),
      ...(input.location    !== undefined && { location:    input.location ?? null }),
      sync_status: existing.google_event_id ? "pending" : "synced",
      updated_at:  new Date().toISOString(),
    })
    .eq("id", id);

  // Push update to Google Calendar
  if (existing.google_event_id) {
    const tokenCtx = await getCalendarToken(supabase, user.id);
    if (tokenCtx) {
      try {
        const updates: Partial<CalendarEventInput> = {};
        if (input.title)       updates.summary     = input.title;
        if (input.description) updates.description = input.description;
        if (input.location)    updates.location    = input.location;
        if (input.start_at)    updates.start       = { dateTime: input.start_at, timeZone: "America/Toronto" };
        if (input.end_at)      updates.end         = { dateTime: input.end_at,   timeZone: "America/Toronto" };

        await updateEvent(tokenCtx.accessToken, existing.google_event_id, updates);
        await supabase
          .from("calendar_events")
          .update({ sync_status: "synced", synced_at: new Date().toISOString() })
          .eq("id", id);
      } catch (err) {
        console.error("[calendar-actions] Google update failed:", err);
      }
    }
  }

  return { ok: true };
}

// ── Delete ─────────────────────────────────────────────────────────────────────

export async function deleteCalendarEvent(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: existing } = await supabase
    .from("calendar_events")
    .select("id, google_event_id, user_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!existing) return { error: "Event not found" };

  // Delete from Google Calendar first (best-effort)
  if (existing.google_event_id) {
    const tokenCtx = await getCalendarToken(supabase, user.id);
    if (tokenCtx) {
      try {
        await deleteEvent(tokenCtx.accessToken, existing.google_event_id);
      } catch (err) {
        console.error("[calendar-actions] Google delete failed:", err);
      }
    }
  }

  // Mark as deleted locally (soft delete via sync_status)
  await supabase
    .from("calendar_events")
    .update({ sync_status: "deleted", updated_at: new Date().toISOString() })
    .eq("id", id);

  return { ok: true };
}

// ── Fetch ──────────────────────────────────────────────────────────────────────

export async function getCalendarEvents(options: {
  from?: string;
  to?: string;
} = {}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", events: [] };

  let query = supabase
    .from("calendar_events")
    .select("*")
    .eq("user_id", user.id)
    .neq("sync_status", "deleted")
    .order("start_at", { ascending: true });

  if (options.from) query = query.gte("start_at", options.from);
  if (options.to)   query = query.lte("start_at", options.to);

  const { data, error } = await query;
  if (error) return { error: error.message, events: [] };

  return { events: data ?? [] };
}

// ── Server-side sync helper (called by cron route) ────────────────────────────

/**
 * Run incremental calendar sync for one user.
 * Used by the cron job at /api/cron/calendar-sync.
 */
export async function syncUserCalendar(userId: string): Promise<{
  synced: number;
  errors: number;
}> {
  const admin = createAdminClient();
  let syncedCount  = 0;
  let errorCount   = 0;

  // Get Google connection with sync token
  const { data: conn } = await admin
    .from("google_connections")
    .select("id, access_token_enc, refresh_token_enc, expires_at, calendar_sync_enabled, calendar_sync_token")
    .eq("user_id", userId)
    .maybeSingle();

  if (!conn?.calendar_sync_enabled) return { synced: 0, errors: 0 };

  try {
    // Get a valid access token
    const tokenResult = await getValidAccessToken(conn as unknown as GoogleConnection);
    if (tokenResult.refreshed && tokenResult.newAccessTokenEnc) {
      await admin
        .from("google_connections")
        .update({
          access_token_enc: tokenResult.newAccessTokenEnc,
          expires_at:       tokenResult.newExpiresAt!.toISOString(),
          updated_at:       new Date().toISOString(),
        })
        .eq("id", conn.id);
    }

    const { listAllEvents } = await import("@/lib/google/calendar-client");

    // Incremental sync if we have a token; full sync for first run
    let nextSyncToken: string | null = null;
    const { events, nextSyncToken: newToken } = await listAllEvents(
      tokenResult.accessToken,
      conn.calendar_sync_token
        ? { syncToken: conn.calendar_sync_token }
        : {
            timeMin: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            timeMax: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          }
    );
    nextSyncToken = newToken;

    // Upsert events that originated from Google (source = 'google')
    for (const ev of events) {
      try {
        if (ev.status === "cancelled") {
          await admin
            .from("calendar_events")
            .update({ sync_status: "deleted", updated_at: new Date().toISOString() })
            .eq("user_id", userId)
            .eq("google_event_id", ev.id);
        } else {
          const startAt = ev.start.dateTime ?? (ev.start.date ? `${ev.start.date}T00:00:00Z` : null);
          const endAt   = ev.end.dateTime   ?? (ev.end.date   ? `${ev.end.date}T00:00:00Z`   : null);
          if (!startAt || !endAt) continue;

          await admin
            .from("calendar_events")
            .upsert(
              {
                user_id:         userId,
                google_event_id: ev.id,
                source:          "google",
                source_type:     "personal",
                title:           ev.summary ?? "(No title)",
                description:     null,
                start_at:        startAt,
                end_at:          endAt,
                all_day:         !!ev.start.date,
                location:        ev.location ?? null,
                google_updated:  ev.updated ?? new Date().toISOString(),
                synced_at:       new Date().toISOString(),
                sync_status:     "synced",
              },
              { onConflict: "user_id,google_event_id" }
            );
          syncedCount++;
        }
      } catch (evErr) {
        console.error(`[calendar-sync] Failed to upsert event ${ev.id}:`, evErr);
        errorCount++;
      }
    }

    // Save the new sync token and update last_calendar_sync
    if (nextSyncToken) {
      await admin
        .from("google_connections")
        .update({
          calendar_sync_token: nextSyncToken,
          last_calendar_sync:  new Date().toISOString(),
        })
        .eq("id", conn.id);
    }
  } catch (err: unknown) {
    // 410 Gone = sync token expired → clear it so next run does full sync
    if ((err as { code?: number }).code === 410) {
      await admin
        .from("google_connections")
        .update({ calendar_sync_token: null })
        .eq("id", conn.id);
    } else {
      console.error(`[calendar-sync] User ${userId} sync failed:`, err);
      errorCount++;
    }
  }

  return { synced: syncedCount, errors: errorCount };
}
