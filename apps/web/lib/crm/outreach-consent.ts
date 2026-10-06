/**
 * CASL gate for Flight Control email drafts.
 *
 * Under CASL, buying (or selling) a home through the agent creates implied
 * consent to receive commercial email for two years. After that, the purchase
 * alone no longer covers an email — a closing-anniversary note with a home
 * value offer, an idle-client check-in, a mortgage-renewal nudge.
 *
 * Flight Control still surfaces those past clients (they are the best people
 * to reconnect with), but as a call, not an email draft. Both the scan read
 * path (getTopOpportunities) and the draft write path (detectAndDraftForUser)
 * apply this — one shared helper keeps them in lock-step, the same reason
 * contactable-records.ts exists.
 *
 * Scope: only clients with a closed deal on record are gated. For everyone
 * else the app has no view of their consent basis (an inquiry, an open-house
 * sign-up, express consent), so their behaviour is unchanged.
 */

/** CASL s.10(10)(a): implied consent from a purchase lasts two years. */
export const CASL_IMPLIED_CONSENT_MONTHS = 24;

export type ContactChannel = "email" | "call";

export interface DealForConsent {
  client_id?:        string | null;
  close_date?:       string | null;
  condition_status?: string | null;
}

/** Each client's most recent closed deal. Collapsed deals are not purchases. */
export function lastClosedDealByClient(
  records: readonly DealForConsent[],
): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of records) {
    if (!r.client_id || !r.close_date) continue;
    if (r.condition_status === "collapsed") continue;
    const prev = out.get(r.client_id);
    if (!prev || r.close_date > prev) out.set(r.client_id, r.close_date);
  }
  return out;
}

function localISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * How Flight Control should reach this client for an opportunity.
 *
 * Measured on the day the message would go out: the trigger date, or today
 * if the trigger has already passed. "call" once that day is on or after the
 * two-year mark from the client's most recent closed deal.
 */
export function outreachChannel(
  lastClose:   string | undefined,
  triggerDate: string,
  today:       Date = new Date(),
): ContactChannel {
  if (!lastClose) return "email";

  // Anchor at local noon — a bare date parsed as UTC midnight lands on the
  // previous day west of Greenwich (the #268 bug class).
  const lapse = new Date(`${lastClose.slice(0, 10)}T12:00:00`);
  if (isNaN(lapse.getTime())) return "call"; // a past client we can't date: fail closed
  lapse.setMonth(lapse.getMonth() + CASL_IMPLIED_CONSENT_MONTHS);

  const todayIso = localISODate(today);
  const trigger  = triggerDate.slice(0, 10);
  const sendIso  = trigger > todayIso ? trigger : todayIso;
  return sendIso >= localISODate(lapse) ? "call" : "email";
}
