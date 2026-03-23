-- Migration 00064: Add 'closed' to pipeline_stage enum
-- Required for the new pipeline "Closed (100%)" stage option.

ALTER TYPE pipeline_stage ADD VALUE IF NOT EXISTS 'closed';
