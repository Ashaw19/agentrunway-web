-- Add has_seen_tour flag to user_settings for first-login walkthrough
ALTER TABLE user_settings ADD COLUMN has_seen_tour boolean NOT NULL DEFAULT false;
