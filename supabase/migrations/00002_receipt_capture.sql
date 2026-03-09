-- ============================================================================
-- 00002_receipt_capture.sql
-- Receipt capture feature: individual expense records from receipt photos
-- ============================================================================

-- ── Storage bucket ────────────────────────────────────────────────────────────
-- Create a private bucket for receipt images.
-- Run this once; safe to re-run (ON CONFLICT DO NOTHING).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  false,                                        -- private bucket
  10485760,                                     -- 10 MB max per file
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/heic','image/heif']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: each user can only access their own receipt images.
-- Path convention: receipts/{user_id}/{filename}
CREATE POLICY "Users upload own receipts"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'receipts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users read own receipts"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'receipts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users delete own receipts"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'receipts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── receipt_expenses table ────────────────────────────────────────────────────
-- Stores individual expense records captured from receipt photos.
-- Intentionally standalone — not coupled to the budget-style expense_categories
-- / expense_items system. These are individual receipt transactions.

CREATE TABLE IF NOT EXISTS receipt_expenses (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Core receipt fields (all nullable — OCR may miss some)
  vendor          TEXT,
  expense_date    DATE,
  total_amount    NUMERIC(10,2),
  tax_amount      NUMERIC(10,2),
  subtotal        NUMERIC(10,2),
  currency        TEXT          NOT NULL DEFAULT 'CAD',

  -- Category maps to expense_categories.key (vehicle, marketing, etc.)
  -- Stored as a plain text key so it works even if categories are customised later.
  category_key    TEXT,

  -- Free-text notes; optional
  notes           TEXT,

  -- Supabase Storage path: receipts/{user_id}/{uuid}.jpg
  -- Used to generate signed URLs on demand.
  receipt_path    TEXT,

  -- OCR metadata — useful for debugging and future confidence-based UI
  ocr_confidence  NUMERIC(3,2),   -- 0.00–1.00
  ocr_raw         JSONB,          -- raw Groq extraction (fields as returned)

  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE receipt_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own receipt expenses"
  ON receipt_expenses FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX idx_receipt_expenses_user     ON receipt_expenses (user_id);
CREATE INDEX idx_receipt_expenses_date     ON receipt_expenses (user_id, expense_date DESC);
CREATE INDEX idx_receipt_expenses_category ON receipt_expenses (user_id, category_key);

-- ── Auto-update updated_at ────────────────────────────────────────────────────
-- Reuse the existing trigger function from migration 00001
CREATE TRIGGER trg_receipt_expenses_updated
  BEFORE UPDATE ON receipt_expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
