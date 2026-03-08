-- 003_guest_party_fields.sql
-- Adds title, suffix, address fields, and party grouping to guests table
-- Supports CSV imports from Zola/The Knot with partner + children rows

-- New columns on guests
ALTER TABLE guests ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS suffix TEXT;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS address_line1 TEXT;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS address_line2 TEXT;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS zip TEXT;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS party_id UUID;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS party_role TEXT DEFAULT 'primary'
  CHECK (party_role IN ('primary', 'partner', 'child'));
ALTER TABLE guests ADD COLUMN IF NOT EXISTS relationship TEXT;

-- Index for party grouping
CREATE INDEX IF NOT EXISTS idx_guests_party ON guests(party_id) WHERE party_id IS NOT NULL;
