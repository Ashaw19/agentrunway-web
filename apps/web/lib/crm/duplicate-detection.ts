// Duplicate-client clustering — pure, client-side, no DB access.
//
// WHY: the CSV importer's only duplicate check is an exact match on
// name_search (a normalized name) against existing clients — nothing on
// email or phone, and no review step. Genuinely-duplicate clients typed
// slightly differently (nickname, middle initial, a curly vs. straight
// apostrophe) both get inserted as separate rows, silently. This module is
// the detection half of the fix: it clusters the full client list (already
// loaded in clients-content.tsx local state) into likely-duplicate groups
// for a human to review and merge via fn_merge_clients (migration 00162).
//
// SCOPE (v1, deliberately cut): exact-match clustering only, on name/email/
// phone. No fuzzy/typo matching (e.g. "Bob" vs "Robert") — that needs a
// similarity threshold and false-positive tuning that's a larger, separate
// piece of work. This module only surfaces suggestions; nothing is written
// until a human picks a cluster and confirms a merge, so a missed edge case
// here is a missed suggestion, not a data-integrity risk.

import { clusterNameKey } from "./client-identity";
import { normalizeEmail, normalizePhone } from "./client-identity";

export interface ClusterableClient {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  /** Used for near-matches when set; otherwise the name is split. */
  first_name?: string | null;
  last_name?: string | null;
}

export type MatchReason = "name" | "email" | "phone";

export interface DuplicateCluster {
  clientIds: string[];
  matchedOn: MatchReason[];
}

// ── Union-Find (disjoint set), path-compressed ───────────────────────────────

class UnionFind {
  private parent = new Map<string, string>();

  private ensure(x: string): void {
    if (!this.parent.has(x)) this.parent.set(x, x);
  }

  find(x: string): string {
    this.ensure(x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    // Path compression: repoint every visited node straight at the root.
    let cur = x;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

function bucketBy(
  clients: ClusterableClient[],
  keyFn: (c: ClusterableClient) => string | null,
): Map<string, string[]> {
  const buckets = new Map<string, string[]>();
  for (const c of clients) {
    const key = keyFn(c);
    if (!key) continue;
    const arr = buckets.get(key) ?? [];
    arr.push(c.id);
    buckets.set(key, arr);
  }
  return buckets;
}

/**
 * Cluster clients into likely-duplicate groups. Two clients land in the same
 * cluster if they share a normalized name, email, or phone — transitively:
 * if A matches B by phone and B matches C by email, all three cluster
 * together, even though A and C share nothing directly.
 *
 * Returns only clusters with 2+ members; singletons are never included.
 */
export function clusterDuplicateClients(clients: ClusterableClient[]): DuplicateCluster[] {
  const uf = new UnionFind();
  for (const c of clients) uf.find(c.id);

  const byName = bucketBy(clients, (c) => clusterNameKey(c.name));
  const byEmail = bucketBy(clients, (c) => normalizeEmail(c.email));
  const byPhone = bucketBy(clients, (c) => normalizePhone(c.phone));

  for (const bucket of [byName, byEmail, byPhone]) {
    for (const ids of bucket.values()) {
      for (let i = 1; i < ids.length; i++) uf.union(ids[0], ids[i]);
    }
  }

  const groups = new Map<string, string[]>();
  for (const c of clients) {
    const root = uf.find(c.id);
    const arr = groups.get(root) ?? [];
    arr.push(c.id);
    groups.set(root, arr);
  }

  const clusters: DuplicateCluster[] = [];
  for (const clientIds of groups.values()) {
    if (clientIds.length < 2) continue;
    const idSet = new Set(clientIds);
    const matchedOn = new Set<MatchReason>();
    const reasonBuckets: [MatchReason, Map<string, string[]>][] = [
      ["name", byName],
      ["email", byEmail],
      ["phone", byPhone],
    ];
    for (const [reason, bucket] of reasonBuckets) {
      for (const bucketIds of bucket.values()) {
        if (bucketIds.length < 2) continue;
        const overlapCount = bucketIds.filter((id) => idSet.has(id)).length;
        if (overlapCount >= 2) matchedOn.add(reason);
      }
    }
    clusters.push({ clientIds, matchedOn: [...matchedOn] });
  }

  // Stable, deterministic order for UI rendering (largest clusters first).
  return clusters.sort((a, b) => b.clientIds.length - a.clientIds.length);
}

/**
 * Suggest which client in a cluster should be the merge target ("primary").
 * A record whose name is a real name beats one named with an email address
 * (the merge keeps the primary's name). Then the earliest created_at:
 * usually the original entry, with the most accumulated history. The review
 * UI lets the user override this.
 */
export function pickSuggestedPrimary(
  clients: ClusterableClient[],
  clientIds: string[],
): string {
  const candidates = clients.filter((c) => clientIds.includes(c.id));
  if (candidates.length === 0) {
    throw new Error("pickSuggestedPrimary: no matching clients for the given ids");
  }
  const named = candidates.filter((c) => !nameIsEmail(c.name));
  const pool = named.length > 0 ? named : candidates;
  return pool.reduce((best, c) => (c.created_at < best.created_at ? c : best)).id;
}

// ── Near-matches (2026-10-27) ────────────────────────────────────────────────
//
// Andrew imported 103 iPhone contacts and asked for email-only clients to be
// consolidated with the same people's phone cards. The exact clustering
// above never pairs "Bob Smith <bob@…>" with "Robert Smith 506-…": nothing
// is equal. These are suggestions for review, never merged on their own,
// and never chained transitively (two near-matches don't make a third).
//
// A pair is suggested when:
//   - the last names are the same and the first names agree (the same, one
//     starts the other like Rob/Robert or J/John, or a common nickname like
//     Bob/Robert), or
//   - one card has only an email and the other only a phone number, and the
//     email address carries the other card's name (its last name plus the
//     first name or first initial: jsmith@, john.smith@, smithj@).
// Never when both cards have real names and the first names disagree.
// Pairs already in an exact cluster are left to the cluster.

export type NearMatchReason = "contact_split" | "same_last_name" | "first_names_match" | "email_has_name";

export interface PossibleDuplicatePair {
  clientIds: [string, string];
  reasons: NearMatchReason[];
}

/** Common English nicknames whose letters don't start the full name. */
const NICKNAMES: Record<string, string[]> = {
  robert: ["bob", "bobby", "rob", "robbie", "bert"],
  william: ["bill", "billy", "will", "willy", "liam"],
  elizabeth: ["liz", "lizzie", "beth", "betty", "betsy", "eliza", "libby"],
  michael: ["mike", "mikey", "mick", "mickey"],
  james: ["jim", "jimmy", "jamie"],
  richard: ["rick", "ricky", "dick", "rich", "richie"],
  david: ["dave", "davey"],
  john: ["jack", "johnny", "jon"],
  jonathan: ["jon", "jonny", "nathan"],
  anthony: ["tony"],
  andrew: ["andy", "drew"],
  edward: ["ed", "eddie", "ted", "ned"],
  charles: ["charlie", "chuck", "chaz"],
  henry: ["hank", "harry"],
  margaret: ["maggie", "meg", "peggy", "marge", "greta"],
  deborah: ["deb", "debbie"],
  sandra: ["sandy"],
  susan: ["sue", "suzy", "susie"],
  suzanne: ["sue", "suzy"],
  katherine: ["kate", "katie", "kathy", "kat", "kay"],
  catherine: ["kate", "katie", "cathy", "cat"],
  kathleen: ["kathy", "kate", "katie"],
  jennifer: ["jen", "jenny"],
  patricia: ["pat", "patty", "trish", "tricia"],
  patrick: ["pat", "paddy"],
  rebecca: ["becky", "becca"],
  sarah: ["sally", "sadie"],
  amanda: ["mandy"],
  gerald: ["gerry", "jerry"],
  terrence: ["terry"],
  theresa: ["terry", "tess", "tessa"],
  teresa: ["terry", "tess"],
  lawrence: ["larry"],
  joseph: ["joe", "joey"],
  thomas: ["tom", "tommy"],
  daniel: ["dan", "danny"],
  christopher: ["chris", "topher"],
  christine: ["chris", "chrissy", "tina"],
  christina: ["chris", "tina"],
  nicholas: ["nick", "nicky"],
  stephen: ["steve", "stevie"],
  steven: ["steve", "stevie"],
  matthew: ["matt"],
  benjamin: ["ben", "benny"],
  samuel: ["sam", "sammy"],
  samantha: ["sam", "sammy"],
  alexander: ["alex", "sandy", "xander"],
  alexandra: ["alex", "sandra", "lexi"],
  victoria: ["vicky", "tori"],
  francis: ["frank", "fran"],
  frances: ["fran", "frannie"],
  frederick: ["fred", "freddie"],
  timothy: ["tim", "timmy"],
  gregory: ["greg"],
  jeffrey: ["jeff"],
  kenneth: ["ken", "kenny"],
  ronald: ["ron", "ronnie"],
  donald: ["don", "donnie"],
  douglas: ["doug"],
  raymond: ["ray"],
  leonard: ["len", "lenny", "leo"],
  albert: ["al", "bert"],
  alan: ["al"],
  allan: ["al"],
  jacqueline: ["jackie"],
  abigail: ["abby"],
  barbara: ["barb", "barbie"],
  cynthia: ["cindy"],
  pamela: ["pam"],
  melissa: ["mel", "missy"],
  jessica: ["jess", "jessie"],
  nicole: ["nikki", "nicky"],
  stephanie: ["steph"],
  valerie: ["val"],
  joshua: ["josh"],
  zachary: ["zach", "zack"],
  jacob: ["jake"],
  louis: ["lou"],
  louise: ["lou"],
  dorothy: ["dot", "dottie"],
  eleanor: ["ellie", "nell", "nora"],
  helen: ["nell"],
  virginia: ["ginny"],
};

const NICKNAME_PAIRS = new Set<string>();
for (const [full, nicks] of Object.entries(NICKNAMES)) {
  for (const n of nicks) {
    NICKNAME_PAIRS.add(`${full}|${n}`);
    NICKNAME_PAIRS.add(`${n}|${full}`);
  }
}

/** Lowercase letters only, accents folded. "Jean-Guy" → "jeanguy". */
function letters(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
}

function nameIsEmail(name: string | null | undefined): boolean {
  return (name ?? "").includes("@");
}

/** First and last name, from the columns when set, else the name split. */
function nameParts(c: ClusterableClient): { first: string; last: string } | null {
  if (nameIsEmail(c.name)) return null;
  const tokens = (c.name ?? "").trim().split(/\s+/).filter(Boolean);
  const first = letters(c.first_name) || letters(tokens[0]);
  const last = letters(c.last_name) || (tokens.length > 1 ? letters(tokens[tokens.length - 1]) : "");
  return first ? { first, last } : null;
}

/** The same, one starts the other (Rob/Robert; an initial J/John), or a nickname. */
export function firstNamesAgree(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.startsWith(short) && (short.length === 1 || short.length >= 3)) return true;
  return NICKNAME_PAIRS.has(`${a}|${b}`);
}

/** The email address (its local part, letters only) carries this name:
 *  last name plus first name or initial. */
function emailCarriesName(local: string, name: { first: string; last: string }): boolean {
  if (!local || name.last.length < 3) return false;
  if (!local.includes(name.last)) return false;
  const initial = name.first[0];
  return (name.first.length >= 3 && local.includes(name.first)) || local.startsWith(initial) || local.endsWith(initial);
}

/** Stable key for a pair of client ids (sorted). */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Pairs that may be the same person, for review. `exactClusters` (from
 * clusterDuplicateClients) are left out; so are pairs in `dismissed`
 * (pairKey values the agent marked "Not the same person"). Pairs where one
 * card has only the email and the other only the phone come first.
 */
export function findPossibleDuplicatePairs(
  clients: ClusterableClient[],
  exactClusters: DuplicateCluster[] = [],
  dismissed: ReadonlySet<string> = new Set(),
): PossibleDuplicatePair[] {
  const clusterOf = new Map<string, number>();
  exactClusters.forEach((cl, i) => cl.clientIds.forEach((id) => clusterOf.set(id, i)));

  const info = clients.map((c) => {
    const email = normalizeEmail(c.email);
    return {
      c,
      name: nameParts(c),
      email,
      phone: normalizePhone(c.phone),
      // Computed once: letters of the part before the @.
      local: email ? letters(email.split("@")[0]) : "",
    };
  });
  type Info = (typeof info)[number];

  const found = new Map<string, PossibleDuplicatePair>();
  const consider = (x: Info, y: Info) => {
    if (x.c.id === y.c.id) return;
    const key = pairKey(x.c.id, y.c.id);
    if (found.has(key) || dismissed.has(key)) return;
    const cx = clusterOf.get(x.c.id);
    if (cx !== undefined && cx === clusterOf.get(y.c.id)) return;

    const split = (!!x.email && !x.phone && !!y.phone && !y.email) || (!!y.email && !y.phone && !!x.phone && !x.email);
    const sameLast = !!x.name && !!y.name && x.name.last.length >= 2 && x.name.last === y.name.last;
    const firstAgree = !!x.name && !!y.name && firstNamesAgree(x.name.first, y.name.first);
    // Two real names whose first names disagree (Jane and John Smith) are
    // two people, even when one's email carries the shared surname.
    if (x.name && y.name && !firstAgree) return;
    const emailHasName = split && (
      (!!y.name && emailCarriesName(x.local, y.name)) ||
      (!!x.name && emailCarriesName(y.local, x.name))
    );
    if (!(sameLast && firstAgree) && !emailHasName) return;

    const reasons: NearMatchReason[] = [];
    if (split) reasons.push("contact_split");
    if (sameLast) reasons.push("same_last_name");
    if (firstAgree) reasons.push("first_names_match");
    if (emailHasName) reasons.push("email_has_name");
    const ids: [string, string] = x.c.id < y.c.id ? [x.c.id, y.c.id] : [y.c.id, x.c.id];
    found.set(key, { clientIds: ids, reasons });
  };

  // Same last name: compare within each last-name bucket only.
  const byLast = new Map<string, Info[]>();
  for (const i of info) {
    if (!i.name || i.name.last.length < 2) continue;
    const list = byLast.get(i.name.last) ?? [];
    list.push(i);
    byLast.set(i.name.last, list);
  }
  for (const list of byLast.values()) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) consider(list[i], list[j]);
  }

  // Email-only cards against phone-only cards whose last name is in the
  // email address (checked once per distinct last name, not per card).
  const phoneOnlyByLast = new Map<string, Info[]>();
  for (const i of info) {
    if (!i.phone || i.email || !i.name || i.name.last.length < 3) continue;
    const list = phoneOnlyByLast.get(i.name.last) ?? [];
    list.push(i);
    phoneOnlyByLast.set(i.name.last, list);
  }
  for (const e of info) {
    if (!e.email || e.phone || !e.local) continue;
    for (const [last, list] of phoneOnlyByLast) {
      if (e.local.includes(last)) for (const p of list) consider(e, p);
    }
  }

  const rank = (p: PossibleDuplicatePair) => (p.reasons.includes("contact_split") ? 0 : 1);
  return [...found.values()].sort((a, b) => rank(a) - rank(b) || pairKey(...a.clientIds).localeCompare(pairKey(...b.clientIds)));
}
