-- Migration 00144: corp_documents
--
-- Governance document storage for Agent Runway Inc. (Director Cockpit).
-- Stores minute-book entries, board resolutions, signed contracts, and
-- correspondence uploaded through the Documents tab.
--
-- This migration also creates the private corp-documents storage bucket
-- with path-scoped RLS policies.
--
-- Applied to production 2026-05-07 via Supabase MCP before this file
-- was committed; idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING).

-- ── Storage bucket ────────────────────────────────────────────────────────────
-- Private bucket: 50 MB per file, PDF/doc/image types.
-- Path convention: corp-documents/{user_id}/{document_type}/{date}_{filename}
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'corp-documents',
  'corp-documents',
  false,
  52428800,  -- 50 MB
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: path-scoped to user_id (first folder segment).
DROP POLICY IF EXISTS "corp_docs_insert" ON storage.objects;
CREATE POLICY "corp_docs_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'corp-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "corp_docs_select" ON storage.objects;
CREATE POLICY "corp_docs_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'corp-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "corp_docs_delete" ON storage.objects;
CREATE POLICY "corp_docs_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'corp-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── corp_documents table ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS corp_documents (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type    TEXT        NOT NULL CHECK (document_type IN (
                                 'minutes', 'resolution', 'contract',
                                 'correspondence', 'other'
                               )),
  title            TEXT        NOT NULL,
  description      TEXT        NULL,
  document_date    DATE        NOT NULL,
  fiscal_year      INTEGER     NOT NULL,
  storage_path     TEXT        NOT NULL,
  file_name        TEXT        NOT NULL,
  file_size_bytes  BIGINT      NULL,
  mime_type        TEXT        NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_corp_doc_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_corp_doc_updated_at
  BEFORE UPDATE ON corp_documents
  FOR EACH ROW EXECUTE FUNCTION set_corp_doc_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_corp_docs_user_date
  ON corp_documents (user_id, document_date DESC);

CREATE INDEX IF NOT EXISTS idx_corp_docs_user_type
  ON corp_documents (user_id, document_type);

CREATE INDEX IF NOT EXISTS idx_corp_docs_user_fiscal_year
  ON corp_documents (user_id, fiscal_year DESC);

-- ── RLS ────────────────────────────────────────────────────────────────────────

ALTER TABLE corp_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "corp_documents_select"
  ON corp_documents FOR SELECT
  USING (cockpit_has_access());

CREATE POLICY "corp_documents_insert"
  ON corp_documents FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND cockpit_has_access()
  );

CREATE POLICY "corp_documents_update"
  ON corp_documents FOR UPDATE
  USING (cockpit_has_access())
  WITH CHECK (
    user_id = auth.uid()
    AND cockpit_has_access()
  );

CREATE POLICY "corp_documents_delete"
  ON corp_documents FOR DELETE
  USING (cockpit_has_access());
