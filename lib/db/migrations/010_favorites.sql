-- Migration 010: Add favorites table for guest photo bookmarking

CREATE TABLE IF NOT EXISTS favorites (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wedding_id   UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  guest_id     UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  upload_id    UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(guest_id, upload_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_guest ON favorites(guest_id);
CREATE INDEX IF NOT EXISTS idx_favorites_wedding ON favorites(wedding_id);
