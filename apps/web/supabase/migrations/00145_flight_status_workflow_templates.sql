-- Migration 00145: Flight Status workflow templates + drafts
--
-- Phase 2.3 of the HML gap-closure plan: a library of pre-built email
-- sequences keyed to Flight Status transitions. When an agent moves a
-- client to a new stage, the CRM client detail panel surfaces matching
-- templates and the agent clicks "Draft" to generate one — fully
-- on-demand, no auto-trigger, no auto-send. CASL posture: drafts are text
-- the agent reviews and copies into their own email client. No CASA-
-- shelved Gmail/Workspace integration involved.
--
-- Two tables:
--   workflow_templates — the catalog (6 system rows seeded with
--                        user_id IS NULL; per-user customization is a
--                        future extension that does not need a schema
--                        change)
--   workflow_drafts    — the generated drafts (one row per click of
--                        "Draft" on a template; status pending/sent/
--                        dismissed tracks the agent's lifecycle)
--
-- RLS:
--   workflow_templates — authenticated users SELECT system rows
--                        (user_id IS NULL) plus their own rows; INSERT/
--                        UPDATE/DELETE only their own rows
--   workflow_drafts    — full ownership scope on user_id = auth.uid()

-- ── workflow_templates ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_templates (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NULL = system template (visible to every authenticated user).
  -- Non-NULL = a user's private custom template (not yet exposed in UI;
  -- column shape ready for the v1.1 extension).
  user_id           UUID          REFERENCES auth.users(id) ON DELETE CASCADE,

  trigger_event     TEXT          NOT NULL
    CONSTRAINT trigger_event_valid CHECK (trigger_event IN (
      'new_lead',
      'showing_scheduled',
      'listing_active',
      'transaction_milestone',
      'anniversary',
      'closing_day'
    )),

  name              TEXT          NOT NULL,
  subject_template  TEXT          NOT NULL,
  body_prompt       TEXT          NOT NULL,

  is_active         BOOLEAN       NOT NULL DEFAULT TRUE,

  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_templates_trigger
  ON workflow_templates (trigger_event)
  WHERE is_active = TRUE;

CREATE INDEX idx_workflow_templates_user
  ON workflow_templates (user_id)
  WHERE user_id IS NOT NULL;

ALTER TABLE workflow_templates ENABLE ROW LEVEL SECURITY;

-- Read: every authenticated user can read system rows (user_id IS NULL)
-- AND their own rows. Anonymous has no access.
CREATE POLICY "workflow_templates select system or own"
  ON workflow_templates FOR SELECT
  TO authenticated
  USING (user_id IS NULL OR user_id = (SELECT auth.uid()));

-- Write: users may only INSERT/UPDATE/DELETE rows they own. System rows
-- (user_id IS NULL) are read-only for everyone — they are seeded by
-- migration and will be edited via future migrations only.
CREATE POLICY "workflow_templates insert own"
  ON workflow_templates FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "workflow_templates update own"
  ON workflow_templates FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "workflow_templates delete own"
  ON workflow_templates FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE TRIGGER trg_workflow_templates_updated
  BEFORE UPDATE ON workflow_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── workflow_drafts ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_drafts (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id         UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id       UUID          NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  template_id     UUID          NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,

  trigger_event   TEXT          NOT NULL
    CONSTRAINT draft_trigger_event_valid CHECK (trigger_event IN (
      'new_lead',
      'showing_scheduled',
      'listing_active',
      'transaction_milestone',
      'anniversary',
      'closing_day'
    )),

  subject         TEXT          NOT NULL,
  body            TEXT          NOT NULL,

  status          TEXT          NOT NULL DEFAULT 'pending'
    CONSTRAINT draft_status_valid CHECK (status IN ('pending', 'sent', 'dismissed')),

  generated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_drafts_user_client
  ON workflow_drafts (user_id, client_id, generated_at DESC);

CREATE INDEX idx_workflow_drafts_pending
  ON workflow_drafts (user_id, client_id)
  WHERE status = 'pending';

ALTER TABLE workflow_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflow_drafts select own"
  ON workflow_drafts FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "workflow_drafts insert own"
  ON workflow_drafts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "workflow_drafts update own"
  ON workflow_drafts FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "workflow_drafts delete own"
  ON workflow_drafts FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE TRIGGER trg_workflow_drafts_updated
  BEFORE UPDATE ON workflow_drafts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Seed: 6 system templates (user_id IS NULL) ────────────────────────
INSERT INTO workflow_templates (user_id, trigger_event, name, subject_template, body_prompt)
VALUES
  (
    NULL,
    'new_lead',
    'Welcome — new client',
    'Welcome aboard, {{client_name}}',
    'Draft a warm introduction email welcoming {{client_name}} as a new client. Mention that you''re their dedicated agent and ask what kind of property they''re looking for or confirm the property they want to list. Keep it brief and genuine — under 150 words. End with a soft, specific next step (e.g. "happy to set up a quick call this week to walk through what you''re looking for"). Do NOT use phrases like "I hope this email finds you well" or "just touching base".'
  ),
  (
    NULL,
    'showing_scheduled',
    'Showing confirmation',
    'Confirming your showing — {{client_name}}',
    'Draft a showing confirmation email for {{client_name}}. Confirm the showing details and let them know you''re looking forward to walking through the property with them. Offer to answer any questions beforehand. Keep it under 120 words. End with a friendly close — not "Don''t miss out!". Do NOT use phrases like "I hope this email finds you well" or filler openers.'
  ),
  (
    NULL,
    'listing_active',
    'Listing live — sellers',
    'Your listing is live, {{client_name}}',
    'Draft an email to {{client_name}} marking that their listing is now active on the market. Keep the tone steady and confident — not breathless. Set expectations for what happens next (showings, feedback, offers) in plain language. Mention that you''ll keep them looped in on activity. Under 160 words. Do NOT promise specific outcomes, do NOT use phrases like "exciting news" or "thrilled to announce".'
  ),
  (
    NULL,
    'transaction_milestone',
    'Accepted offer',
    'Offer accepted — next steps',
    'Draft an email to {{client_name}} acknowledging that their offer has been accepted. Walk through the next steps in the transaction process clearly — conditions, financing, inspection windows, key dates — in plain language. Keep it warm but practical. Under 200 words. Do NOT use phrases like "exciting news" or "congratulations on your dream home". The tone is professional and clear, not breathless.'
  ),
  (
    NULL,
    'anniversary',
    'Home anniversary check-in',
    'Has it really been a year, {{client_name}}?',
    'Draft a friendly anniversary email to {{client_name}} marking the time since their purchase or sale. Ask how they''re settling in or how the property has performed for them. Offer to be a resource if they have any real estate questions or want a current value read on the home. Under 140 words. Do NOT push for a transaction. Do NOT use phrases like "I hope this email finds you well" or "just touching base".'
  ),
  (
    NULL,
    'closing_day',
    'Closing day — congratulations',
    'Big day, {{client_name}}',
    'Draft a closing day email to {{client_name}}. Acknowledge the work it took to get here, thank them for trusting you with the transaction, and offer to be a resource going forward (referrals, future moves, market questions). Under 140 words. Keep it sincere and steady — not over-the-top. Do NOT use phrases like "your dream home" or "exciting news".'
  );
