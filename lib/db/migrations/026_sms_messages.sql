-- 026: SMS broadcast history
--
-- One row per "blast" the couple sends from the Text Guests page, not one
-- row per recipient. Per-recipient delivery state lives in Twilio's console;
-- here we only keep the counts and the first few errors so the dashboard
-- can show "Sent to 142 · 2 failed" history without another vendor API call.
--
-- audience mirrors the send API enum; group_labels is populated only when
-- audience = 'group'.

CREATE TABLE IF NOT EXISTS sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  audience TEXT NOT NULL
    CHECK (audience IN ('all', 'attending', 'pending', 'declined', 'group', 'selected')),
  group_labels TEXT[],
  recipient_count INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  skipped_bad_phone INT NOT NULL DEFAULT 0,
  errors JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_messages_wedding
  ON sms_messages (wedding_id, created_at DESC);
