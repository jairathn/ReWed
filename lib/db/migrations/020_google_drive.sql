-- Migration 020: Extend Gmail integration to also cover Drive (read-only)
-- and harden token storage for both. The OAuth flow asks for both scopes
-- in a single consent so the couple connects once.

-- Rename for clarity now that the connection is more than just Gmail.
ALTER TABLE gmail_connections RENAME TO google_connections;

-- Track which scopes are actually granted (couples may decline drive on
-- the consent screen).
ALTER TABLE google_connections ADD COLUMN IF NOT EXISTS gmail_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE google_connections ADD COLUMN IF NOT EXISTS drive_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE google_connections ADD COLUMN IF NOT EXISTS last_drive_scanned_at TIMESTAMPTZ;

-- Same rename for the OAuth state table.
ALTER TABLE gmail_oauth_states RENAME TO google_oauth_states;

-- Rename the existing RLS policy to match the new table name.
ALTER POLICY gmail_connections_wedding_isolation ON google_connections
  RENAME TO google_connections_wedding_isolation;

ALTER POLICY gmail_oauth_states_wedding_isolation ON google_oauth_states
  RENAME TO google_oauth_states_wedding_isolation;

-- Suggestions can now come from drive too.
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS source_url TEXT;
