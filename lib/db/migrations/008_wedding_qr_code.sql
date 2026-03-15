-- Add QR code storage key to weddings table
ALTER TABLE weddings ADD COLUMN IF NOT EXISTS qr_code_key TEXT;
