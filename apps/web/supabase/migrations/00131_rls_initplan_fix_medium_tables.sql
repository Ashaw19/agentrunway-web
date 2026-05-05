-- 00131 · RLS initplan fix — medium-traffic tables (Phase 1b)
--
-- Continues the rewrite from 00129. All 19 policies on these 5 tables
-- follow the simple `auth.uid() = user_id` (or `id = auth.uid()` for
-- profiles) shape — mechanical rewrite to (SELECT auth.uid()).

-- ── profiles (3 policies) ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Profiles: insert own" ON public.profiles;
CREATE POLICY "Profiles: insert own"
  ON public.profiles FOR INSERT
  TO public
  WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Profiles: select own" ON public.profiles;
CREATE POLICY "Profiles: select own"
  ON public.profiles FOR SELECT
  TO public
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Profiles: update own" ON public.profiles;
CREATE POLICY "Profiles: update own"
  ON public.profiles FOR UPDATE
  TO public
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- ── recurring_expense_entries (4 policies) ───────────────────────────────
DROP POLICY IF EXISTS "recurring_entries_delete" ON public.recurring_expense_entries;
CREATE POLICY "recurring_entries_delete"
  ON public.recurring_expense_entries FOR DELETE
  TO public
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "recurring_entries_insert" ON public.recurring_expense_entries;
CREATE POLICY "recurring_entries_insert"
  ON public.recurring_expense_entries FOR INSERT
  TO public
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "recurring_entries_select" ON public.recurring_expense_entries;
CREATE POLICY "recurring_entries_select"
  ON public.recurring_expense_entries FOR SELECT
  TO public
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "recurring_entries_update" ON public.recurring_expense_entries;
CREATE POLICY "recurring_entries_update"
  ON public.recurring_expense_entries FOR UPDATE
  TO public
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ── recurring_expenses (4 policies) ──────────────────────────────────────
DROP POLICY IF EXISTS "recurring_expenses_delete" ON public.recurring_expenses;
CREATE POLICY "recurring_expenses_delete"
  ON public.recurring_expenses FOR DELETE
  TO public
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "recurring_expenses_insert" ON public.recurring_expenses;
CREATE POLICY "recurring_expenses_insert"
  ON public.recurring_expenses FOR INSERT
  TO public
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "recurring_expenses_select" ON public.recurring_expenses;
CREATE POLICY "recurring_expenses_select"
  ON public.recurring_expenses FOR SELECT
  TO public
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "recurring_expenses_update" ON public.recurring_expenses;
CREATE POLICY "recurring_expenses_update"
  ON public.recurring_expenses FOR UPDATE
  TO public
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ── social_connections (4 policies) ──────────────────────────────────────
DROP POLICY IF EXISTS "social_connections_delete" ON public.social_connections;
CREATE POLICY "social_connections_delete"
  ON public.social_connections FOR DELETE
  TO public
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "social_connections_insert" ON public.social_connections;
CREATE POLICY "social_connections_insert"
  ON public.social_connections FOR INSERT
  TO public
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "social_connections_select" ON public.social_connections;
CREATE POLICY "social_connections_select"
  ON public.social_connections FOR SELECT
  TO public
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "social_connections_update" ON public.social_connections;
CREATE POLICY "social_connections_update"
  ON public.social_connections FOR UPDATE
  TO public
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ── social_posts (4 policies) ────────────────────────────────────────────
DROP POLICY IF EXISTS "social_posts_delete" ON public.social_posts;
CREATE POLICY "social_posts_delete"
  ON public.social_posts FOR DELETE
  TO public
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "social_posts_insert" ON public.social_posts;
CREATE POLICY "social_posts_insert"
  ON public.social_posts FOR INSERT
  TO public
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "social_posts_select" ON public.social_posts;
CREATE POLICY "social_posts_select"
  ON public.social_posts FOR SELECT
  TO public
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "social_posts_update" ON public.social_posts;
CREATE POLICY "social_posts_update"
  ON public.social_posts FOR UPDATE
  TO public
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
