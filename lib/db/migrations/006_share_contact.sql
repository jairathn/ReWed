-- 006_share_contact.sql
-- Add contact info field for ride-sharing coordination

ALTER TABLE travel_plans ADD COLUMN share_contact TEXT;

-- Also add depart_time to travel_stops for ride-share matching
ALTER TABLE travel_stops ADD COLUMN depart_time TIME;
