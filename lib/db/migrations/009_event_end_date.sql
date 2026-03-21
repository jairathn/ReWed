-- Add end_date column to events table for multi-day events
-- (e.g. a reception that starts Friday evening and ends Saturday morning)
ALTER TABLE events ADD COLUMN IF NOT EXISTS end_date DATE;
