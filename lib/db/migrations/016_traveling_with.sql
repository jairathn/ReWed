-- 016_traveling_with.sql
-- Add traveling_with field to link companions' travel plans
ALTER TABLE travel_plans ADD COLUMN traveling_with_guest_ids UUID[];
