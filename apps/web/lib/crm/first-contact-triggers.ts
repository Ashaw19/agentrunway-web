/**
 * New-client welcome and contact anniversary: the two Flight Control
 * triggers dated from clients.first_contacted_at.
 *
 * first_contacted_at is a timestamptz (the first non-note activity, set by
 * set_client_first_contacted). The day it happened is its Atlantic day.
 * Both detectors used to cut it with `.slice(0, 10)`, the UTC date, so a
 * first contact logged from 9 pm Atlantic (8 pm in winter) got its welcome
 * and its anniversary one day late, and one on Dec 31 evening was never
 * found in December: its start year read as the next one.
 *
 * Moving the day moves trigger_date, and outreach_queue is unique on
 * (user, client, type, trigger_date): a welcome already drafted or sent
 * under Oct 17 would be drafted again under Oct 16, and a card dismissed
 * under the old date would come back. So an occurrence already on file under
 * its UTC date, as a queue row in any status or as a dismissal, keeps that
 * date. Everything else is dated from the Atlantic day.
 *
 * Only rows written before this shipped (2026-10-13) can sit under a UTC
 * date, and a trigger leaves its window 21 days after the first contact
 * (welcome) or the day after the anniversary. No row can match once
 * November 2026 is a week old; `recorded` and the lookup behind it can be
 * deleted then.
 *
 * Shared by getTopOpportunities (Scan) and detectAndDraftForUser (nightly
 * drafts, and the Draft button, which pins Scan's card by trigger_date) so
 * the two can't compute different dates.
 */

import { addDaysISO, atlanticISODate, daysBetweenISO } from "@agent-runway/core/lib/local-date";
import { opportunityKey, type OpportunityKeyParts } from "./dismissed-opportunities";

export const FIRST_CONTACT_TYPES = ["new_client_welcome", "contact_anniversary"] as const;
export type FirstContactType = (typeof FIRST_CONTACT_TYPES)[number];

const WELCOME_AFTER_DAYS    = 7;
const WELCOME_LOOKBACK_DAYS = 14;
const ANNIVERSARY_YEARS     = [1, 2, 3, 5, 10];

export interface FirstContactClient {
  id:                  string;
  first_contacted_at?: string | null;
}

export interface FirstContactCandidate {
  client_id:        string;
  opportunity_type: FirstContactType;
  trigger_date:     string;
  context:          Record<string, unknown>;
}

export interface FirstContactOptions {
  /** Today as YYYY-MM-DD. Defaults to the Atlantic day. */
  today?:     string;
  /** How many days ahead a trigger is detected. */
  windowDays: number;
  /** Clients contacted inside the suppression window. */
  suppressed: ReadonlySet<string>;
  /** Occurrences already on file, from recordedOccurrences(). */
  recorded:   ReadonlySet<string>;
}

/** Keys of the queue rows and dismissals already on file. */
export function recordedOccurrences(
  queueRows:  readonly OpportunityKeyParts[],
  dismissals: readonly OpportunityKeyParts[],
): Set<string> {
  return new Set([...queueRows, ...dismissals].map(opportunityKey));
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD plus whole years. Feb 29 lands on Mar 1 in a common year. */
function addYearsISO(iso: string, years: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y + years, m - 1, d));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/**
 * The day of a first contact: its Atlantic day, and the UTC date both
 * detectors keyed on before 2026-10-13. Null when it can't be read.
 */
function firstContactDay(firstContactedAt: string): { day: string; utcDay: string } | null {
  const at = new Date(firstContactedAt);
  if (Number.isNaN(at.getTime())) return null;
  return { day: atlanticISODate(at), utcDay: at.toISOString().slice(0, 10) };
}

/**
 * The date an occurrence is filed under: the Atlantic one, unless it is
 * already on file under the UTC date and not under the Atlantic one.
 */
function filedDate(
  client_id:        string,
  opportunity_type: FirstContactType,
  atlanticDate:     string,
  utcDate:          string,
  recorded:         ReadonlySet<string>,
): string {
  if (utcDate === atlanticDate) return atlanticDate;
  const onFile = (trigger_date: string) =>
    recorded.has(opportunityKey({ client_id, opportunity_type, trigger_date }));
  return !onFile(atlanticDate) && onFile(utcDate) ? utcDate : atlanticDate;
}

/** Welcome note, a week after the first contact. Open until 14 days after. */
export function newClientWelcomeCandidates(
  clients: readonly FirstContactClient[],
  opts:    FirstContactOptions,
): FirstContactCandidate[] {
  const today = opts.today ?? atlanticISODate();
  const out: FirstContactCandidate[] = [];
  for (const client of clients) {
    if (!client.first_contacted_at) continue;
    if (opts.suppressed.has(client.id)) continue;
    const first = firstContactDay(client.first_contacted_at);
    if (!first) continue;
    const welcomeDate = addDaysISO(first.day, WELCOME_AFTER_DAYS);
    const d = daysBetweenISO(today, welcomeDate);
    if (d >= -WELCOME_LOOKBACK_DAYS && d <= opts.windowDays) {
      const utcDate = addDaysISO(first.utcDay, WELCOME_AFTER_DAYS);
      out.push({
        client_id:        client.id,
        opportunity_type: "new_client_welcome",
        trigger_date:     filedDate(client.id, "new_client_welcome", welcomeDate, utcDate, opts.recorded),
        context:          { first_contacted_at: client.first_contacted_at },
      });
    }
  }
  return out;
}

/**
 * "N years since we first spoke", from 14 days ahead through the day itself.
 *
 * Decided from the anniversary date alone. This used to skip a client whose
 * first contact was in the current calendar year, which hid a first
 * anniversary in early January until Jan 1: up to two weeks into its window.
 */
export function contactAnniversaryCandidates(
  clients: readonly FirstContactClient[],
  opts:    FirstContactOptions,
): FirstContactCandidate[] {
  const today = opts.today ?? atlanticISODate();
  const out: FirstContactCandidate[] = [];
  for (const client of clients) {
    if (!client.first_contacted_at) continue;
    if (opts.suppressed.has(client.id)) continue;
    const first = firstContactDay(client.first_contacted_at);
    if (!first) continue;
    const { day } = first;
    for (const yr of ANNIVERSARY_YEARS) {
      const annivDate = addYearsISO(day, yr);
      const d = daysBetweenISO(today, annivDate);
      if (d >= 0 && d <= opts.windowDays) {
        const utcDate = addYearsISO(first.utcDay, yr);
        out.push({
          client_id:        client.id,
          opportunity_type: "contact_anniversary",
          trigger_date:     filedDate(client.id, "contact_anniversary", annivDate, utcDate, opts.recorded),
          context:          { anniversary_year: yr, first_contacted_at: day },
        });
      }
    }
  }
  return out;
}
