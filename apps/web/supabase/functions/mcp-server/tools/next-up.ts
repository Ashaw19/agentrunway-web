import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { McpTool } from "./index.ts";
import { appUrl } from "../lib/app-url.ts";
import { APP_TIME_ZONE, addDaysISO, atlanticISODate } from "../../_shared/core/lib/local-date.ts";
import { writeClientToHangar, writeSuggestionHold, writeSuggestionSkip } from "../../_shared/core/lib/record-writers.ts";
import {
  LATER_TONIGHT_HOUR,
  LATER_TOMORROW_HOUR,
  laterChoices,
  laterUntil,
  stopUntil,
  type LaterChoice,
} from "../../_shared/core/lib/suggestion-dismissals.ts";
import { DEAL_DEADLINE_DAYS, HANDFUL_TARGET, NEW_LEAD_HOURS } from "../../_shared/core/lib/next-up/rules.ts";
import type { HandfulItem, NextUpPayload } from "../../_shared/core/lib/next-up/types.ts";

/**
 * Today's Next up over MCP: the mirror of Flight Crew's getNextUp,
 * skipSuggestedClient, snoozeSuggestedClient and stopSuggestingClient
 * (apps/web/lib/ai/tools.ts).
 *
 *   get_next_up              (read-only) the web app's /api/next-up with
 *                            persist and drafting off, called with the
 *                            caller's own session token (as capture_note
 *                            calls /api/voice-extract): the same payload, and
 *                            so the same handful, the iPhone app, Flight
 *                            Control Scan and Flight Crew show. It pins
 *                            nothing and drafts nothing.
 *   skip_suggested_client    (write) a skip on the occurrence that payload
 *                            shows for the client; refused for a client who
 *                            isn't in today's handful.
 *   snooze_suggested_client  (write) Later: in an hour, tonight or tomorrow.
 *   stop_suggesting_client   (write) Stop for 3 or 6 months, or the Hangar.
 *
 * Writes go through core record-writers (the Deno copy): the writers the
 * web, the phone and Flight Crew use, on the caller's own client (RLS).
 * MCP writes aren't on the AI ledger, as with every MCP write tool. The
 * client's tool approval prompt is the approval step.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LATER_CHOICES: readonly LaterChoice[] = ["in_an_hour", "tonight", "tomorrow"];
const STOP_CHOICES = ["3_months", "6_months", "hangar"] as const;
type StopDuration = (typeof STOP_CHOICES)[number];

const json = (body: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(body, null, 2) }] });
const done = (message: string) => ({ content: [{ type: "text" as const, text: message }] });
const fail = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * "7:00 p.m. today", "8:00 a.m. tomorrow" or "9:00 a.m. on Oct. 21": an
 * instant on the Atlantic clock. Never used for a calendar-day date.
 */
function atlanticTimeInWords(at: Date, now: Date): string {
  if (Number.isNaN(at.getTime())) return "later";
  const time = at.toLocaleTimeString("en-CA", { timeZone: APP_TIME_ZONE, hour: "numeric", minute: "2-digit" });
  const day = atlanticISODate(at);
  const today = atlanticISODate(now);
  if (day === today) return `${time} today`;
  if (day === addDaysISO(today, 1)) return `${time} tomorrow`;
  return `${time} on ${at.toLocaleDateString("en-CA", { timeZone: APP_TIME_ZONE, month: "short", day: "numeric" })}`;
}

/**
 * How the phone's card offers to reach the client: its text status (CASL
 * checked when the payload was built) and whether there is a number to call.
 */
function channel(h: HandfulItem): string {
  const t = h.text;
  if (t.status === "ready") return "text: drafted and waiting in the iPhone app (call works too)";
  if (t.status === "draftable") return "text or call";
  if (t.status === "call_only") return h.phone ? `call only: ${t.reason}` : `no phone number on file, and no text: ${t.reason}`;
  return h.phone ? "call only: the number on file can't take a text" : "no phone number on file";
}

/** The payload in the shape Flight Crew's getNextUp relays. */
function summary(p: NextUpPayload, now: Date) {
  return {
    day:        p.day,
    done_today: Math.min(p.done_today, p.target),
    target:     p.target,
    handful:    p.handful.map((h) => ({
      client:  { id: h.client_id, name: h.client_name },
      reason:  h.label,
      why_now: h.why_now,
      channel: channel(h),
    })),
    on_later:   p.snoozed.map((s) => ({
      client: { id: s.client_id, name: s.client_name },
      until:  atlanticTimeInWords(new Date(s.until), now),
    })),
    urgent:     p.urgent,
  };
}

/** Today's payload from the web app, as the caller. */
async function readNextUp(accessToken: string): Promise<{ ok: true; payload: NextUpPayload } | { ok: false; message: string }> {
  const res = await fetch(`${appUrl()}/api/next-up?persist=0&draft=0`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) return { ok: false, message: `Couldn't read today's Next up: ${String(body.error ?? res.status)}` };
  if (!Array.isArray(body.handful) || !Array.isArray(body.snoozed) || !isObj(body.urgent)) {
    return { ok: false, message: "Couldn't read today's Next up: the reply wasn't a Next up list." };
  }
  return { ok: true, payload: body as unknown as NextUpPayload };
}

/** The caller's client for a Skip, Later or Stop, or why not. */
async function readClient(
  supabase: SupabaseClient,
  userId: string,
  clientId: string,
): Promise<{ ok: true; name: string; archived: boolean } | { ok: false; message: string }> {
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, archived_at")
    .eq("id", clientId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { ok: false, message: "Couldn't read the client right now. Try again in a moment." };
  if (!data) return { ok: false, message: "That client isn't in your CRM." };
  const row = data as { name?: string | null; archived_at?: string | null };
  return { ok: true, name: row.name?.trim() || "This client", archived: !!row.archived_at };
}

const hangarRefusal = (name: string) => `${name} is in the Hangar, so they aren't suggested.`;
const clientIdSchema = { type: "string", description: "The client's id, from get_next_up or get_clients." };

export function getNextUpTools(supabase: SupabaseClient, userId: string, accessToken: string): McpTool[] {
  return [
    // ── get_next_up ──────────────────────────────────────────────────────
    {
      name: "get_next_up",
      description:
        `Today's Next up, as the Agent Runway iPhone app's dashboard shows it: today's handful (up to ${HANDFUL_TARGET} clients Flight Control picks, the same people Flight Control Scan and the in-app Flight Crew show), each with Flight Control's reason, why now, and how the phone offers to reach them (text, call only with the CASL reason, or no number); the clients on Later and when they come back (Atlantic time); how many of today's ${HANDFUL_TARGET} are done; and the counts that always go on top (new leads under ${NEW_LEAD_HOURS} hours old with no contact yet, overdue Checklist items, deal deadlines within ${DEAL_DEADLINE_DAYS} days). Relay each reason as given. Read only: nothing is drafted, pinned or saved. A client stays on the handful until the agent contacts, skips, stops or archives them; a client on Later keeps their place.`,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: {
        title: "Today's Next Up",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async () => {
        const read = await readNextUp(accessToken);
        if (!read.ok) return fail(read.message);
        return json(summary(read.payload, new Date()));
      },
    },

    // ── skip_suggested_client ────────────────────────────────────────────
    {
      name: "skip_suggested_client",
      description:
        "Skips one of today's suggested clients this time, when the agent asks to. It covers this one reason only, the occurrence today's handful shows (this birthday, this check-in); the client comes back at their next reason to reach out. Only for a client in today's handful (get_next_up). Saved once and honoured on the iPhone app, Flight Control Scan, the nightly drafts and Flight Crew.",
      inputSchema: {
        type: "object",
        properties: { client_id: clientIdSchema },
        required: ["client_id"],
        additionalProperties: false,
      },
      annotations: {
        title: "Skip a Suggested Client",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (args) => {
        const clientId = isObj(args) && typeof args.client_id === "string" ? args.client_id : "";
        if (!UUID.test(clientId)) return fail("client_id is not an id from get_next_up.");
        const found = await readClient(supabase, userId, clientId);
        if (!found.ok) return fail(found.message);
        const read = await readNextUp(accessToken);
        if (!read.ok) return fail(read.message);
        const pick = read.payload.handful.find((h) => h.client_id === clientId);
        if (!pick) return fail(`${found.name} isn't in today's suggestions.`);
        const res = await writeSuggestionSkip(supabase, userId, {
          client_id:        clientId,
          opportunity_type: pick.opportunity_type,
          trigger_date:     pick.trigger_date,
        });
        if (!res.ok) return fail(`Not saved: ${res.message}`);
        return done(`Skipped ${found.name} this time. They come back at their next reason to reach out.`);
      },
    },

    // ── snooze_suggested_client ──────────────────────────────────────────
    {
      name: "snooze_suggested_client",
      description:
        `Puts a client on Later, when the agent asks to: no suggestions for them on the iPhone app, Flight Control Scan or the nightly drafts until then. until: in_an_hour, tonight (${LATER_TONIGHT_HOUR}:00 Atlantic; not offered from ${LATER_TONIGHT_HOUR}:00 on) or tomorrow (${String(LATER_TOMORROW_HOUR).padStart(2, "0")}:00 Atlantic). A client on Later keeps their place in today's handful. If their suggestions are already stopped, nothing changes and the reply says until when. Any client in the agent's CRM who isn't in the Hangar.`,
      inputSchema: {
        type: "object",
        properties: {
          client_id: clientIdSchema,
          until: { type: "string", enum: [...LATER_CHOICES], description: "in_an_hour, tonight or tomorrow." },
        },
        required: ["client_id", "until"],
        additionalProperties: false,
      },
      annotations: {
        title: "Put a Suggested Client on Later",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      handler: async (args) => {
        const a = isObj(args) ? args : {};
        const clientId = typeof a.client_id === "string" ? a.client_id : "";
        if (!UUID.test(clientId)) return fail("client_id is not an id from get_next_up or get_clients.");
        const until = a.until;
        if (typeof until !== "string" || !(LATER_CHOICES as readonly string[]).includes(until)) {
          return fail("until is in_an_hour, tonight or tomorrow.");
        }
        const now = new Date();
        if (!laterChoices(now).includes(until as LaterChoice)) {
          return fail(`Tonight isn't ahead any more: it's past ${LATER_TONIGHT_HOUR}:00 Atlantic. Offer in_an_hour or tomorrow instead.`);
        }
        const found = await readClient(supabase, userId, clientId);
        if (!found.ok) return fail(found.message);
        if (found.archived) return fail(hangarRefusal(found.name));
        const at = laterUntil(until as LaterChoice, now);
        const res = await writeSuggestionHold(
          supabase, userId,
          { clientId, clientName: found.name, kind: "later", until: at },
          atlanticISODate(now), now,
        );
        // A running Stop: nothing was written. Say so; never claim a Later.
        if (res.stoppedUntil) return done(`Nothing changed: ${res.message}`);
        if (!res.ok) return fail(`Not saved: ${res.message}`);
        return done(`${found.name} is on Later until ${atlanticTimeInWords(at, now)}: no suggestions for them until then.`);
      },
    },

    // ── stop_suggesting_client ───────────────────────────────────────────
    {
      name: "stop_suggesting_client",
      description:
        "Stops suggesting a client, when the agent asks to. duration 3_months or 6_months: no suggestions for them on the iPhone app, Flight Control Scan or the nightly drafts until then, except a consent-lapsing notice (the CASL ask has a deadline, so Stop never hides it). duration hangar: moves them to the Hangar (archived), which hides them everywhere; they can be restored from the Hangar in the app's CRM. Any client in the agent's CRM who isn't already in the Hangar.",
      inputSchema: {
        type: "object",
        properties: {
          client_id: clientIdSchema,
          duration: { type: "string", enum: [...STOP_CHOICES], description: "3_months, 6_months or hangar." },
        },
        required: ["client_id", "duration"],
        additionalProperties: false,
      },
      annotations: {
        title: "Stop Suggesting a Client",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      handler: async (args) => {
        const a = isObj(args) ? args : {};
        const clientId = typeof a.client_id === "string" ? a.client_id : "";
        if (!UUID.test(clientId)) return fail("client_id is not an id from get_next_up or get_clients.");
        const duration = a.duration;
        if (typeof duration !== "string" || !(STOP_CHOICES as readonly string[]).includes(duration)) {
          return fail("duration is 3_months, 6_months or hangar.");
        }
        const now = new Date();
        const found = await readClient(supabase, userId, clientId);
        if (!found.ok) return fail(found.message);
        if (found.archived) return fail(hangarRefusal(found.name));
        if ((duration as StopDuration) === "hangar") {
          const res = await writeClientToHangar(supabase, userId, { clientId, clientName: found.name });
          if (!res.ok) return fail(`Not saved: ${res.message}`);
          return done(`${res.message} They aren't suggested anywhere while they're there.`);
        }
        const res = await writeSuggestionHold(
          supabase, userId,
          { clientId, clientName: found.name, kind: "stop", until: stopUntil(duration as "3_months" | "6_months", now) },
          atlanticISODate(now), now,
        );
        if (!res.ok) return fail(`Not saved: ${res.message}`);
        return done(`${res.message} Stop doesn't hide a consent-lapsing notice.`);
      },
    },
  ];
}
