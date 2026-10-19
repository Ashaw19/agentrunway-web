-- ============================================================================
-- Migration 00184: CRA vehicle logbook (vehicles, logbook periods, odometer
-- readings, saved places; vehicle and odometer on mileage_logs)
--
-- Until now every surface multiplied vehicle costs by a typed setting
-- (user_settings.vehicle_business_use_pct) and mileage_logs held business
-- trips only, with no odometer, so the log could not support the percentage
-- beside it. CRA ("Motor vehicle records", canada.ca, 2026-08-31):
--   - a logbook lists each business trip's date, destination, purpose and km,
--     and each vehicle's odometer at the start and end of the fiscal period;
--   - a full logbook for one complete year is a base year; after it a
--     three-month sample logbook gives a later year's business use when it is
--     within 10% of the base year:
--     (sample % / base-year same-period %) x base-year annual %.
-- The math is packages/core/engines/vehicle-logbook-engine.ts.
--
-- DESIGN
--   vehicles                   one row per vehicle the agent drives for work.
--   vehicle_logbook_periods    a base year (12 months) or a sample period
--                              (3 months) of one vehicle, from the 1st of a
--                              month, with the odometer at its start and end.
--   vehicle_odometer_readings  the odometer at the end of a day, for a base
--                              year's month ends: they let a later sample be
--                              compared with the same months of the base year.
--   mileage_places             places the agent drives to often (quick entry).
--   mileage_logs               + vehicle_id, odometer_start, odometer_end.
--
-- ADDITIVE ONLY. No existing row is rewritten: trips logged before this have
-- vehicle_id NULL and count for the agent's default vehicle (the first active
-- one added), worked out in code (defaultVehicleId). A vehicle is created
-- when the agent first adds one or starts a logbook period.
--
-- Data API: from 2026-10-30 Supabase stops exposing new tables without
-- explicit grants (supabase.com/changelog/45329); each table is granted below.
-- ============================================================================

-- ── vehicles ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vehicles (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  model_year  integer     CHECK (model_year IS NULL OR model_year BETWEEN 1900 AND 2100),
  make        text        CHECK (make IS NULL OR char_length(make) <= 60),
  model       text        CHECK (model IS NULL OR char_length(model) <= 60),
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vehicles_user_idx ON public.vehicles (user_id, created_at);

CREATE TRIGGER vehicles_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vehicles_select_own" ON public.vehicles
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY "vehicles_insert_own" ON public.vehicles
  FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "vehicles_update_own" ON public.vehicles
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "vehicles_delete_own" ON public.vehicles
  FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

REVOKE ALL ON public.vehicles FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated, service_role;

-- ── vehicle_logbook_periods ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vehicle_logbook_periods (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id      uuid          NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  kind            text          NOT NULL CHECK (kind IN ('base', 'sample')),
  start_date      date          NOT NULL,
  end_date        date          NOT NULL,
  odometer_start  numeric(9,1)  CHECK (odometer_start IS NULL OR odometer_start >= 0),
  odometer_end    numeric(9,1)  CHECK (odometer_end IS NULL OR odometer_end >= 0),
  notes           text          CHECK (notes IS NULL OR char_length(notes) <= 1000),
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  -- From the 1st of a month: 12 months for a base year, 3 for a sample.
  CONSTRAINT vehicle_logbook_periods_starts_on_first
    CHECK (extract(day FROM start_date) = 1),
  CONSTRAINT vehicle_logbook_periods_length
    CHECK (end_date = (start_date + (CASE WHEN kind = 'base' THEN 12 ELSE 3 END) * interval '1 month' - interval '1 day')::date),
  CONSTRAINT vehicle_logbook_periods_odometer_order
    CHECK (odometer_start IS NULL OR odometer_end IS NULL OR odometer_end >= odometer_start)
);

CREATE INDEX IF NOT EXISTS vehicle_logbook_periods_user_idx
  ON public.vehicle_logbook_periods (user_id, start_date);
CREATE INDEX IF NOT EXISTS vehicle_logbook_periods_vehicle_idx
  ON public.vehicle_logbook_periods (vehicle_id, start_date);

CREATE TRIGGER vehicle_logbook_periods_updated_at
  BEFORE UPDATE ON public.vehicle_logbook_periods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.vehicle_logbook_periods ENABLE ROW LEVEL SECURITY;

-- The vehicle has to be the agent's own as well as the row.
CREATE POLICY "vehicle_logbook_periods_select_own" ON public.vehicle_logbook_periods
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY "vehicle_logbook_periods_insert_own" ON public.vehicle_logbook_periods
  FOR INSERT TO authenticated WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = vehicle_id AND v.user_id = (select auth.uid()))
  );
CREATE POLICY "vehicle_logbook_periods_update_own" ON public.vehicle_logbook_periods
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = vehicle_id AND v.user_id = (select auth.uid()))
  );
CREATE POLICY "vehicle_logbook_periods_delete_own" ON public.vehicle_logbook_periods
  FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

REVOKE ALL ON public.vehicle_logbook_periods FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_logbook_periods TO authenticated, service_role;

-- ── vehicle_odometer_readings ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vehicle_odometer_readings (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id    uuid          NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  -- The odometer at the END of this day.
  reading_date  date          NOT NULL,
  odometer_km   numeric(9,1)  NOT NULL CHECK (odometer_km >= 0),
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_odometer_readings_vehicle_day_key UNIQUE (vehicle_id, reading_date)
);

CREATE INDEX IF NOT EXISTS vehicle_odometer_readings_user_idx
  ON public.vehicle_odometer_readings (user_id, reading_date);

CREATE TRIGGER vehicle_odometer_readings_updated_at
  BEFORE UPDATE ON public.vehicle_odometer_readings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.vehicle_odometer_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vehicle_odometer_readings_select_own" ON public.vehicle_odometer_readings
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY "vehicle_odometer_readings_insert_own" ON public.vehicle_odometer_readings
  FOR INSERT TO authenticated WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = vehicle_id AND v.user_id = (select auth.uid()))
  );
CREATE POLICY "vehicle_odometer_readings_update_own" ON public.vehicle_odometer_readings
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = vehicle_id AND v.user_id = (select auth.uid()))
  );
CREATE POLICY "vehicle_odometer_readings_delete_own" ON public.vehicle_odometer_readings
  FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

REVOKE ALL ON public.vehicle_odometer_readings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_odometer_readings TO authenticated, service_role;

-- ── mileage_places ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.mileage_places (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text          NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  address     text          CHECK (address IS NULL OR char_length(address) <= 200),
  default_km  numeric(8,1)  CHECK (default_km IS NULL OR default_km > 0),
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mileage_places_user_idx ON public.mileage_places (user_id, name);

CREATE TRIGGER mileage_places_updated_at
  BEFORE UPDATE ON public.mileage_places
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.mileage_places ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mileage_places_select_own" ON public.mileage_places
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY "mileage_places_insert_own" ON public.mileage_places
  FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "mileage_places_update_own" ON public.mileage_places
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "mileage_places_delete_own" ON public.mileage_places
  FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

REVOKE ALL ON public.mileage_places FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mileage_places TO authenticated, service_role;

-- ── mileage_logs: vehicle and odometer (nullable, no rewrite) ───────────────

ALTER TABLE public.mileage_logs
  ADD COLUMN IF NOT EXISTS vehicle_id     uuid         REFERENCES public.vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS odometer_start numeric(9,1) CHECK (odometer_start IS NULL OR odometer_start >= 0),
  ADD COLUMN IF NOT EXISTS odometer_end   numeric(9,1) CHECK (odometer_end IS NULL OR odometer_end >= 0);

ALTER TABLE public.mileage_logs
  ADD CONSTRAINT mileage_logs_odometer_order
    CHECK (odometer_start IS NULL OR odometer_end IS NULL OR odometer_end >= odometer_start);

CREATE INDEX IF NOT EXISTS mileage_logs_vehicle_date_idx
  ON public.mileage_logs (vehicle_id, trip_date)
  WHERE vehicle_id IS NOT NULL;
