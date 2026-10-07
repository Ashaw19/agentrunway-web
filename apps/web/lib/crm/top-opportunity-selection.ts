import { SPHERE_MAX_PER_SCAN } from "./scan-call-cards";

/**
 * Card selection for Flight Control "Scan Now" (getTopOpportunities).
 *
 * Strong signals (score >= 55) rank first. Remaining slots backfill with the
 * best of the rest instead of leaving the page nearly empty. Without a fresh
 * AI memory profile — the normal case — an idle past client scores 38 and a
 * multi-deal milestone 52, so a hard 55 cutoff hid them all and Scan showed
 * only events dated within the next two weeks.
 *
 * The send-worthiness threshold for automated nightly drafting
 * (MIN_SEND_WORTHY_SCORE in detect-opportunities) is unchanged: backfill
 * widens what the agent sees, not what gets drafted without being asked.
 */

export const TOP_OPPORTUNITY_THRESHOLD = 55;
export const MAX_TOP_OPPORTUNITIES     = 5;

/** Per-type card limits. Sphere check-ins fill spare slots, never the whole list. */
export const TYPE_CAPS: Readonly<Record<string, number>> = { sphere_check_in: SPHERE_MAX_PER_SCAN };

export interface RankableCandidate {
  client_id:        string;
  opportunity_type: string;
  context:          Record<string, unknown>;
}

const scoreOf = (c: RankableCandidate) => Number(c.context.outreach_score ?? 0);

/**
 * Pick up to `limit` cards, one per client (their highest-scoring
 * opportunity), score first and lifetime GCI as the tiebreak.
 */
export function selectTopCandidates<T extends RankableCandidate>(
  candidates:  readonly T[],
  lifetimeGci: ReadonlyMap<string, number>,
  limit:       number = MAX_TOP_OPPORTUNITIES,
): T[] {
  const ranked = [...candidates].sort(
    (a, b) =>
      scoreOf(b) - scoreOf(a) ||
      (lifetimeGci.get(b.client_id) ?? 0) - (lifetimeGci.get(a.client_id) ?? 0),
  );

  const picked: T[] = [];
  const seen = new Set<string>();
  const perType = new Map<string, number>();
  for (const c of ranked) {
    if (picked.length >= limit) break;
    if (seen.has(c.client_id)) continue;
    const cap = TYPE_CAPS[c.opportunity_type];
    if (cap !== undefined && (perType.get(c.opportunity_type) ?? 0) >= cap) continue;
    // Seasonal campaigns are broadcasts (the Newsletters tab owns them), not
    // "who should I contact" — they never take a backfill slot.
    if (scoreOf(c) < TOP_OPPORTUNITY_THRESHOLD && c.opportunity_type.startsWith("seasonal_")) continue;
    seen.add(c.client_id);
    perType.set(c.opportunity_type, (perType.get(c.opportunity_type) ?? 0) + 1);
    picked.push(c);
  }
  return picked;
}

/** Lifetime GCI per client from client_records. Collapsed deals earned nothing. */
export function clientLifetimeGci(
  records: readonly {
    client_id?:        string | null;
    gci?:              number | string | null;
    condition_status?: string | null;
  }[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of records) {
    if (!r.client_id || r.condition_status === "collapsed") continue;
    const gci = Number(r.gci ?? 0);
    if (!Number.isFinite(gci) || gci <= 0) continue;
    out.set(r.client_id, (out.get(r.client_id) ?? 0) + gci);
  }
  return out;
}
