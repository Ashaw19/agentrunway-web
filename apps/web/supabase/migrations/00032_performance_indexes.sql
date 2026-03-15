-- Performance indexes for most frequent query patterns
-- All IF NOT EXISTS — idempotent, safe to re-run

-- Transactions: user timeline queries (dashboard, forecast, reports)
CREATE INDEX IF NOT EXISTS idx_transactions_user_date
  ON transactions (user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_user_status_date
  ON transactions (user_id, status, date DESC);

-- Pipeline deals
CREATE INDEX IF NOT EXISTS idx_pipeline_deals_user
  ON pipeline_deals (user_id);

-- Receipt expenses: YTD totals + per-category rollups
CREATE INDEX IF NOT EXISTS idx_receipt_expenses_user_date
  ON receipt_expenses (user_id, expense_date DESC);

CREATE INDEX IF NOT EXISTS idx_receipt_expenses_user_key
  ON receipt_expenses (user_id, category_key);

-- Expense items
CREATE INDEX IF NOT EXISTS idx_expense_items_user
  ON expense_items (user_id);

CREATE INDEX IF NOT EXISTS idx_expense_items_category
  ON expense_items (category_id);

-- History items: seasonality + YoY comparison
CREATE INDEX IF NOT EXISTS idx_history_items_user_year
  ON history_items (user_id, year DESC);

-- Mileage logs
CREATE INDEX IF NOT EXISTS idx_mileage_logs_user_date
  ON mileage_logs (user_id, trip_date DESC);

-- CRM activities: stale lead detection + timeline
CREATE INDEX IF NOT EXISTS idx_contact_activities_client_date
  ON contact_activities (client_id, created_at DESC);
