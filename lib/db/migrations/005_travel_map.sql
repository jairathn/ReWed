-- 005_travel_map.sql
-- Travel Map feature: lets guests share travel plans and discover overlaps

-- Travel plans (one per guest per wedding)
CREATE TABLE travel_plans (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wedding_id    UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  guest_id      UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  plan_type     TEXT NOT NULL CHECK (plan_type IN ('direct', 'exploring')),
  origin_city   TEXT,
  origin_lat    DOUBLE PRECISION,
  origin_lng    DOUBLE PRECISION,
  origin_country TEXT,
  share_transport BOOLEAN DEFAULT FALSE,
  visibility    TEXT DEFAULT 'full'
                CHECK (visibility IN ('full', 'city_only', 'private')),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(wedding_id, guest_id)
);

CREATE INDEX idx_travel_plans_wedding ON travel_plans(wedding_id);

-- Individual stops in the itinerary
CREATE TABLE travel_stops (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id       UUID NOT NULL REFERENCES travel_plans(id) ON DELETE CASCADE,
  wedding_id    UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  stop_type     TEXT NOT NULL CHECK (stop_type IN (
    'origin', 'pre_wedding', 'arrival', 'departure', 'post_wedding', 'return'
  )),
  city          TEXT NOT NULL,
  region        TEXT,
  country       TEXT NOT NULL,
  country_code  TEXT,
  latitude      DOUBLE PRECISION NOT NULL,
  longitude     DOUBLE PRECISION NOT NULL,
  arrive_date   DATE,
  depart_date   DATE,
  arrive_time   TIME,
  transport_mode TEXT,
  transport_details TEXT,
  accommodation TEXT,
  open_to_meetup BOOLEAN DEFAULT TRUE,
  notes         TEXT,
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_travel_stops_wedding ON travel_stops(wedding_id);
CREATE INDEX idx_travel_stops_plan ON travel_stops(plan_id);
CREATE INDEX idx_travel_stops_city ON travel_stops(wedding_id, city, arrive_date);
CREATE INDEX idx_travel_stops_geo ON travel_stops(wedding_id, latitude, longitude);

-- RLS
ALTER TABLE travel_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY travel_plans_tenant ON travel_plans FOR ALL
  USING (wedding_id = current_setting('app.current_wedding_id')::uuid);
CREATE POLICY travel_stops_tenant ON travel_stops FOR ALL
  USING (wedding_id = current_setting('app.current_wedding_id')::uuid);
