-- 004_wedding_timezone.sql
-- Add timezone column to weddings table so event times display correctly.

ALTER TABLE weddings ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/New_York';
