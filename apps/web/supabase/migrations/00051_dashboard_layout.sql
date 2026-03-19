-- Stores drag-and-drop card layout for the dashboard.
-- Format: { "order": ["kpi_row","tasks",...], "hidden": ["corp_tax","tax_savings"] }

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS dashboard_layout jsonb;
