/**
 * Archived-client gate for client_records-driven outreach.
 *
 * Archiving a client writes ONLY `clients.archived_at` (+ `archive_reason`). It
 * does not change `clients.status`, and it does not touch `client_records`. So
 * a `client_records` fetch — which has no archived column of its own — happily
 * returns rows belonging to clients archived as 'deceased', 'moved_away', or
 * 'do_not_contact'.
 *
 * The opportunity detectors iterate those records rather than the clients list,
 * so without this gate an archived client keeps generating outreach forever:
 * closing anniversaries, idle nudges, post-close touchpoints, deal milestones.
 * That is a real-world harm (a drafted "happy anniversary" to a deceased
 * client) and a CASL exposure for 'do_not_contact'.
 *
 * Both the write path (detectAndDraftForUser) and the read path
 * (getTopOpportunities) must apply this. Sharing one helper is what keeps them
 * in lock-step — they drifted precisely because each built its own filtering.
 */

/** Minimal shape needed to gate a record — anything with an optional client FK. */
export interface RecordWithClientRef {
  client_id?: string | null;
}

/**
 * Keep only records whose client is present in `clientMap`.
 *
 * `clientMap` MUST be built from an archived-filtered clients query
 * (`.is("archived_at", null)`); membership in it is therefore exactly the
 * "this client is still contactable" test. Records with a null client_id are
 * dropped — they cannot be attributed to anyone to contact.
 */
export function contactableRecords<T extends RecordWithClientRef>(
  records: readonly T[],
  clientMap: ReadonlyMap<string, unknown>,
): T[] {
  return records.filter((r) => !!r.client_id && clientMap.has(r.client_id));
}
