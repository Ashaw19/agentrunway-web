-- Migration 00017: Add annual expense + mileage columns to history_items
-- Enables year-over-year expense comparison on the Expenses page.
-- Agents can record their total annual expenses (and mileage deduction) for
-- past years so the app can show trend analysis.

ALTER TABLE history_items
  ADD COLUMN IF NOT EXISTS annual_expenses       NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS annual_mileage_km     NUMERIC(10,1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS annual_mileage_deduct NUMERIC(12,2) NOT NULL DEFAULT 0;
