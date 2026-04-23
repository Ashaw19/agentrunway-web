-- Fix T2-2: recurring_expenses and recurring_expense_entries UPDATE policies
-- were missing WITH CHECK, allowing a user to change user_id on their own row
-- to another user's UUID after the pre-update USING check passes.
--
-- Fix T2-3: social_connections and social_posts used FOR ALL USING without an
-- explicit WITH CHECK. Splitting into discrete operations makes the intent
-- explicit and prevents future overlay policies from inadvertently weakening
-- INSERT/UPDATE protection.

-- ── recurring_expenses ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS recurring_expenses_update ON recurring_expenses;

CREATE POLICY recurring_expenses_update ON recurring_expenses
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── recurring_expense_entries ─────────────────────────────────────────────────

DROP POLICY IF EXISTS recurring_entries_update ON recurring_expense_entries;

CREATE POLICY recurring_entries_update ON recurring_expense_entries
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── social_connections ────────────────────────────────────────────────────────
-- Replace FOR ALL with explicit per-operation policies.

DROP POLICY IF EXISTS "social_connections_user" ON social_connections;

CREATE POLICY social_connections_select ON social_connections
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY social_connections_insert ON social_connections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY social_connections_update ON social_connections
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY social_connections_delete ON social_connections
  FOR DELETE USING (auth.uid() = user_id);

-- ── social_posts ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "social_posts_user" ON social_posts;

CREATE POLICY social_posts_select ON social_posts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY social_posts_insert ON social_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY social_posts_update ON social_posts
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY social_posts_delete ON social_posts
  FOR DELETE USING (auth.uid() = user_id);
