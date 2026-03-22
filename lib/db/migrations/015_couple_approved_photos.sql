-- Per-photo couple approval for the shared gallery / memoir carousels
-- Defaults to true so all existing photos are included; couple can reject specific ones
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS couple_approved BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX idx_uploads_approved ON uploads(wedding_id, couple_approved, status, type);
