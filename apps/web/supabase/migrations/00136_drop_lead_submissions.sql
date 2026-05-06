-- Migration 00136: drop dead lead_submissions table
--
-- Migration 00135 (2026-05-06) created two tables for a misdirected Phase 1.2
-- "lead-gen template" build that was closed without merge (PR #48 closed). The
-- companion `consents` table is being kept and put to use by the CASL retrofit
-- across /waitlist + the homepage email-capture component. The
-- `lead_submissions` table is unused dead schema and is dropped here.

drop table if exists lead_submissions;
