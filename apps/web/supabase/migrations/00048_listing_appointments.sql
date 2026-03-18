/**
 * Migration 00048 — Listing Appointments table
 *
 * Tracks pre-transactional listing appointments for seller clients.
 * Used for Phase A pipeline tracking: estimated vs. actual sale price
 * forecasting accuracy measurement.
 *
 * Status flow: scheduled → active → sold | expired | withdrawn | lost
 */

CREATE TABLE IF NOT EXISTS listing_appointments (
  id                   uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id              uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id            uuid          REFERENCES clients(id) ON DELETE SET NULL,
  appointment_date     date          NOT NULL,
  property_address     text,
  estimated_list_price numeric(12,2),   -- agent's price estimate at appointment time
  actual_list_price    numeric(12,2),   -- what it listed for (filled in later)
  actual_sale_price    numeric(12,2),   -- what it sold for (filled in later)
  status               text          NOT NULL DEFAULT 'scheduled',
  notes                text,
  created_at           timestamptz   DEFAULT now() NOT NULL,
  updated_at           timestamptz   DEFAULT now() NOT NULL
);

ALTER TABLE listing_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own listing appointments"
  ON listing_appointments FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_listing_appts_user_id   ON listing_appointments(user_id);
CREATE INDEX idx_listing_appts_client_id ON listing_appointments(client_id);

NOTIFY pgrst, 'reload schema';
