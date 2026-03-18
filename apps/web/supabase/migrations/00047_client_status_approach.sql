/**
 * Migration 00047 — Add "approach" client status
 *
 * The clients.status column uses a text type with no CHECK constraint
 * (the constraint lives in the application layer via the ClientStatus union type).
 * This migration is a no-op DDL change; it documents the new value and updates
 * the PostgREST schema cache so the column's allowed values are visible to tooling.
 *
 * "approach" sits between "taxiing" and "in_flight":
 *   boarding → taxiing → approach → in_flight → landed → cruising
 *
 * Meaning: client is actively viewing homes and preparing to make an offer.
 */

-- No DDL required — status is an unconstrained text column.
-- Notify PostgREST to reload its schema cache.
NOTIFY pgrst, 'reload schema';
