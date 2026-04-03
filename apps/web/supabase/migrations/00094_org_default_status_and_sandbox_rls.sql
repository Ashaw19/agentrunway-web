-- Fix: organizations.subscription_status should NOT default to 'active'
-- New orgs must go through Stripe checkout to become active
ALTER TABLE organizations ALTER COLUMN subscription_status SET DEFAULT 'inactive';

-- Add sandbox RESTRICTIVE policies to tables created after migration 00066
-- These tables were missing sandbox write guards

-- client_memory_profiles (migration 00073)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sandbox_block_client_memory_profiles') THEN
    CREATE POLICY sandbox_block_client_memory_profiles ON client_memory_profiles
      AS RESTRICTIVE FOR ALL TO authenticated
      USING (
        NOT EXISTS (
          SELECT 1 FROM user_settings us
          WHERE us.user_id = auth.uid() AND us.sandbox_mode = true
        )
        OR current_setting('role') = 'service_role'
      );
  END IF;
END $$;

-- client_notes (migration 00074)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sandbox_block_client_notes') THEN
    CREATE POLICY sandbox_block_client_notes ON client_notes
      AS RESTRICTIVE FOR ALL TO authenticated
      USING (
        NOT EXISTS (
          SELECT 1 FROM user_settings us
          WHERE us.user_id = auth.uid() AND us.sandbox_mode = true
        )
        OR current_setting('role') = 'service_role'
      );
  END IF;
END $$;

-- chat_analytics (migration 00088)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sandbox_block_chat_analytics') THEN
    CREATE POLICY sandbox_block_chat_analytics ON chat_analytics
      AS RESTRICTIVE FOR ALL TO authenticated
      USING (
        NOT EXISTS (
          SELECT 1 FROM user_settings us
          WHERE us.user_id = auth.uid() AND us.sandbox_mode = true
        )
        OR current_setting('role') = 'service_role'
      );
  END IF;
END $$;

-- referrals (migration 00069)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sandbox_block_referrals') THEN
    CREATE POLICY sandbox_block_referrals ON referrals
      AS RESTRICTIVE FOR ALL TO authenticated
      USING (
        NOT EXISTS (
          SELECT 1 FROM user_settings us
          WHERE us.user_id = auth.uid() AND us.sandbox_mode = true
        )
        OR current_setting('role') = 'service_role'
      );
  END IF;
END $$;

-- recruitment_pages (migration 00071)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sandbox_block_recruitment_pages') THEN
    CREATE POLICY sandbox_block_recruitment_pages ON recruitment_pages
      AS RESTRICTIVE FOR ALL TO authenticated
      USING (
        NOT EXISTS (
          SELECT 1 FROM user_settings us
          WHERE us.user_id = auth.uid() AND us.sandbox_mode = true
        )
        OR current_setting('role') = 'service_role'
      );
  END IF;
END $$;

-- recruitment_applications (migration 00071)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sandbox_block_recruitment_applications') THEN
    CREATE POLICY sandbox_block_recruitment_applications ON recruitment_applications
      AS RESTRICTIVE FOR ALL TO authenticated
      USING (
        NOT EXISTS (
          SELECT 1 FROM user_settings us
          WHERE us.user_id = auth.uid() AND us.sandbox_mode = true
        )
        OR current_setting('role') = 'service_role'
      );
  END IF;
END $$;
