-- Migration 019: Gmail integration + AI-suggested changes
-- One Gmail connection per wedding. The connected mailbox gets scanned on
-- demand by the couple — recent threads are digested into "suggestions"
-- that the couple can accept (apply to todos/timeline) or decline.

CREATE TABLE IF NOT EXISTS gmail_connections (
  wedding_id UUID PRIMARY KEY REFERENCES weddings(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  scope TEXT,
  last_scanned_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pending OAuth state values (CSRF protection during the OAuth dance).
-- Short-lived rows; cleaned up either after callback or by retention.
CREATE TABLE IF NOT EXISTS gmail_oauth_states (
  state TEXT PRIMARY KEY,
  wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Suggestions surfaced from email scans. We keep the source for traceability
-- so the couple can see the email that triggered the suggestion.
CREATE TABLE IF NOT EXISTS suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  source_type VARCHAR(20) NOT NULL DEFAULT 'email',
  source_ref VARCHAR(200),         -- gmail message id
  source_summary TEXT,             -- "Re: Sangeet menu — Sensacions" or similar
  action_type VARCHAR(30) NOT NULL, -- 'create_todo' | 'update_todo' | 'update_timeline'
  payload JSONB NOT NULL,
  rationale TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | accepted | declined
  resolved_at TIMESTAMPTZ,
  resolved_by_role VARCHAR(20),
  applied_entity_id UUID,           -- todo id or timeline_entry id once accepted
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_suggestions_wedding_status ON suggestions(wedding_id, status, created_at DESC);

-- RLS isolation
ALTER TABLE gmail_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY gmail_connections_wedding_isolation ON gmail_connections
  USING (wedding_id::text = current_setting('app.current_wedding_id', true));

CREATE POLICY gmail_oauth_states_wedding_isolation ON gmail_oauth_states
  USING (wedding_id::text = current_setting('app.current_wedding_id', true));

CREATE POLICY suggestions_wedding_isolation ON suggestions
  USING (wedding_id::text = current_setting('app.current_wedding_id', true));
