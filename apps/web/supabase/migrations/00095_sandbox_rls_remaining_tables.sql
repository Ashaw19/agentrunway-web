-- Add sandbox RESTRICTIVE policies to remaining tables missing guards

-- market_data_snapshots (migration 00076)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sandbox_block_market_data_snapshots') THEN
    CREATE POLICY sandbox_block_market_data_snapshots ON market_data_snapshots
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

-- push_tokens (migration 00077)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sandbox_block_push_tokens') THEN
    CREATE POLICY sandbox_block_push_tokens ON push_tokens
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

-- notification_preferences (migration 00077)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sandbox_block_notification_preferences') THEN
    CREATE POLICY sandbox_block_notification_preferences ON notification_preferences
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

-- notification_log (migration 00077)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sandbox_block_notification_log') THEN
    CREATE POLICY sandbox_block_notification_log ON notification_log
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

-- testimonials (migration 00086)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sandbox_block_testimonials') THEN
    CREATE POLICY sandbox_block_testimonials ON testimonials
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

-- ai_knowledge_audit_log (migration 00088)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sandbox_block_ai_knowledge_audit_log') THEN
    CREATE POLICY sandbox_block_ai_knowledge_audit_log ON ai_knowledge_audit_log
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

-- accountant_shares (migration 00070) — uses admin client for access-count updates,
-- but the RLS guard will only affect authenticated (non-service-role) callers
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sandbox_block_accountant_shares') THEN
    CREATE POLICY sandbox_block_accountant_shares ON accountant_shares
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
