-- Secure public token for customer invoice viewing without login.
ALTER TABLE invoices ADD COLUMN public_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_public_token_idx ON invoices (public_token);
