-- Split client name into first_name + last_name
-- Existing name field is kept as the canonical display name.
-- Back-fill splits on the first space.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name  text;

-- Back-fill from existing name (split on first space)
UPDATE clients
SET
  first_name = split_part(trim(name), ' ', 1),
  last_name  = NULLIF(trim(substring(trim(name) FROM position(' ' IN trim(name)) + 1)), '')
WHERE first_name IS NULL AND name IS NOT NULL AND trim(name) != '';

NOTIFY pgrst, 'reload schema';
