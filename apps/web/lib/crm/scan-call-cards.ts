/**
 * Flight Control Scan call cards (Andrew, 2026-10-07): Scan came back empty
 * although 2 of 8 active leads/clients hadn't heard from him in 30+ days and
 * 157 contacts had nothing Scan could key on.
 *
 *   lead_going_quiet  Boarding / In-Flight, 14+ days since last contact (the
 *                     dashboard briefing's stale threshold). Strong signal,
 *                     ranked above past clients. Dismiss lasts the week.
 *   sphere_check_in   Cruising, no deal ever (own or co-bought), 90+ days
 *                     since contact. Backfill only, max 2 per scan, below idle
 *                     past clients. Dismiss lasts the quarter.
 *
 * Both are call-first: Scan shows them, they are never drafted as emails
 * (detectAndDraftForUser never creates them). Active leads deserve a personal
 * touch; sphere contacts have no consent basis the app can see.
 *
 * Detection, scoring, dismiss keys and card copy live here so the route only
 * wires them in, and so they are testable without a database.
 */

export const QUIET_LEAD_DAYS     = 14;
export const QUIET_LEAD_STATUSES = new Set(["boarding", "in_flight"]);
export const SPHERE_DAYS         = 90;
export const SPHERE_MAX_PER_SCAN = 2;
export const SPHERE_SCORE        = 30; // idle past clients score 38 without memory
const QUIET_LEAD_BASE_SCORE      = 60; // ≥ 55 = strong signal in top-opportunity-selection

export const CALL_FIRST_TYPES = new Set(["lead_going_quiet", "sphere_check_in"]);

export type CallReason = "casl_lapsed" | "personal_check_in" | "sphere" | "opted_out";

const TIMEZONE = "America/Halifax";
const DAY_MS = 86_400_000;

export interface ScanClient {
  id:               string;
  status:           string | null;
  last_contact_at?: string | null;
  created_at?:      string | null;
}

export interface ScanCallCandidate {
  client_id:        string;
  opportunity_type: "lead_going_quiet" | "sphere_check_in";
  trigger_date:     string;
  context:          Record<string, unknown>;
}

// ── Dismiss keys ────────────────────────────────────────────────────────────

function atlanticYMD(now: Date): { y: number; m: number; d: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE, year: "numeric", month: "numeric", day: "numeric", weekday: "short",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return { y: Number(get("year")), m: Number(get("month")), d: Number(get("day")), weekday: weekdays.indexOf(get("weekday")) };
}

function isoDate(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toISOString().slice(0, 10);
}

/** Monday of the current week, Atlantic time. A lead dismissal lasts until next week. */
export function weekStartKey(now: Date = new Date()): string {
  const { y, m, d, weekday } = atlanticYMD(now);
  const back = (weekday + 6) % 7; // Mon → 0 … Sun → 6
  return isoDate(y, m, d - back);
}

/** First day of the current quarter, Atlantic time. A sphere dismissal lasts the quarter. */
export function quarterStartKey(now: Date = new Date()): string {
  const { y, m } = atlanticYMD(now);
  return isoDate(y, Math.floor((m - 1) / 3) * 3 + 1, 1);
}

function lastTouch(c: ScanClient): string | null {
  return c.last_contact_at ?? c.created_at ?? null;
}

function daysSince(iso: string, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(iso)) / DAY_MS);
}

// ── Detection ───────────────────────────────────────────────────────────────

export function quietLeadCandidates(
  clients:           readonly ScanClient[],
  recentlyContacted: ReadonlySet<string>,
  now:               Date = new Date(),
): ScanCallCandidate[] {
  const week = weekStartKey(now);
  const out: ScanCallCandidate[] = [];
  for (const c of clients) {
    if (!c.status || !QUIET_LEAD_STATUSES.has(c.status)) continue;
    if (recentlyContacted.has(c.id)) continue;
    const touch = lastTouch(c);
    if (!touch) continue;
    const days = daysSince(touch, now);
    if (days < QUIET_LEAD_DAYS) continue;
    out.push({
      client_id:        c.id,
      opportunity_type: "lead_going_quiet",
      trigger_date:     week,
      context:          { status: c.status, days_quiet: days, never_contacted: !c.last_contact_at },
    });
  }
  return out;
}

/** Longest since contact first; selection caps them at SPHERE_MAX_PER_SCAN. */
export function sphereCandidates(
  clients:           readonly ScanClient[],
  pastClientIds:     ReadonlySet<string>,
  recentlyContacted: ReadonlySet<string>,
  now:               Date = new Date(),
): ScanCallCandidate[] {
  const quarter = quarterStartKey(now);
  const out: (ScanCallCandidate & { days: number })[] = [];
  for (const c of clients) {
    if (c.status !== "cruising") continue;
    if (pastClientIds.has(c.id) || recentlyContacted.has(c.id)) continue;
    const touch = lastTouch(c);
    if (!touch) continue;
    const days = daysSince(touch, now);
    if (days < SPHERE_DAYS) continue;
    out.push({
      client_id:        c.id,
      opportunity_type: "sphere_check_in",
      trigger_date:     quarter,
      context:          { days_since_contact: days, never_contacted: !c.last_contact_at },
      days,
    });
  }
  return out
    .sort((a, b) => b.days - a.days)
    .map(({ days: _days, ...cand }) => cand);
}

// ── Scoring ─────────────────────────────────────────────────────────────────

/** Score for the call-first types, or null to let scoreCandidate handle the rest. */
export function scanCallCardScore(type: string, ctx: Record<string, unknown>): number | null {
  if (type === "sphere_check_in") return SPHERE_SCORE;
  if (type !== "lead_going_quiet") return null;
  let score = QUIET_LEAD_BASE_SCORE;
  if (ctx.status === "in_flight") score += 10; // a live deal going quiet
  if (Number(ctx.days_quiet) >= 30) score += 5;
  return score;
}

/** Why a card offers a call instead of an email draft. */
export function callReasonFor(type: string, channel: "email" | "call", optedOut = false): CallReason | null {
  if (optedOut) return "opted_out";
  if (type === "lead_going_quiet") return "personal_check_in";
  if (type === "sphere_check_in") return "sphere";
  return channel === "call" ? "casl_lapsed" : null;
}

// ── Card copy ───────────────────────────────────────────────────────────────

export interface CallCardCopy {
  label:          string;
  whyNow:         string;
  whyThisMatters: string;
  angle:          string;
  impact:         string;
  primaryReason:  string;
  risk:           string;
}

export function callCardCopy(type: string, ctx: Record<string, unknown>): CallCardCopy | null {
  if (type === "lead_going_quiet") {
    const days = Number(ctx.days_quiet) || 0;
    const inDeal = ctx.status === "in_flight";
    const never = ctx.never_contacted === true;
    return {
      label: never
        ? `${inDeal ? "Active deal" : "Active lead"} · added ${days} days ago, no contact logged`
        : `${inDeal ? "Active deal" : "Active lead"} · ${days} days since you last talked`,
      whyNow: never
        ? `No contact has been logged since they were added ${days} days ago.`
        : `${days} days without contact. Active clients usually hear from you every week or two.`,
      whyThisMatters: inDeal
        ? "They're mid-deal. Quiet stretches are when deals stall or questions go unanswered."
        : "They're actively looking. The agent who stays in touch is usually the one who gets the deal.",
      angle: inDeal
        ? "Quick status call: where things stand and what happens next."
        : "Check in on their search: anything new they've seen, any change in plans or budget.",
      impact: "An active client is your nearest income. Staying in touch protects the deal you're already working on.",
      primaryReason: "An active client going quiet is the most time-sensitive call on your list.",
      risk: "The longer the gap, the more likely they've started talking to another agent.",
    };
  }
  if (type === "sphere_check_in") {
    const days = Number(ctx.days_since_contact) || 0;
    const months = Math.floor(days / 30);
    const never = ctx.never_contacted === true;
    return {
      label: never ? "In your database · no contact logged yet" : `In your database · ${months} months since you last talked`,
      whyNow: "Nothing on the calendar for them, and it's been a while. A quick hello keeps you top of mind.",
      whyThisMatters: "Most repeat and referral business comes from people who already know you.",
      angle: "Friendly catch-up call. No pitch: ask how they're doing and whether anything has changed at home.",
      impact: "Keeping your database warm is what turns into referrals over time.",
      primaryReason: "Your list is clear, so this is a good time to reconnect with your database.",
      risk: "People you don't hear from for a year tend to forget who their agent is.",
    };
  }
  return null;
}
