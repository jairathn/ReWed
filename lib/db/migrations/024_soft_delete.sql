-- Migration 024: Soft-delete + undo across destructive surfaces
--
-- Audit finding 1.3: deletes on todos / meetings / guests / vendors /
-- timeline_entries fire immediately with no confirmation. Couples and
-- planners lose work to mis-taps. The fix is an optimistic-delete +
-- undo-toast pattern, backed by a `soft_deleted_at` column on each table.
-- A daily janitor hard-deletes rows older than 30 days.
--
-- Implementation notes:
--   - The app already filters reads by wedding_id explicitly, so RLS
--     policies are defense-in-depth here. We update them anyway so future
--     code paths that DO set app.current_wedding_id (e.g. withWeddingContext)
--     also get the soft-delete filter for free.
--   - Partial indexes on (soft_deleted_at IS NULL) keep hot-path scans
--     fast even after months of soft-deleted rows accumulate.
--   - Cleanup of rows >30 days soft-deleted runs from
--     /api/v1/cron/janitor (added in this PR; cron config wires it up).

-- -------------------------------------------------------------------
-- 1) Add the column to every soft-deletable table
-- -------------------------------------------------------------------

ALTER TABLE todos            ADD COLUMN IF NOT EXISTS soft_deleted_at TIMESTAMPTZ;
ALTER TABLE meetings         ADD COLUMN IF NOT EXISTS soft_deleted_at TIMESTAMPTZ;
ALTER TABLE guests           ADD COLUMN IF NOT EXISTS soft_deleted_at TIMESTAMPTZ;
ALTER TABLE vendors          ADD COLUMN IF NOT EXISTS soft_deleted_at TIMESTAMPTZ;
ALTER TABLE timeline_entries ADD COLUMN IF NOT EXISTS soft_deleted_at TIMESTAMPTZ;

-- -------------------------------------------------------------------
-- 2) Partial indexes — every hot-path query filters live rows.
-- These speed up reads dramatically once soft-deleted rows accumulate.
-- -------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_todos_wedding_live
  ON todos(wedding_id) WHERE soft_deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_meetings_wedding_live
  ON meetings(wedding_id, meeting_date DESC NULLS LAST) WHERE soft_deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_guests_wedding_live
  ON guests(wedding_id) WHERE soft_deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vendors_wedding_live
  ON vendors(wedding_id) WHERE soft_deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_timeline_entries_wedding_live
  ON timeline_entries(wedding_id, event_date NULLS LAST, sort_order)
  WHERE soft_deleted_at IS NULL;

-- The janitor cron filters by soft_deleted_at so it can find ripe rows
-- across all tenants quickly.
CREATE INDEX IF NOT EXISTS idx_todos_softdel            ON todos(soft_deleted_at)            WHERE soft_deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meetings_softdel         ON meetings(soft_deleted_at)         WHERE soft_deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_guests_softdel           ON guests(soft_deleted_at)           WHERE soft_deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendors_softdel          ON vendors(soft_deleted_at)          WHERE soft_deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_timeline_entries_softdel ON timeline_entries(soft_deleted_at) WHERE soft_deleted_at IS NOT NULL;

-- -------------------------------------------------------------------
-- 3) Update RLS policies to exclude soft-deleted rows
--
-- Note: the existing policies on these tables already restrict by
-- wedding_id. We replace them with versions that also require
-- soft_deleted_at IS NULL. App-level queries explicitly filter for safety,
-- but this catches any future code path that doesn't.
-- -------------------------------------------------------------------

-- guests: created by foundation's bulk DO $$ loop as guests_tenant_isolation
DROP POLICY IF EXISTS guests_tenant_isolation ON guests;
CREATE POLICY guests_tenant_isolation ON guests
  FOR ALL
  USING (
    wedding_id = current_setting('app.current_wedding_id', true)::uuid
    AND soft_deleted_at IS NULL
  );

-- vendors
DROP POLICY IF EXISTS vendors_wedding_isolation ON vendors;
CREATE POLICY vendors_wedding_isolation ON vendors
  USING (
    wedding_id::text = current_setting('app.current_wedding_id', true)
    AND soft_deleted_at IS NULL
  );

-- timeline_entries
DROP POLICY IF EXISTS timeline_wedding_isolation ON timeline_entries;
CREATE POLICY timeline_wedding_isolation ON timeline_entries
  USING (
    wedding_id::text = current_setting('app.current_wedding_id', true)
    AND soft_deleted_at IS NULL
  );

-- meetings
DROP POLICY IF EXISTS meetings_wedding_isolation ON meetings;
CREATE POLICY meetings_wedding_isolation ON meetings
  USING (
    wedding_id::text = current_setting('app.current_wedding_id', true)
    AND soft_deleted_at IS NULL
  );

-- todos
DROP POLICY IF EXISTS todos_wedding_isolation ON todos;
CREATE POLICY todos_wedding_isolation ON todos
  USING (
    wedding_id::text = current_setting('app.current_wedding_id', true)
    AND soft_deleted_at IS NULL
  );
