/**
 * Microsoft Outlook Calendar API client — list, create, update, and delete events.
 *
 * Uses the Microsoft Graph API v1.0 with the authenticated user's access token.
 * Mirrors the Google Calendar client pattern for consistency.
 */

const GRAPH_EVENTS_BASE = "https://graph.microsoft.com/v1.0/me/events";
const _GRAPH_CALENDAR_VIEW = "https://graph.microsoft.com/v1.0/me/calendarView";
const GRAPH_CALENDAR_VIEW_DELTA = "https://graph.microsoft.com/v1.0/me/calendarView/delta";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface OutlookDateTime {
  dateTime: string; // ISO 8601 without timezone offset (e.g. "2026-04-15T10:00:00")
  timeZone: string; // IANA timezone (e.g. "America/Toronto")
}

export interface OutlookCalendarEvent {
  id: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType: string; content: string };
  location?: { displayName?: string };
  start: OutlookDateTime;
  end: OutlookDateTime;
  isAllDay?: boolean;
  isCancelled?: boolean;
  lastModifiedDateTime?: string; // ISO 8601
  webLink?: string;
  /** Present when event was deleted (returned by delta queries) */
  "@removed"?: { reason: string };
}

export interface OutlookListResponse {
  value: OutlookCalendarEvent[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
}

export interface OutlookEventInput {
  subject: string;
  body?: { contentType: "HTML" | "Text"; content: string };
  location?: { displayName: string };
  start: OutlookDateTime;
  end: OutlookDateTime;
  isAllDay?: boolean;
  reminderMinutesBeforeStart?: number;
  isReminderOn?: boolean;
}

// ── List / Sync ────────────────────────────────────────────────────────────────

/**
 * Fetch events using Microsoft Graph delta query for incremental sync.
 *
 * - Without deltaLink: performs initial sync using calendarView (date range).
 * - With deltaLink: performs incremental sync (only changes since last sync).
 *
 * Returns events and the deltaLink for future incremental syncs.
 */
export async function listEvents(
  accessToken: string,
  options: {
    startDateTime?: string; // ISO 8601
    endDateTime?: string;   // ISO 8601
    deltaLink?: string;     // from previous sync
    nextLink?: string;      // pagination
  } = {}
): Promise<OutlookListResponse> {
  let url: string;

  if (options.nextLink) {
    url = options.nextLink;
  } else if (options.deltaLink) {
    url = options.deltaLink;
  } else {
    // Initial sync — use calendarView/delta to get both events AND a deltaLink for future incremental syncs
    const u = new URL(GRAPH_CALENDAR_VIEW_DELTA);
    if (options.startDateTime) u.searchParams.set("startDateTime", options.startDateTime);
    if (options.endDateTime) u.searchParams.set("endDateTime", options.endDateTime);
    u.searchParams.set("$top", "250");
    u.searchParams.set("$select", "id,subject,bodyPreview,location,start,end,isAllDay,isCancelled,lastModifiedDateTime,webLink");
    url = u.toString();
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errText = await res.text();

    // Delta token expired — Microsoft Graph returns 410, or 400/404 with
    // "SyncStateNotFound" / "resyncRequired" in the error body
    if (
      res.status === 410 ||
      ((res.status === 400 || res.status === 404) &&
        (errText.includes("SyncStateNotFound") || errText.includes("resyncRequired")))
    ) {
      const err = new Error("Delta token expired — full resync required");
      (err as Error & { code: number }).code = 410;
      throw err;
    }

    throw new Error(`Outlook calendar list failed: ${res.status} — ${errText}`);
  }

  return (await res.json()) as OutlookListResponse;
}

/**
 * Fetches ALL events (handles pagination) and returns the final deltaLink.
 */
export async function listAllEvents(
  accessToken: string,
  options: {
    startDateTime?: string;
    endDateTime?: string;
    deltaLink?: string;
  } = {}
): Promise<{ events: OutlookCalendarEvent[]; deltaLink: string | null }> {
  const allEvents: OutlookCalendarEvent[] = [];
  let nextLink: string | undefined;
  let deltaLink: string | null = null;

  // First request
  let response = await listEvents(accessToken, options);
  allEvents.push(...(response.value ?? []));
  nextLink = response["@odata.nextLink"];
  if (response["@odata.deltaLink"]) {
    deltaLink = response["@odata.deltaLink"];
  }

  // Paginate
  while (nextLink) {
    response = await listEvents(accessToken, { nextLink });
    allEvents.push(...(response.value ?? []));
    nextLink = response["@odata.nextLink"];
    if (response["@odata.deltaLink"]) {
      deltaLink = response["@odata.deltaLink"];
    }
  }

  return { events: allEvents, deltaLink };
}

// ── Create ─────────────────────────────────────────────────────────────────────

/**
 * Create a new event on the user's Outlook calendar.
 * Returns the created event (including its Outlook-assigned ID).
 */
export async function createEvent(
  accessToken: string,
  event: OutlookEventInput
): Promise<OutlookCalendarEvent> {
  const res = await fetch(GRAPH_EVENTS_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Outlook calendar create failed: ${res.status} — ${errText}`);
  }

  return (await res.json()) as OutlookCalendarEvent;
}

// ── Update ─────────────────────────────────────────────────────────────────────

/**
 * Update an existing event by its Outlook event ID.
 * Uses PATCH for partial updates.
 */
export async function updateEvent(
  accessToken: string,
  eventId: string,
  updates: Partial<OutlookEventInput>
): Promise<OutlookCalendarEvent> {
  const res = await fetch(`${GRAPH_EVENTS_BASE}/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updates),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Outlook calendar update failed: ${res.status} — ${errText}`);
  }

  return (await res.json()) as OutlookCalendarEvent;
}

// ── Delete ─────────────────────────────────────────────────────────────────────

/**
 * Delete an event by its Outlook event ID.
 */
export async function deleteEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  const res = await fetch(`${GRAPH_EVENTS_BASE}/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  // 204 = success, 404 = already deleted (both OK)
  if (!res.ok && res.status !== 404) {
    const errText = await res.text();
    throw new Error(`Outlook calendar delete failed: ${res.status} — ${errText}`);
  }
}
