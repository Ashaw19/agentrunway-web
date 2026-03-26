-- Migration 00071 — Brokerage recruitment pages
--
-- Allows team leaders to create a branded, public recruitment page
-- that showcases team stats and an application form.

CREATE TABLE recruitment_pages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  is_active   BOOLEAN NOT NULL DEFAULT true,

  -- Content
  headline       TEXT NOT NULL DEFAULT 'Join Our Team',
  description    TEXT NOT NULL DEFAULT '',
  team_photo_url TEXT DEFAULT '',

  -- What to show
  show_team_stats    BOOLEAN NOT NULL DEFAULT true,
  show_value_props   BOOLEAN NOT NULL DEFAULT true,
  show_testimonials  BOOLEAN NOT NULL DEFAULT false,
  custom_values      JSONB DEFAULT '[]',  -- [{title, description}]

  -- Application form
  application_email  TEXT DEFAULT '',  -- where to send applications
  require_resume     BOOLEAN DEFAULT false,

  -- Analytics
  view_count         INTEGER NOT NULL DEFAULT 0,
  application_count  INTEGER NOT NULL DEFAULT 0,
  last_viewed_at     TIMESTAMPTZ,

  -- Metadata
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update timestamp
CREATE TRIGGER recruitment_pages_updated_at
  BEFORE UPDATE ON recruitment_pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Index for fast token lookup
CREATE INDEX idx_recruitment_pages_token ON recruitment_pages (token) WHERE is_active = true;

-- RLS
ALTER TABLE recruitment_pages ENABLE ROW LEVEL SECURITY;

-- Org owners/admins can manage recruitment pages
CREATE POLICY "Org admins manage recruitment pages"
  ON recruitment_pages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.org_id = recruitment_pages.org_id
      AND organization_members.user_id = auth.uid()
      AND organization_members.role IN ('owner', 'admin', 'team_leader')
    )
  );

-- Store applications
CREATE TABLE recruitment_applications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recruitment_page_id UUID NOT NULL REFERENCES recruitment_pages(id) ON DELETE CASCADE,
  applicant_name    TEXT NOT NULL,
  applicant_email   TEXT NOT NULL,
  applicant_phone   TEXT DEFAULT '',
  years_experience  INTEGER DEFAULT 0,
  current_brokerage TEXT DEFAULT '',
  message           TEXT DEFAULT '',
  resume_url        TEXT DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new', 'contacted', 'interviewing', 'offered', 'hired', 'declined')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE recruitment_applications ENABLE ROW LEVEL SECURITY;

-- Org admins can view applications for their pages
CREATE POLICY "Org admins view applications"
  ON recruitment_applications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM recruitment_pages rp
      JOIN organization_members om ON om.org_id = rp.org_id
      WHERE rp.id = recruitment_applications.recruitment_page_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin', 'team_leader')
    )
  );
