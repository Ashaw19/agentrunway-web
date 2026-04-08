-- Backfill clients.first_name / clients.last_name for rows that were
-- inserted after migration 00045 through the broken Add Client modal
-- or the CSV import path, both of which only wrote `name` and left
-- first_name / last_name NULL. The code paths have now been fixed to
-- populate both columns on insert; this migration repairs historical rows.
--
-- Idempotent: only touches rows where first_name IS NULL AND last_name IS NULL,
-- and skips rows with a blank/NULL `name`. Safe to re-run.

UPDATE clients
SET
  first_name = split_part(trim(name), ' ', 1),
  last_name  = NULLIF(
    trim(substring(trim(name) FROM position(' ' IN trim(name)) + 1)),
    ''
  )
WHERE first_name IS NULL
  AND last_name  IS NULL
  AND name IS NOT NULL
  AND trim(name) != '';

NOTIFY pgrst, 'reload schema';
