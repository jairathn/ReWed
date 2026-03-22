-- Migration 011: Guest Experience Features
-- Activity tracking, seating, music requests, contact sharing, feed enhancements

-- 1. Activity log for tracking guest engagement
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  guest_id UUID REFERENCES guests(id) ON DELETE SET NULL,
  event_type VARCHAR(50) NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_log_wedding ON activity_log(wedding_id, created_at DESC);
CREATE INDEX idx_activity_log_event_type ON activity_log(wedding_id, event_type);

-- 2. Seating assignments (couples assign tables, guests discover tablemates)
CREATE TABLE IF NOT EXISTS seating_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  guest_id UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  table_name VARCHAR(100) NOT NULL,
  seat_number INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(wedding_id, guest_id)
);

CREATE INDEX idx_seating_wedding_table ON seating_assignments(wedding_id, table_name);

-- 3. Table icebreaker responses (one fun question per guest)
CREATE TABLE IF NOT EXISTS icebreaker_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  guest_id UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  question_key VARCHAR(50) NOT NULL,
  answer TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(wedding_id, guest_id)
);

-- 4. Music requests
CREATE TABLE IF NOT EXISTS music_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  guest_id UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  song_title VARCHAR(300) NOT NULL,
  artist VARCHAR(300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_music_requests_wedding ON music_requests(wedding_id);

-- 5. Contact shares (post-wedding "keep in touch")
CREATE TABLE IF NOT EXISTS contact_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  guest_id UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  instagram_handle VARCHAR(100),
  phone VARCHAR(30),
  email VARCHAR(255),
  share_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(wedding_id, guest_id)
);

CREATE INDEX idx_contact_shares_wedding ON contact_shares(wedding_id);

-- 6. Add social_media handles to guests table
ALTER TABLE guests ADD COLUMN IF NOT EXISTS instagram_handle VARCHAR(100);

-- 7. Add video support to feed posts (currently only photo_key)
ALTER TABLE feed_posts ADD COLUMN IF NOT EXISTS video_key TEXT;
ALTER TABLE feed_posts ADD COLUMN IF NOT EXISTS media_type VARCHAR(10);

-- RLS policies
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE seating_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE icebreaker_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE music_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY activity_log_wedding_isolation ON activity_log
  USING (wedding_id::text = current_setting('app.current_wedding_id', true));

CREATE POLICY seating_wedding_isolation ON seating_assignments
  USING (wedding_id::text = current_setting('app.current_wedding_id', true));

CREATE POLICY icebreaker_wedding_isolation ON icebreaker_responses
  USING (wedding_id::text = current_setting('app.current_wedding_id', true));

CREATE POLICY music_wedding_isolation ON music_requests
  USING (wedding_id::text = current_setting('app.current_wedding_id', true));

CREATE POLICY contact_wedding_isolation ON contact_shares
  USING (wedding_id::text = current_setting('app.current_wedding_id', true));
