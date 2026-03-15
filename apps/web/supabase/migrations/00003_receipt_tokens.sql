-- ============================================================
-- Migration 00003 — Receipt Upload Tokens
-- Supports the desktop → phone QR handoff capture mode.
-- ============================================================

-- ── Table ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.receipt_upload_tokens (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Securely random 64-char hex string used in the phone URL
  token         text         NOT NULL UNIQUE,

  -- 5-minute window
  expires_at    timestamptz  NOT NULL DEFAULT (now() + interval '5 minutes'),

  -- Lifecycle
  used          boolean      NOT NULL DEFAULT false,

  -- Result written by the mobile-upload API after OCR completes
  -- pending | complete | error
  status        text         NOT NULL DEFAULT 'pending',
  receipt_path  text,                             -- Supabase storage path
  extraction_result jsonb,                        -- OcrExtraction JSON
  error_message text,                             -- set on status = 'error'

  created_at    timestamptz  NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS receipt_upload_tokens_token_idx
  ON public.receipt_upload_tokens (token);

CREATE INDEX IF NOT EXISTS receipt_upload_tokens_user_id_idx
  ON public.receipt_upload_tokens (user_id);

-- Auto-expire: clean up tokens older than 1 hour (belt-and-suspenders)
CREATE INDEX IF NOT EXISTS receipt_upload_tokens_expires_idx
  ON public.receipt_upload_tokens (expires_at);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.receipt_upload_tokens ENABLE ROW LEVEL SECURITY;

-- Owners can read their own tokens (for polling)
CREATE POLICY "Users can read own tokens"
  ON public.receipt_upload_tokens
  FOR SELECT
  USING (auth.uid() = user_id);

-- Owners can create tokens for themselves
CREATE POLICY "Users can insert own tokens"
  ON public.receipt_upload_tokens
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- NOTE: Updates (marking used/complete) are done via the service-role
-- admin client in the API route — no UPDATE policy needed for anon.
