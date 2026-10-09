-- ============================================================================
-- Migration 00172: Checklist — record how an item was done
--
-- The Checklist page (2026-10-09) is the existing task list (contact_tasks).
-- Ticking off a client item asks how the agent reached them; "Done this
-- week" shows it ("Called · Tue"). completed_via stores that answer:
--   call | text | email | meeting   the contact was also logged as an activity
--   done                            marked done, nothing logged
-- NULL for items completed before this column existed, and for open items.
--
-- Partial index: the page reads each user's items completed in the last week.
-- ============================================================================

ALTER TABLE public.contact_tasks
  ADD COLUMN IF NOT EXISTS completed_via text;

ALTER TABLE public.contact_tasks
  DROP CONSTRAINT IF EXISTS contact_tasks_completed_via_check;
ALTER TABLE public.contact_tasks
  ADD CONSTRAINT contact_tasks_completed_via_check
  CHECK (completed_via IS NULL OR completed_via IN ('call', 'text', 'email', 'meeting', 'done'));

COMMENT ON COLUMN public.contact_tasks.completed_via IS
  'How a checklist item was completed: call/text/email/meeting (contact logged '
  'on the client profile) or done. NULL = open, or completed before 00172.';

CREATE INDEX IF NOT EXISTS contact_tasks_completed_idx
  ON public.contact_tasks (user_id, completed_at)
  WHERE completed_at IS NOT NULL;
