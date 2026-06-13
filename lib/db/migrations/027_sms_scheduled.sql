-- 027: Scheduled SMS broadcasts
--
-- A broadcast the couple queued for a future time via Twilio's native
-- message scheduling (ScheduleType=fixed on a Messaging Service). Twilio
-- schedules one message *per recipient*, so we resolve and lock the audience
-- at schedule time and store the resulting per-recipient Twilio SIDs here.
--
-- This table is the source of truth for the "Scheduled texts" list and for
-- cancellation: to cancel we POST Status=canceled to each SID, then flip the
-- local status. We do not poll Twilio to list pending sends.
--
-- audience mirrors the send/schedule API enum; group_labels is populated only
-- when audience = 'group', guest_ids only when audience = 'selected'.

CREATE TABLE IF NOT EXISTS sms_scheduled (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  audience TEXT NOT NULL
    CHECK (audience IN ('all', 'attending', 'pending', 'declined', 'group', 'selected')),
  group_labels TEXT[],
  guest_ids UUID[],
  recipient_count INT NOT NULL DEFAULT 0,
  -- One Twilio message SID per recipient (Twilio schedules per-message).
  twilio_message_sids TEXT[] NOT NULL DEFAULT '{}',
  send_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'canceled', 'sent')),
  -- First few per-recipient scheduling errors, same shape as sms_messages.errors
  errors JSONB,
  skipped_bad_phone INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  canceled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sms_scheduled_wedding
  ON sms_scheduled (wedding_id, send_at);
