/**
 * Google Calendar API client — list, create, update, and delete events.
 *
 * Uses the Calendar REST API v3 with the authenticated user's access token.
 * Follows the same pattern as gmail-client.ts.
 */

const CALENDAR_BASE =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CalendarEventTime {
  dateTime?: string; // ISO 8601 with timezone offset
  date?: string;     // YYYY-MM-DD for all-day events
  timeZone?: string;
}

export interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start: CalendarEventTime;
  end: CalendarEventTime;
  status?: string;    // "confirmed" | "tentative" | "cancelled"
  updated?: string;   // ISO 8601
  htmlLink?: string;
}

export interface CalendarListResponse {
  items: GoogleCalendarEvent[];
  nextSyncToken?: string;
  nextPageToken?: string;
}

export interface CalendarEventInput {
  summary: string;
  description?: string;
  location?: string;
  start: CalendarEventTime;
  end: CalendarEventTime;
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{ method: string; minutes: number }>;
  };
}

// ── List / Sync ────────────────────────────────────────────────────────────────

/**
 * List events from the user's primary calendar.
 *
 * - Without syncToken: performs an initial full sync (fetches events in range).
 * - With syncToken: performs incremental sync (only changes since last sync).
 *
 * Returns events and the nextSyncToken for future incremental syncs.
 */
export async function listEvents(
  accessToken: string,
  options: {
    timeMin?: string;  // ISO 8601 — lower bound for event start
    timeMax?: string;  // ISO 8601 — upper bound for event start
    syncToken?: string;
    pageToken?: string;
    maxResults?: number;
  } = {}
): Promise<CalendarListResponse> {
  const url = new URL(CALENDAR_BASE);

  if (options.syncToken) {
    // Incremental sync — syncToken overrides time filters
    url.searchParams.set("syncToken", options.syncToken);
  } else {
    // Initial sync — use time range
    if (options.timeMin) url.searchParams.set("timeMin", options.timeMin);
    if (options.timeMax) url.searchParams.set("timeMax", options.timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
  }

  if (options.pageToken) {
    url.searchParams.set("pageToken", options.pageToken);
  }

  url.searchParams.set(
    "maxResults",
    String(options.maxResults ?? 250)
  );

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errText = await res.text();

    // 410 Gone means the syncToken is invalid — caller should do a full resync
    if (res.status === 410) {
      const err = new Error("Sync token expired — full resync required");
      (err as Error & { code: number }).code = 410;
      throw err;
    }

    throw new Error(`Calendar list failed: ${res.status} — ${errText}`);
  }

  return (await res.json()) as CalendarListResponse;
}

/**
 * Fetches ALL events (handles pagination) and returns the final syncToken.
 */
export async function listAllEvents(
  accessToken: string,
  options: {
    timeMin?: string;
    timeMax?: string;
    syncToken?: string;
  } = {}
): Promise<{ events: GoogleCalendarEvent[]; nextSyncToken: string | null }> {
  const allEvents: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;

  do {
    const response = await listEvents(accessToken, {
      ...options,
      pageToken,
    });

    allEvents.push(...(response.items ?? []));
    pageToken = response.nextPageToken;
    if (response.nextSyncToken) {
      nextSyncToken = response.nextSyncToken;
    }
  } while (pageToken);

  return { events: allEvents, nextSyncToken };
}

// ── Create ─────────────────────────────────────────────────────────────────────

/**
 * Create a new event on the user's primary calendar.
 * Returns the created event (including its Google-assigned ID).
 */
export async function createEvent(
  accessToken: string,
  event: CalendarEventInput
): Promise<GoogleCalendarEvent> {
  const res = await fetch(CALENDAR_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Calendar create failed: ${res.status} — ${errText}`);
  }

  return (await res.json()) as GoogleCalendarEvent;
}

// ── Update ─────────────────────────────────────────────────────────────────────

/**
 * Update an existing event by its Google event ID.
 * Uses PATCH for partial updates.
 */
export async function updateEvent(
  accessToken: string,
  eventId: string,
  updates: Partial<CalendarEventInput>
): Promise<GoogleCalendarEvent> {
  const res = await fetch(`${CALENDAR_BASE}/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updates),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Calendar update failed: ${res.status} — ${errText}`);
  }

  return (await res.json()) as GoogleCalendarEvent;
}

// ── Delete ─────────────────────────────────────────────────────────────────────

/**
 * Delete an event by its Google event ID.
 */
export async function deleteEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  const res = await fetch(`${CALENDAR_BASE}/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  // 204 No Content = success, 410 Gone = already deleted (both OK)
  if (!res.ok && res.status !== 410) {
    const errText = await res.text();
    throw new Error(`Calendar delete failed: ${res.status} — ${errText}`);
  }
}
