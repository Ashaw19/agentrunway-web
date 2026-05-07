-- ============================================================================
-- Migration 00141 — Director Cockpit corp_compliance_events (Phase 2 / Build #8)
--
-- The Compliance Calendar is the corporate-side answer to "what's coming due
-- and when?". It surfaces:
--
--   - T2 corporate income tax filing + payment deadline (6 months after FYE
--     for filing, 2 months after FYE for the balance — 3 months for CCPCs
--     claiming the SBD)
--   - HST quarterly filing deadlines (1 month after period close)
--   - GST/HST instalment dates (Mar 31, Jun 30, Sep 30, Dec 31 for annual filers)
--   - NB / federal annual return (within 60 days of anniversary date)
--   - T4 / T4A slip filing (Feb 28 if payroll elected)
--   - Minute-book updates (annual, anniversary)
--   - Insurance renewals (E&O, general liability, D&O — once those are bound)
--
-- The schema is built so:
--   1. Events are seeded once at install time (the bedrock recurring set).
--   2. Each fiscal year, recurring events get rolled forward into the next
--      year's calendar with adjusted due_date. No per-year migration needed.
--   3. Andrew (or the scheduled routines: Vera monthly, Quinn quarterly,
--      Tessa annual) can post one-off compliance events via INSERT.
--   4. Events have a "completed" notion (NULL = upcoming/overdue, NOT NULL =
--      done). Mirrors corp_inbox_items.resolved_at.
--
-- Schema design notes
-- -------------------
-- `kind`: enumerated category. Stored as TEXT so additions don't require a
--   migration. Known values at install:
--     'cra-t2-filing', 'cra-t2-payment',
--     'cra-hst-filing', 'cra-hst-instalment',
--     'cra-payroll-t4', 'cra-payroll-source-deductions',
--     'corp-annual-return-federal', 'corp-annual-return-nb',
--     'corp-minute-book', 'corp-insurance-renewal',
--     'corp-other'
--
-- `severity`: 'low' | 'medium' | 'high'. Filing deadlines = high; minute
--   book = medium; insurance renewals = low (they have grace periods).
--
-- `recurring_pattern`: NULL for one-off events; otherwise a TEXT pattern like
--   'annual' | 'quarterly' | 'monthly' | 'fiscal-anniversary'. The roll-forward
--   logic uses this to know which events need cloning into next FY.
--
-- `source_ref_id`: optional pointer to the originating record (e.g. an
--   insurance-policy UUID, or a corp_transactions UUID that triggered a
--   filing review). Same pattern as corp_inbox_items.source_ref_id.
--
-- `notes`: free-form text — Andrew's reminder to himself, Vera's framing,
--   the accountant's note. Mirrors how corp_brief_entries.content_md works.
--
-- RLS: standard cockpit_has_access() guard.
-- ============================================================================

CREATE TABLE IF NOT EXISTS corp_compliance_events (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  title              TEXT        NOT NULL,
  kind               TEXT        NOT NULL DEFAULT 'corp-other',

  due_date           DATE        NOT NULL,
  severity           TEXT        NOT NULL DEFAULT 'medium'
                                 CONSTRAINT corp_compliance_severity_chk
                                 CHECK (severity IN ('low', 'medium', 'high')),

  recurring_pattern  TEXT        NULL
                                 CONSTRAINT corp_compliance_recurring_chk
                                 CHECK (recurring_pattern IS NULL
                                        OR recurring_pattern IN
                                           ('annual', 'quarterly', 'monthly', 'fiscal-anniversary')),

  source_ref_id      TEXT        NULL,
  notes              TEXT        NULL,

  completed_at       TIMESTAMPTZ NULL,
  completed_note     TEXT        NULL,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE corp_compliance_events IS
  'Director Cockpit compliance calendar. T2 / HST / payroll / annual return /
   minute book / insurance renewal deadlines for AR Inc. Andrew (and the
   scheduled routines Vera/Quinn/Tessa) post events; Andrew marks them
   complete. Recurring events roll forward by recurring_pattern.';

-- Fast Snapshot-card query: upcoming, not-yet-completed, by due_date
CREATE INDEX IF NOT EXISTS corp_compliance_user_upcoming_idx
  ON corp_compliance_events(user_id, due_date ASC)
  WHERE completed_at IS NULL;

-- Lookup by kind (e.g. all 'cra-hst-instalment' for an annual roll-up)
CREATE INDEX IF NOT EXISTS corp_compliance_user_kind_idx
  ON corp_compliance_events(user_id, kind, due_date ASC);


ALTER TABLE corp_compliance_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "corp_compliance: select cockpit" ON corp_compliance_events;
CREATE POLICY "corp_compliance: select cockpit"
  ON corp_compliance_events FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );

DROP POLICY IF EXISTS "corp_compliance: insert cockpit" ON corp_compliance_events;
CREATE POLICY "corp_compliance: insert cockpit"
  ON corp_compliance_events FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );

DROP POLICY IF EXISTS "corp_compliance: update cockpit" ON corp_compliance_events;
CREATE POLICY "corp_compliance: update cockpit"
  ON corp_compliance_events FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );

DROP POLICY IF EXISTS "corp_compliance: delete cockpit" ON corp_compliance_events;
CREATE POLICY "corp_compliance: delete cockpit"
  ON corp_compliance_events FOR DELETE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND cockpit_has_access()
  );


-- ============================================================================
-- Reporting view: v_corp_upcoming_compliance
--
-- Surfaces upcoming + recently-overdue events with a computed urgency tier so
-- the Snapshot card and the Director persona can both consume the same shape.
--
-- Urgency tiers (mirrors apps/web/lib/cockpit/deadlines pattern):
--   'overdue'  — due_date < today, not completed
--   'critical' — due_date within 7 days
--   'soon'     — due_date within 30 days
--   'upcoming' — due_date > 30 days
-- ============================================================================

CREATE OR REPLACE VIEW v_corp_upcoming_compliance AS
SELECT
  c.id,
  c.user_id,
  c.title,
  c.kind,
  c.due_date,
  c.severity,
  c.recurring_pattern,
  c.notes,
  c.completed_at,
  c.created_at,
  (c.due_date - CURRENT_DATE) AS days_until_due,
  CASE
    WHEN c.due_date < CURRENT_DATE THEN 'overdue'
    WHEN c.due_date <= CURRENT_DATE + INTERVAL '7 days'  THEN 'critical'
    WHEN c.due_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'soon'
    ELSE 'upcoming'
  END AS urgency
FROM corp_compliance_events c
WHERE c.completed_at IS NULL
ORDER BY c.due_date ASC;

COMMENT ON VIEW v_corp_upcoming_compliance IS
  'Open compliance events with urgency tier. Used by /cockpit/compliance,
   the Snapshot card, and the Director persona upcomingCompliance() tool.';
