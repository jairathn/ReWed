-- Style guide images: couples can upload fashion/outfit photos per event
ALTER TABLE events ADD COLUMN IF NOT EXISTS style_guide_images JSONB DEFAULT '[]';
