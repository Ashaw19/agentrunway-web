/**
 * Flight Control's 14-day suppression: a client contacted in the last two
 * weeks gets no non-birthday outreach.
 *
 * "Contacted" has two sources. A CRM activity moves clients.last_contact_at
 * (DB trigger). "Mark as sent" in Flight Control writes only
 * outreach_queue.sent_at — it logs no activity — so reading last_contact_at
 * alone let a client you had just emailed come straight back as the top card.
 *
 * Shared by the scan read path and the draft write path so both suppress the
 * same people.
 */

export const OUTREACH_SUPPRESSION_DAYS = 14;

/** Earliest contact time that still suppresses. Use it to bound the sent-outreach fetch. */
export function outreachSuppressionCutoff(now: Date = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - OUTREACH_SUPPRESSION_DAYS);
  return cutoff;
}

export function recentlyContactedClientIds(
  clients:      readonly { id: string; last_contact_at?: string | null }[],
  sentOutreach: readonly { client_id?: string | null; sent_at?: string | null }[],
  now:          Date = new Date(),
): Set<string> {
  const cutoff = outreachSuppressionCutoff(now);
  const ids = new Set<string>();
  for (const c of clients) {
    if (c.last_contact_at && new Date(c.last_contact_at) > cutoff) ids.add(c.id);
  }
  for (const s of sentOutreach) {
    if (s.client_id && s.sent_at && new Date(s.sent_at) > cutoff) ids.add(s.client_id);
  }
  return ids;
}
