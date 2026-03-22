-- Wedding-level control: couple must approve the gallery before memoir pages
-- can show carousel photos from the shared gallery
ALTER TABLE weddings ADD COLUMN IF NOT EXISTS gallery_published BOOLEAN NOT NULL DEFAULT FALSE;
