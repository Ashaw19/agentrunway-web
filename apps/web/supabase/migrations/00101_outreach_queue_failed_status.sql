-- ============================================================================
-- Migration 00101: Allow 'failed' status on outreach_queue
--
-- Needed so the send endpoint can mark items that error out during
-- delivery without leaving them stuck in 'ready'.
-- ============================================================================

ALTER TABLE outreach_queue
  DROP CONSTRAINT outreach_queue_status_check;

ALTER TABLE outreach_queue
  ADD CONSTRAINT outreach_queue_status_check
  CHECK (status IN ('draft', 'ready', 'sent', 'skipped', 'failed'));
