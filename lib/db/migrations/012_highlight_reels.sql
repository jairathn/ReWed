-- Highlight reels: couple-created keeper (2min) and social reel (20s) per guest
CREATE TABLE IF NOT EXISTS highlight_reels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  guest_id UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('keeper', 'reel')),
  storage_key TEXT NOT NULL,
  thumbnail_key TEXT,
  duration_ms INTEGER,
  size_bytes BIGINT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(wedding_id, guest_id, type)
);

CREATE INDEX idx_highlight_reels_guest ON highlight_reels(wedding_id, guest_id, status);

-- Couple's personal thank-you message per guest (for memoir flip card)
CREATE TABLE IF NOT EXISTS memoir_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  guest_id UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(wedding_id, guest_id)
);
