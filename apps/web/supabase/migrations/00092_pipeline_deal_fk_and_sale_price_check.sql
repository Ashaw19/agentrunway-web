-- Add FK constraint: transactions.pipeline_deal_id → pipeline_deals.id
-- ON DELETE SET NULL prevents dangling references when pipeline deals are deleted
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'transactions_pipeline_deal_id_fkey'
      AND table_name = 'transactions'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_pipeline_deal_id_fkey
      FOREIGN KEY (pipeline_deal_id)
      REFERENCES pipeline_deals(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Note: sale_price > 0 enforcement is handled at the application layer
-- via validateSalePrice() in input-guards.ts. The DB column has NOT NULL
-- with existing historical zero-price imports that cannot be changed.
