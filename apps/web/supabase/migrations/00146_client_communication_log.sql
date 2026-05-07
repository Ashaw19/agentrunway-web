-- Migration 00146: Client Communication Log
--
-- Phase 2.4 of the HML gap-closure plan: a per-client conversation timeline
-- panel ("Client Comms") in the CRM client detail. Because Gmail/Workspace
-- and all email integrations are CASA-shelved (see
-- memory/project_google_integrations.md), AR cannot read inbound replies
-- automatically. Instead, the agent pastes inbound replies (or jots a manual
-- note about a phone/text conversation) into a "Log reply" form. Combined
-- with workflow_drafts (Phase 2.3) and outreach_queue (Flight Control
-- briefing drafts), this produces a full reverse-chronological communication
-- timeline per client without any email integration.
--
-- CASL posture: rows here are agent notes — not automated commercial
-- messages. No consent regime applies to note-taking. Outbound rows logged
-- here represent communications the agent sent through their own external
-- email/SMS/phone channel.
--
-- Direction enum:
--   outbound — message the agent sent through their own channel (logged
--              after the fact, e.g. agent typed an email in Gmail and
--              pasted it here for record-keeping)
--   inbound  — message the agent received from the client (pasted in)
--   note     — free-form note about a conversation (phone, in-person,
--              text) that doesn't have a literal message body to capture

CREATE TABLE IF NOT EXISTS client_communication_log (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id      UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id    UUID          NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  direction    TEXT          NOT NULL
    CONSTRAINT communication_log_direction_valid CHECK (direction IN (
      'outbound',
      'inbound',
      'note'
    )),

  subject      TEXT,
  body         TEXT          NOT NULL,

  -- When the communication actually occurred (defaults to insert time but
  -- the form lets the agent backdate to "yesterday" if they're catching
  -- up on a thread).
  logged_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),

  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Primary read index: list timeline for a single client, newest first.
CREATE INDEX idx_client_communication_log_client_logged
  ON client_communication_log (user_id, client_id, logged_at DESC);

-- Secondary read index for any user-scoped audit/export.
CREATE INDEX idx_client_communication_log_user_logged
  ON client_communication_log (user_id, logged_at DESC);

ALTER TABLE client_communication_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_communication_log select own"
  ON client_communication_log FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "client_communication_log insert own"
  ON client_communication_log FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "client_communication_log update own"
  ON client_communication_log FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "client_communication_log delete own"
  ON client_communication_log FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE TRIGGER trg_client_communication_log_updated
  BEFORE UPDATE ON client_communication_log
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
