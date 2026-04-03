-- Add CHECK constraint on clients.status to prevent arbitrary values.
-- Only the 6 valid flight statuses are allowed.
ALTER TABLE clients
  ADD CONSTRAINT clients_status_valid
  CHECK (status IN ('boarding', 'taxiing', 'approach', 'in_flight', 'landed', 'cruising'));
