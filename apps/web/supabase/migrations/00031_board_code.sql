-- Migration: Add CREA board selection fields to user_settings
-- Allows agents to select their local real estate board for live market benchmarking

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS board_code        text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS board_subregion   text    NOT NULL DEFAULT '';

-- board_code:      CREA board slug (e.g. 'nbreb', 'treb', 'vanc')
-- board_subregion: optional sub-region within the board (e.g. 'Saint John', 'Moncton')
--                  empty string means use board-level totals
