-- Migration 00025: Auto-grant admin + professional to founder emails on signup
--
-- Rewrites handle_new_user() so that specific emails are automatically set to
-- subscription_tier = 'professional', subscription_status = 'active', is_admin = true.
-- Everyone else gets the normal defaults.
--
-- To add more admin emails later, just add them to the ARRAY below and re-run.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _admin_emails text[] := ARRAY[
    'andrew@andrewshaw.ca',
    'erin@ellisrealty.ca'
  ];
BEGIN
  IF NEW.email = ANY(_admin_emails) THEN
    INSERT INTO user_settings (user_id, subscription_tier, subscription_status, is_admin)
    VALUES (NEW.id, 'professional', 'active', true);
  ELSE
    INSERT INTO user_settings (user_id) VALUES (NEW.id);
  END IF;

  PERFORM seed_default_expenses(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
