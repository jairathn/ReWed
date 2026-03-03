-- 001_foundation.sql
-- Run with: psql $DATABASE_URL_UNPOOLED -f lib/db/migrations/001_foundation.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- COUPLES (account holders)
CREATE TABLE IF NOT EXISTS couples (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT,
  stripe_customer_id TEXT,
  email_verified BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_couples_email ON couples(email);
CREATE INDEX IF NOT EXISTS idx_couples_stripe ON couples(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- WEDDINGS (tenants)
CREATE TABLE IF NOT EXISTS weddings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  couple_id       UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  slug            TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  hashtag         TEXT,
  wedding_date    DATE,
  status          TEXT NOT NULL DEFAULT 'setup'
                  CHECK (status IN ('setup', 'active', 'post_wedding', 'archived')),
  config          JSONB NOT NULL DEFAULT '{}'::jsonb,
  package_config  JSONB NOT NULL DEFAULT '{}'::jsonb,
  storage_used_bytes  BIGINT DEFAULT 0,
  ai_portraits_used   INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_weddings_slug ON weddings(slug);
CREATE INDEX IF NOT EXISTS idx_weddings_couple ON weddings(couple_id);
CREATE INDEX IF NOT EXISTS idx_weddings_status ON weddings(status);

-- EVENTS
CREATE TABLE IF NOT EXISTS events (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wedding_id   UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  date         DATE,
  start_time   TIME,
  end_time     TIME,
  venue_name   TEXT,
  venue_address TEXT,
  dress_code   TEXT,
  description  TEXT,
  logistics    TEXT,
  accent_color TEXT,
  sort_order   INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_wedding ON events(wedding_id);

-- GUESTS
CREATE TABLE IF NOT EXISTS guests (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wedding_id   UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  first_name   TEXT NOT NULL,
  last_name    TEXT NOT NULL,
  display_name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
  email        TEXT,
  phone        TEXT,
  group_label  TEXT,
  rsvp_status  TEXT DEFAULT 'pending'
               CHECK (rsvp_status IN ('pending', 'attending', 'declined')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guests_wedding ON guests(wedding_id);
CREATE INDEX IF NOT EXISTS idx_guests_name_trgm ON guests USING gin (display_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_guests_wedding_name ON guests(wedding_id, first_name, last_name);

-- SESSIONS
CREATE TABLE IF NOT EXISTS sessions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wedding_id   UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  guest_id     UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  device_type  TEXT DEFAULT 'mobile'
               CHECK (device_type IN ('mobile', 'kiosk_ipad', 'desktop')),
  token_hash   TEXT NOT NULL UNIQUE,
  user_agent   TEXT,
  last_active  TIMESTAMPTZ DEFAULT NOW(),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_guest ON sessions(guest_id);
CREATE INDEX IF NOT EXISTS idx_sessions_wedding ON sessions(wedding_id);

-- UPLOADS
CREATE TABLE IF NOT EXISTS uploads (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wedding_id    UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  guest_id      UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  event_id      UUID REFERENCES events(id) ON DELETE SET NULL,
  type          TEXT NOT NULL CHECK (type IN ('photo', 'video')),
  storage_key   TEXT NOT NULL,
  original_filename TEXT,
  mime_type     TEXT,
  size_bytes    BIGINT,
  duration_ms   INTEGER,
  width         INTEGER,
  height        INTEGER,
  filter_applied TEXT,
  prompt_answered TEXT,
  thumbnail_key TEXT,
  transcode_key TEXT,
  status        TEXT DEFAULT 'pending'
                CHECK (status IN ('pending', 'uploading', 'processing', 'ready', 'failed')),
  retry_count   INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uploads_wedding ON uploads(wedding_id);
CREATE INDEX IF NOT EXISTS idx_uploads_guest ON uploads(guest_id);
CREATE INDEX IF NOT EXISTS idx_uploads_event ON uploads(event_id);
CREATE INDEX IF NOT EXISTS idx_uploads_wedding_status ON uploads(wedding_id, status);
CREATE INDEX IF NOT EXISTS idx_uploads_guest_type ON uploads(guest_id, type);

-- AI JOBS (portraits)
CREATE TABLE IF NOT EXISTS ai_jobs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wedding_id    UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  guest_id      UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('portrait', 'reel_guest', 'reel_couple')),
  style_id      TEXT,
  input_key     TEXT,
  output_key    TEXT,
  status        TEXT DEFAULT 'queued'
                CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  cost_cents    INTEGER,
  error_message TEXT,
  metadata      JSONB DEFAULT '{}'::jsonb,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_jobs_wedding ON ai_jobs(wedding_id);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_guest ON ai_jobs(guest_id);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_status ON ai_jobs(wedding_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_guest_type ON ai_jobs(guest_id, type);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_quota ON ai_jobs(wedding_id, guest_id, type)
  WHERE status IN ('completed', 'processing');

-- SOCIAL FEED
CREATE TABLE IF NOT EXISTS feed_posts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wedding_id    UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  guest_id      UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('text', 'photo', 'memory')),
  content       TEXT,
  photo_key     TEXT,
  like_count    INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  is_pinned     BOOLEAN DEFAULT FALSE,
  is_hidden     BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feed_wedding ON feed_posts(wedding_id, created_at DESC)
  WHERE is_hidden = FALSE;

CREATE TABLE IF NOT EXISTS feed_likes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id     UUID NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  guest_id    UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  wedding_id  UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, guest_id)
);

CREATE TABLE IF NOT EXISTS feed_comments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id     UUID NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  guest_id    UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  wedding_id  UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_post ON feed_comments(post_id, created_at);

-- FAQ
CREATE TABLE IF NOT EXISTS faq_entries (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wedding_id    UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  question      TEXT NOT NULL,
  answer        TEXT NOT NULL,
  source        TEXT DEFAULT 'manual'
                CHECK (source IN ('manual', 'zola_import', 'generated')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_faq_wedding ON faq_entries(wedding_id);

CREATE TABLE IF NOT EXISTS faq_cache (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wedding_id    UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  question_hash TEXT NOT NULL,
  answer        TEXT NOT NULL,
  hit_count     INTEGER DEFAULT 1,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(wedding_id, question_hash)
);

-- NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wedding_id    UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  guest_id      UUID REFERENCES guests(id) ON DELETE CASCADE,
  channel       TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'push')),
  type          TEXT NOT NULL,
  payload       JSONB NOT NULL,
  status        TEXT DEFAULT 'queued'
                CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'bounced')),
  external_id   TEXT,
  retry_count   INTEGER DEFAULT 0,
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_wedding ON notifications(wedding_id);

-- SUBSCRIPTIONS (Stripe)
CREATE TABLE IF NOT EXISTS subscriptions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wedding_id            UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT,
  stripe_checkout_session_id TEXT,
  status                TEXT DEFAULT 'pending'
                        CHECK (status IN ('pending', 'active', 'past_due', 'canceled')),
  price_cents           INTEGER NOT NULL,
  package_snapshot      JSONB NOT NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_wedding ON subscriptions(wedding_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);

-- ROW LEVEL SECURITY
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE faq_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE faq_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policies
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'events', 'guests', 'sessions', 'uploads', 'ai_jobs',
    'feed_posts', 'feed_likes', 'feed_comments',
    'faq_entries', 'faq_cache', 'notifications'
  ]) LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I_tenant_isolation ON %I',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY %I_tenant_isolation ON %I
       FOR ALL
       USING (wedding_id = current_setting(''app.current_wedding_id'')::uuid)',
      t, t
    );
  END LOOP;
END $$;

-- UPDATED_AT TRIGGER
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS couples_updated_at ON couples;
CREATE TRIGGER couples_updated_at BEFORE UPDATE ON couples
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS weddings_updated_at ON weddings;
CREATE TRIGGER weddings_updated_at BEFORE UPDATE ON weddings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS subscriptions_updated_at ON subscriptions;
CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
