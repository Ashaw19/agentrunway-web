-- ============================================================================
-- Extend import_telemetry to support error events and batch saves.
--
-- event_type: distinguishes successful single-year saves ('save'),
--             multi-year batch saves ('batch_save'), and failed imports ('error').
--             Defaults to 'save' so existing rows are unaffected.
--
-- error_category: sanitized error bucket for failed imports. Never stores
--                 raw error messages or document content.
--
-- file_type: the detected file type at upload time. Useful for correlating
--            error rates and edit rates with file format. Stored on all events.
-- ============================================================================

ALTER TABLE import_telemetry
  ADD COLUMN IF NOT EXISTS event_type     TEXT NOT NULL DEFAULT 'save',
  ADD COLUMN IF NOT EXISTS error_category TEXT,          -- null for non-error events
  ADD COLUMN IF NOT EXISTS file_type      TEXT;          -- 'pdf' | 'image' | 'excel' | 'csv' | 'txt'

COMMENT ON COLUMN import_telemetry.event_type IS
  '''save'' = single-year import saved; ''batch_save'' = multi-year Excel import saved; ''error'' = import failed before save';
COMMENT ON COLUMN import_telemetry.error_category IS
  'Sanitized error bucket for failed imports. Never contains raw error text or financial content.';
COMMENT ON COLUMN import_telemetry.file_type IS
  'Detected file type at upload: pdf | image | excel | csv | txt';
