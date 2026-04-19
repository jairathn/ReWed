-- Migration 018: Meeting Notes → AI To-dos
-- Couples and planners can drop in raw meeting notes; AI extracts to-dos
-- assigned to vendors or to the couple. Vendors see their to-dos in the
-- portal and can mark them complete.

-- 1. Meetings
CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  title VARCHAR(300) NOT NULL,
  meeting_date DATE,
  raw_notes TEXT NOT NULL,
  created_by_role VARCHAR(20) NOT NULL DEFAULT 'couple',
  created_by_label VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_meetings_wedding ON meetings(wedding_id, created_at DESC);

-- 2. Meeting stakeholders (which vendors attended). The couple is always an
-- implicit stakeholder for to-do assignment.
CREATE TABLE IF NOT EXISTS meeting_stakeholders (
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  PRIMARY KEY (meeting_id, vendor_id)
);

CREATE INDEX idx_meeting_stakeholders_vendor ON meeting_stakeholders(vendor_id);

-- 3. To-dos. assigned_to_vendor_id NULL means assigned to the couple.
CREATE TABLE IF NOT EXISTS todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  meeting_id UUID REFERENCES meetings(id) ON DELETE SET NULL,
  assigned_to_vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  due_date DATE,
  priority VARCHAR(10) NOT NULL DEFAULT 'normal',
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  completed_by_role VARCHAR(20)
);

CREATE INDEX idx_todos_wedding_status ON todos(wedding_id, status, created_at DESC);
CREATE INDEX idx_todos_vendor ON todos(assigned_to_vendor_id, status);
CREATE INDEX idx_todos_meeting ON todos(meeting_id);

-- RLS isolation
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_stakeholders ENABLE ROW LEVEL SECURITY;
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;

CREATE POLICY meetings_wedding_isolation ON meetings
  USING (wedding_id::text = current_setting('app.current_wedding_id', true));

CREATE POLICY meeting_stakeholders_wedding_isolation ON meeting_stakeholders
  USING (
    meeting_id IN (
      SELECT id FROM meetings
      WHERE wedding_id::text = current_setting('app.current_wedding_id', true)
    )
  );

CREATE POLICY todos_wedding_isolation ON todos
  USING (wedding_id::text = current_setting('app.current_wedding_id', true));
