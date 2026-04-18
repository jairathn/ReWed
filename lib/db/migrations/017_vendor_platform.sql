-- Migration 017: Vendor Management Platform
-- Vendor profiles, master timeline, coordination links, vendor comments,
-- email audit log, planner access grants, chatbot daily rate limiting.

-- 1. Vendors (per wedding)
CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  company VARCHAR(200),
  category VARCHAR(150),
  email VARCHAR(255),
  phone VARCHAR(50),
  whatsapp BOOLEAN DEFAULT FALSE,
  deposit_status TEXT,
  notes TEXT,
  access_token VARCHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vendors_wedding ON vendors(wedding_id);
CREATE INDEX idx_vendors_token ON vendors(access_token);

-- 2. Master timeline entries
CREATE TABLE IF NOT EXISTS timeline_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  event_date DATE,
  event_name VARCHAR(200),
  time_label VARCHAR(80),
  sort_order INTEGER NOT NULL DEFAULT 0,
  action TEXT NOT NULL,
  location VARCHAR(300),
  notes TEXT,
  status VARCHAR(50),
  deadline BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_timeline_wedding_date ON timeline_entries(wedding_id, event_date, sort_order);

-- 3. Vendor-to-entry links (owner = assigned; coordinate_with = mentioned)
CREATE TABLE IF NOT EXISTS timeline_entry_vendors (
  timeline_entry_id UUID NOT NULL REFERENCES timeline_entries(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'owner',
  PRIMARY KEY (timeline_entry_id, vendor_id, role)
);

CREATE INDEX idx_tev_vendor ON timeline_entry_vendors(vendor_id);

-- 4. Vendor comments / proposed changes
CREATE TABLE IF NOT EXISTS vendor_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  timeline_entry_id UUID REFERENCES timeline_entries(id) ON DELETE SET NULL,
  comment TEXT NOT NULL,
  proposed_change TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_vendor_comments_wedding ON vendor_comments(wedding_id, status, created_at DESC);
CREATE INDEX idx_vendor_comments_vendor ON vendor_comments(vendor_id, created_at DESC);

-- 5. Vendor email audit log
CREATE TABLE IF NOT EXISTS vendor_email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  recipient_email VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  email_type VARCHAR(50) NOT NULL,
  resend_id VARCHAR(100),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vendor_email_log_wedding ON vendor_email_log(wedding_id, sent_at DESC);

-- 6. Planner access grants (edit permissions on master timeline)
CREATE TABLE IF NOT EXISTS planner_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  name VARCHAR(200),
  email VARCHAR(255) NOT NULL,
  access_token VARCHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  UNIQUE (wedding_id, email)
);

CREATE INDEX idx_planner_access_token ON planner_access(access_token);

-- 7. Chatbot daily rate limiting (20 questions/day per identifier)
-- identifier is guest_id when authenticated, otherwise IP address hash
CREATE TABLE IF NOT EXISTS chatbot_usage (
  wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  identifier VARCHAR(100) NOT NULL,
  bot_type VARCHAR(20) NOT NULL,
  usage_date DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (wedding_id, identifier, bot_type, usage_date)
);

CREATE INDEX idx_chatbot_usage_cleanup ON chatbot_usage(usage_date);

-- RLS policies
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_entry_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_email_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE planner_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendors_wedding_isolation ON vendors
  USING (wedding_id::text = current_setting('app.current_wedding_id', true));

CREATE POLICY timeline_wedding_isolation ON timeline_entries
  USING (wedding_id::text = current_setting('app.current_wedding_id', true));

CREATE POLICY tev_wedding_isolation ON timeline_entry_vendors
  USING (
    timeline_entry_id IN (
      SELECT id FROM timeline_entries
      WHERE wedding_id::text = current_setting('app.current_wedding_id', true)
    )
  );

CREATE POLICY vendor_comments_wedding_isolation ON vendor_comments
  USING (wedding_id::text = current_setting('app.current_wedding_id', true));

CREATE POLICY vendor_email_log_wedding_isolation ON vendor_email_log
  USING (wedding_id::text = current_setting('app.current_wedding_id', true));

CREATE POLICY planner_access_wedding_isolation ON planner_access
  USING (wedding_id::text = current_setting('app.current_wedding_id', true));

CREATE POLICY chatbot_usage_wedding_isolation ON chatbot_usage
  USING (wedding_id::text = current_setting('app.current_wedding_id', true));
