-- 007_wedding_venue_city.sql
-- Add venue location fields to weddings table so the wedding city
-- is stored centrally and available for travel planning auto-fill.

ALTER TABLE weddings ADD COLUMN IF NOT EXISTS venue_city TEXT;
ALTER TABLE weddings ADD COLUMN IF NOT EXISTS venue_country TEXT;
ALTER TABLE weddings ADD COLUMN IF NOT EXISTS venue_lat DOUBLE PRECISION;
ALTER TABLE weddings ADD COLUMN IF NOT EXISTS venue_lng DOUBLE PRECISION;
