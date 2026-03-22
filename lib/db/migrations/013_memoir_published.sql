-- Per-guest memoir publish control
-- When false (default), the memoir page shows a "coming soon" holding page
ALTER TABLE guests ADD COLUMN IF NOT EXISTS memoir_published BOOLEAN NOT NULL DEFAULT FALSE;
