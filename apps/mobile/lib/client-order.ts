/**
 * The order of the phone's Clients list (All, Active and Cruising, with or
 * without a search): top clients first, as on the web Clients table.
 *
 * Top clients are the contacts with a lifetime GCI above $0, in the web
 * table's default order. That order is not worked out here: it is core
 * buildAllGroups (a deal belongs to its client_id, else to the contact whose
 * name_search matches; collapsed deals earn nothing; a household's deal is on
 * one client and a co-party holds $0) sorted by the web table's own
 * sortTableGroups with CLIENTS_TABLE_DEFAULT_SORT: Lifetime GCI highest
 * first, an exact tie by name A to Z.
 *
 * Everyone else (no counted GCI) follows by most recent contact, as the list
 * was ordered before; never contacted last, then name A to Z, then id. The web
 * lists these A to Z instead; on the phone the people you have been talking
 * to are the ones you call back.
 *
 * Deal rows that match no contact are a row of their own on web; the phone
 * lists contacts only, so they are left out (they never move anyone else).
 * The Overdue and New Leads lists keep their own order (stores/data-store.ts).
 */

import {
  buildAllGroups,
  CLIENTS_TABLE_DEFAULT_SORT,
  sortTableGroups,
} from "@agent-runway/core/lib/client-groups";
import { toNameSearch } from "@agent-runway/core/lib/client-identity";
import type { ClientRecord } from "@agent-runway/core/types/database";
import { safeDateMs } from "./safe-date";

/** The client fields the order reads. */
export interface OrderableClient {
  id: string;
  name: string;
  /** On every row read from the database; missing on an optimistic row. */
  name_search?: string | null;
  last_contact_at: string | null;
}

export interface TopClients {
  /** Lifetime GCI of each contact above $0: the web table's Lifetime GCI. */
  gciById: ReadonlyMap<string, number>;
  /** Each of those contacts' place in the web table's default order (0 = first). */
  rankById: ReadonlyMap<string, number>;
}

function byId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The contacts with lifetime GCI, ranked as the web Clients table ranks them by default. */
export function topClients(
  clients: readonly OrderableClient[],
  records: ClientRecord[],
): TopClients {
  // Web reads clients by name, then id, and both sorts after it are stable,
  // so two contacts with the same name and the same GCI stay in id order.
  // Handing them over in id order gives the same result.
  const groupable = [...clients].sort(byId).map((c) => ({
    id: c.id,
    name: c.name,
    // A saved row always has it; an unsaved one will be saved with this.
    name_search: c.name_search ?? toNameSearch(c.name),
  }));
  // Co-parties only set web's Household Activity badge (their GCI stays $0),
  // so the order doesn't need them.
  const ranked = sortTableGroups(
    buildAllGroups(groupable, records, []),
    CLIENTS_TABLE_DEFAULT_SORT.col,
    CLIENTS_TABLE_DEFAULT_SORT.dir,
  );
  const gciById = new Map<string, number>();
  const rankById = new Map<string, number>();
  for (const g of ranked) {
    if (!g.clientId || !(g.totalGCI > 0)) continue;
    rankById.set(g.clientId, rankById.size);
    gciById.set(g.clientId, g.totalGCI);
  }
  return { gciById, rankById };
}

/** `list` (any subset of the clients) with top clients first, then by most recent contact. */
export function orderTopClientsFirst<C extends OrderableClient>(
  list: readonly C[],
  top: TopClients,
): C[] {
  const keyed = list.map((c) => ({
    c,
    rank: top.rankById.get(c.id),
    contactMs: safeDateMs(c.last_contact_at),
  }));
  keyed.sort((a, b) => {
    if (a.rank !== undefined || b.rank !== undefined) {
      if (a.rank === undefined) return 1;
      if (b.rank === undefined) return -1;
      return a.rank - b.rank;
    }
    if (a.contactMs !== b.contactMs) {
      if (a.contactMs === null) return 1;
      if (b.contactMs === null) return -1;
      return b.contactMs - a.contactMs;
    }
    return a.c.name.localeCompare(b.c.name) || byId(a.c, b.c);
  });
  return keyed.map((k) => k.c);
}
