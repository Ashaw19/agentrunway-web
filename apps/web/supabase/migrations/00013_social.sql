-- ============================================================================
-- Migration 00013 — Social Media Studio
-- Tables for Meta account connections and saved post drafts
-- ============================================================================

-- ── Social connections (Meta OAuth tokens) ───────────────────────────────────

CREATE TABLE social_connections (
  id                            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform                      TEXT        NOT NULL CHECK (platform IN ('instagram', 'facebook')),

  account_id                    TEXT,                        -- IG or Page account ID
  account_name                  TEXT,                        -- display name
  access_token                  TEXT,                        -- long-lived user access token
  token_expires_at              TIMESTAMPTZ,

  -- Instagram-specific
  instagram_business_account_id TEXT,                        -- the IG Business Account ID

  -- Facebook-specific
  page_id                       TEXT,                        -- Facebook Page ID
  page_access_token             TEXT,                        -- page-scoped access token

  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, platform)
);

ALTER TABLE social_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "social_connections_user" ON social_connections
  FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER social_connections_updated_at
  BEFORE UPDATE ON social_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Social posts (saved drafts / published posts) ────────────────────────────

CREATE TABLE social_posts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  title            TEXT,
  month            INTEGER     CHECK (month BETWEEN 1 AND 12),
  year             INTEGER,

  template_style   TEXT        NOT NULL DEFAULT 'classic'
                               CHECK (template_style IN ('classic', 'bold', 'minimal')),
  platform         TEXT        NOT NULL DEFAULT 'instagram'
                               CHECK (platform IN ('instagram', 'facebook')),

  transaction_ids  UUID[],                -- selected deal IDs
  caption          TEXT,

  status           TEXT        NOT NULL DEFAULT 'draft'
                               CHECK (status IN ('draft', 'published')),
  published_at     TIMESTAMPTZ,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "social_posts_user" ON social_posts
  FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER social_posts_updated_at
  BEFORE UPDATE ON social_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
